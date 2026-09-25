import { VehiclePhysics, getCourse } from './physics.mjs';
import { SceneView } from './scene.mjs';

const byId = id => document.getElementById(id);
const ui = Object.fromEntries([
  'shell', 'game', 'pause', 'restart', 'sound', 'fullscreen', 'back', 'gas', 'rocket', 'modal',
  'modalTitle', 'modalText', 'primary', 'secondary', 'hint', 'levelTitle',
  'timer', 'goldFill', 'status', 'mainMenu', 'menuStart', 'level1', 'level2', 'level3', 'levelNumber',
].map(id => [id, byId(id)]));

const physics = new VehiclePhysics();
const view = new SceneView(ui.game);
const heldKeys = new Set();
const heldPointers = new Map();
const forwardKeys = new Set(['ArrowRight', 'ArrowUp', 'd', 'w', ' ']);
const reverseKeys = new Set(['ArrowLeft', 'ArrowDown', 'a', 's']);
const statusLabels = {
  ready: '已就绪', running: '进行中', paused: '已暂停', won: '已通关', crashed: '已翻车',
};
const GOLD_TIME_LIMIT = 10;
const initialHint = ui.hint?.textContent || '按住 → 或 D 前进';
let state = physics.getState();
let paused = false;
let modalMode = null;
let lastTime = null;
let previousStatus = state.status;
let resizePending = false;
let soundEnabled = true;
let inMenu = true;
let currentLevel = 1;

// Everything is synthesized locally and only started by a user gesture.
class GameAudio {
  constructor() {
    this.context = null;
  }

  unlock() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = soundEnabled ? 0.32 : 0;
      this.master.connect(this.context.destination);
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      this.engineFilter = this.context.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engine = this.context.createOscillator();
      this.engine.type = 'sawtooth';
      this.engine.frequency.value = 48;
      this.engine.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engine.start();
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  mute(muted) {
    if (this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.32, this.context.currentTime, 0.03);
  }

  update(current, throttle, isPaused) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const moving = current.status === 'running' && !isPaused;
    const speed = Math.min(Math.abs(current.vx) / 4.5, 1);
    const driving = Math.abs(throttle) > 0;
    this.engine.frequency.setTargetAtTime(43 + speed * 55 + (driving ? 15 : 0), now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(270 + speed * 220, now, 0.08);
    this.engineGain.gain.setTargetAtTime(moving ? (driving ? 0.13 : 0.035 * speed) : 0, now, 0.055);
  }

  tone(frequency, when, duration, type = 'triangle', volume = 0.23) {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = this.context.currentTime + when;
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
  }

  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => this.tone(note, index * 0.115, index === 3 ? 0.5 : 0.21));
  }

  crash() {
    this.tone(82, 0, 0.22, 'sawtooth', 0.2);
    this.tone(55, 0.07, 0.3, 'triangle', 0.18);
  }
}

const audio = new GameAudio();

function throttleValue() {
  const forward = [...heldKeys].some(key => forwardKeys.has(key)) || [...heldPointers.values()].includes('gas');
  const reverse = [...heldKeys].some(key => reverseKeys.has(key)) || [...heldPointers.values()].includes('back');
  return Number(forward) - Number(reverse);
}
function rocketValue() {
  // On level three the booster is linked directly to the drive input.
  // Holding either movement control starts the rocket automatically.
  return currentLevel === 3 && throttleValue() > 0;
}

function updateHeldButtons() {
  const forward = [...heldKeys].some(key => forwardKeys.has(key)) || [...heldPointers.values()].includes('gas');
  const reverse = [...heldKeys].some(key => reverseKeys.has(key)) || [...heldPointers.values()].includes('back');
  ui.gas?.classList.toggle('down', forward);
  ui.back?.classList.toggle('down', reverse);
  ui.gas?.setAttribute('aria-pressed', String(forward));
  ui.back?.setAttribute('aria-pressed', String(reverse));
  const rocket = rocketValue();
  ui.rocket?.classList.toggle('down', rocket);
  ui.rocket?.setAttribute('aria-pressed', String(rocket));
}

function clearInput() {
  heldKeys.clear();
  heldPointers.clear();
  updateHeldButtons();
}

function setModal(mode, title = '', message = '', primary = '', secondary = '') {
  modalMode = mode;
  ui.modal.hidden = !mode;
  ui.modal.classList.toggle('open', Boolean(mode));
  ui.modal.setAttribute('aria-hidden', String(!mode));
  ui.modal.dataset.mode = mode || '';
  ui.modal.dataset.gold = mode === 'won' ? String(earnedGold()) : '';
  if (!mode) {
    ui.primary.blur();
    ui.secondary.blur();
    return;
  }
  clearInput();
  ui.modalTitle.textContent = title;
  ui.modalText.textContent = message;
  ui.primary.textContent = primary;
  ui.secondary.textContent = secondary;
  ui.secondary.hidden = !secondary;
  ui.primary.focus({ preventScroll: true });
}

