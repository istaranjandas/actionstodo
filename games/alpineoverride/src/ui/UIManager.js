import { GAME_MODES, PLAYER, QUALITY_CONFIG, QUALITY_TIER_ORDER, SCORE } from '../config/constants.js';

const POPUP_POOL_SIZE = 6;
const POPUP_MAX_OFFSET_VW = 13;
const POPUP_MIN_OFFSET_VW = 1.5;
const POPUP_VERTICAL_JITTER = 26;
const MAX_SPEED_KMH = PLAYER.MAX_SPEED_CAP * 3.6;
const FPS_REFRESH_MS = 250;
const RATIO_STEPS = 500;
const HOT_MULTIPLIER = 1;
const BLAZING_MULTIPLIER = 5;
const AUTO_OPTION = 'AUTO';
const QUALITY_OPTIONS = Object.freeze([...QUALITY_TIER_ORDER, AUTO_OPTION]);
const WRONG_WAY_LABEL = `${SCORE.WRONG_WAY_MULTIPLIER}×`;

const MODE_OPTIONS = Object.freeze([
  Object.freeze({ mode: GAME_MODES.STANDARD, label: 'STANDARD', note: 'ONE CRASH ENDS THE RUN' }),
  Object.freeze({ mode: GAME_MODES.UNLIMITED, label: 'UNLIMITED', note: 'CRASHES NEVER END THE RUN — THE CAR NEVER STOPS' }),
]);

const CAMERA_LABELS = Object.freeze({
  CHASE: 'CHASE',
  ISOMETRIC: 'ISO',
  HOOD: 'HOOD',
});

const KEY_LEGEND = Object.freeze([
  Object.freeze({ keys: Object.freeze(['A', 'D', '←', '→']), action: 'STEER' }),
  Object.freeze({ keys: Object.freeze(['W', '↑']), action: 'BOOST' }),
  Object.freeze({ keys: Object.freeze(['S', '↓', 'SPACE']), action: 'BRAKE' }),
  Object.freeze({ keys: Object.freeze(['C']), action: 'CAMERA' }),
  Object.freeze({ keys: Object.freeze(['P', 'ESC']), action: 'PAUSE' }),
  Object.freeze({ keys: Object.freeze(['M']), action: 'MUTE' }),
]);

const TOUCH_LEGEND = Object.freeze([
  Object.freeze({ keys: Object.freeze(['◀︎', '▶︎']), action: 'STEER' }),
  Object.freeze({ keys: Object.freeze(['BOOST']), action: 'ACCELERATE' }),
  Object.freeze({ keys: Object.freeze(['BRAKE']), action: 'SLOW DOWN' }),
  Object.freeze({ keys: Object.freeze(['II']), action: 'PAUSE' }),
]);

const REPORT_FIELDS = Object.freeze([
  Object.freeze({ key: 'highScore', label: 'HIGH SCORE', unit: '', record: true }),
  Object.freeze({ key: 'distance', label: 'DISTANCE', unit: 'KM' }),
  Object.freeze({ key: 'topSpeed', label: 'TOP SPEED', unit: 'KM/H' }),
  Object.freeze({ key: 'averageSpeed', label: 'AVG SPEED', unit: 'KM/H' }),
  Object.freeze({ key: 'nearMisses', label: 'NEAR MISSES', unit: '' }),
  Object.freeze({ key: 'bestCombo', label: 'BEST COMBO', unit: '' }),
  Object.freeze({ key: 'wrongWay', label: 'WRONG-WAY', unit: 'S' }),
  Object.freeze({ key: 'duration', label: 'DURATION', unit: 'MM:SS' }),
]);

const EMPTY_TELEMETRY = Object.freeze({
  score: 0,
  highScore: 0,
  multiplier: 1,
  comboCount: 0,
  comboTimerRatio: 0,
  isWrongWay: false,
  speedKmh: 0,
  distanceKm: 0,
});

const readClock =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();

const toFinite = (value, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clampUnit = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

const padTwo = (value) => String(value).padStart(2, '0');

function formatInteger(value) {
  const rounded = Math.round(toFinite(value));
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rounded < 0 ? `-${digits}` : digits;
}

function formatMultiplier(value) {
  const tenths = Math.round(toFinite(value, 1) * 10);
  return tenths % 10 === 0 ? `×${tenths / 10}` : `×${(tenths / 10).toFixed(1)}`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(toFinite(seconds)));
  return `${padTwo(Math.floor(total / 60))}:${padTwo(total % 60)}`;
}

