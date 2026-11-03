# Bench Dragon Single-Player Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, touch-friendly, single-player 60-second pixel-art Bench Dragon game that runs on GitHub Pages and is easy to test on a 16:9 Seewo whiteboard.

**Architecture:** Keep game rules in dependency-free ES modules and render the state through Canvas 2D. The logical map is a fixed tile grid where beige road tiles are the only traversable and spawnable cells; green grass and all scene tiles are collision walls. Browser UI code owns screens and input, while the pure engine owns movement, collision, timers, seeded spawning, pause, and restart.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Canvas 2D, Node.js built-in test runner for development tests only.

**Spec:** `docs/superpowers/specs/2026-11-03-bench-dragon-single-player-demo-design.md`

## Global Constraints

- Production runtime must be fully static and require no server, database, private API, package CDN, or network connection.
- The single challenge lasts exactly 60 seconds after `GO`.
- Logical movement interval is 220ms per tile; collision stun is 500ms.
- Initial bench count is 3; keep 5 normal benches on the map whenever legal spawn cells exist.
- Normal benches add 1; dragon pearls add 2.
- Pearl opportunities occur every 12 seconds and each pearl lasts 7 seconds.
- Beige road is the only traversable and spawnable terrain.
- Green grass, houses, rice fields, bamboo, temple, and every other scene tile are walls.
- Do not include a pond or anonymous gray blocker tiles.
- Use small, repeated pixel houses and short recognizable courtyard walls to form the maze.
- Direction controls remain below the map in three rows, with the left/right row separating up from down.
- Same seed plus restart must reproduce the same initial items and later spawn candidate sequence.
- Node.js is allowed only to execute tests; deployment output remains plain static files.
- The current folder is not a Git repository, so task checkpoints use test results instead of commits.

## File Structure

```text
index.html                  Browser entry and screen markup
styles.css                 16:9 layout, touch controls, HUD, overlays
package.json               ES-module mode and local test command
js/config.js               Tunable gameplay and layout values
js/random.js               Deterministic seeded random generator
js/map.js                  Tile map, terrain queries, connectivity helpers
js/game-engine.js          Pure game state and all game rules
js/input.js                Touch, arrow-key, and WASD adapters
js/renderer.js             Canvas pixel-art renderer
js/screens.js              Screen visibility and result presentation
js/main.js                 Browser bootstrap and animation loop
tests/random.test.js       Seed and reset determinism
tests/map.test.js          Road semantics, connectivity, and maze loops
tests/game-engine.test.js  Movement, collision, items, timing, pause, restart
tests/input.test.js        Key mapping and reverse-turn prevention
tests/smoke.test.js        Static-file and DOM-contract checks
README.md                  Run, test, and GitHub Pages instructions
```

---

### Task 1: Deterministic Random and Tile Maze Foundation

**Files:**
- Create: `package.json`
- Create: `js/config.js`
- Create: `js/random.js`
- Create: `js/map.js`
- Create: `tests/random.test.js`
- Create: `tests/map.test.js`

**Interfaces:**
- Produces: `GAME_CONFIG`, `SeededRandom`, `MAP_LAYOUT`, `parseMap()`, `getTile()`, `isRoad()`, `getRoadCells()`, `roadCycleRank()`.
- Terrain codes: `.` road, `G` grass, `H` house, `R` rice, `B` bamboo, `T` temple, `W` short courtyard wall, `S` drying-yard scenery.

- [ ] **Step 1: Add the test command and failing deterministic-random tests**

Create `package.json`:

```json
{
  "name": "bench-dragon-demo",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

Create `tests/random.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SeededRandom } from '../js/random.js';

test('same seed generates the same sequence', () => {
  const a = new SeededRandom(482931);
  const b = new SeededRandom(482931);
  assert.deepEqual(
    Array.from({ length: 20 }, () => a.nextUint32()),
    Array.from({ length: 20 }, () => b.nextUint32())
  );
});

