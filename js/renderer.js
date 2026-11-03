import { getTile } from './map.js';

const TILE_SIZE = 28;

export function interpolateSegments(previousSegments, currentSegments, progress) {
  const amount = Math.max(0, Math.min(1, progress));
  const previousTail = previousSegments.at(-1);

  return currentSegments.map((current, index) => {
    const previous = previousSegments[index] ?? previousTail ?? current;
    return {
      x: previous.x + (current.x - previous.x) * amount,
      y: previous.y + (current.y - previous.y) * amount
    };
  });
}

export function interpolateRecoveryFrames(frames, progress) {
  if (frames.length === 0) {
    return [];
  }

  if (frames.length === 1) {
    return frames[0].map((segment) => ({ ...segment }));
  }

  const amount = Math.max(0, Math.min(1, progress));
  const scaled = amount * (frames.length - 1);
  const startIndex = Math.min(Math.floor(scaled), frames.length - 2);
  const localProgress = amount === 1 ? 1 : scaled - startIndex;
  return interpolateSegments(
    frames[startIndex],
    frames[startIndex + 1],
    localProgress
  );
}

const COLORS = Object.freeze({
  road: '#c8ad77',
  roadLight: '#ddc694',
  roadDark: '#ad915e',
  grass: '#719b49',
  grassLight: '#83ab55',
  grassDark: '#4f773a',
  roof: '#3e4446',
  roofLight: '#6c7374',
  wall: '#eadfc6',
  door: '#81332f',
  window: '#4f8696',
  red: '#b52a2e',
  redDark: '#762023',
  gold: '#f0bf44',
  riceSoil: '#a78938',
  rice: '#ead468',
  bamboo: '#245331',
  bambooLight: '#79aa4b',
  temple: '#8f3535',
  yard: '#b77b43',
  yardLight: '#cf9655'
});

