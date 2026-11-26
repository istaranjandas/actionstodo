const STEER_LEFT_CODES = Object.freeze(['KeyA', 'ArrowLeft']);
const STEER_RIGHT_CODES = Object.freeze(['KeyD', 'ArrowRight']);
const THROTTLE_CODES = Object.freeze(['KeyW', 'ArrowUp']);
const BRAKE_CODES = Object.freeze(['KeyS', 'ArrowDown', 'Space']);

const MOVEMENT_CODES = new Set([...STEER_LEFT_CODES, ...STEER_RIGHT_CODES, ...THROTTLE_CODES, ...BRAKE_CODES]);

const ACTION_BY_CODE = new Map([
  ['KeyC', 'CAMERA'],
  ['KeyP', 'PAUSE'],
  ['Escape', 'PAUSE'],
  ['KeyM', 'MUTE'],
  ['Enter', 'CONFIRM'],
  ['NumpadEnter', 'CONFIRM'],
]);

const SCROLL_BLOCKING_CODES = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'Enter',
  'NumpadEnter',
]);

const META_CODES = new Set(['MetaLeft', 'MetaRight', 'OSLeft', 'OSRight']);

const KEY_FALLBACKS = new Map([
  ['ArrowLeft', 'ArrowLeft'],
  ['ArrowRight', 'ArrowRight'],
  ['ArrowUp', 'ArrowUp'],
  ['ArrowDown', 'ArrowDown'],
  ['Left', 'ArrowLeft'],
  ['Right', 'ArrowRight'],
  ['Up', 'ArrowUp'],
  ['Down', 'ArrowDown'],
  [' ', 'Space'],
  ['Spacebar', 'Space'],
  ['Enter', 'Enter'],
  ['Escape', 'Escape'],
  ['Esc', 'Escape'],
]);

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const TOUCH_ZONES = Object.freeze([
  // One steer and one pedal per thumb: LEFT + BOOST on the left, BRAKE + RIGHT on the right
  Object.freeze({ id: 'left', cluster: 'steer', index: '01', label: 'LEFT' }),
  Object.freeze({ id: 'boost', cluster: 'steer', index: '02', label: 'BOOST' }),
  Object.freeze({ id: 'brake', cluster: 'pedals', index: '03', label: 'BRAKE' }),
  Object.freeze({ id: 'right', cluster: 'pedals', index: '04', label: 'RIGHT' }),
]);

const STEER_ZONES = new Set(['left', 'right']);

function resolveCode(event) {
  if (event.code) return event.code;
  const key = event.key;
  if (!key) return '';
  const mapped = KEY_FALLBACKS.get(key);
  if (mapped) return mapped;
  if (key.length === 1) {
    const upper = key.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') return `Key${upper}`;
  }
  return '';
}

function isEditableTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return typeof target.tagName === 'string' && EDITABLE_TAGS.has(target.tagName);
}

function isButtonTarget(target) {
  return Boolean(target) && target.tagName === 'BUTTON';
}

function hasAnyCode(heldCodes, codes) {
  for (let index = 0; index < codes.length; index += 1) {
    if (heldCodes.has(codes[index])) return true;
  }
  return false;
}

export class InputManager {
  constructor(uiRoot) {
    this.uiRoot = uiRoot ?? null;
    this.enabled = true;
    this.state = { steer: 0, throttle: 0, brake: false };
    this.heldCodes = new Set();
    this.keyboard = { left: false, right: false, throttle: false, brake: false };
    this.touch = { left: false, right: false, brake: false, boost: false };
    this.pointerZones = new Map();
    this.zoneElements = new Map();
    this.actionListeners = new Map();
    this.steerSplitX = 0;
    this.touchDetected = false;
    this.touchRoot = null;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleWindowBlur = this.handleWindowBlur.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleZonePointerDown = this.handleZonePointerDown.bind(this);
    this.handleZonePointerMove = this.handleZonePointerMove.bind(this);
    this.handlePointerEnd = this.handlePointerEnd.bind(this);
    this.handleGlobalPointerDown = this.handleGlobalPointerDown.bind(this);
    this.handleGlobalTouchStart = this.handleGlobalTouchStart.bind(this);
    this.preventDefault = this.preventDefault.bind(this);

    this.buildTouchControls();
    this.attachGlobalListeners();
  }

