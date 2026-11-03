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

test('map contains many small house tiles and no pond code', () => {
  const flat = MAP_LAYOUT.join('');

  assert.ok([...flat].filter((tile) => tile === 'H').length >= 24);
  assert.equal(flat.includes('P'), false);
});

test('map rejects ragged rows', () => {
  assert.throws(() => parseMap(['....', '...']), /equal width/);
});
