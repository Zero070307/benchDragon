import { GAME_CONFIG } from './config.js';
import { MAP_LAYOUT, parseMap } from './map.js';
import {
  DIRECTIONS,
  createGame,
  queueDirection,
  advanceGame,
  pauseGame,
  resumeGame,
  restartGame,
  populateInitialItems
} from './game-engine.js';
import { createRenderer } from './renderer.js';
import { bindInput } from './input.js';
import { createScreens } from './screens.js';

const map = parseMap(MAP_LAYOUT);
const spawn = Object.freeze({ x: 4, y: 3 });
const directionsByName = Object.freeze({
  up: DIRECTIONS.UP,
  down: DIRECTIONS.DOWN,
  left: DIRECTIONS.LEFT,
  right: DIRECTIONS.RIGHT
});

const app = document.getElementById('app');
const canvas = document.getElementById('game-canvas');
const screens = createScreens(document);
const renderer = createRenderer(canvas);
const lengthValue = document.getElementById('length-value');
const collisionValue = document.getElementById('collision-value');
const touchHint = document.getElementById('touch-hint');
const timeValue = document.getElementById('time-value');
const countdownValue = document.getElementById('countdown-value');
const pauseButton = document.getElementById('pause-button');
const pauseOverlay = document.getElementById('pause-overlay');
const durationButtons = [...document.querySelectorAll('[data-duration]')];

let game = null;
let selectedDurationMs = GAME_CONFIG.durationMs;
let countdownToken = 0;
let resultShown = false;
let lastFrameTime = performance.now();

function newSeed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function formatTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateHud() {
  if (!game) return;
  lengthValue.textContent = `${game.benchCount} 节`;
  collisionValue.textContent = String(game.collisionCount);
  touchHint.textContent = game.blockedByWall
    ? '撞墙了，请改变方向'
    : '只在米色村道上前进';
  timeValue.textContent = formatTime(game.remainingMs);
  timeValue.classList.toggle(
    'is-final-countdown',
    game.phase === 'running' && game.remainingMs <= GAME_CONFIG.finalCountdownMs
  );
}

async function runCountdown() {
  const token = ++countdownToken;
  screens.show('countdown');

  for (const label of ['3', '2', '1', 'GO']) {
    if (token !== countdownToken || !game) return;
    countdownValue.textContent = label;
    await delay(label === 'GO' ? 500 : 700);
  }

  if (token !== countdownToken || !game) return;
  game.phase = 'running';
  pauseButton.textContent = '暂停';
  pauseOverlay.hidden = true;
  resultShown = false;
  lastFrameTime = performance.now();
  screens.show('game');
  renderer.render(game);
  updateHud();
}

function buildGame(seed) {
  const nextGame = createGame({
    map,
    seed,
    spawn,
    direction: DIRECTIONS.RIGHT,
    config: { ...GAME_CONFIG, durationMs: selectedDurationMs }
  });
  populateInitialItems(nextGame);
  return nextGame;
}

function startNewChallenge() {
  game = buildGame(newSeed());
  runCountdown();
}

function restartChallenge() {
  if (!game) return;
  countdownToken += 1;
  restartGame(game, spawn, DIRECTIONS.RIGHT);
  populateInitialItems(game);
  runCountdown();
}

function returnHome() {
  countdownToken += 1;
  game = null;
  resultShown = false;
  pauseOverlay.hidden = true;
  pauseButton.textContent = '暂停';
  timeValue.classList.remove('is-final-countdown');
  screens.show('home');
}

function togglePause() {
  if (!game) return;

  if (game.phase === 'running') {
    pauseGame(game);
    pauseButton.textContent = '继续';
    pauseOverlay.hidden = false;
  } else if (game.phase === 'paused') {
    resumeGame(game);
    pauseButton.textContent = '暂停';
    pauseOverlay.hidden = true;
    lastFrameTime = performance.now();
  }
}

function frame(now) {
  const deltaMs = Math.max(0, now - lastFrameTime);
  lastFrameTime = now;

  if (game) {
    if (game.phase === 'running') {
      advanceGame(game, deltaMs);
    }

    if (!document.getElementById('game-screen').hidden) {
      renderer.render(game);
      updateHud();
    }

    if (game.phase === 'ended' && !resultShown) {
      resultShown = true;
      screens.showResult(game);
    }
  }

  requestAnimationFrame(frame);
}

bindInput({
  root: app,
  onDirection(name) {
    if (!game || game.phase !== 'running') return;
    queueDirection(game, directionsByName[name]);
  }
});

for (const button of durationButtons) {
  button.addEventListener('click', () => {
    selectedDurationMs = Number(button.dataset.duration) * 1_000;
    for (const option of durationButtons) {
      option.setAttribute('aria-pressed', String(option === button));
    }
  });
}

document.getElementById('start-button').addEventListener('click', startNewChallenge);
document.getElementById('rules-button').addEventListener('click', () => screens.show('rules'));
document.getElementById('rules-back-button').addEventListener('click', () => screens.show('home'));
pauseButton.addEventListener('click', togglePause);
document.getElementById('restart-button').addEventListener('click', restartChallenge);
document.getElementById('home-button').addEventListener('click', returnHome);
document.getElementById('play-again-button').addEventListener('click', startNewChallenge);
document.getElementById('result-home-button').addEventListener('click', returnHome);

screens.show('home');
requestAnimationFrame(frame);
