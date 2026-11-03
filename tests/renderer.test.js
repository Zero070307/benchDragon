import test from 'node:test';
import assert from 'node:assert/strict';
import {
  interpolateSegments,
  createRenderer
} from '../js/renderer.js';

test('dragon segments interpolate linearly between logical steps', () => {
  const previous = [
    { x: 2, y: 2 },
    { x: 1, y: 2 },
    { x: 0, y: 2 }
  ];
  const current = [
    { x: 3, y: 2 },
    { x: 2, y: 2 },
    { x: 1, y: 2 }
  ];

  assert.deepEqual(interpolateSegments(previous, current, 0), previous);
  assert.deepEqual(interpolateSegments(previous, current, 0.5), [
    { x: 2.5, y: 2 },
    { x: 1.5, y: 2 },
    { x: 0.5, y: 2 }
  ]);
  assert.deepEqual(interpolateSegments(previous, current, 1), current);
});

test('new growth starts from the previous tail instead of appearing ahead', () => {
  const previous = [
    { x: 2, y: 2 },
    { x: 1, y: 2 }
  ];
  const current = [
    { x: 3, y: 2 },
    { x: 2, y: 2 },
    { x: 1, y: 2 }
  ];

  assert.deepEqual(interpolateSegments(previous, current, 0.5), [
    { x: 2.5, y: 2 },
    { x: 1.5, y: 2 },
    { x: 1, y: 2 }
  ]);
});

test('renderer builds the static map layer only once for repeated frames', () => {
  const noOp = () => {};
  const mainContext = {
    imageSmoothingEnabled: true,
    clearRect: noOp,
    drawImage: noOp,
    fillRect: noOp,
    save: noOp,
    restore: noOp,
    translate: noOp,
    rotate: noOp
  };
  const layerContext = {
    imageSmoothingEnabled: true,
    fillRect: noOp
  };
  let layerCreations = 0;
  const canvas = {
    width: 28,
    height: 28,
    getContext: () => mainContext,
    ownerDocument: {
      createElement() {
        layerCreations += 1;
        return {
          width: 0,
          height: 0,
          getContext: () => layerContext
        };
      }
    }
  };
  const renderer = createRenderer(canvas);
  const game = {
    map: { width: 1, height: 1, tiles: ['.'] },
    config: { moveIntervalMs: 220 },
    phase: 'running',
    moveAccumulatorMs: 50,
    direction: { x: 1, y: 0 },
    previousSegments: [{ x: 0, y: 0 }],
    segments: [{ x: 0, y: 0 }],
    normalBenches: [],
    pearl: null
  };

  renderer.render(game);
  renderer.render(game);

  assert.equal(layerCreations, 1);
});