function formatTime(seconds) {
  const tenths = Math.floor(seconds * 10 + 1e-8);
  const minutes = Math.floor(tenths / 600);
  return `${String(minutes).padStart(2, '0')}:${((tenths % 600) / 10).toFixed(1).padStart(4, '0')}`;
}

function earnedGold() {
  return state.status === 'won' && state.time <= GOLD_TIME_LIMIT + 1e-8;
}

function updateHud() {
  const status = paused ? 'paused' : state.status;
  const goldRemaining = Math.max(0, GOLD_TIME_LIMIT - state.time);
  const goldExpired = goldRemaining <= 1e-8 && !earnedGold();
  if (ui.status) {
    ui.status.dataset.status = status;
    ui.status.dataset.x = state.x.toFixed(3);
    ui.status.dataset.time = state.time.toFixed(3);
    ui.status.dataset.gold = earnedGold() ? 'earned' : goldExpired ? 'expired' : 'available';
    ui.status.dataset.goldRemaining = goldRemaining.toFixed(3);
    ui.status.textContent = statusLabels[status] || status;
  }
  if (ui.timer) ui.timer.textContent = formatTime(state.time);
  if (ui.goldFill) {
    ui.goldFill.style.width = `${(goldRemaining / GOLD_TIME_LIMIT * 100).toFixed(1)}%`;
    ui.goldFill.style.opacity = goldExpired ? '0.25' : '1';
    ui.goldFill.classList.toggle('is-exhausted', goldExpired);
    // The empty track remains faintly gold after its ten-second allowance.
    ui.goldFill.parentElement.style.backgroundColor = goldExpired ? '#9b8b5740' : '';
  }
  if (ui.hint) {
    ui.hint.hidden = state.status !== 'ready' || paused;
    ui.hint.textContent = currentLevel === 3 ? `${initialHint} · 自动火箭推进` : initialHint;
  }
  ui.pause?.classList.toggle('is-paused', paused);
  ui.pause?.setAttribute('aria-pressed', String(paused));
  ui.pause?.setAttribute('aria-label', paused ? '继续游戏' : '暂停游戏');
}

function reset() {
  clearInput();
  paused = false;
  state = physics.reset();
  previousStatus = state.status;
  lastTime = null;
  view.reset();
  setModal(null);
  audio.update(state, 0, false);
  updateHud();
  ui.primary.blur();
}

function startSelectedLevel(level = currentLevel) {
  currentLevel = Number(level) || 1;
  const course = getCourse(currentLevel);
  physics.setLevel(currentLevel);
  view.setLevel(course);
  if (ui.levelNumber) ui.levelNumber.textContent = String(currentLevel);
  if (ui.levelTitle) ui.levelTitle.textContent = course.title;
  document.title = `Drive Mad — Level ${currentLevel}`;
  ui.shell?.setAttribute('aria-label', `Drive Mad 第${currentLevel}关`);
  if (ui.menuStart) ui.menuStart.querySelector('span').textContent = `开始第${currentLevel}关`;
  inMenu = false;
  ui.mainMenu?.classList.add('hidden');
  ui.mainMenu?.setAttribute('aria-hidden', 'true');
  reset();
  ui.game?.focus({ preventScroll: true });
}

function showMainMenu() {
  inMenu = true;
  reset();
  ui.mainMenu?.classList.remove('hidden');
  ui.mainMenu?.setAttribute('aria-hidden', 'false');
  ui.level2?.focus?.({ preventScroll: true });
}

function setPaused(value) {
  if (inMenu) return;
  if (state.status === 'won' || state.status === 'crashed') return;
  paused = value;
  clearInput();
  lastTime = null;
  if (paused) setModal('paused', '已暂停', '休息一下，准备好后继续前进。', '继续游戏', '返回主菜单');
  else setModal(null);
  audio.update(state, 0, paused);
  updateHud();
}

function finish() {
  if (state.status === previousStatus) return;
  previousStatus = state.status;
  if (state.status === 'won') {
    clearInput();
    view.celebration();
    audio.win();
    const gold = earnedGold();
    const result = gold ? '获得金牌！' : '已完成关卡；10 秒内抵达可获金牌。';
    const next = currentLevel < 3 ? document.getElementById(`level${currentLevel + 1}`) : null;
    if (next) {
      next.disabled = false;
      next.classList.remove('locked');
      next.classList.add('selected');
      next.querySelector('.level-desc').textContent = '已解锁 · 继续挑战';
      next.querySelector('i').textContent = '▶';
    }
    setModal('won', gold ? '金牌通关！' : `第${currentLevel}关完成！`, `用时 ${state.time.toFixed(1)} 秒。${result}`, '再玩一次', '返回主菜单');
  } else if (state.status === 'crashed') {
    clearInput();
    view.crash();
    audio.crash();
    const message = state.crashReason === 'roof' ? '车顶碰到了地面。试着调整油门，保持平衡。' : '掉出赛道了。回到起点，再试一次！';
    setModal('crashed', '再试一次！', message, '重新开始', '看看赛道');
  }
}

