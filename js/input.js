const KEY_DIRECTIONS = new Map([
  ['ArrowUp', 'up'],
  ['w', 'up'],
  ['ArrowDown', 'down'],
  ['s', 'down'],
  ['ArrowLeft', 'left'],
  ['a', 'left'],
  ['ArrowRight', 'right'],
  ['d', 'right']
]);

export function directionForKey(key) {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  return KEY_DIRECTIONS.get(normalized) ?? null;
}

export function bindInput({ root, onDirection }) {
  const onKeyDown = (event) => {
    const direction = directionForKey(event.key);

    if (!direction) {
      return;
    }

    event.preventDefault();
    onDirection(direction);
  };

  const onPointerDown = (event) => {
    const button = event.target.closest('[data-direction]');

    if (!button || !root.contains(button)) {
      return;
    }

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