  buildTouchControls() {
    if (!this.uiRoot || typeof document === 'undefined') return;

    const root = document.createElement('div');
    root.className = 'touch-controls';
    root.setAttribute('aria-hidden', 'true');

    const clusters = {
      steer: document.createElement('div'),
      pedals: document.createElement('div'),
    };
    clusters.steer.className = 'touch-cluster touch-cluster--steer';
    clusters.pedals.className = 'touch-cluster touch-cluster--pedals';

    for (const zone of TOUCH_ZONES) {
      const element = document.createElement('div');
      element.className = `touch-zone touch-zone--${zone.id}`;
      element.dataset.zone = zone.id;

      const index = document.createElement('span');
      index.className = 'touch-zone__idx';
      index.textContent = zone.index;

      const glyph = document.createElement('span');
      glyph.className = 'touch-zone__glyph';

      const label = document.createElement('span');
      label.className = 'touch-zone__label';
      label.textContent = zone.label;

      element.append(index, glyph, label);
      element.addEventListener('pointerdown', this.handleZonePointerDown);
      element.addEventListener('pointermove', this.handleZonePointerMove);
      element.addEventListener('pointerup', this.handlePointerEnd);
      element.addEventListener('pointercancel', this.handlePointerEnd);
      element.addEventListener('lostpointercapture', this.handlePointerEnd);

      clusters[zone.cluster].append(element);
      this.zoneElements.set(zone.id, { element, active: false });
    }

    root.append(clusters.steer, clusters.pedals);
    root.addEventListener('contextmenu', this.preventDefault);
    root.addEventListener('selectstart', this.preventDefault);
    this.uiRoot.append(root);
    this.touchRoot = root;
  }

  attachGlobalListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
      window.addEventListener('blur', this.handleWindowBlur);
      window.addEventListener('pagehide', this.handleWindowBlur);
      window.addEventListener('pointerup', this.handlePointerEnd);
      window.addEventListener('pointercancel', this.handlePointerEnd);
      window.addEventListener('pointerdown', this.handleGlobalPointerDown, { capture: true, passive: true });
      window.addEventListener('touchstart', this.handleGlobalTouchStart, { capture: true, passive: true });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  detachTouchDetection() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('pointerdown', this.handleGlobalPointerDown, { capture: true });
    window.removeEventListener('touchstart', this.handleGlobalTouchStart, { capture: true });
  }

  preventDefault(event) {
    event.preventDefault();
  }

  handleKeyDown(event) {
    const code = resolveCode(event);
    if (!code || isEditableTarget(event.target)) return;

    const isConfirm = code === 'Enter' || code === 'NumpadEnter';
    if (isConfirm && isButtonTarget(event.target)) return;

    const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
    if (SCROLL_BLOCKING_CODES.has(code) && !hasModifier) event.preventDefault();

    if (MOVEMENT_CODES.has(code) && !event.metaKey && !this.heldCodes.has(code)) {
      this.heldCodes.add(code);
      this.refreshKeyboard();
    }

    if (event.repeat || hasModifier) return;
    const action = ACTION_BY_CODE.get(code);
    if (action) this.emit(action);
  }

  handleKeyUp(event) {
    const code = resolveCode(event);
    if (!code) return;
    if (META_CODES.has(code)) {
      this.releaseKeys();
      return;
    }
    if (code === 'Space') event.preventDefault();
    if (this.heldCodes.delete(code)) this.refreshKeyboard();
  }

  handleWindowBlur() {
    this.releaseAll();
  }

  handleVisibilityChange() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') this.releaseAll();
  }

  handleGlobalPointerDown(event) {
    if (event.pointerType === 'touch') this.markTouchDevice();
  }

  handleGlobalTouchStart() {
    this.markTouchDevice();
  }

  markTouchDevice() {
    if (this.touchDetected) return;
    this.touchDetected = true;
    if (this.uiRoot && this.uiRoot.classList) this.uiRoot.classList.add('has-touch');
    this.detachTouchDetection();
  }

  handleZonePointerDown(event) {
    const element = event.currentTarget;
    const zone = element && element.dataset ? element.dataset.zone : undefined;
    if (!zone) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();
    if (event.pointerType === 'touch' || event.pointerType === 'pen') this.markTouchDevice();

    if (typeof element.setPointerCapture === 'function' && element.isConnected !== false) {
      element.setPointerCapture(event.pointerId);
    }
    if (STEER_ZONES.has(zone)) this.updateSteerSplit();

    this.pointerZones.set(event.pointerId, zone);
    this.refreshTouch();
  }

  // LEFT and RIGHT sit under different thumbs now, so a held press never slides between them
  handleZonePointerMove() {}

  handlePointerEnd(event) {
    if (this.pointerZones.delete(event.pointerId)) this.refreshTouch();
  }

  updateSteerSplit() {
    const left = this.zoneElements.get('left');
    const right = this.zoneElements.get('right');
    if (!left || !right || typeof left.element.getBoundingClientRect !== 'function') return;
    const leftRect = left.element.getBoundingClientRect();
    const rightRect = right.element.getBoundingClientRect();
    this.steerSplitX = (leftRect.right + rightRect.left) * 0.5;
  }

  refreshKeyboard() {
    const held = this.heldCodes;
    this.keyboard.left = hasAnyCode(held, STEER_LEFT_CODES);
    this.keyboard.right = hasAnyCode(held, STEER_RIGHT_CODES);
    this.keyboard.throttle = hasAnyCode(held, THROTTLE_CODES);
    this.keyboard.brake = hasAnyCode(held, BRAKE_CODES);
  }

  refreshTouch() {
    let left = false;
    let right = false;
    let brake = false;
    let boost = false;
    for (const zone of this.pointerZones.values()) {
      if (zone === 'left') left = true;
      else if (zone === 'right') right = true;
      else if (zone === 'brake') brake = true;
      else if (zone === 'boost') boost = true;
    }
    this.touch.left = left;
    this.touch.right = right;
    this.touch.brake = brake;
    this.touch.boost = boost;
    this.syncZone('left', left);
    this.syncZone('right', right);
    this.syncZone('brake', brake);
    this.syncZone('boost', boost);
  }

  syncZone(id, active) {
    const entry = this.zoneElements.get(id);
    if (!entry || entry.active === active) return;
    entry.active = active;
    entry.element.classList.toggle('is-active', active);
  }

  emit(action) {
    const listeners = this.actionListeners.get(action);
    if (!listeners || listeners.length === 0) return;
    const snapshot = listeners.slice();
    for (let index = 0; index < snapshot.length; index += 1) snapshot[index](action);
  }

  onAction(name, callback) {
    if (typeof callback !== 'function') return () => {};
    let listeners = this.actionListeners.get(name);
    if (!listeners) {
      listeners = [];
      this.actionListeners.set(name, listeners);
    }
    listeners.push(callback);
    return () => {
      const index = listeners.indexOf(callback);
      if (index !== -1) listeners.splice(index, 1);
    };
  }

  getState() {
    const state = this.state;
    if (!this.enabled) {
      state.steer = 0;
      state.throttle = 0;
      state.brake = false;
      return state;
    }
    const left = this.keyboard.left || this.touch.left;
    const right = this.keyboard.right || this.touch.right;
    state.steer = (right ? 1 : 0) - (left ? 1 : 0);
    state.throttle = this.keyboard.throttle || this.touch.boost ? 1 : 0;
    state.brake = this.keyboard.brake || this.touch.brake;
    return state;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.releasePointers();
  }

  releaseKeys() {
    if (this.heldCodes.size === 0) return;
    this.heldCodes.clear();
    this.refreshKeyboard();
  }

  releasePointers() {
    if (this.pointerZones.size === 0) return;
    const pointerIds = Array.from(this.pointerZones.keys());
    this.pointerZones.clear();
    for (const { element } of this.zoneElements.values()) {
      if (typeof element.hasPointerCapture !== 'function') continue;
      for (const pointerId of pointerIds) {
        if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      }
    }
    this.refreshTouch();
  }

  releaseAll() {
    this.releaseKeys();
    this.releasePointers();
  }

  reset() {
    this.releaseAll();
    this.state.steer = 0;
    this.state.throttle = 0;
    this.state.brake = false;
  }

  dispose() {
    this.releaseAll();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
      window.removeEventListener('blur', this.handleWindowBlur);
      window.removeEventListener('pagehide', this.handleWindowBlur);
      window.removeEventListener('pointerup', this.handlePointerEnd);
      window.removeEventListener('pointercancel', this.handlePointerEnd);
    }
    this.detachTouchDetection();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (this.touchRoot && typeof this.touchRoot.remove === 'function') this.touchRoot.remove();
    this.touchRoot = null;
    this.zoneElements.clear();
    this.actionListeners.clear();
  }
}