test('reset restores the original sequence', () => {
  const random = new SeededRandom(91);
  const first = Array.from({ length: 8 }, () => random.nextInt(100));
  random.reset();
  assert.deepEqual(Array.from({ length: 8 }, () => random.nextInt(100)), first);
});
```

- [ ] **Step 2: Run the random tests and verify the expected failure**

Run: `node --test tests/random.test.js`

Expected: FAIL because `js/random.js` does not exist.

- [ ] **Step 3: Implement the seeded generator and central configuration**

Create `js/config.js`:

```js
export const GAME_CONFIG = Object.freeze({
  durationMs: 60_000,
  countdownSeconds: 3,
  gridWidth: 28,
  gridHeight: 14,
  initialBenchCount: 3,
  normalBenchCount: 5,
  normalBenchReward: 1,
  pearlReward: 2,
  moveIntervalMs: 220,
  collisionStunMs: 500,
  pearlIntervalMs: 12_000,
  pearlLifetimeMs: 7_000,
  finalCountdownMs: 10_000,
  spawnHeadClearance: 1
});
```

Create `js/random.js`:

```js
export class SeededRandom {
  constructor(seed) {
    this.initialSeed = (seed >>> 0) || 0x6d2b79f5;
    this.state = this.initialSeed;
  }

  reset() {
    this.state = this.initialSeed;
  }

  nextUint32() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  next() {
    return this.nextUint32() / 0x1_0000_0000;
  }

  nextInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive must be a positive integer');
    }
    return Math.floor(this.next() * maxExclusive);
  }
}
```

- [ ] **Step 4: Add the maze tests before the tile data**

Create `tests/map.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_LAYOUT,
  parseMap,
  getTile,
  isRoad,
  getRoadCells,
  reachableRoadCount,
  roadCycleRank
} from '../js/map.js';
import { GAME_CONFIG } from '../js/config.js';

test('map dimensions match configuration', () => {
  assert.equal(MAP_LAYOUT.length, GAME_CONFIG.gridHeight);
  assert.ok(MAP_LAYOUT.every((row) => row.length === GAME_CONFIG.gridWidth));
});

test('only beige road code is traversable', () => {
  const map = parseMap(MAP_LAYOUT);
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      assert.equal(isRoad(map, x, y), getTile(map, x, y) === '.');
    }
  }
});

test('all road tiles connect and contain at least two loops', () => {
  const map = parseMap(MAP_LAYOUT);
  const roads = getRoadCells(map);
  assert.equal(reachableRoadCount(map, roads[0]), roads.length);
  assert.ok(roadCycleRank(map) >= 2);
});

test('map contains repeated small houses and no pond code', () => {
  const flat = MAP_LAYOUT.join('');
  assert.ok([...flat].filter((tile) => tile === 'H').length >= 24);
  assert.equal(flat.includes('P'), false);
});
```

Run: `node --test tests/map.test.js`

Expected: FAIL because the map exports do not exist.

- [ ] **Step 5: Implement map parsing, semantics, connectivity, and the reviewed maze**

Create `js/map.js` with a 28×14 layout. Keep paths at least two tiles wide around turns, place many small `H` clusters instead of large buildings, leave a full road corridor between `T` and every neighboring scene, and never use a pond code.

```js
export const MAP_LAYOUT = Object.freeze([
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'G....RRRR...HH..HH...BBBB..G',
  'G....RRRR...HH..HH...BBBB..G',
  'G..........WW..............G',
  'G.HH..HH......HH..HH.......G',
  'G.HH..HH.....HH..HH..TT....G',
  'G...............WW...TT....G',
  'G....HH...SSSS.............G',
  'G....HH...SSSS...HH..HH....G',
  'G........SSSS...HH..HH.....G',
  'G.HH..HH............HH.....G',
  'G.HH..HH...HH..HH....HH....G',
  'G........HH....HH..........G',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGG'
]);

const CARDINALS = Object.freeze([
  { x: 1, y: 0 }, { x: -1, y: 0 },
  { x: 0, y: 1 }, { x: 0, y: -1 }
]);

export function parseMap(layout) {
  if (!layout.length || layout.some((row) => row.length !== layout[0].length)) {
    throw new Error('Map rows must be non-empty and equal width');
  }
  return { width: layout[0].length, height: layout.length, tiles: [...layout] };
}

export function getTile(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.tiles[y][x];
}

export function isRoad(map, x, y) {
  return getTile(map, x, y) === '.';
}

export function getRoadCells(map) {
  const cells = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (isRoad(map, x, y)) cells.push({ x, y });
    }
  }
  return cells;
}