function frame(timestamp) {
  const dt = lastTime === null ? 0 : Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  const throttle = throttleValue();
  if (!inMenu && !paused) state = physics.step(dt, throttle, rocketValue());
  finish();
  updateHud();
  audio.update(state, throttle, paused);
  view.render(state, paused ? 0 : dt);
  requestAnimationFrame(frame);
}

function bindHold(button, direction) {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    audio.unlock();
    if (paused || state.status === 'won' || state.status === 'crashed') return;
    heldPointers.set(event.pointerId, direction);
    button.setPointerCapture(event.pointerId);
    updateHeldButtons();
  });
  const release = event => {
    heldPointers.delete(event.pointerId);
    updateHeldButtons();
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', event => event.preventDefault());
}

function keyName(event) {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

async function toggleFullscreen() {
  const target = ui.game.closest('.game-shell') || ui.game.parentElement;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (target.requestFullscreen) await target.requestFullscreen();
  } catch {
    // Fullscreen can be unavailable when the page is embedded.
  }
}

bindHold(ui.gas, 'gas');
bindHold(ui.back, 'back');
ui.menuStart?.addEventListener('click', () => startSelectedLevel(currentLevel));
ui.level1?.addEventListener('click', () => startSelectedLevel(1));
ui.level2?.addEventListener('click', () => startSelectedLevel(2));
ui.level3?.addEventListener('click', () => startSelectedLevel(3));
window.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
  const key = keyName(event);
  if (inMenu && (key === 'Enter' || key === ' ')) {
    event.preventDefault();
    startSelectedLevel();
    return;
  }
  if (key === ' ' && event.target.tagName === 'BUTTON') return;
  if (forwardKeys.has(key) || reverseKeys.has(key)) {
    event.preventDefault();
    audio.unlock();
    if (!inMenu && !paused && state.status !== 'won' && state.status !== 'crashed') heldKeys.add(key);
    updateHeldButtons();
  }
  if (event.repeat) return;
  if (key === 'r') {
    event.preventDefault();
    audio.unlock();
    if (inMenu) return;
    reset();
  } else if (key === 'p' || (key === 'Escape' && !document.fullscreenElement)) {
    event.preventDefault();
    setPaused(!paused);
  } else if (key === 'f') {
    event.preventDefault();
    toggleFullscreen();
  }
});
window.addEventListener('keyup', event => {
  heldKeys.delete(keyName(event));
  updateHeldButtons();
});

ui.pause.addEventListener('click', () => setPaused(!paused));
ui.restart.addEventListener('click', () => { audio.unlock(); reset(); });
ui.primary.addEventListener('click', () => {
  audio.unlock();
  if (modalMode === 'paused') setPaused(false);
  else reset();
});
ui.secondary.addEventListener('click', () => {
  if (modalMode === 'paused' || modalMode === 'won') showMainMenu();
  else setModal(null);
});
ui.sound.addEventListener('click', () => {
  audio.unlock();
  soundEnabled = !soundEnabled;
  audio.mute(!soundEnabled);
  ui.sound.classList.toggle('is-muted', !soundEnabled);
  ui.sound.dataset.muted = String(!soundEnabled);
  ui.sound.setAttribute('aria-pressed', String(soundEnabled));
  ui.sound.setAttribute('aria-label', soundEnabled ? '关闭声音' : '开启声音');
  ui.sound.title = soundEnabled ? '关闭声音' : '开启声音';
});
ui.fullscreen.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  const active = Boolean(document.fullscreenElement);
  ui.fullscreen.classList.toggle('is-active', active);
  ui.fullscreen.setAttribute('aria-pressed', String(active));
  ui.fullscreen.setAttribute('aria-label', active ? '退出全屏' : '全屏游戏');
  view.resize();
});

function loseFocus() {
  clearInput();
  if (state.status === 'running' && !paused) setPaused(true);
}
window.addEventListener('blur', loseFocus);
document.addEventListener('visibilitychange', () => { if (document.hidden) loseFocus(); });

function scheduleResize() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    view.resize();
  });
}
window.addEventListener('resize', scheduleResize);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(scheduleResize).observe(ui.game.parentElement);
ui.sound.setAttribute('aria-pressed', 'true');
ui.sound.setAttribute('aria-label', '关闭声音');
view.resize();
view.reset();
setModal(null);
updateHud();
requestAnimationFrame(frame);