function pixelRect(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function drawRoad(ctx, x, y, size) {
  pixelRect(ctx, x, y, size, size, COLORS.road);
  pixelRect(ctx, x + 4, y + 6, 4, 3, COLORS.roadDark);
  pixelRect(ctx, x + size - 8, y + size - 9, 3, 3, COLORS.roadLight);
}

function drawGrass(ctx, x, y, size) {
  pixelRect(ctx, x, y, size, size, COLORS.grass);
  pixelRect(ctx, x, y, size / 2, size / 2, COLORS.grassLight);
  pixelRect(ctx, x + size / 2, y + size / 2, size / 2, size / 2, '#688f43');
  pixelRect(ctx, x + 5, y + size - 8, 3, 6, COLORS.grassDark);
}

function drawHouse(ctx, x, y, size) {
  drawGrass(ctx, x, y, size);
  pixelRect(ctx, x + 3, y + 10, size - 6, size - 12, COLORS.wall);
  pixelRect(ctx, x + 1, y + 8, size - 2, 5, COLORS.roof);
  pixelRect(ctx, x + 5, y + 4, size - 10, 4, COLORS.roof);
  pixelRect(ctx, x + 9, y + 1, size - 18, 3, COLORS.roofLight);
  pixelRect(ctx, x + 7, y + 17, 6, size - 17, COLORS.door);
  pixelRect(ctx, x + size - 11, y + 16, 6, 5, COLORS.window);
}

function drawRice(ctx, x, y, size) {
  pixelRect(ctx, x, y, size, size, COLORS.riceSoil);
  pixelRect(ctx, x, y + size - 4, size, 4, '#61572f');

  for (const offset of [6, 14, 22]) {
    pixelRect(ctx, x + offset, y + 7, 3, 17, COLORS.rice);
    pixelRect(ctx, x + offset - 3, y + 10, 4, 3, COLORS.rice);
    pixelRect(ctx, x + offset + 2, y + 6, 4, 3, COLORS.rice);
  }
}

function drawBamboo(ctx, x, y, size) {
  pixelRect(ctx, x, y, size, size, COLORS.bamboo);

  for (const offset of [7, 15, 23]) {
    pixelRect(ctx, x + offset, y + 3, 4, size - 6, COLORS.bambooLight);
    pixelRect(ctx, x + offset - 2, y + 11, 8, 3, '#9ac35a');
  }

  pixelRect(ctx, x + 2, y + 5, 9, 4, '#9ac35a');
  pixelRect(ctx, x + 17, y + 19, 9, 4, '#9ac35a');
}

function drawTemple(ctx, x, y, size) {
  drawGrass(ctx, x, y, size);
  pixelRect(ctx, x + 3, y + 10, size - 6, size - 11, COLORS.temple);
  pixelRect(ctx, x, y + 7, size, 5, COLORS.roof);
  pixelRect(ctx, x + 5, y + 3, size - 10, 4, COLORS.roof);
  pixelRect(ctx, x + 5, y + 14, 4, size - 15, COLORS.gold);
  pixelRect(ctx, x + size - 9, y + 14, 4, size - 15, COLORS.gold);
  pixelRect(ctx, x + 11, y + 16, size - 22, size - 17, '#542527');
}

function drawWall(ctx, x, y, size) {
  drawGrass(ctx, x, y, size);
  pixelRect(ctx, x + 2, y + 10, size - 4, 9, '#8a7a64');
  pixelRect(ctx, x + 4, y + 12, 6, 3, '#b09e7f');
  pixelRect(ctx, x + 14, y + 12, 6, 3, '#b09e7f');
}

function drawYard(ctx, x, y, size) {
  pixelRect(ctx, x, y, size, size, COLORS.yard);
  pixelRect(ctx, x + 3, y + 3, 9, 8, COLORS.yardLight);
  pixelRect(ctx, x + 15, y + 3, 10, 8, COLORS.yardLight);
  pixelRect(ctx, x + 3, y + 14, 10, 11, COLORS.yardLight);
  pixelRect(ctx, x + 16, y + 14, 9, 11, COLORS.yardLight);
  pixelRect(ctx, x + 9, y + 19, 10, 5, COLORS.rice);
}

const TILE_DRAWERS = Object.freeze({
  '.': drawRoad,
  G: drawGrass,
  H: drawHouse,
  R: drawRice,
  B: drawBamboo,
  T: drawTemple,
  W: drawWall,
  S: drawYard
});

function drawNormalBench(ctx, cell) {
  const x = cell.x * TILE_SIZE;
  const y = cell.y * TILE_SIZE;
  pixelRect(ctx, x + 8, y + 9, 12, 8, COLORS.red);
  pixelRect(ctx, x + 8, y + 8, 12, 3, COLORS.gold);
  pixelRect(ctx, x + 9, y + 17, 3, 4, COLORS.redDark);
  pixelRect(ctx, x + 17, y + 17, 3, 4, COLORS.redDark);
}

function drawPearl(ctx, pearl) {
  const x = pearl.x * TILE_SIZE;
  const y = pearl.y * TILE_SIZE;
  pixelRect(ctx, x + 10, y + 8, 8, 12, COLORS.gold);
  pixelRect(ctx, x + 8, y + 10, 12, 8, COLORS.gold);
  pixelRect(ctx, x + 11, y + 9, 5, 5, '#fff19a');
  pixelRect(ctx, x + 6, y + 13, 3, 3, '#ffe36c');
  pixelRect(ctx, x + 19, y + 13, 3, 3, '#ffe36c');
}

function drawBench(ctx, cell) {
  const x = cell.x * TILE_SIZE;
  const y = cell.y * TILE_SIZE;
  pixelRect(ctx, x + 5, y + 8, 18, 12, COLORS.redDark);
  pixelRect(ctx, x + 7, y + 7, 14, 9, COLORS.red);
  pixelRect(ctx, x + 7, y + 7, 14, 3, COLORS.gold);
  pixelRect(ctx, x + 7, y + 18, 4, 4, COLORS.gold);
  pixelRect(ctx, x + 17, y + 18, 4, 4, COLORS.gold);
}

function drawTail(ctx, segments) {
  if (segments.length < 2) return;
  const last = segments.at(-1);
  const previous = segments.at(-2);
  const dx = last.x - previous.x;
  const dy = last.y - previous.y;
  const centerX = last.x * TILE_SIZE + TILE_SIZE / 2;
  const centerY = last.y * TILE_SIZE + TILE_SIZE / 2;
  pixelRect(ctx, centerX + dx * 8 - 3, centerY + dy * 8 - 3, 7, 7, COLORS.gold);
}

function drawHead(ctx, game) {
  const head = game.segments[0];
  const centerX = head.x * TILE_SIZE + TILE_SIZE / 2;
  const centerY = head.y * TILE_SIZE + TILE_SIZE / 2;
  const angle = Math.atan2(game.direction.y, game.direction.x);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  const flash = game.stunRemainingMs > 0 && Math.floor(game.stunRemainingMs / 100) % 2 === 0;
  pixelRect(ctx, -9, -9, 18, 18, flash ? '#f36c5e' : COLORS.red);
  pixelRect(ctx, 5, -6, 5, 12, COLORS.redDark);
  pixelRect(ctx, -5, -13, 4, 5, COLORS.gold);
  pixelRect(ctx, 3, -13, 4, 5, COLORS.gold);
  pixelRect(ctx, 4, -5, 3, 3, '#fff5c9');
  pixelRect(ctx, 4, 3, 3, 3, '#fff5c9');
  ctx.restore();
}

function drawDragon(ctx, game) {
  for (let index = game.segments.length - 1; index >= 1; index -= 1) {
    drawBench(ctx, game.segments[index]);
  }

  drawTail(ctx, game.segments);
  drawHead(ctx, game);
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  let cachedMap = null;
  let mapLayer = null;

  function resize(map) {
    const width = map.width * TILE_SIZE;
    const height = map.height * TILE_SIZE;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      context.imageSmoothingEnabled = false;
    }
  }

  function ensureMapLayer(map) {
    if (cachedMap === map && mapLayer) {
      return;
    }

    mapLayer = canvas.ownerDocument.createElement('canvas');
    mapLayer.width = map.width * TILE_SIZE;
    mapLayer.height = map.height * TILE_SIZE;
    const layerContext = mapLayer.getContext('2d');
    layerContext.imageSmoothingEnabled = false;

    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const tile = getTile(map, x, y);
        const drawer = TILE_DRAWERS[tile] ?? drawGrass;
        drawer(layerContext, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE);
      }
    }

    cachedMap = map;
  }

  function render(game) {
    resize(game.map);
    ensureMapLayer(game.map);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(mapLayer, 0, 0);

    for (const bench of game.normalBenches) {
      drawNormalBench(context, bench);
    }

    if (game.pearl) {
      drawPearl(context, game.pearl);
    }

    const visualSegments = game.recovery
      ? interpolateRecoveryFrames(
        game.recovery.frames,
        game.recovery.elapsedMs / game.recovery.durationMs
      )
      : interpolateSegments(
        game.previousSegments ?? game.segments,
        game.segments,
        game.phase === 'ended'
          ? 1
          : game.moveAccumulatorMs / game.config.moveIntervalMs
      );
    drawDragon(context, { ...game, segments: visualSegments });
  }

  return { resize, render };
}