export function reachableRoadCount(map, start) {
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);
  while (queue.length) {
    const cell = queue.shift();
    for (const delta of CARDINALS) {
      const next = { x: cell.x + delta.x, y: cell.y + delta.y };
      const key = `${next.x},${next.y}`;
      if (isRoad(map, next.x, next.y) && !seen.has(key)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  return seen.size;
}

export function roadCycleRank(map) {
  const roads = getRoadCells(map);
  const vertices = roads.length;
  let doubledEdges = 0;
  for (const cell of roads) {
    doubledEdges += CARDINALS.filter((delta) =>
      isRoad(map, cell.x + delta.x, cell.y + delta.y)
    ).length;
  }
  return doubledEdges / 2 - vertices + 1;
}
```

Run: `npm test`

Expected: all Task 1 tests PASS.

---

### Task 2: Pure Movement, Direction Buffer, and Collision Engine

**Files:**
- Create: `js/game-engine.js`
- Create: `tests/game-engine.test.js`

**Interfaces:**
- Consumes: `GAME_CONFIG`, `SeededRandom`, `parseMap()`, `isRoad()`, `getRoadCells()`.
- Produces: `DIRECTIONS`, `createGame()`, `queueDirection()`, `stepMovement()`, `advanceGame()`, `pauseGame()`, `resumeGame()`, `restartGame()`.
- `GameState.segments[0]` is the head; remaining segment positions are realized benches. `benchCount` is the displayed target count and may exceed realized benches while growth is being applied over later steps.

- [ ] **Step 1: Write focused failing movement and collision tests**

Create `tests/game-engine.test.js` beginning with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMap, isRoad } from '../js/map.js';
import {
  DIRECTIONS,
  createGame,
  queueDirection,
  stepMovement,
  advanceGame,
  pauseGame,
  resumeGame,
  restartGame
} from '../js/game-engine.js';

const OPEN_MAP = parseMap([
  'GGGGGGGGGG',
  'G........G',
  'G........G',
  'G........G',
  'GGGGGGGGGG'
]);

const SPAWN = Object.freeze({ x: 4, y: 2 });
const same = (a, b) => a.x === b.x && a.y === b.y;

function createRunningGame(seed = 7) {
  const game = createGame({ map: OPEN_MAP, seed, spawn: SPAWN, direction: DIRECTIONS.RIGHT });
  game.phase = 'running';
  return game;
}

test('dragon moves one tile and may not reverse', () => {
  const game = createRunningGame();
  assert.equal(queueDirection(game, DIRECTIONS.LEFT), false);
  stepMovement(game);
  assert.deepEqual(game.segments[0], { x: 5, y: 2 });
});

test('only one legal turn is buffered per movement step', () => {
  const game = createRunningGame();
  assert.equal(queueDirection(game, DIRECTIONS.UP), true);
  assert.equal(queueDirection(game, DIRECTIONS.LEFT), false);
  stepMovement(game);
  assert.deepEqual(game.segments[0], { x: 4, y: 1 });
});

test('green or scene tile collision keeps position and starts one stun', () => {
  const game = createGame({ map: OPEN_MAP, seed: 7, spawn: { x: 1, y: 2 }, direction: DIRECTIONS.LEFT });
  game.phase = 'running';
  const before = structuredClone(game.segments);
  stepMovement(game);
  assert.deepEqual(game.segments, before);
  assert.equal(game.collisionCount, 1);
  assert.equal(game.stunRemainingMs, 500);
  stepMovement(game);
  assert.equal(game.collisionCount, 1);
});

test('turn buffered during stun is applied when stun ends', () => {
  const game = createGame({ map: OPEN_MAP, seed: 7, spawn: { x: 1, y: 2 }, direction: DIRECTIONS.LEFT });
  game.phase = 'running';
  stepMovement(game);
  assert.equal(queueDirection(game, DIRECTIONS.UP), true);
  advanceGame(game, 500);
  stepMovement(game);
  assert.deepEqual(game.segments[0], { x: 1, y: 1 });
});
```

- [ ] **Step 2: Run the movement tests and verify failure**

Run: `node --test tests/game-engine.test.js`

Expected: FAIL because `js/game-engine.js` does not exist.

- [ ] **Step 3: Implement the exact direction and movement rules**

Create `js/game-engine.js` with these foundations:

```js
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
const opposite = (a, b) => a.x + b.x === 0 && a.y + b.y === 0;

export function createGame({ map, seed, spawn, direction = DIRECTIONS.RIGHT, config = GAME_CONFIG }) {
  const segments = [
    { ...spawn },
    { x: spawn.x - direction.x, y: spawn.y - direction.y },
    { x: spawn.x - direction.x * 2, y: spawn.y - direction.y * 2 },
    { x: spawn.x - direction.x * 3, y: spawn.y - direction.y * 3 }
  ];
  return {
    map, seed, config, rng: new SeededRandom(seed),
    phase: 'ready', direction, pendingDirection: null,
    segments, benchCount: config.initialBenchCount,
    collisionCount: 0, stunRemainingMs: 0,
    remainingMs: config.durationMs, elapsedMs: 0, moveAccumulatorMs: 0,
    normalBenches: [], pearl: null, nextPearlAtMs: config.pearlIntervalMs
  };
}

export function queueDirection(game, requested) {
  if (game.pendingDirection || opposite(game.direction, requested)) return false;
  game.pendingDirection = requested;
  return true;
}

export function stepMovement(game) {
  if (game.stunRemainingMs > 0 || game.phase !== 'running') return false;
  if (game.pendingDirection) {
    game.direction = game.pendingDirection;
    game.pendingDirection = null;
  }
  const head = game.segments[0];
  const next = { x: head.x + game.direction.x, y: head.y + game.direction.y };
  const hitsSelf = game.segments.slice(1).some((segment) => sameCell(segment, next));
  if (!isRoad(game.map, next.x, next.y) || hitsSelf) {
    game.collisionCount += 1;
    game.stunRemainingMs = game.config.collisionStunMs;
    return false;
  }
  game.segments.unshift(next);
  const realizedBenchCount = game.segments.length - 1;
  if (realizedBenchCount > game.benchCount) game.segments.pop();
  collectAtHead(game);
  return true;
}
```

Implement `collectAtHead(game)` in the same file so it removes a matching normal bench and increments `benchCount` by 1, or clears a matching pearl and increments `benchCount` by 2. Task 3 supplies respawn behavior, but collection must be functional now.

- [ ] **Step 4: Implement deterministic time advancement, pause, resume, and restart state**

Add:

```js
export function advanceGame(game, deltaMs) {
  if (game.phase !== 'running') return;
  const activeMs = Math.min(deltaMs, game.remainingMs);
  game.elapsedMs += activeMs;
  game.remainingMs -= activeMs;
  if (game.stunRemainingMs > 0) {
    game.stunRemainingMs = Math.max(0, game.stunRemainingMs - activeMs);
  } else {
    game.moveAccumulatorMs += activeMs;
    while (game.moveAccumulatorMs >= game.config.moveIntervalMs && game.phase === 'running') {
      game.moveAccumulatorMs -= game.config.moveIntervalMs;
      stepMovement(game);
      if (game.stunRemainingMs > 0) break;
    }
  }
  if (game.remainingMs === 0) game.phase = 'ended';
}

export function pauseGame(game) {
  if (game.phase === 'running') game.phase = 'paused';
}

export function resumeGame(game) {
  if (game.phase === 'paused') game.phase = 'running';
}

export function restartGame(game, spawn, direction = DIRECTIONS.RIGHT) {
  const fresh = createGame({ map: game.map, seed: game.seed, spawn, direction, config: game.config });
  Object.assign(game, fresh);
  return game;
}
```

- [ ] **Step 5: Run all engine tests and record a passing checkpoint**

Run: `npm test`

Expected: Task 1 and Task 2 tests PASS.

---

### Task 3: Controlled Item Spawning, Pearl Lifecycle, and Full Timer Coverage

**Files:**
- Modify: `js/game-engine.js`
- Extend: `tests/game-engine.test.js`

**Interfaces:**
- Produces: `populateInitialItems()`, `findSpawnCell()`, `updateItems()`.
- `findSpawnCell(game)` consumes seeded candidates and returns either a legal beige road coordinate or `null` when no legal road cell exists.

- [ ] **Step 1: Add failing item, pause, restart, and ending tests**

Append exact tests covering:

```js
test('initial and replacement items use only road cells', () => {
  const game = createRunningGame(31);
  populateInitialItems(game);
  assert.equal(game.normalBenches.length, 5);
  assert.ok(game.normalBenches.every((item) => isRoad(game.map, item.x, item.y)));
  assert.ok(game.normalBenches.every((item) => !game.segments.some((part) => same(part, item))));
});

test('normal bench adds one and is immediately replaced', () => {
  const game = createRunningGame(32);
  game.normalBenches = [{ x: game.segments[0].x + 1, y: game.segments[0].y }];
  const before = game.benchCount;
  stepMovement(game);
  assert.equal(game.benchCount, before + 1);
  assert.equal(game.normalBenches.length, 5);
});

test('pearl appears at 12 seconds, adds two, and expires after 7 seconds', () => {
  const game = createRunningGame(33);
  advanceGame(game, 12_000);
  assert.ok(game.pearl);
  assert.ok(isRoad(game.map, game.pearl.x, game.pearl.y));
  advanceGame(game, 7_000);
  assert.equal(game.pearl, null);
});

test('pause freezes every timer', () => {
  const game = createRunningGame(34);
  advanceGame(game, 3_000);
  pauseGame(game);
  const snapshot = structuredClone({
    remainingMs: game.remainingMs,
    elapsedMs: game.elapsedMs,
    pearl: game.pearl,
    stunRemainingMs: game.stunRemainingMs
  });
  advanceGame(game, 8_000);
  assert.deepEqual({
    remainingMs: game.remainingMs,
    elapsedMs: game.elapsedMs,
    pearl: game.pearl,
    stunRemainingMs: game.stunRemainingMs
  }, snapshot);
});

test('restart reproduces item positions for the same seed', () => {
  const game = createRunningGame(35);
  populateInitialItems(game);
  const first = structuredClone(game.normalBenches);
  restartGame(game, SPAWN, DIRECTIONS.RIGHT);
  game.phase = 'running';
  populateInitialItems(game);
  assert.deepEqual(game.normalBenches, first);
});

test('challenge ends at exactly zero milliseconds', () => {
  const game = createRunningGame(36);
  advanceGame(game, 60_000);
  assert.equal(game.remainingMs, 0);
  assert.equal(game.phase, 'ended');
});
```

- [ ] **Step 2: Run the extended engine suite and verify failure**

Run: `node --test tests/game-engine.test.js`

Expected: FAIL on missing item lifecycle functions.

- [ ] **Step 3: Implement legal seeded spawn selection**

Use a deterministic Fisher-Yates-style candidate draw without modifying the static road list:

```js
const cellKey = (cell) => `${cell.x},${cell.y}`;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function findSpawnCell(game) {
  const roads = getRoadCells(game.map);
  const occupied = new Set([
    ...game.segments.map(cellKey),
    ...game.normalBenches.map(cellKey),
    ...(game.pearl ? [cellKey(game.pearl)] : [])
  ]);
  for (let tries = 0; tries < roads.length * 2; tries += 1) {
    const cell = roads[game.rng.nextInt(roads.length)];
    if (occupied.has(cellKey(cell))) continue;
    if (manhattan(cell, game.segments[0]) <= game.config.spawnHeadClearance) continue;
    return { ...cell };
  }
  return roads.find((cell) =>
    !occupied.has(cellKey(cell)) &&
    manhattan(cell, game.segments[0]) > game.config.spawnHeadClearance
  ) ?? null;
}

export function populateInitialItems(game) {
  while (game.normalBenches.length < game.config.normalBenchCount) {
    const cell = findSpawnCell(game);
    if (!cell) break;
    game.normalBenches.push(cell);
  }
}
```

After normal-bench collection, call `populateInitialItems(game)` so the count returns to 5 immediately whenever legal cells remain.

- [ ] **Step 4: Implement pearl scheduling and expiration using active game time**

Add `remainingMs` to the pearl object and call this function inside `advanceGame()` after the active-time calculation:

```js
export function updateItems(game, activeMs) {
  if (game.pearl) {
    game.pearl.remainingMs -= activeMs;
    if (game.pearl.remainingMs <= 0) game.pearl = null;
  }
  if (game.elapsedMs >= game.nextPearlAtMs) {
    if (!game.pearl) {
      const cell = findSpawnCell(game);
      if (cell) game.pearl = { ...cell, remainingMs: game.config.pearlLifetimeMs };
    }
    game.nextPearlAtMs += game.config.pearlIntervalMs;
  }
}
```

When the head collects a pearl, clear it before calling any replacement logic and increase `benchCount` by `pearlReward`.

- [ ] **Step 5: Run the complete pure-logic suite**

Run: `npm test`

Expected: all tests through Task 3 PASS with no external packages installed.

---

### Task 4: Pixel Renderer and Scene-Based Maze

**Files:**
- Create: `js/renderer.js`
- Create: `index.html` with the game canvas and screen containers needed by the renderer
- Create: `tests/smoke.test.js` with renderer/source contract checks

**Interfaces:**
- Consumes: parsed map and complete `GameState`.
- Produces: `createRenderer(canvas)`, returning `{ resize(), render(game) }`.
- Scene drawing functions: `drawGrass`, `drawRoad`, `drawHouse`, `drawRice`, `drawBamboo`, `drawTemple`, `drawWall`, `drawDragon`, `drawNormalBench`, `drawPearl`.

- [ ] **Step 1: Add failing static renderer-contract tests**

Create `tests/smoke.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index provides the required canvas and screens', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['home-screen', 'rules-screen', 'countdown-screen', 'game-screen', 'result-screen', 'game-canvas']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test('renderer disables image smoothing and has no pond renderer', async () => {
  const source = await readFile(new URL('../js/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /imageSmoothingEnabled\s*=\s*false/);
  assert.doesNotMatch(source, /drawPond|pond/i);
});
```

- [ ] **Step 2: Run the smoke tests and verify failure**

Run: `node --test tests/smoke.test.js`

Expected: FAIL because the browser files do not exist.

- [ ] **Step 3: Create semantic screen markup and the canvas shell**

Create `index.html` with one `<main id="app">`, five screen sections, one `<canvas id="game-canvas">`, a visible HUD, teacher controls, and four direction buttons. Use these stable IDs:

```html
<section id="game-screen" class="screen" hidden>
  <header class="hud">
    <div><span>长度</span><strong id="length-value">3 节</strong></div>
    <div><span>碰撞</span><strong id="collision-value">0</strong></div>
    <div><span>剩余</span><strong id="time-value">01:00</strong></div>
    <nav class="teacher-controls" aria-label="教师控制">
      <button id="pause-button" type="button">暂停</button>
      <button id="restart-button" type="button">重开</button>
      <button id="home-button" type="button">返回首页</button>
    </nav>
  </header>
  <div class="canvas-frame"><canvas id="game-canvas" aria-label="乡村道路迷宫"></canvas></div>
  <div class="direction-pad" aria-label="方向控制">
    <button data-direction="up" class="direction up" type="button">↑</button>
    <button data-direction="left" class="direction left" type="button">←</button>
    <button data-direction="right" class="direction right" type="button">→</button>
    <button data-direction="down" class="direction down" type="button">↓</button>
  </div>
</section>
```

Also include home, rules, countdown, and result sections using the IDs asserted by the smoke test, plus `<script type="module" src="js/main.js"></script>`.

- [ ] **Step 4: Implement integer-scaled tile rendering and recognizable pixel scenes**

Create `js/renderer.js`. Calculate `tileSize` from the canvas backing size, center the full map, and draw every tile using integer coordinates. Set:

```js
ctx.imageSmoothingEnabled = false;
```

Terrain drawing rules:

```js
const TILE_DRAWERS = {
  '.': drawRoad,
  'G': drawGrass,
  'H': drawHouse,
  'R': drawRice,
  'B': drawBamboo,
  'T': drawTemple,
  'W': drawWall,
  'S': drawYard
};
```

Each scene function must use small `fillRect()` pixel clusters rather than text labels:

- `drawHouse`: gray stepped roof, cream wall, red door, blue window.
- `drawRice`: ochre soil, green/brown ridge, repeated gold stalk pixels.
- `drawBamboo`: dark green floor, segmented light-green stems and blocky leaves.
- `drawTemple`: dark stepped roof, red wall, gold pillars, central dark door.
- `drawWall`: a narrow tan brick line, never a large gray rectangle.
- `drawYard`: warm paving blocks and two small grain piles; it remains a wall because only `.` is road.

Draw the dragon last. The head occupies at most 80% of a tile, each bench at most 65%, and the tail at most 50%. Draw normal benches and pearls at at most 45% of a tile so routes remain readable.

- [ ] **Step 5: Run smoke and logic tests**

Run: `npm test`

Expected: all tests PASS, including absence of pond rendering.

---

### Task 5: Input Adapters and Screen State Flow

**Files:**
- Create: `js/input.js`
- Create: `js/screens.js`
- Create: `tests/input.test.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: direction names and `queueDirection()` callback.
- Produces: `directionForKey(key)`, `bindInput({ root, onDirection })`, `createScreens(document)`.

- [ ] **Step 1: Add failing key-mapping tests**

Create `tests/input.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { directionForKey } from '../js/input.js';

test('arrow keys and WASD map to direction names', () => {
  assert.equal(directionForKey('ArrowUp'), 'up');
  assert.equal(directionForKey('w'), 'up');
  assert.equal(directionForKey('A'), 'left');
  assert.equal(directionForKey('ArrowRight'), 'right');
  assert.equal(directionForKey('s'), 'down');
  assert.equal(directionForKey('Enter'), null);
});
```

- [ ] **Step 2: Run input tests and verify failure**

Run: `node --test tests/input.test.js`

Expected: FAIL because `js/input.js` does not exist.

- [ ] **Step 3: Implement keyboard and touch adapters**

Create `js/input.js`:

```js
const KEY_DIRECTIONS = new Map([
  ['ArrowUp', 'up'], ['w', 'up'],
  ['ArrowDown', 'down'], ['s', 'down'],
  ['ArrowLeft', 'left'], ['a', 'left'],
  ['ArrowRight', 'right'], ['d', 'right']
]);

export function directionForKey(key) {
  return KEY_DIRECTIONS.get(key.length === 1 ? key.toLowerCase() : key) ?? null;
}

export function bindInput({ root, onDirection }) {
  const onKeyDown = (event) => {
    const direction = directionForKey(event.key);
    if (!direction) return;
    event.preventDefault();
    onDirection(direction);
  };
  const onPointerDown = (event) => {
    const button = event.target.closest('[data-direction]');
    if (!button || !root.contains(button)) return;
    event.preventDefault();
    onDirection(button.dataset.direction);
  };
  window.addEventListener('keydown', onKeyDown, { passive: false });
  root.addEventListener('pointerdown', onPointerDown, { passive: false });
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    root.removeEventListener('pointerdown', onPointerDown);
  };
}
```

- [ ] **Step 4: Implement page transitions without hiding game rules inside the renderer**

Create `js/screens.js`:

```js
const SCREEN_IDS = ['home', 'rules', 'countdown', 'game', 'result'];

export function createScreens(document) {
  const screens = Object.fromEntries(
    SCREEN_IDS.map((name) => [name, document.getElementById(`${name}-screen`)])
  );
  function show(name) {
    for (const [key, element] of Object.entries(screens)) element.hidden = key !== name;
  }
  function showResult({ benchCount, collisionCount }) {
    document.getElementById('result-length').textContent = `${benchCount} 节`;
    document.getElementById('result-collisions').textContent = `${collisionCount} 次`;
    show('result');
  }
  return { show, showResult };
}
```

Add buttons with stable IDs: `start-button`, `rules-button`, `rules-back-button`, `pause-button`, `restart-button`, `home-button`, `play-again-button`, `result-home-button`.

- [ ] **Step 5: Run the input and full suites**

Run: `npm test`

Expected: all tests PASS.

---

### Task 6: Browser Bootstrap, Countdown, HUD, Pause, Restart, and Finish

**Files:**
- Create: `js/main.js`
- Modify: `js/game-engine.js`
- Modify: `index.html`
- Extend: `tests/smoke.test.js`

**Interfaces:**
- Consumes every earlier module.
- Produces a complete playable single-player flow with no global mutable API.

- [ ] **Step 1: Extend smoke checks for every required control and module entry**

Add assertions that `index.html` contains every stable button ID and that `js/main.js` imports `createGame`, `createRenderer`, `bindInput`, and `createScreens`.

- [ ] **Step 2: Run smoke tests and verify failure**

Run: `node --test tests/smoke.test.js`

Expected: FAIL because `js/main.js` is missing.

- [ ] **Step 3: Implement the browser lifecycle**

In `js/main.js`:

1. Parse `MAP_LAYOUT` once.
2. Pick a reviewed road spawn where three initial trailing benches also remain on road.
3. Create a seed with `crypto.getRandomValues(new Uint32Array(1))[0]` once per new challenge.
4. Keep the same seed for “重开”; generate a fresh seed for “再玩一次”.
5. Run a visible 3-2-1-GO countdown using `setTimeout` and ignore direction input until `GO`.
6. Start one `requestAnimationFrame` loop and pass clamped frame deltas to `advanceGame()`.
7. Call `renderer.render(game)` every frame.
8. Update HUD text from game state.
9. Switch to the result screen exactly once when `phase === 'ended'`.

Use an explicit name-to-direction mapping:

```js
const DIRECTIONS_BY_NAME = {
  up: DIRECTIONS.UP,
  down: DIRECTIONS.DOWN,
  left: DIRECTIONS.LEFT,
  right: DIRECTIONS.RIGHT
};
```

For restart, call `restartGame(game, SPAWN, DIRECTIONS.RIGHT)`, repopulate items, and rerun the countdown without changing `game.seed`.

- [ ] **Step 4: Wire pause and safe navigation**

- “暂停” calls `pauseGame(game)`, changes button text to “继续”, and displays a paused overlay.
- “继续” calls `resumeGame(game)` and clears the overlay.
- “返回首页” stops active gameplay, shows home, and does not leave a hidden running timer.
- Re-entering a challenge creates a fresh game object and never stacks input listeners or animation loops.
- When the remaining time enters the last 10 seconds, add `is-final-countdown` to the time display; remove it on restart.

- [ ] **Step 5: Run the complete automated suite**

Run: `npm test`

Expected: all tests PASS.

---

### Task 7: Seewo Whiteboard Layout and Touch Polish

**Files:**
- Create: `styles.css`
- Modify: `index.html`
- Extend: `tests/smoke.test.js`

**Interfaces:**
- CSS consumes only the stable IDs and classes already defined.
- Produces a no-scroll 16:9 layout with a dominant map and separated three-row D-pad.

- [ ] **Step 1: Add failing CSS-contract checks**

Extend `tests/smoke.test.js`:

```js
test('touch layout prevents scrolling and keeps three distinct direction rows', async () => {
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /grid-template-areas:[^;]*"\. up\."[^;]*"left \. right"[^;]*"\. down \./s);
});
```

- [ ] **Step 2: Run the smoke test and verify failure**

Run: `node --test tests/smoke.test.js`

Expected: FAIL because `styles.css` does not exist.

- [ ] **Step 3: Implement the full-screen responsive shell**

Required CSS foundations:

```css
html, body {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  overscroll-behavior: none;
  touch-action: none;
}

#app, .screen {
  width: 100%;
  height: 100dvh;
}

