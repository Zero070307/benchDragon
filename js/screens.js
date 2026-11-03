const SCREEN_NAMES = Object.freeze(['home', 'rules', 'countdown', 'game', 'result']);

export function createScreens(document) {
  const screens = Object.fromEntries(
    SCREEN_NAMES.map((name) => [name, document.getElementById(`${name}-screen`)])
  );

  function show(name) {
    for (const [key, element] of Object.entries(screens)) {
      element.hidden = key !== name;
    }
  }

  function showResult({ benchCount, collisionCount, endReason }) {
    document.getElementById('result-title').textContent = endReason === 'self'
      ? '咬到自己，挑战结束！'
      : '板凳龙收队啦！';
    document.getElementById('result-length').textContent = `${benchCount} 节`;
    document.getElementById('result-collisions').textContent = `${collisionCount} 次`;
    show('result');
  }

  return { show, showResult };
}
