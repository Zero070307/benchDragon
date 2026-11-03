import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_LAYOUT, parseMap, isRoad } from '../js/map.js';
import {
  DIRECTIONS,
  createGame,
  queueDirection,
  stepMovement,
  advanceGame,
  pauseGame,
  resumeGame,
  restartGame,
  populateInitialItems,
  findSpawnCell
} from '../js/game-engine.js';

const OPEN_MAP = parseMap([
  'GGGGGGGGGGGG',
  'G..........G',
  'G..........G',
  'G..........G',
  'G..........G',
  'G..........G',
  'GGGGGGGGGGGG'
]);

const SPAWN = Object.freeze({ x: 4, y: 3 });
const same = (a, b) => a.x === b.x && a.y === b.y;

function createRunningGame(seed = 7, overrides = {}) {
  const game = createGame({
    map: OPEN_MAP,
    seed,
    spawn: SPAWN,
    direction: DIRECTIONS.RIGHT,
    ...overrides
  });
  game.phase = 'running';
  return game;
}

test('dragon moves one tile and may not reverse', () => {
  const game = createRunningGame();
  const before = structuredClone(game.segments);

  assert.equal(queueDirection(game, DIRECTIONS.LEFT), false);
  stepMovement(game);

  assert.deepEqual(game.segments[0], { x: 5, y: 3 });
  assert.deepEqual(game.previousSegments, before);
});

test('only one legal turn is buffered per movement step', () => {
  const game = createRunningGame();

  assert.equal(queueDirection(game, DIRECTIONS.UP), true);
  assert.equal(queueDirection(game, DIRECTIONS.LEFT), false);
  stepMovement(game);

  assert.deepEqual(game.segments[0], { x: 4, y: 2 });
});

test('scene collision keeps position and starts one stun', () => {
  const game = createGame({
    map: OPEN_MAP,
    seed: 7,
    spawn: { x: 1, y: 3 },
    direction: DIRECTIONS.LEFT
  });
  game.phase = 'running';
  const before = structuredClone(game.segments);

  stepMovement(game);
  stepMovement(game);

  assert.deepEqual(game.segments, before);
  assert.deepEqual(game.previousSegments, before);
  assert.equal(game.collisionCount, 1);
  assert.equal(game.stunRemainingMs, 500);
});

test('turn buffered during stun is applied when stun ends', () => {
  const game = createGame({
    map: OPEN_MAP,
    seed: 8,
    spawn: { x: 1, y: 3 },
    direction: DIRECTIONS.LEFT
  });
  game.phase = 'running';

  stepMovement(game);
  assert.equal(queueDirection(game, DIRECTIONS.UP), true);
  advanceGame(game, 500);
  stepMovement(game);

  assert.deepEqual(game.segments[0], { x: 1, y: 2 });
});

test('a queued turn is committed within 100 milliseconds', () => {
  const game = createRunningGame(81);

  queueDirection(game, DIRECTIONS.UP);
  advanceGame(game, 99);
  assert.deepEqual(game.segments[0], SPAWN);
  advanceGame(game, 1);

  assert.deepEqual(game.segments[0], { x: 4, y: 2 });
});

test('dead-end collision rewinds to the nearest junction and aims at the nearest item', () => {
  const deadEndMap = parseMap([
    'GGGGGGG',
    'G.....G',
    'GGG.GGG',
    'GGG.GGG',
    'GGGGGGG'
  ]);
  const game = createGame({
    map: deadEndMap,
    seed: 82,
    spawn: { x: 3, y: 1 },
    direction: DIRECTIONS.DOWN,
    config: {
      ...createRunningGame().config,
      initialBenchCount: 0,
      recoveryStepMs: 70
    }
  });
  game.phase = 'running';
  game.normalBenches = [{ x: 5, y: 1 }];
  const initialRemainingMs = game.remainingMs;

  stepMovement(game);
  stepMovement(game);
  stepMovement(game);

  assert.equal(game.collisionCount, 1);
  assert.ok(game.recoveryTarget);

  advanceGame(game, 500);
  assert.ok(game.recovery);
  const recoveryDurationMs = game.recovery.durationMs;

  advanceGame(game, recoveryDurationMs);

  assert.equal(game.recovery, null);
  assert.equal(game.recoveryTarget, null);
  assert.deepEqual(game.segments[0], { x: 3, y: 1 });
  assert.equal(game.direction, DIRECTIONS.RIGHT);
  assert.deepEqual(game.normalBenches, [{ x: 5, y: 1 }]);
  assert.equal(
    game.remainingMs,
    initialRemainingMs - 500 - recoveryDurationMs
  );
});

