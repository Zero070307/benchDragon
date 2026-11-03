import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('index provides every required screen and game control', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const ids = [
    'home-screen',
    'rules-screen',
    'countdown-screen',
    'game-screen',
    'result-screen',
    'game-canvas',
    'start-button',
    'rules-button',
    'rules-back-button',
    'pause-button',
    'restart-button',
    'home-button',
    'play-again-button',
    'result-home-button'
  ];

  for (const id of ids) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test('renderer uses crisp pixels and contains every approved scene drawer', async () => {
  const source = await readFile(new URL('../js/renderer.js', import.meta.url), 'utf8');

  assert.match(source, /imageSmoothingEnabled\s*=\s*false/);
  assert.match(source, /drawHouse/);
  assert.match(source, /drawRice/);
  assert.match(source, /drawBamboo/);
  assert.match(source, /drawTemple/);
  assert.doesNotMatch(source, /drawPond|pond/i);
});

test('main module connects engine, renderer, input, and screens', async () => {
  const source = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

  assert.match(source, /createGame/);
  assert.match(source, /createRenderer/);
  assert.match(source, /bindInput/);
  assert.match(source, /createScreens/);
});

test('animation loop keeps the full active elapsed time', async () => {
  const source = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

  assert.match(source, /Math\.max\(0, now - lastFrameTime\)/);
  assert.doesNotMatch(source, /Math\.min\(100,/);
});

test('touch layout prevents scrolling and keeps three distinct direction rows', async () => {
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /grid-template-areas:[^;]*"\. up \s*\."[^;]*"left \. right"[^;]*"\. down \s*\."/s);
});

test('index boots from file URLs without ES module requests', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /<script[^>]+type=["']module["']/i);
  assert.match(html, /<script[^>]+defer[^>]+src=["']js\/game\.bundle\.js["']/i);

  const bundleUrl = new URL('../js/game.bundle.js', import.meta.url);
  const bundle = await readFile(bundleUrl, 'utf8');
  assert.doesNotMatch(bundle, /^\s*(?:import|export)\s/m);

  const syntax = spawnSync(process.execPath, ['--check', fileURLToPath(bundleUrl)], {
    encoding: 'utf8'
  });
  assert.equal(syntax.status, 0, syntax.stderr);
});
