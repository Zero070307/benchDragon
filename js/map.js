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
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: 0, y: -1 })
]);

export function parseMap(layout) {
  if (!layout.length || layout.some((row) => row.length !== layout[0].length)) {
    throw new Error('Map rows must be non-empty and equal width');
  }

  return {
    width: layout[0].length,
    height: layout.length,
    tiles: [...layout]
  };
}

export function getTile(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return null;
  }

  return map.tiles[y][x];
}

export function isRoad(map, x, y) {
  return getTile(map, x, y) === '.';
}

export function getRoadCells(map) {
  const cells = [];

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (isRoad(map, x, y)) {
        cells.push({ x, y });
      }
    }
  }

  return cells;
}

export function reachableRoadCount(map, start) {
  if (!start || !isRoad(map, start.x, start.y)) {
    return 0;
  }

  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);

  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];

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

  if (roads.length === 0) {
    return 0;
  }

  let doubledEdges = 0;

  for (const cell of roads) {
    doubledEdges += CARDINALS.filter((delta) =>
      isRoad(map, cell.x + delta.x, cell.y + delta.y)
    ).length;
  }

  return doubledEdges / 2 - roads.length + 1;
}
