import { GAME_CONFIG } from './config.js';
import { SeededRandom } from './random.js';
import { getRoadCells, isRoad } from './map.js';

export const DIRECTIONS = Object.freeze({
  UP: Object.freeze({ x: 0, y: -1, name: 'up' }),
  DOWN: Object.freeze({ x: 0, y: 1, name: 'down' }),
  LEFT: Object.freeze({ x: -1, y: 0, name: 'left' }),
  RIGHT: Object.freeze({ x: 1, y: 0, name: 'right' })
});

const sameCell = (a, b) => a.x === b.x && a.y === b.y;
const cellKey = (cell) => `${cell.x},${cell.y}`;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const opposite = (a, b) => a.x + b.x === 0 && a.y + b.y === 0;

export function createGame({
  map,
  seed,
  spawn,
  direction = DIRECTIONS.RIGHT,
  config = GAME_CONFIG
}) {
  const segments = [{ ...spawn }];

  for (let index = 1; index <= config.initialBenchCount; index += 1) {
    segments.push({
      x: spawn.x - direction.x * index,
      y: spawn.y - direction.y * index
    });
  }

  const game = {
    map,
    seed,
    config,
    rng: new SeededRandom(seed),
    phase: 'ready',
    direction,
    pendingDirection: null,
    segments,
    previousSegments: segments.map((segment) => ({ ...segment })),
    benchCount: config.initialBenchCount,
    collisionCount: 0,
    blockedByWall: false,
    endReason: null,
    remainingMs: config.durationMs,
    elapsedMs: 0,
    moveAccumulatorMs: 0,
    normalBenches: [],
    pearl: null,
    nextPearlAtMs: config.pearlIntervalMs
  };

  return game;
}

export function queueDirection(game, requested) {
  if (
    !requested ||
    game.pendingDirection ||
    (game.blockedByWall && requested === game.direction) ||
    (!game.blockedByWall && opposite(game.direction, requested))
  ) {
    return false;
  }

  game.pendingDirection = requested;
  return true;
}

export function findSpawnCell(game) {
  const roads = getRoadCells(game.map);
  const occupied = new Set([
    ...game.segments.map(cellKey),
    ...game.normalBenches.map(cellKey),
    ...(game.pearl ? [cellKey(game.pearl)] : [])
  ]);

  const isLegal = (cell) =>
    !occupied.has(cellKey(cell)) &&
    manhattan(cell, game.segments[0]) > game.config.spawnHeadClearance;
  const legalCells = roads.filter(isLegal);

  if (legalCells.length === 0) {
    return null;
  }

  const regionOf = (cell) =>
    (cell.x < game.map.width / 2 ? 0 : 1) +
    (cell.y < game.map.height / 2 ? 0 : 2);
  const regionCounts = [0, 0, 0, 0];

  for (const item of [...game.normalBenches, ...(game.pearl ? [game.pearl] : [])]) {
    regionCounts[regionOf(item)] += 1;
  }

  const availableRegions = new Set(legalCells.map(regionOf));
  const smallestCount = Math.min(
    ...[...availableRegions].map((region) => regionCounts[region])
  );
  const preferredCells = legalCells.filter((cell) =>
    regionCounts[regionOf(cell)] === smallestCount
  );
  const selected = preferredCells[game.rng.nextInt(preferredCells.length)];
  return { ...selected };
}

export function populateInitialItems(game) {
  while (game.normalBenches.length < game.config.normalBenchCount) {
    const cell = findSpawnCell(game);

    if (!cell) {
      break;
    }

    game.normalBenches.push(cell);
  }
}

function collectAtHead(game) {
  const head = game.segments[0];
  const normalIndex = game.normalBenches.findIndex((item) => sameCell(item, head));

  if (normalIndex >= 0) {
    game.normalBenches.splice(normalIndex, 1);
    game.benchCount += game.config.normalBenchReward;
    populateInitialItems(game);
  }

  if (game.pearl && sameCell(game.pearl, head)) {
    game.pearl = null;
    game.benchCount += game.config.pearlReward;
  }
}

export function stepMovement(game) {
  if (game.phase !== 'running' || (game.blockedByWall && !game.pendingDirection)) {
    return false;
  }

  if (game.pendingDirection) {
    game.direction = game.pendingDirection;
    game.pendingDirection = null;
    game.blockedByWall = false;
  }

  game.previousSegments = game.segments.map((segment) => ({ ...segment }));

  const head = game.segments[0];
  const next = {
    x: head.x + game.direction.x,
    y: head.y + game.direction.y
  };
  const hitsScene = !isRoad(game.map, next.x, next.y);
  const hitsSelf = game.segments.slice(1).some((segment) => sameCell(segment, next));

  if (hitsScene) {
    game.collisionCount += 1;
    game.blockedByWall = true;
    return false;
  }

  if (hitsSelf) {
    game.collisionCount += 1;
    game.phase = 'ended';
    game.endReason = 'self';
    return false;
  }

  game.blockedByWall = false;
  game.segments.unshift(next);

  if (game.segments.length - 1 > game.benchCount) {
    game.segments.pop();
  }

  collectAtHead(game);
  return true;
}

function expireOrSpawnPearl(game) {
  if (game.pearl && game.pearl.remainingMs <= 0) {
    game.pearl = null;
  }

  while (game.elapsedMs >= game.nextPearlAtMs) {
    if (!game.pearl) {
      const cell = findSpawnCell(game);

      if (cell) {
        game.pearl = {
          ...cell,
          remainingMs: game.config.pearlLifetimeMs
        };
      }
    }

    game.nextPearlAtMs += game.config.pearlIntervalMs;
  }
}

function nextTimeSlice(game, availableMs) {
  const candidates = [availableMs, game.remainingMs];

  candidates.push(game.config.moveIntervalMs - game.moveAccumulatorMs);

  if (game.pearl) {
    candidates.push(game.pearl.remainingMs);
  }

  if (game.nextPearlAtMs > game.elapsedMs) {
    candidates.push(game.nextPearlAtMs - game.elapsedMs);
  }

  return Math.max(0, Math.min(...candidates.filter((value) => value > 0)));
}

export function advanceGame(game, deltaMs) {
  if (game.phase !== 'running' || deltaMs <= 0) {
    return;
  }

  let unconsumedMs = Math.min(deltaMs, game.remainingMs);

  while (unconsumedMs > 0 && game.phase === 'running') {
    const sliceMs = nextTimeSlice(game, unconsumedMs);

    if (sliceMs <= 0) {
      break;
    }

    game.elapsedMs += sliceMs;
    game.remainingMs -= sliceMs;
    unconsumedMs -= sliceMs;

    if (game.pearl) {
      game.pearl.remainingMs -= sliceMs;
    }

    game.moveAccumulatorMs += sliceMs;

    expireOrSpawnPearl(game);

    if (game.moveAccumulatorMs >= game.config.moveIntervalMs) {
      game.moveAccumulatorMs -= game.config.moveIntervalMs;
      stepMovement(game);
    }

    if (game.remainingMs <= 0) {
      game.remainingMs = 0;
      game.phase = 'ended';
      game.endReason ??= 'time';
    }
  }
}

export function pauseGame(game) {
  if (game.phase === 'running') {
    game.phase = 'paused';
  }
}

export function resumeGame(game) {
  if (game.phase === 'paused') {
    game.phase = 'running';
  }
}

export function restartGame(game, spawn, direction = DIRECTIONS.RIGHT) {
  const fresh = createGame({
    map: game.map,
    seed: game.seed,
    spawn,
    direction,
    config: game.config
  });

  Object.assign(game, fresh);
  return game;
}