#game-screen:not([hidden]) {
  display: grid;
  grid-template-rows: minmax(56px, 8dvh) minmax(0, 1fr) minmax(190px, 27dvh);
}

.canvas-frame {
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
}

#game-canvas {
  width: min(100%, calc((65dvh) * 2));
  max-height: 100%;
  image-rendering: pixelated;
}
```

Keep the map visually dominant. Teacher controls stay in the HUD, away from the D-pad.

- [ ] **Step 4: Implement the separated Seewo D-pad and feedback**

```css
.direction-pad {
  display: grid;
  grid-template-columns: repeat(3, clamp(76px, 8vw, 132px));
  grid-template-rows: repeat(3, clamp(52px, 6dvh, 82px));
  grid-template-areas:
    ". up ."
    "left . right"
    ". down .";
  gap: clamp(8px, 1.3dvh, 18px) clamp(18px, 2.5vw, 42px);
  place-content: center;
}

.direction.up { grid-area: up; }
.direction.left { grid-area: left; }
.direction.right { grid-area: right; }
.direction.down { grid-area: down; }

.direction:active {
  transform: translateY(3px);
  filter: brightness(.88);
}
```

Use at least 76×52 CSS pixels for every direction button, with larger values on 16:9 whiteboards.

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: all tests PASS.

---

### Task 8: Documentation and End-to-End Verification

**Files:**
- Create: `README.md`
- Modify only if verification exposes a defect: files from Tasks 1–7

**Interfaces:**
- Produces a directly usable local demo and GitHub Pages deployment instructions.

- [ ] **Step 1: Write the run and deployment guide**

Document these exact workflows:

```text
Run tests:
  npm test

