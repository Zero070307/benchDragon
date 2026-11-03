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

test('nextInt rejects invalid bounds', () => {
  const random = new SeededRandom(1);

  assert.throws(() => random.nextInt(0), RangeError);
  assert.throws(() => random.nextInt(1.5), RangeError);
});
