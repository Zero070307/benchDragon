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