function createNode(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function createLiveText(parent, initial = '') {
  const text = document.createTextNode(initial);
  parent.appendChild(text);
  return text;
}

function createLabel(index, text, className = 'label') {
  const node = createNode('div', className);
  node.append(createNode('span', 'idx', index), createNode('span', 'label__text', text));
  return node;
}

function createLegend(rows, variant) {
  const list = createNode('dl', `legend legend--${variant}`);
  for (const row of rows) {
    const item = createNode('div', 'legend__row');
    const keys = createNode('dt', 'legend__keys');
    for (const key of row.keys) keys.append(createNode('kbd', 'key', key));
    item.append(keys, createNode('dd', 'legend__action', row.action));
    list.append(item);
  }
  return list;
}

function createFallbackRoot() {
  const root = document.createElement('div');
  root.id = 'ui-root';
  document.body.appendChild(root);
  return root;
}

export class UIManager {
  constructor(uiRoot, callbacks = {}) {
    this.root = uiRoot ?? createFallbackRoot();
    this.callbacks = callbacks ?? {};
    this.screen = '';
    this.currentTier = QUALITY_TIER_ORDER[QUALITY_TIER_ORDER.length - 1];
    this.isAuto = true;
    this.muted = false;
    this.qualityRevision = 0;
    this.muteRevision = 0;
    this.mode = GAME_MODES.STANDARD;
    this.modeRevision = 0;
    this.modeButtons = [];
    this.qualityButtons = [];
    this.muteControls = [];
    this.popups = [];
    this.popupCursor = 0;
    this.hudCache = {
      score: NaN,
      highScore: NaN,
      distance: NaN,
      speed: NaN,
      multiplier: NaN,
      multiplierState: -1,
      comboCount: NaN,
      comboRatio: NaN,
      wrongWay: null,
      fps: NaN,
      fpsStamp: -Infinity,
      tier: null,
      isAuto: null,
      cameraMode: undefined,
      impacts: NaN,
    };

    this.hud = this.buildHUD();
    this.menu = this.buildMenu();
    this.pause = this.buildPause();
    this.report = this.buildGameOver();
    this.flash = this.buildFlash();

    this.setQualityState(this.currentTier, this.isAuto);
    this.setMuted(false);
    this.setMode(this.mode);
    this.setScreen('none');
  }

  invoke(name, argument) {
    const callback = this.callbacks[name];
    if (typeof callback === 'function') callback(argument);
  }

  createButton(className, handler, ariaLabel = '') {
    const button = createNode('button', className);
    button.type = 'button';
    if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      handler(event);
      button.blur();
    });
    return button;
  }

  createActionButton(className, index, text, hint, handler) {
    const button = this.createButton(className, handler);
    if (index) button.append(createNode('span', 'btn__idx', index));
    button.append(createNode('span', 'btn__text', text));
    if (hint) button.append(createNode('span', 'btn__hint', hint));
    return button;
  }

  createMuteButton(className, prefix, withIndicator) {
    const button = this.createButton(className, () => this.handleMuteToggle(), 'Mute');
    button.append(createNode('span', 'btn__key', prefix));
    const state = createNode('span', 'btn__state');
    if (withIndicator) state.append(createNode('span', 'btn__dot'));
    const value = createNode('span', 'btn__value');
    const text = createLiveText(value, 'ON');
    state.append(value);
    button.append(state);
    this.muteControls.push({ button, text });
    return button;
  }

  createQualityControl() {
    const group = createNode('div', 'segmented');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Render quality');
    for (const option of QUALITY_OPTIONS) {
      const label = option === AUTO_OPTION ? 'AUTO' : QUALITY_CONFIG[option].label;
      const button = this.createButton('btn btn--segment', () => this.handleQualitySelect(option));
      button.dataset.option = option;
      button.append(createNode('span', 'btn__text', label));
      this.qualityButtons.push({ option, button, active: null, current: null });
      group.append(button);
    }
    return group;
  }

  createModeControl() {
    const group = createNode('div', 'segmented segmented--two');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Game mode');
    for (const option of MODE_OPTIONS) {
      const button = this.createButton('btn btn--segment', () => this.handleModeSelect(option.mode));
      button.dataset.mode = option.mode;
      button.append(createNode('span', 'btn__text', option.label));
      this.modeButtons.push({ mode: option.mode, button });
      group.append(button);
    }
    return group;
  }

  buildHUD() {
    const screen = createNode('section', 'screen screen--hud');
    screen.setAttribute('aria-label', 'Telemetry');

    const frame = createNode('div', 'hud-frame');
    frame.setAttribute('aria-hidden', 'true');
    for (const corner of ['tl', 'tr', 'bl', 'br']) frame.append(createNode('span', `hud-corner hud-corner--${corner}`));
    frame.append(createNode('span', 'hud-cross hud-cross--left'), createNode('span', 'hud-cross hud-cross--right'));

    const scoreBlock = createNode('div', 'hud-block hud-score');
    const scoreValue = createNode('div', 'hud-score__value num');
    const scoreText = createLiveText(scoreValue, '0');
    const scoreMeta = createNode('div', 'hud-score__meta');

    const distanceStat = createNode('div', 'hud-stat');
    const distanceValue = createNode('div', 'hud-stat__value num');
    const distanceText = createLiveText(distanceValue, '0.00');
    distanceValue.append(createNode('span', 'unit', 'KM'));
    distanceStat.append(createLabel('02', 'DISTANCE'), distanceValue);

    const bestStat = createNode('div', 'hud-stat');
    const bestValue = createNode('div', 'hud-stat__value num');
    const bestText = createLiveText(bestValue, '0');
    bestStat.append(createLabel('03', 'BEST'), bestValue);

    scoreMeta.append(distanceStat, bestStat);
    scoreBlock.append(createLabel('01', 'SCORE'), scoreValue, scoreMeta);

    const rightBlock = createNode('div', 'hud-block hud-right');
    const buttons = createNode('div', 'hud-buttons');

    const cameraButton = this.createButton('btn btn--hud', () => this.invoke('onCameraCycle'), 'Cycle camera');
    cameraButton.append(createNode('span', 'btn__key', 'CAM'), createNode('span', 'btn__sep', '/'));
    const cameraValue = createNode('span', 'btn__value');
    const cameraText = createLiveText(cameraValue, CAMERA_LABELS.CHASE);
    cameraButton.append(cameraValue);

    const muteButton = this.createMuteButton('btn btn--hud', 'SND', false);

    const pauseButton = this.createButton('btn btn--hud btn--icon', () => this.invoke('onPauseToggle'), 'Pause');
    pauseButton.append(createNode('span', 'btn__text', 'II'));

    buttons.append(cameraButton, muteButton, pauseButton);

    const combo = createNode('div', 'hud-combo');
    const comboHead = createNode('div', 'hud-combo__head');
    comboHead.append(createLabel('04', 'MULTIPLIER'));
    const multBadge = createNode('div', 'hud-mult num');
    const multText = createLiveText(multBadge, '×1');
    const comboBar = createNode('div', 'hud-combo__bar');
    const comboFill = createNode('span', 'hud-combo__fill');
    comboBar.append(comboFill);
    const comboMeta = createNode('div', 'hud-combo__meta');
    const comboCount = createNode('span', 'hud-combo__count num');
    const comboText = createLiveText(comboCount, '00');
    comboMeta.append(createNode('span', 'label', 'COMBO'), comboCount);
    combo.append(comboHead, multBadge, comboBar, comboMeta);

    const perf = createNode('div', 'hud-perf num');
    const fpsText = createLiveText(perf, '--');
    perf.append(createNode('span', 'hud-perf__sep', ' FPS — '));
    const tierText = createLiveText(perf, QUALITY_CONFIG[this.currentTier].label);

    const modeBadge = createNode('div', 'hud-mode');
    const impactsValue = createNode('span', 'hud-mode__count num');
    const impactsText = createLiveText(impactsValue, '00');
    modeBadge.append(
      createNode('span', 'hud-mode__tag', '∞ UNLIMITED'),
      createNode('span', 'hud-mode__label', 'IMPACTS'),
      impactsValue,
    );

    rightBlock.append(buttons, combo, perf, modeBadge);

    const wrongWay = createNode('div', 'hud-wrongway');
    wrongWay.setAttribute('role', 'status');
    const wrongWayBonus = createNode('span', 'hud-wrongway__bonus');
    wrongWayBonus.append(
      createNode('span', 'hud-wrongway__mult num', WRONG_WAY_LABEL),
      createNode('span', 'hud-wrongway__sub', 'SCORE'),
    );
    wrongWay.append(createNode('span', 'hud-wrongway__main', 'WRONG WAY'), wrongWayBonus);

    const speedBlock = createNode('div', 'hud-block hud-speed');
    const speedHead = createNode('div', 'hud-speed__head');
    speedHead.append(createLabel('05', 'VELOCITY'), createNode('span', 'hud-speed__unit', 'KM/H'));
    const speedValue = createNode('div', 'hud-speed__value num');
    const speedText = createLiveText(speedValue, '0');
    const gauge = createNode('div', 'hud-speed__gauge');
    const gaugeFill = createNode('span', 'hud-speed__fill');
    gauge.append(gaugeFill);
    speedBlock.append(speedHead, speedValue, gauge);

    const meta = createNode('div', 'hud-meta');
    meta.setAttribute('aria-hidden', 'true');
    meta.append(
      createNode('span', 'hud-meta__line', 'ALPINE OVERDRIVE — LIVE TELEMETRY'),
      createNode('span', 'hud-meta__line', '46°34′N 08°33′E — PASS ROAD'),
      createNode('span', 'hud-meta__line hud-meta__line--accent', `ONCOMING LANES — ${WRONG_WAY_LABEL} SCORE`),
    );

    const popupLayer = createNode('div', 'popup-layer');
    popupLayer.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < POPUP_POOL_SIZE; index += 1) this.popups.push(this.createPopup(popupLayer));

    screen.append(frame, scoreBlock, rightBlock, wrongWay, speedBlock, meta, popupLayer);
    this.root.append(screen);

    return {
      screen,
      scoreText,
      distanceText,
      bestText,
      cameraText,
      multBadge,
      multText,
      comboFill,
      comboText,
      fpsText,
      tierText,
      speedText,
      gaugeFill,
      impactsText,
    };
  }

  createPopup(layer) {
    const root = createNode('div', 'nm-popup');
    const inner = createNode('div', 'nm-popup__inner');
    const label = createNode('span', 'nm-popup__label');
    const labelText = createLiveText(label, '+NEAR MISS');
    const row = createNode('span', 'nm-popup__row');
    const points = createNode('span', 'nm-popup__points num');
    const pointsText = createLiveText(points, '+0');
    const multiplier = createNode('span', 'nm-popup__mult num');
    const multiplierText = createLiveText(multiplier, '×1');
    row.append(points, multiplier);
    inner.append(label, row);
    root.append(inner);
    layer.append(root);
    inner.addEventListener('animationend', (event) => {
      if (event.target === inner) root.classList.remove('is-live');
    });
    return { root, labelText, pointsText, multiplierText };
  }

  buildMenu() {
    const screen = createNode('section', 'screen screen--menu');
    screen.setAttribute('aria-label', 'Main menu');

    const panel = createNode('div', 'menu-panel');

    const head = createNode('header', 'menu-head');
    head.append(
      createNode('span', 'meta meta--strong', 'AO—01'),
      createNode('span', 'meta', 'DUSK EDITION'),
      createNode('span', 'meta meta--end', 'SWISS ALPS — 2,429 M'),
    );
    const backLink = createNode('a', 'meta meta--strong back-to-tasks', '← TASKS');
    backLink.href = '/';
    backLink.setAttribute('aria-label', 'Back to Actions To Do');
    head.prepend(backLink);

    const lockup = createNode('h1', 'lockup');
    lockup.setAttribute('aria-label', 'Alpine Overdrive');
    lockup.append(createNode('span', 'lockup__line', 'ALPINE'), createNode('span', 'lockup__line', 'OVERDRIVE'));

    const rule = createNode('div', 'index-rule');
    rule.setAttribute('aria-hidden', 'true');
    rule.append(
      createNode('span', 'index-rule__num', '01'),
      createNode('span', 'index-rule__bar'),
      createNode('span', 'index-rule__line'),
      createNode('span', 'index-rule__tail', 'NO. 01'),
    );

    const subtitle = createNode('p', 'menu-sub', 'ENDLESS TWO-WAY HIGHWAY — PROCEDURAL — 60 FPS');

    const grid = createNode('div', 'menu-grid');

    const record = createNode('div', 'cell cell--record');
    const recordValue = createNode('div', 'record-value num');
    const recordText = createLiveText(recordValue, '0');
    const recordNote = createNode('div', 'cell-note');
    const recordNoteText = createLiveText(recordNote, 'STANDARD — PERSONAL BEST');
    const modeNote = createNode('div', 'cell-note');
    const modeNoteText = createLiveText(modeNote, MODE_OPTIONS[0].note);
    record.append(
      createLabel('02', 'HIGH SCORE'),
      recordValue,
      recordNote,
      createLabel('03', 'MODE', 'label label--spaced'),
      this.createModeControl(),
      modeNote,
    );

    const settings = createNode('div', 'cell cell--settings');
    settings.append(
      createLabel('04', 'QUALITY'),
      this.createQualityControl(),
      createLabel('05', 'SOUND', 'label label--spaced'),
      this.createMuteButton('btn btn--toggle', 'SOUND', true),
    );

    const controls = createNode('div', 'cell cell--controls');
    controls.append(createLabel('06', 'CONTROLS'), createLegend(KEY_LEGEND, 'keys'), createLegend(TOUCH_LEGEND, 'touch'));

    grid.append(record, settings, controls);

    const foot = createNode('footer', 'menu-foot');
    foot.append(
      createNode('span', 'meta', 'NEAR MISSES CHAIN COMBOS'),
      createNode('span', 'meta meta--accent', `ONCOMING LANES SCORE ${WRONG_WAY_LABEL}`),
    );

    const start = this.createActionButton('btn btn--primary btn--start', '', 'START', '— ENTER', () =>
      this.invoke('onStart'),
    );
    start.append(createNode('span', 'btn__arrow', '→'));

    panel.append(head, lockup, rule, subtitle, grid, foot, start);

    const aside = createNode('aside', 'menu-aside');
    aside.setAttribute('aria-hidden', 'true');
    aside.append(
      createNode('span', 'meta meta--strong', '07 — LIVE FLYOVER'),
      createNode('span', 'meta', 'PROCEDURAL TERRAIN — REAL-TIME'),
      createNode('span', 'meta', '46°34′N 08°33′E'),
    );

    screen.append(panel, aside);
    this.root.append(screen);
    return { screen, recordText, recordNoteText, modeNoteText };
  }

  buildPause() {
    const screen = createNode('section', 'screen screen--pause overlay');
    screen.setAttribute('aria-label', 'Paused');

    const sheet = createNode('div', 'sheet sheet--pause');

    const head = createNode('div', 'sheet-head');
    head.append(
      createNode('span', 'meta meta--strong', 'II'),
      createNode('span', 'meta', 'SESSION SUSPENDED'),
      createNode('span', 'meta meta--end', 'P / ESC — RESUME'),
    );

    const title = createNode('h2', 'giant', 'PAUSED');

    const actions = createNode('div', 'sheet-actions');
    actions.append(
      this.createActionButton('btn btn--primary btn--block', '01', 'RESUME', 'P / ESC', () => this.invoke('onPauseToggle')),
      this.createActionButton('btn btn--block', '02', 'RESTART', 'NEW RUN', () => this.invoke('onRestart')),
      this.createActionButton('btn btn--block', '03', 'MAIN MENU', 'EXIT', () => this.invoke('onMainMenu')),
      this.createActionButton('btn btn--block btn--end-run', '∞', 'END RUN', 'REPORT', () => this.invoke('onEndRun')),
    );

    const settings = createNode('div', 'sheet-settings');
    settings.append(
      createLabel('04', 'QUALITY'),
      this.createQualityControl(),
      createLabel('05', 'SOUND', 'label label--spaced'),
      this.createMuteButton('btn btn--toggle', 'SOUND', true),
    );

    sheet.append(head, title, actions, settings);
    screen.append(sheet);
    this.root.append(screen);
    return { screen };
  }

  buildGameOver() {
    const screen = createNode('section', 'screen screen--gameover overlay');
    screen.setAttribute('aria-label', 'Run report');

    const sheet = createNode('div', 'sheet sheet--report');

    const headTitle = createNode('span', 'meta');
    const headTitleText = createLiveText(headTitle, 'GAME OVER — RUN REPORT');
    const head = createNode('div', 'sheet-head');
    head.append(
      createNode('span', 'meta meta--strong', 'END'),
      headTitle,
      createNode('span', 'meta meta--end', 'ENTER — RESTART'),
    );

    const hero = createNode('div', 'report-hero');
    const heroMain = createNode('div', 'report-hero__main');
    const scoreValue = createNode('div', 'report-score num');
    const scoreText = createLiveText(scoreValue, '0');
    heroMain.append(createLabel('00', 'FINAL SCORE'), scoreValue);
    const heroMeta = createNode('div', 'report-hero__meta');
    heroMeta.append(createNode('span', 'tag tag--record', 'NEW RECORD'), createNode('span', 'meta', 'TELEMETRY SUMMARY'));
    hero.append(heroMain, heroMeta);

    const grid = createNode('div', 'report-grid');
    const fields = {};
    const fieldLabels = {};
    const fieldUnits = {};
    REPORT_FIELDS.forEach((field, index) => {
      const cell = createNode('div', field.record ? 'report-cell report-cell--record' : 'report-cell');
      const cellHead = createNode('div', 'report-cell__head');
      const label = createLabel(padTwo(index + 1), field.label);
      fieldLabels[field.key] = label.lastChild;
      cellHead.append(label);
      if (field.record) cellHead.append(createNode('span', 'tag tag--record', 'NEW RECORD'));
      const value = createNode('div', 'report-value num');
      const text = createLiveText(value, '0');
      if (field.unit) {
        fieldUnits[field.key] = createNode('span', 'unit', field.unit);
        value.append(fieldUnits[field.key]);
      }
      cell.append(cellHead, value);
      grid.append(cell);
      fields[field.key] = text;
    });

    const actions = createNode('div', 'report-actions');
    actions.append(
      this.createActionButton('btn btn--primary btn--block', '', 'RESTART', '— ENTER', () => this.invoke('onRestart')),
      this.createActionButton('btn btn--block', '', 'MAIN MENU', 'EXIT', () => this.invoke('onMainMenu')),
    );

    sheet.append(head, hero, grid, actions);
    screen.append(sheet);
    this.root.append(screen);
    return { screen, scoreText, fields, fieldLabels, fieldUnits, headTitleText };
  }

  buildFlash() {
    const flash = createNode('div', 'crash-flash');
    flash.setAttribute('aria-hidden', 'true');
    flash.addEventListener('animationend', (event) => {
      if (event.target === flash) flash.classList.remove('is-live');
    });
    this.root.append(flash);
    return flash;
  }

  setScreen(name) {
    if (this.screen === name) return;
    this.screen = name;
    this.root.dataset.screen = name;
  }

  clearPopups() {
    for (const popup of this.popups) popup.root.classList.remove('is-live');
  }

  showMenu(highScore, currentTier, isAuto) {
    this.menu.recordText.nodeValue = formatInteger(highScore);
    this.setQualityState(currentTier ?? this.currentTier, isAuto ?? this.isAuto);
    this.clearPopups();
    this.menu.screen.scrollTop = 0;
    this.setScreen('menu');
  }

  showHUD() {
    this.setScreen('hud');
  }

  showPause() {
    this.pause.screen.scrollTop = 0;
    this.setScreen('pause');
  }

  showGameOver(summary) {
    const data = summary ?? {};
    const report = this.report;
    const fields = report.fields;
    const distanceKm = Math.max(0, toFinite(data.distanceKm));
    const durationSeconds = Math.max(0, toFinite(data.durationSeconds));

    report.scoreText.nodeValue = formatInteger(data.score);
    fields.highScore.nodeValue = formatInteger(data.highScore);
    fields.distance.nodeValue = distanceKm.toFixed(2);
    fields.topSpeed.nodeValue = formatInteger(data.topSpeedKmh);
    const isUnlimitedRun = data.mode === GAME_MODES.UNLIMITED;
    report.headTitleText.nodeValue = isUnlimitedRun ? 'UNLIMITED — RUN REPORT' : 'GAME OVER — RUN REPORT';
    report.fieldLabels.averageSpeed.textContent = isUnlimitedRun ? 'IMPACTS' : 'AVG SPEED';
    report.fieldUnits.averageSpeed.textContent = isUnlimitedRun ? '' : 'KM/H';
    fields.averageSpeed.nodeValue = isUnlimitedRun
      ? formatInteger(data.impacts)
      : formatInteger(durationSeconds > 0 ? (distanceKm * 3600) / durationSeconds : 0);
    fields.nearMisses.nodeValue = formatInteger(data.nearMisses);
    fields.bestCombo.nodeValue = toFinite(data.bestCombo) > 0 ? `×${formatInteger(data.bestCombo)}` : '—';
    fields.wrongWay.nodeValue = Math.max(0, toFinite(data.wrongWaySeconds)).toFixed(1);
    fields.duration.nodeValue = formatDuration(durationSeconds);
    report.screen.classList.toggle('is-record', Boolean(data.isNewHighScore));

    this.clearPopups();
    report.screen.scrollTop = 0;
    this.setScreen('gameover');
  }

  hideAll() {
    this.clearPopups();
    this.setScreen('none');
  }

  updateHUD(telemetry, fps, currentTier, cameraMode, isAuto) {
    const data = telemetry ?? EMPTY_TELEMETRY;
    const cache = this.hudCache;
    const hud = this.hud;

    const score = Math.round(toFinite(data.score));
    if (score !== cache.score) {
      cache.score = score;
      hud.scoreText.nodeValue = formatInteger(score);
    }

    const highScore = Math.round(toFinite(data.highScore));
    if (highScore !== cache.highScore) {
      cache.highScore = highScore;
      hud.bestText.nodeValue = formatInteger(highScore);
    }

    const distance = Math.max(0, Math.round(toFinite(data.distanceKm) * 100));
    if (distance !== cache.distance) {
      cache.distance = distance;
      hud.distanceText.nodeValue = (distance / 100).toFixed(2);
    }

    const speed = Math.max(0, Math.round(toFinite(data.speedKmh)));
    if (speed !== cache.speed) {
      cache.speed = speed;
      hud.speedText.nodeValue = String(speed);
      hud.gaugeFill.style.transform = `scaleX(${clampUnit(speed / MAX_SPEED_KMH).toFixed(3)})`;
    }

    const multiplierValue = toFinite(data.multiplier, 1);
    const multiplier = Math.round(multiplierValue * 10);
    if (multiplier !== cache.multiplier) {
      cache.multiplier = multiplier;
      hud.multText.nodeValue = formatMultiplier(multiplierValue);
      const multiplierState = multiplierValue >= BLAZING_MULTIPLIER ? 2 : multiplierValue > HOT_MULTIPLIER ? 1 : 0;
      if (multiplierState !== cache.multiplierState) {
        cache.multiplierState = multiplierState;
        hud.multBadge.classList.toggle('is-hot', multiplierState === 1);
        hud.multBadge.classList.toggle('is-blazing', multiplierState === 2);
      }
    }

    const comboCount = Math.max(0, Math.round(toFinite(data.comboCount)));
    if (comboCount !== cache.comboCount) {
      cache.comboCount = comboCount;
      hud.comboText.nodeValue = padTwo(comboCount);
    }

    const comboRatio = Math.round(clampUnit(toFinite(data.comboTimerRatio)) * RATIO_STEPS);
    if (comboRatio !== cache.comboRatio) {
      cache.comboRatio = comboRatio;
      hud.comboFill.style.transform = `scaleX(${(comboRatio / RATIO_STEPS).toFixed(3)})`;
    }

    const wrongWay = Boolean(data.isWrongWay);
    if (wrongWay !== cache.wrongWay) {
      cache.wrongWay = wrongWay;
      hud.screen.classList.toggle('is-wrong-way', wrongWay);
    }

    const fpsRounded = Math.max(0, Math.round(toFinite(fps)));
    if (fpsRounded !== cache.fps) {
      const stamp = readClock();
      if (stamp - cache.fpsStamp >= FPS_REFRESH_MS) {
        cache.fps = fpsRounded;
        cache.fpsStamp = stamp;
        hud.fpsText.nodeValue = String(fpsRounded);
      }
    }

    const autoFlag = Boolean(isAuto);
    if (currentTier !== cache.tier || autoFlag !== cache.isAuto) {
      cache.tier = currentTier;
      cache.isAuto = autoFlag;
      const config = QUALITY_CONFIG[currentTier];
      const label = config ? config.label : String(currentTier ?? '—');
      hud.tierText.nodeValue = autoFlag ? `${label} AUTO` : label;
      if (config && (currentTier !== this.currentTier || autoFlag !== this.isAuto)) {
        this.setQualityState(currentTier, autoFlag);
      }
    }

    const impacts = Math.max(0, Math.round(toFinite(data.impacts)));
    if (impacts !== cache.impacts) {
      cache.impacts = impacts;
      hud.impactsText.nodeValue = padTwo(impacts);
    }

    if (cameraMode !== cache.cameraMode) {
      cache.cameraMode = cameraMode;
      hud.cameraText.nodeValue = CAMERA_LABELS[cameraMode] ?? String(cameraMode ?? '—');
    }
  }

  triggerNearMissPopup(points, multiplier, isOncoming) {
    const popup = this.popups[this.popupCursor];
    const side = this.popupCursor % 2 === 0 ? -1 : 1;
    this.popupCursor = (this.popupCursor + 1) % this.popups.length;

    const oncoming = Boolean(isOncoming);
    popup.labelText.nodeValue = oncoming ? '+ONCOMING NEAR MISS' : '+NEAR MISS';
    popup.pointsText.nodeValue = `+${formatInteger(points)}`;
    popup.multiplierText.nodeValue = formatMultiplier(multiplier);

    const offsetX = side * (POPUP_MIN_OFFSET_VW + Math.random() * (POPUP_MAX_OFFSET_VW - POPUP_MIN_OFFSET_VW));
    const offsetY = (Math.random() * 2 - 1) * POPUP_VERTICAL_JITTER;
    popup.root.style.transform = `translate3d(${offsetX.toFixed(2)}vw, ${offsetY.toFixed(1)}px, 0)`;

    const classes = popup.root.classList;
    classes.remove('is-impact');
    classes.toggle('is-oncoming', oncoming);
    classes.toggle('is-alt');
    classes.add('is-live');
  }

  triggerImpactPopup(impactCount) {
    const popup = this.popups[this.popupCursor];
    this.popupCursor = (this.popupCursor + 1) % this.popups.length;
    popup.labelText.nodeValue = 'IMPACT — COMBO LOST';
    popup.pointsText.nodeValue = 'KEEP DRIVING';
    popup.multiplierText.nodeValue = `#${padTwo(Math.max(0, Math.round(toFinite(impactCount))))}`;
    popup.root.style.transform = `translate3d(0, ${POPUP_VERTICAL_JITTER}px, 0)`;
    const classes = popup.root.classList;
    classes.remove('is-oncoming');
    classes.add('is-impact');
    classes.toggle('is-alt');
    classes.add('is-live');
  }

  setMode(mode, highScore) {
    this.mode = mode === GAME_MODES.UNLIMITED ? GAME_MODES.UNLIMITED : GAME_MODES.STANDARD;
    this.modeRevision += 1;
    const option = MODE_OPTIONS.find((entry) => entry.mode === this.mode) ?? MODE_OPTIONS[0];
    for (const entry of this.modeButtons) {
      const active = entry.mode === this.mode;
      entry.button.classList.toggle('is-active', active);
      entry.button.setAttribute('aria-pressed', String(active));
    }
    this.menu.modeNoteText.nodeValue = option.note;
    this.menu.recordNoteText.nodeValue = `${option.label} — PERSONAL BEST`;
    if (highScore !== undefined) this.menu.recordText.nodeValue = formatInteger(highScore);
    this.root.classList.toggle('is-unlimited', this.mode === GAME_MODES.UNLIMITED);
  }

  handleModeSelect(mode) {
    if (mode === this.mode) return;
    const revision = this.modeRevision;
    this.invoke('onModeChange', mode);
    if (revision === this.modeRevision) this.setMode(mode);
  }

  flashCrash() {
    this.flash.classList.toggle('is-alt');
    this.flash.classList.add('is-live');
  }

  handleQualitySelect(option) {
    if (option === AUTO_OPTION) {
      const next = !this.isAuto;
      const revision = this.qualityRevision;
      this.invoke('onAutoQualityToggle', next);
      if (revision === this.qualityRevision) this.setQualityState(this.currentTier, next);
      return;
    }
    if (!this.isAuto && option === this.currentTier) return;
    if (this.isAuto) this.invoke('onAutoQualityToggle', false);
    const revision = this.qualityRevision;
    this.invoke('onQualityChange', option);
    if (revision === this.qualityRevision) this.setQualityState(option, false);
  }

  handleMuteToggle() {
    const revision = this.muteRevision;
    this.invoke('onMuteToggle');
    if (revision === this.muteRevision) this.setMuted(!this.muted);
  }

  setQualityState(tier, isAuto) {
    if (QUALITY_CONFIG[tier]) this.currentTier = tier;
    this.isAuto = Boolean(isAuto);
    this.qualityRevision += 1;
    for (const entry of this.qualityButtons) {
      const isAutoButton = entry.option === AUTO_OPTION;
      const active = isAutoButton ? this.isAuto : !this.isAuto && entry.option === this.currentTier;
      const current = !isAutoButton && this.isAuto && entry.option === this.currentTier;
      if (active !== entry.active) {
        entry.active = active;
        entry.button.classList.toggle('is-active', active);
        entry.button.setAttribute('aria-pressed', String(active));
      }
      if (current !== entry.current) {
        entry.current = current;
        entry.button.classList.toggle('is-current', current);
      }
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.muteRevision += 1;
    const label = this.muted ? 'OFF' : 'ON';
    for (const control of this.muteControls) {
      control.text.nodeValue = label;
      control.button.classList.toggle('is-muted', this.muted);
      control.button.setAttribute('aria-pressed', String(this.muted));
    }
  }
}