Preview locally:
  python -m http.server 8000
  open http://localhost:8000/

GitHub Pages:
  publish the repository root from the main branch
```

Explain that Node is needed only for tests, while the game itself is a static site. Include controls, scoring, collision behavior, pause, restart, and the current absence of two-player PK.

- [ ] **Step 2: Run the full automated suite from a clean command**

Run: `npm test`

Expected: zero failures and zero skipped tests.

- [ ] **Step 3: Start a static server and verify the real browser flow**

Run: `python -m http.server 8000`

Verify in a browser:

1. Home and rules pages fit without scrolling.
2. Start shows 3-2-1-GO before movement and timing.
3. Touch buttons, arrow keys, and WASD turn the dragon.
4. Direct reverse input is ignored.
5. Beige roads are traversable; green grass and every scene tile collide.
6. Collision holds position, adds one collision, and pauses movement for about 0.5 seconds.
7. Five normal benches stay on beige roads.
8. Pearls appear only on beige roads.
9. Pause freezes movement and all timers.
10. Restart preserves the seed and reproduces initial item placement.
11. The final 10 seconds are visually emphasized.
12. At zero, the result screen shows length and collisions.
13. No pond or unidentified gray blocker appears.
14. The map remains dominant at 1920×1080 with no scrollbar.
15. Up and down are separated by the complete left/right row.

- [ ] **Step 4: Inspect the browser console and responsive layout**

Check 1920×1080 and 1366×768. Expected: no uncaught errors, no missing resources, no horizontal or vertical scrollbars, no stretched canvas collision coordinates, and readable HUD values.

- [ ] **Step 5: Record final evidence**

Save the final `npm test` output and list any manual checks that could not be performed. Do not claim Seewo hardware verification unless the game was actually opened on that hardware.