test('moving into the realized body triggers collision', () => {
  const game = createRunningGame();
  game.segments = [
    { x: 5, y: 3 },
    { x: 5, y: 4 },
    { x: 4, y: 4 },
    { x: 4, y: 3 }
  ];
  game.direction = DIRECTIONS.DOWN;

  queueDirection(game, DIRECTIONS.LEFT);
  stepMovement(game);

  assert.equal(game.collisionCount, 1);
  assert.deepEqual(game.segments[0], { x: 5, y: 3 });
});

test('initial items use only road cells and avoid the dragon', () => {
  const game = createRunningGame(31);

  populateInitialItems(game);

  assert.equal(game.normalBenches.length, 5);
  assert.ok(game.normalBenches.every((item) => isRoad(game.map, item.x, item.y)));
  assert.ok(game.normalBenches.every((item) => !game.segments.some((part) => same(part, item))));
  assert.ok(game.normalBenches.every((item) =>
    Math.abs(item.x - game.segments[0].x) + Math.abs(item.y - game.segments[0].y) > 1
  ));
});

test('five normal benches are distributed across all four map regions', () => {
  const game = createGame({
    map: parseMap(MAP_LAYOUT),
    seed: 17,
    spawn: { x: 4, y: 3 },
    direction: DIRECTIONS.RIGHT
  });
  game.phase = 'running';

  populateInitialItems(game);

  const regions = new Set(game.normalBenches.map((cell) =>
    `${cell.x < game.map.width / 2 ? 'left' : 'right'}-${cell.y < game.map.height / 2 ? 'top' : 'bottom'}`
  ));
  assert.equal(regions.size, 4);
});

test('spawn selection returns null when no legal road cell exists', () => {
  const tinyMap = parseMap([
    'GGGGG',
    'G...G',
    'GGGGG'
  ]);
  const game = createGame({
    map: tinyMap,
    seed: 1,
    spawn: { x: 2, y: 1 },
    direction: DIRECTIONS.RIGHT,
    config: {
      ...createRunningGame().config,
      initialBenchCount: 0
    }
  });
  game.segments = [{ x: 2, y: 1 }];
  game.normalBenches = [{ x: 1, y: 1 }, { x: 3, y: 1 }];

  assert.equal(findSpawnCell(game), null);
});

test('normal bench adds one and is immediately replaced', () => {
  const game = createRunningGame(32);
  game.normalBenches = [{ x: 5, y: 3 }];
  const before = game.benchCount;

  stepMovement(game);

  assert.equal(game.benchCount, before + 1);
  assert.equal(game.normalBenches.length, 5);
  assert.ok(game.normalBenches.every((item) => isRoad(game.map, item.x, item.y)));
});

test('pearl appears at 12 seconds and expires after 7 active seconds', () => {
  const game = createRunningGame(33);

  advanceGame(game, 12_000);
  assert.ok(game.pearl);
  assert.ok(isRoad(game.map, game.pearl.x, game.pearl.y));

  advanceGame(game, 7_000);
  assert.equal(game.pearl, null);
});

test('collecting a pearl adds two benches', () => {
  const game = createRunningGame(34);
  game.pearl = { x: 5, y: 3, remainingMs: 7_000 };
  const before = game.benchCount;

  stepMovement(game);

  assert.equal(game.benchCount, before + 2);
  assert.equal(game.pearl, null);
});

test('pause freezes movement and every game timer', () => {
  const game = createRunningGame(35);
  advanceGame(game, 3_000);
  pauseGame(game);
  const snapshot = structuredClone({
    segments: game.segments,
    remainingMs: game.remainingMs,
    elapsedMs: game.elapsedMs,
    pearl: game.pearl,
    stunRemainingMs: game.stunRemainingMs
  });

  advanceGame(game, 8_000);

  assert.deepEqual({
    segments: game.segments,
    remainingMs: game.remainingMs,
    elapsedMs: game.elapsedMs,
    pearl: game.pearl,
    stunRemainingMs: game.stunRemainingMs
  }, snapshot);
  resumeGame(game);
  assert.equal(game.phase, 'running');
});

test('restart reproduces item positions for the same seed', () => {
  const game = createRunningGame(36);
  populateInitialItems(game);
  const first = structuredClone(game.normalBenches);

  restartGame(game, SPAWN, DIRECTIONS.RIGHT);
  game.phase = 'running';
  populateInitialItems(game);

  assert.deepEqual(game.normalBenches, first);
  assert.equal(game.remainingMs, 60_000);
  assert.equal(game.collisionCount, 0);
  assert.equal(game.benchCount, 3);
});

test('challenge ends at exactly zero milliseconds', () => {
  const game = createRunningGame(37);

  advanceGame(game, 60_000);

  assert.equal(game.remainingMs, 0);
  assert.equal(game.phase, 'ended');
});
