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
const DIRECTION_ORDER = Object.freeze([
  DIRECTIONS.UP,
  DIRECTIONS.RIGHT,
  DIRECTIONS.DOWN,
  DIRECTIONS.LEFT
]);

function cloneSegments(segments) {
  return segments.map((segment) => ({ ...segment }));
}

function pathSnapshot(game) {
  return {
    head: { ...game.segments[0] },
    segments: cloneSegments(game.segments),
    direction: game.direction
  };
}

function roadNeighbors(map, cell) {
  return DIRECTION_ORDER
    .map((direction) => ({
      direction,
      cell: {
        x: cell.x + direction.x,
        y: cell.y + direction.y
      }
    }))
    .filter((entry) => isRoad(map, entry.cell.x, entry.cell.y));
}

function expandedSegments(segments, benchCount) {
  const expanded = cloneSegments(segments).slice(0, benchCount + 1);
  const tail = expanded.at(-1);

  while (expanded.length < benchCount + 1 && tail) {
    expanded.push({ ...tail });
  }

  return expanded;
}

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
    stunRemainingMs: 0,
    remainingMs: config.durationMs,
    elapsedMs: 0,
    moveAccumulatorMs: 0,
    normalBenches: [],
    pearl: null,
    nextPearlAtMs: config.pearlIntervalMs,
    pathHistory: [],
    recoveryTarget: null,
    recovery: null
  };

  game.pathHistory.push(pathSnapshot(game));
  return game;
}

export function queueDirection(game, requested) {
  if (
    !requested ||
    game.pendingDirection ||
    game.recoveryTarget ||
    game.recovery ||
    opposite(game.direction, requested)
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

function nearestJunctionIndex(game) {
  for (let index = game.pathHistory.length - 1; index >= 0; index -= 1) {
    if (roadNeighbors(game.map, game.pathHistory[index].head).length >= 3) {
      return index;
    }
  }

  return 0;
}

function distanceToTargets(map, start, targetKeys) {
  if (targetKeys.size === 0) {
    return 0;
  }

  const queue = [{ cell: start, distance: 0 }];
  const seen = new Set([cellKey(start)]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    if (targetKeys.has(cellKey(current.cell))) {
      return current.distance;
    }

    for (const neighbor of roadNeighbors(map, current.cell)) {
      const key = cellKey(neighbor.cell);

      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ cell: neighbor.cell, distance: current.distance + 1 });
      }
    }
  }

  return Number.POSITIVE_INFINITY;
}

function chooseRecoveryDirection(game, targetIndex, restoredSegments) {
  const junction = game.pathHistory[targetIndex].head;
  const deadEndBranch = game.pathHistory[targetIndex + 1]?.head ?? null;
  const occupiedBody = new Set(restoredSegments.slice(1).map(cellKey));
  let candidates = roadNeighbors(game.map, junction).filter((entry) =>
    !occupiedBody.has(cellKey(entry.cell))
  );

  if (deadEndBranch && candidates.length > 1) {
    const alternatives = candidates.filter((entry) => !sameCell(entry.cell, deadEndBranch));
    if (alternatives.length > 0) {
      candidates = alternatives;
    }
  }

  if (candidates.length === 0) {
    return DIRECTIONS.RIGHT;
  }

  const targetKeys = new Set([
    ...game.normalBenches.map(cellKey),
    ...(game.pearl ? [cellKey(game.pearl)] : [])
  ]);

  return candidates
    .map((candidate) => ({
      ...candidate,
      distance: distanceToTargets(game.map, candidate.cell, targetKeys)
    }))
    .sort((a, b) => a.distance - b.distance)[0].direction;
}

function beginRecovery(game) {
  const targetIndex = game.recoveryTarget.historyIndex;
  const frames = [];

  for (let index = game.pathHistory.length - 1; index >= targetIndex; index -= 1) {
    frames.push(expandedSegments(game.pathHistory[index].segments, game.benchCount));
  }

  game.pendingDirection = null;
  game.moveAccumulatorMs = 0;
  game.recovery = {
    targetIndex,
    frames,
    elapsedMs: 0,
    durationMs: Math.max(
      game.config.recoveryStepMs,
      (frames.length - 1) * game.config.recoveryStepMs
    )
  };
}

function completeRecovery(game) {
  const { targetIndex, frames } = game.recovery;
  const restoredSegments = cloneSegments(frames.at(-1));
  const direction = chooseRecoveryDirection(game, targetIndex, restoredSegments);

  game.segments = restoredSegments;
  game.previousSegments = cloneSegments(restoredSegments);
  game.direction = direction;
  game.pendingDirection = null;
  game.moveAccumulatorMs = 0;
  game.pathHistory = game.pathHistory.slice(0, targetIndex + 1);
  game.pathHistory[targetIndex] = pathSnapshot(game);
  game.recovery = null;
  game.recoveryTarget = null;
}

export function stepMovement(game) {
  if (
    game.phase !== 'running' ||
    game.stunRemainingMs > 0 ||
    game.recoveryTarget ||
    game.recovery
  ) {
    return false;
  }

  if (game.pendingDirection) {
    game.direction = game.pendingDirection;
    game.pendingDirection = null;
  }

  game.previousSegments = game.segments.map((segment) => ({ ...segment }));

  const head = game.segments[0];
  const next = {
    x: head.x + game.direction.x,
    y: head.y + game.direction.y
  };
  const hitsScene = !isRoad(game.map, next.x, next.y);
  const hitsSelf = game.segments.slice(1).some((segment) => sameCell(segment, next));

  if (hitsScene || hitsSelf) {
    game.collisionCount += 1;
    game.stunRemainingMs = game.config.collisionStunMs;

    if (hitsScene && roadNeighbors(game.map, head).length <= 1) {
      game.recoveryTarget = { historyIndex: nearestJunctionIndex(game) };
    }

    return false;
  }

  game.segments.unshift(next);

  if (game.segments.length - 1 > game.benchCount) {
    game.segments.pop();
  }

  collectAtHead(game);
  game.pathHistory.push(pathSnapshot(game));
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

  if (game.recovery) {
    candidates.push(game.recovery.durationMs - game.recovery.elapsedMs);
  } else if (game.stunRemainingMs > 0) {
    candidates.push(game.stunRemainingMs);
  } else {
    candidates.push(game.config.moveIntervalMs - game.moveAccumulatorMs);
  }

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

    if (game.recovery) {
      game.recovery.elapsedMs += sliceMs;
    } else if (game.stunRemainingMs > 0) {
      game.stunRemainingMs = Math.max(0, game.stunRemainingMs - sliceMs);
    } else {
      game.moveAccumulatorMs += sliceMs;
    }

    expireOrSpawnPearl(game);

    if (
      game.stunRemainingMs === 0 &&
      game.recoveryTarget &&
      !game.recovery
    ) {
      beginRecovery(game);
    }

    if (
      game.recovery &&
      game.recovery.elapsedMs >= game.recovery.durationMs
    ) {
      completeRecovery(game);
    }

    if (
      !game.recoveryTarget &&
      !game.recovery &&
      game.stunRemainingMs === 0 &&
      game.moveAccumulatorMs >= game.config.moveIntervalMs
    ) {
      game.moveAccumulatorMs -= game.config.moveIntervalMs;
      stepMovement(game);
    }

    if (game.remainingMs <= 0) {
      game.remainingMs = 0;
      game.phase = 'ended';
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
