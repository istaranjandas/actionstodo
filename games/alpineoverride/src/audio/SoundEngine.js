import { clamp, createSeededRandom, NEAR_MISS } from '../config/constants.js';

const SILENCE = 0.0001;
const MASTER_LEVEL = 0.82;
const ENGINE_BUS_LEVEL = 0.4;
const AMBIENCE_BUS_LEVEL = 0.46;
const SFX_BUS_LEVEL = 0.72;
const MUTE_RAMP_SECONDS = 0.15;
const ENGINE_FADE_IN_SECONDS = 0.4;
const ENGINE_FADE_OUT_SECONDS = 0.5;
const SCHEDULE_LEAD = 0.005;
const RESUME_GRACE_SECONDS = 0.5;
const MAX_ONE_SHOT_VOICES = 8;

const NOISE_DURATION = 2;
const NOISE_CROSSFADE = 0.06;
const NOISE_CHANNELS = 2;
const NOISE_PEAK = 0.9;
const NOISE_PREROLL = 4096;
const SHAPER_RESOLUTION = 2049;
const ENGINE_SATURATION_DRIVE = 2.2;
const CRASH_SATURATION_DRIVE = 3.6;
const CRASH_SATURATION_ASYMMETRY = 0.18;

const GEAR_UPPER_BOUNDS = Object.freeze([0.1, 0.22, 0.36, 0.52, 0.72, 1.0]);
const GEAR_COUNT = GEAR_UPPER_BOUNDS.length;
const DOWNSHIFT_HYSTERESIS = 0.018;
const IDLE_RPM = 950;
const SHIFT_LANDING_RPM = 3000;
const SHIFT_POINT_RPM = 6300;
const TOP_GEAR_MAX_RPM = 5900;
const REDLINE_RPM = 7000;
const LOAD_RPM_FLARE = 220;
const UPSHIFT_DIP_SECONDS = 0.15;
const DOWNSHIFT_DIP_SECONDS = 0.08;
const MAX_MODEL_STEP = 0.25;
const MIN_MODEL_STEP = 0.0005;

const ENGINE_BASE_HZ = 26;
const ENGINE_HZ_PER_RPM = 0.031;
const ENGINE_CUTOFF_MIN = 280;
const ENGINE_CUTOFF_MAX = 2400;
const CRUISE_LOAD = 0.45;
const BRAKING_LOAD = 0.1;
const MIN_LOAD = 0.18;
const LOAD_PER_RATIO_RATE = 3.2;
const LOAD_RESPONSE = 7;

const HISS_LEVEL = 0.6;
const WIND_LEVEL = 0.85;
const BRAKE_WHOOSH_LEVEL = 0.3;

const WHOOSH_DURATION = 0.42;
const WHOOSH_PEAK = 2.2;
const WHOOSH_START_HZ = 3200;
const WHOOSH_END_HZ = 500;
const WHOOSH_PAN_WIDTH = 0.85;
const CHIME_DELAY = 0.03;
const NEAR_MISS_ROOT_HZ = 523.25;
const PENTATONIC_STEPS = Object.freeze([0, 2, 4, 7, 9, 12, 14, 16, 19, 21]);
const CHIME_PARTIALS = Object.freeze([
  Object.freeze({ ratio: 1, type: 'sine', level: 0.2, decay: 0.78 }),
  Object.freeze({ ratio: 1.5, type: 'triangle', level: 0.07, decay: 0.62 }),
  Object.freeze({ ratio: 2, type: 'sine', level: 0.06, decay: 0.5 }),
]);

const CRASH_CLANK_COUNT = 4;
const CRASH_DUCK_LEVEL = 0.22;
const CRASH_DUCK_HOLD = 0.7;

const clockSeconds =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now() * 0.001
    : () => Date.now() * 0.001;

const ignore = () => {};

function swallow(result) {
  if (result && typeof result.catch === 'function') result.catch(ignore);
}

function setParam(param, value) {
  if (param) param.value = value;
}

function holdParam(param, time) {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(time);
  } else {
    const current = param.value;
    param.cancelScheduledValues(time);
    param.setValueAtTime(current, time);
  }
}

function rampParam(param, value, time, duration) {
  holdParam(param, time);
  param.linearRampToValueAtTime(value, time + duration);
}

function envelope(param, time, peak, attack, release) {
  param.setValueAtTime(SILENCE, time);
  param.exponentialRampToValueAtTime(Math.max(peak, SILENCE), time + attack);
  param.exponentialRampToValueAtTime(SILENCE, time + release);
}

function sweep(param, time, from, to, duration) {
  param.setValueAtTime(Math.max(from, SILENCE), time);
  param.exponentialRampToValueAtTime(Math.max(to, SILENCE), time + duration);
}

function disconnectAll(nodes) {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {}
  }
}

function abortVoice(nodes, sources) {
  for (const source of sources) {
    try {
      source.onended = null;
      source.stop();
    } catch {}
  }
  disconnectAll(nodes);
}

function makeGain(context, nodes, value) {
  const node = context.createGain();
  node.gain.value = value;
  nodes.push(node);
  return node;
}

function makeFilter(context, nodes, type, frequency, q) {
  const node = context.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  nodes.push(node);
  return node;
}

function makeOscillator(context, nodes, sources, type, frequency) {
  const node = context.createOscillator();
  node.type = type;
  node.frequency.value = frequency;
  nodes.push(node);
  sources.push(node);
  return node;
}

function makeNoise(context, nodes, sources, buffer) {
  const node = context.createBufferSource();
  node.buffer = buffer;
  node.loop = true;
  nodes.push(node);
  sources.push(node);
  return node;
}

function randomNoiseOffset(buffer) {
  const duration = buffer && buffer.duration > 0 ? buffer.duration : NOISE_DURATION;
  return Math.random() * duration * 0.95;
}

function createAudioContext(AudioContextClass) {
  try {
    return new AudioContextClass({ latencyHint: 'interactive' });
  } catch {
    return new AudioContextClass();
  }
}

function createSaturationCurve(drive, asymmetry) {
  const curve = new Float32Array(SHAPER_RESOLUTION);
  const normalizer = Math.tanh(drive * (1 + asymmetry));
  for (let index = 0; index < SHAPER_RESOLUTION; index += 1) {
    const x = (index / (SHAPER_RESOLUTION - 1)) * 2 - 1;
    curve[index] = clamp(Math.tanh(drive * (x + asymmetry * x * x)) / normalizer, -1, 1);
  }
  return curve;
}

function fillPinkishNoise(target, random) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  const total = target.length + NOISE_PREROLL;
  for (let index = 0; index < total; index += 1) {
    const white = random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    if (index >= NOISE_PREROLL) target[index - NOISE_PREROLL] = pink * 0.08 + white * 0.25;
  }
}

function createNoiseBuffer(context) {
  const sampleRate = context.sampleRate || 44100;
  const length = Math.max(2, Math.floor(sampleRate * NOISE_DURATION));
  const crossfade = Math.max(1, Math.min(Math.floor(sampleRate * NOISE_CROSSFADE), length >> 1));
  const buffer = context.createBuffer(NOISE_CHANNELS, length, sampleRate);
  const raw = new Float32Array(length + crossfade);
  for (let channel = 0; channel < NOISE_CHANNELS; channel += 1) {
    fillPinkishNoise(raw, createSeededRandom(0x5eed + channel * 7919));
    const data = buffer.getChannelData(channel);
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      let sample = raw[index];
      if (index < crossfade) {
        const blend = index / crossfade;
        sample = raw[index] * Math.sqrt(blend) + raw[length + index] * Math.sqrt(1 - blend);
      }
      data[index] = sample;
      sum += sample;
    }
    const mean = sum / length;
    let peak = 0;
    for (let index = 0; index < length; index += 1) {
      data[index] -= mean;
      const magnitude = Math.abs(data[index]);
      if (magnitude > peak) peak = magnitude;
    }
    const scale = peak > 0 ? NOISE_PEAK / peak : 0;
    for (let index = 0; index < length; index += 1) data[index] *= scale;
  }
  return buffer;
}

function gearForRatio(ratio) {
  for (let gear = 0; gear < GEAR_COUNT; gear += 1) {
    if (ratio <= GEAR_UPPER_BOUNDS[gear]) return gear;
  }
  return GEAR_COUNT - 1;
}

class SmoothedParam {
  constructor(param, initialValue) {
    this.param = param;
    this.last = initialValue;
    param.value = initialValue;
  }

  jump(value, time) {
    if (!Number.isFinite(value)) return;
    this.param.cancelScheduledValues(time);
    this.param.setValueAtTime(value, time);
    this.last = value;
  }

  glide(value, time, timeConstant) {
    if (!Number.isFinite(value)) return;
    const tolerance = Math.max(Math.abs(this.last), 0.01) * 0.0025;
    if (Math.abs(value - this.last) <= tolerance) return;
    this.param.setTargetAtTime(value, time, timeConstant);
    this.last = value;
  }

  write(value, time, timeConstant, immediate) {
    if (immediate) this.jump(value, time);
    else this.glide(value, time, timeConstant);
  }
}

class EngineModel {
  constructor() {
    this.reset();
  }

  reset() {
    this.ratio = 0;
    this.braking = false;
    this.load = CRUISE_LOAD;
    this.gear = 0;
    this.rpm = IDLE_RPM;
    this.rpmNorm = 0;
    this.dipping = false;
    this.initialized = false;
    this.shiftDipUntil = 0;
    this.rateRatio = 0;
    this.rateTime = 0;
  }

  update(ratio, braking, time) {
    if (!this.initialized) {
      this.gear = gearForRatio(ratio);
      this.load = braking ? BRAKING_LOAD : CRUISE_LOAD;
      this.shiftDipUntil = 0;
      this.rateRatio = ratio;
      this.rateTime = time;
      this.initialized = true;
    } else {
      this.shiftGear(ratio, time);
      const deltaTime = Math.min(time - this.rateTime, MAX_MODEL_STEP);
      if (deltaTime > MIN_MODEL_STEP) {
        const ratioRate = (ratio - this.rateRatio) / deltaTime;
        const targetLoad = braking ? BRAKING_LOAD : clamp(CRUISE_LOAD + ratioRate * LOAD_PER_RATIO_RATE, MIN_LOAD, 1);
        this.load += (targetLoad - this.load) * (1 - Math.exp(-deltaTime * LOAD_RESPONSE));
        this.rateRatio = ratio;
        this.rateTime = time;
      } else if (deltaTime < 0) {
        this.rateRatio = ratio;
        this.rateTime = time;
      }
    }
    this.ratio = ratio;
    this.braking = braking;
    this.dipping = time < this.shiftDipUntil;
    this.computeRpm();
  }

  shiftGear(ratio, time) {
    let gear = this.gear;
    while (gear < GEAR_COUNT - 1 && ratio > GEAR_UPPER_BOUNDS[gear]) gear += 1;
    while (gear > 0 && ratio < GEAR_UPPER_BOUNDS[gear - 1] - DOWNSHIFT_HYSTERESIS) gear -= 1;
    if (gear === this.gear) return;
    this.shiftDipUntil = time + (gear > this.gear ? UPSHIFT_DIP_SECONDS : DOWNSHIFT_DIP_SECONDS);
    this.gear = gear;
  }

  computeRpm() {
    const gear = this.gear;
    const lower = gear === 0 ? 0 : GEAR_UPPER_BOUNDS[gear - 1];
    const progress = clamp((this.ratio - lower) / (GEAR_UPPER_BOUNDS[gear] - lower), 0, 1);
    const floor = gear === 0 ? IDLE_RPM : SHIFT_LANDING_RPM;
    const ceiling = gear === GEAR_COUNT - 1 ? TOP_GEAR_MAX_RPM : SHIFT_POINT_RPM;
    const flare = this.braking ? -LOAD_RPM_FLARE * 0.5 : (this.load - CRUISE_LOAD) * LOAD_RPM_FLARE * 2;
    this.rpm = clamp(floor + (ceiling - floor) * progress + flare, IDLE_RPM * 0.9, REDLINE_RPM);
    this.rpmNorm = clamp((this.rpm - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM), 0, 1);
  }
}

class ContinuousLayer {
  constructor(context, engineBus, ambienceBus, noiseBuffer, engineCurve) {
    this.nodes = [];
    this.sources = [];
    this.started = false;
    try {
      this.build(context, engineBus, ambienceBus, noiseBuffer, engineCurve);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  build(context, engineBus, ambienceBus, noiseBuffer, engineCurve) {
    const nodes = this.nodes;
    const sources = this.sources;

    const saw = makeOscillator(context, nodes, sources, 'sawtooth', 60);
    const triangle = makeOscillator(context, nodes, sources, 'triangle', 60);
    const sub = makeOscillator(context, nodes, sources, 'sine', 30);
    saw.detune.value = -4;
    triangle.detune.value = 9;
    const sawLevel = makeGain(context, nodes, 0.34);
    const triangleLevel = makeGain(context, nodes, 0.3);
    const subLevel = makeGain(context, nodes, 0.46);
    const driveGain = makeGain(context, nodes, 1);
    const shaper = context.createWaveShaper();
    nodes.push(shaper);
    shaper.curve = engineCurve;
    shaper.oversample = '2x';
    const engineFilter = makeFilter(context, nodes, 'lowpass', ENGINE_CUTOFF_MIN, 1.2);
    const pulseGain = makeGain(context, nodes, 0.86);
    const combustionLfo = makeOscillator(context, nodes, sources, 'sine', 8);
    const combustionDepth = makeGain(context, nodes, 0.14);
    const engineLevel = makeGain(context, nodes, 0);
    this.duckGain = makeGain(context, nodes, 1);

    saw.connect(sawLevel);
    triangle.connect(triangleLevel);
    sub.connect(subLevel);
    sawLevel.connect(driveGain);
    triangleLevel.connect(driveGain);
    subLevel.connect(driveGain);
    driveGain.connect(shaper);
    shaper.connect(engineFilter);
    engineFilter.connect(pulseGain);
    combustionLfo.connect(combustionDepth);
    combustionDepth.connect(pulseGain.gain);
    pulseGain.connect(engineLevel);
    engineLevel.connect(this.duckGain);
    this.duckGain.connect(engineBus);

    this.noise = makeNoise(context, nodes, sources, noiseBuffer);
    const hissHighpass = makeFilter(context, nodes, 'highpass', 2000, 0.7);
    const hissLowpass = makeFilter(context, nodes, 'lowpass', 4200, 0.6);
    const hissLevel = makeGain(context, nodes, 0);
    const hissModulation = makeGain(context, nodes, 1);
    const windLowpass = makeFilter(context, nodes, 'lowpass', 240, 0.5);
    const windLevel = makeGain(context, nodes, 0);
    const windGust = makeGain(context, nodes, 1);
    const brakeBand = makeFilter(context, nodes, 'bandpass', 650, 0.8);
    const brakeLevel = makeGain(context, nodes, 0);
    const gustSlow = makeOscillator(context, nodes, sources, 'sine', 0.047);
    const gustFast = makeOscillator(context, nodes, sources, 'sine', 0.11);
    const gustFastDepth = makeGain(context, nodes, 0.18);
    const gustSlowDepth = makeGain(context, nodes, 0.12);
    const gustToneDepth = makeGain(context, nodes, 110);
    const hissGustDepth = makeGain(context, nodes, 0.06);

    this.noise.connect(hissHighpass);
    hissHighpass.connect(hissLowpass);
    hissLowpass.connect(hissLevel);
    hissLevel.connect(hissModulation);
    hissModulation.connect(ambienceBus);
    this.noise.connect(windLowpass);
    windLowpass.connect(windLevel);
    windLevel.connect(windGust);
    windGust.connect(ambienceBus);
    this.noise.connect(brakeBand);
    brakeBand.connect(brakeLevel);
    brakeLevel.connect(engineBus);
    gustFast.connect(gustFastDepth);
    gustFastDepth.connect(windGust.gain);
    gustFast.connect(hissGustDepth);
    hissGustDepth.connect(hissModulation.gain);
    gustSlow.connect(gustSlowDepth);
    gustSlowDepth.connect(windGust.gain);
    gustSlow.connect(gustToneDepth);
    gustToneDepth.connect(windLowpass.frequency);

    this.sawFrequency = new SmoothedParam(saw.frequency, 60);
    this.triangleFrequency = new SmoothedParam(triangle.frequency, 60);
    this.subFrequency = new SmoothedParam(sub.frequency, 30);
    this.pulseRate = new SmoothedParam(combustionLfo.frequency, 8);
    this.pulseDepth = new SmoothedParam(combustionDepth.gain, 0.14);
    this.pulseLevel = new SmoothedParam(pulseGain.gain, 0.86);
    this.drive = new SmoothedParam(driveGain.gain, 1);
    this.cutoff = new SmoothedParam(engineFilter.frequency, ENGINE_CUTOFF_MIN);
    this.resonance = new SmoothedParam(engineFilter.Q, 1.2);
    this.engineLevel = new SmoothedParam(engineLevel.gain, 0);
    this.hissLevel = new SmoothedParam(hissLevel.gain, 0);
    this.hissTone = new SmoothedParam(hissLowpass.frequency, 4200);
    this.windLevel = new SmoothedParam(windLevel.gain, 0);
    this.windTone = new SmoothedParam(windLowpass.frequency, 240);
    this.brakeLevel = new SmoothedParam(brakeLevel.gain, 0);
    this.brakeTone = new SmoothedParam(brakeBand.frequency, 650);
  }

  start(time) {
    if (this.started) return;
    this.started = true;
    for (const source of this.sources) {
      if (source === this.noise) source.start(time, randomNoiseOffset(source.buffer));
      else source.start(time);
    }
  }

  apply(model, time, immediate) {
    const { rpm, rpmNorm, load, dipping, ratio, braking } = model;
    const frequency = ENGINE_BASE_HZ + rpm * ENGINE_HZ_PER_RPM;
    const pitchResponse = dipping ? 0.04 : 0.06;
    this.sawFrequency.write(frequency, time, pitchResponse, immediate);
    this.triangleFrequency.write(frequency, time, pitchResponse, immediate);
    this.subFrequency.write(frequency * 0.5, time, pitchResponse, immediate);

    const pulseDepth = 0.16 - 0.1 * rpmNorm;
    this.pulseRate.write(rpm / 120, time, 0.06, immediate);
    this.pulseDepth.write(pulseDepth, time, 0.1, immediate);
    this.pulseLevel.write(1 - pulseDepth, time, 0.1, immediate);

    let tone = clamp(rpmNorm * 0.55 + load * 0.45, 0, 1);
    if (dipping) tone *= 0.5;
    if (braking) tone *= 0.55;
    this.cutoff.write(ENGINE_CUTOFF_MIN * Math.pow(ENGINE_CUTOFF_MAX / ENGINE_CUTOFF_MIN, tone), time, 0.07, immediate);
    this.resonance.write(1 + 1.8 * load, time, 0.1, immediate);
    this.drive.write(0.85 + load, time, 0.08, immediate);

    let level = (0.5 + 0.4 * load) * (0.88 + 0.12 * rpmNorm);
    if (dipping) level *= 0.6;
    if (braking) level *= 0.8;
    this.engineLevel.write(level, time, dipping ? 0.04 : 0.09, immediate);

    const ratioSquared = ratio * ratio;
    this.hissLevel.write(HISS_LEVEL * ratioSquared, time, 0.12, immediate);
    this.hissTone.write(4200 + 2400 * ratio, time, 0.12, immediate);
    this.windLevel.write(WIND_LEVEL * ratioSquared, time, 0.12, immediate);
    this.windTone.write(240 + 760 * ratio, time, 0.12, immediate);
    this.brakeLevel.write(braking ? BRAKE_WHOOSH_LEVEL * ratio : 0, time, 0.1, immediate);
    this.brakeTone.write(650 + 1100 * ratio, time, 0.1, immediate);
  }

  duck(time) {
    const gain = this.duckGain.gain;
    rampParam(gain, CRASH_DUCK_LEVEL, time, 0.03);
    gain.setTargetAtTime(1, time + CRASH_DUCK_HOLD, 0.3);
  }

  dispose() {
    for (const source of this.sources) {
      try {
        if (this.started) source.stop();
      } catch {}
    }
    disconnectAll(this.nodes);
    this.nodes.length = 0;
    this.sources.length = 0;
  }
}

export class SoundEngine {
  #context = null;
  #ready = false;
  #failed = false;
  #muted = false;
  #engineRequested = false;
  #engineAudible = false;
  #wantsRunning = false;
  #resumeRequestedAt = -Infinity;
  #activeVoices = 0;
  #graphNodes = [];
  #master = null;
  #engineBus = null;
  #ambienceBus = null;
  #sfxBus = null;
  #crashInput = null;
  #noiseBuffer = null;
  #engineCurve = null;
  #crashCurve = null;
  #layer = null;
  #model = new EngineModel();
  #speedRatio = 0;
  #braking = false;

  init() {
    if (this.#failed) return false;
    if (this.#context) {
      this.resume();
      return this.#ready;
    }
    try {
      const AudioContextClass =
        typeof window !== 'undefined' && window ? window.AudioContext || window.webkitAudioContext : undefined;
      if (!AudioContextClass) {
        this.#failed = true;
        return false;
      }
      this.#context = createAudioContext(AudioContextClass);
      this.#buildGraph();
      this.resume();
      if (this.#engineRequested) this.startEngine();
      return true;
    } catch {
      this.#disable();
      return false;
    }
  }

  resume() {
    const context = this.#context;
    if (!context) return;
    try {
      if (context.state === 'closed') return;
      this.#wantsRunning = true;
      this.#resumeRequestedAt = clockSeconds();
      if (typeof context.resume === 'function') swallow(context.resume());
    } catch {}
  }

  suspend() {
    const context = this.#context;
    if (!context) return;
    try {
      this.#wantsRunning = false;
      if (context.state === 'closed') return;
      if (typeof context.suspend === 'function') swallow(context.suspend());
    } catch {}
  }

  startEngine() {
    this.#engineRequested = true;
    if (!this.#ready) return;
    try {
      this.#startEngineNow();
    } catch {
      this.#engineAudible = false;
    }
  }

  stopEngine() {
    this.#engineRequested = false;
    if (!this.#ready) return;
    try {
      const time = this.#context.currentTime;
      rampParam(this.#engineBus.gain, 0, time, ENGINE_FADE_OUT_SECONDS);
      rampParam(this.#ambienceBus.gain, 0, time, ENGINE_FADE_OUT_SECONDS);
      this.#engineAudible = false;
    } catch {
      this.#engineAudible = false;
    }
  }

  updateEngine(speedRatio, isBraking) {
    const ratio = Number.isFinite(speedRatio) ? clamp(speedRatio, 0, 1) : 0;
    const braking = Boolean(isBraking);
    this.#speedRatio = ratio;
    this.#braking = braking;
    if (!this.#layer) return;
    try {
      this.#model.update(ratio, braking, clockSeconds());
      if (this.#isRunning()) this.#layer.apply(this.#model, this.#context.currentTime, false);
    } catch {}
  }

  playNearMiss(combo) {
    if (!this.#canPlayOneShot(false)) return;
    const nodes = [];
    const sources = [];
    try {
      const context = this.#context;
      const time = context.currentTime + SCHEDULE_LEAD;
      const level = clamp(Math.round(Number(combo)) || 1, 1, NEAR_MISS.MAX_COMBO);
      this.#scheduleWhoosh(context, time, nodes, sources);
      this.#scheduleChime(context, time + CHIME_DELAY, level, nodes, sources);
      this.#trackVoice(nodes, sources);
    } catch {
      abortVoice(nodes, sources);
    }
  }

  playCrash() {
    if (!this.#canPlayOneShot(true)) return;
    const nodes = [];
    const sources = [];
    try {
      const context = this.#context;
      const time = context.currentTime + SCHEDULE_LEAD;
      this.#scheduleThump(context, time, nodes, sources);
      this.#scheduleDebris(context, time, nodes, sources);
      for (let index = 0; index < CRASH_CLANK_COUNT; index += 1) {
        this.#scheduleClank(context, time + 0.012 + index * 0.075 + Math.random() * 0.05, index, nodes, sources);
      }
      this.#trackVoice(nodes, sources);
      if (this.#layer) this.#layer.duck(context.currentTime);
    } catch {
      abortVoice(nodes, sources);
    }
  }

  playClick() {
    if (!this.#canPlayOneShot(false)) return;
    const nodes = [];
    const sources = [];
    try {
      const context = this.#context;
      const time = context.currentTime + SCHEDULE_LEAD;
      const blip = makeOscillator(context, nodes, sources, 'triangle', 1900);
      sweep(blip.frequency, time, 1900, 1200, 0.02);
      const blipLevel = makeGain(context, nodes, 0);
      envelope(blipLevel.gain, time, 0.085, 0.0015, 0.026);
      blip.connect(blipLevel);
      blipLevel.connect(this.#sfxBus);
      blip.start(time);
      blip.stop(time + 0.03);

      const tick = makeNoise(context, nodes, sources, this.#noiseBuffer);
      const tickFilter = makeFilter(context, nodes, 'highpass', 3600, 0.7);
      const tickLevel = makeGain(context, nodes, 0);
      envelope(tickLevel.gain, time, 0.03, 0.001, 0.012);
      tick.connect(tickFilter);
      tickFilter.connect(tickLevel);
      tickLevel.connect(this.#sfxBus);
      tick.start(time, randomNoiseOffset(this.#noiseBuffer));
      tick.stop(time + 0.015);

      this.#trackVoice(nodes, sources);
    } catch {
      abortVoice(nodes, sources);
    }
  }

  setMuted(muted) {
    this.#muted = Boolean(muted);
    if (!this.#ready) return;
    try {
      rampParam(this.#master.gain, this.#muted ? 0 : MASTER_LEVEL, this.#context.currentTime, MUTE_RAMP_SECONDS);
    } catch {
      try {
        setParam(this.#master.gain, this.#muted ? 0 : MASTER_LEVEL);
      } catch {}
    }
  }

  isMuted() {
    return this.#muted;
  }

  #buildGraph() {
    const context = this.#context;
    const nodes = this.#graphNodes;

    const master = makeGain(context, nodes, this.#muted ? 0 : MASTER_LEVEL);
    const compressor = context.createDynamicsCompressor();
    nodes.push(compressor);
    setParam(compressor.threshold, -16);
    setParam(compressor.knee, 20);
    setParam(compressor.ratio, 3);
    setParam(compressor.attack, 0.005);
    setParam(compressor.release, 0.25);
    master.connect(compressor);
    compressor.connect(context.destination);

    const engineBus = makeGain(context, nodes, 0);
    const ambienceBus = makeGain(context, nodes, 0);
    const sfxBus = makeGain(context, nodes, SFX_BUS_LEVEL);
    engineBus.connect(master);
    ambienceBus.connect(master);
    sfxBus.connect(master);

    this.#engineCurve = createSaturationCurve(ENGINE_SATURATION_DRIVE, 0);
    this.#crashCurve = createSaturationCurve(CRASH_SATURATION_DRIVE, CRASH_SATURATION_ASYMMETRY);
    this.#noiseBuffer = createNoiseBuffer(context);

    const crashInput = makeGain(context, nodes, 0.8);
    const crashShaper = context.createWaveShaper();
    nodes.push(crashShaper);
    crashShaper.curve = this.#crashCurve;
    crashShaper.oversample = '2x';
    const crashHighpass = makeFilter(context, nodes, 'highpass', 30, 0.7);
    const crashOutput = makeGain(context, nodes, 0.55);
    crashInput.connect(crashShaper);
    crashShaper.connect(crashHighpass);
    crashHighpass.connect(crashOutput);
    crashOutput.connect(sfxBus);

    this.#master = master;
    this.#engineBus = engineBus;
    this.#ambienceBus = ambienceBus;
    this.#sfxBus = sfxBus;
    this.#crashInput = crashInput;
    this.#ready = true;
  }

  #startEngineNow() {
    const context = this.#context;
    const freshLayer = !this.#layer;
    if (freshLayer) {
      this.#layer = new ContinuousLayer(context, this.#engineBus, this.#ambienceBus, this.#noiseBuffer, this.#engineCurve);
    }
    if (freshLayer || !this.#engineAudible) {
      this.#model.reset();
      this.#model.update(this.#speedRatio, this.#braking, clockSeconds());
      this.#layer.apply(this.#model, context.currentTime, freshLayer);
    }
    if (freshLayer) this.#layer.start(context.currentTime + SCHEDULE_LEAD);
    const time = context.currentTime;
    rampParam(this.#engineBus.gain, ENGINE_BUS_LEVEL, time, ENGINE_FADE_IN_SECONDS);
    rampParam(this.#ambienceBus.gain, AMBIENCE_BUS_LEVEL, time, ENGINE_FADE_IN_SECONDS);
    this.#engineAudible = true;
  }

  #isRunning() {
    const state = this.#context.state;
    return state === 'running' || state === undefined;
  }

  #canPlayOneShot(bypassVoiceCap) {
    if (!this.#ready || this.#muted) return false;
    if (!bypassVoiceCap && this.#activeVoices >= MAX_ONE_SHOT_VOICES) return false;
    if (this.#isRunning()) return true;
    return (
      this.#context.state === 'suspended' &&
      this.#wantsRunning &&
      clockSeconds() - this.#resumeRequestedAt < RESUME_GRACE_SECONDS
    );
  }

  #trackVoice(nodes, sources) {
    this.#activeVoices += 1;
    let pending = sources.length;
    const release = () => {
      pending -= 1;
      if (pending > 0) return;
      for (const source of sources) source.onended = null;
      disconnectAll(nodes);
      this.#activeVoices = Math.max(0, this.#activeVoices - 1);
    };
    for (const source of sources) source.onended = release;
  }

  #scheduleWhoosh(context, time, nodes, sources) {
    const source = makeNoise(context, nodes, sources, this.#noiseBuffer);
    const rate = 1.22 + Math.random() * 0.16;
    sweep(source.playbackRate, time, rate, rate * 0.58, WHOOSH_DURATION);
    const band = makeFilter(context, nodes, 'bandpass', WHOOSH_START_HZ, 1.15);
    sweep(band.frequency, time, WHOOSH_START_HZ, WHOOSH_END_HZ, WHOOSH_DURATION * 0.92);
    const level = makeGain(context, nodes, 0);
    envelope(level.gain, time, WHOOSH_PEAK, 0.1, WHOOSH_DURATION);
    source.connect(band);
    band.connect(level);
    if (typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      nodes.push(panner);
      const side = Math.random() < 0.5 ? -1 : 1;
      panner.pan.setValueAtTime(-WHOOSH_PAN_WIDTH * side, time);
      panner.pan.linearRampToValueAtTime(WHOOSH_PAN_WIDTH * side, time + WHOOSH_DURATION);
      level.connect(panner);
      panner.connect(this.#sfxBus);
    } else {
      level.connect(this.#sfxBus);
    }
    source.start(time, randomNoiseOffset(this.#noiseBuffer));
    source.stop(time + WHOOSH_DURATION + 0.04);
  }

  #scheduleChime(context, time, level, nodes, sources) {
    const step = PENTATONIC_STEPS[clamp(level - 1, 0, PENTATONIC_STEPS.length - 1)];
    const root = NEAR_MISS_ROOT_HZ * Math.pow(2, step / 12);
    const brightness = 0.9 + 0.1 * (level / NEAR_MISS.MAX_COMBO);
    for (const partial of CHIME_PARTIALS) {
      const oscillator = makeOscillator(context, nodes, sources, partial.type, root * partial.ratio);
      const amplitude = makeGain(context, nodes, 0);
      envelope(amplitude.gain, time, partial.level * brightness, 0.005, partial.decay);
      oscillator.connect(amplitude);
      amplitude.connect(this.#sfxBus);
      oscillator.start(time);
      oscillator.stop(time + partial.decay + 0.03);
    }
  }

  #scheduleThump(context, time, nodes, sources) {
    const thump = makeOscillator(context, nodes, sources, 'sine', 120);
    sweep(thump.frequency, time, 120, 38, 0.34);
    const level = makeGain(context, nodes, 0);
    envelope(level.gain, time, 0.95, 0.006, 0.62);
    thump.connect(level);
    level.connect(this.#crashInput);
    thump.start(time);
    thump.stop(time + 0.66);
  }

  #scheduleDebris(context, time, nodes, sources) {
    const debris = makeNoise(context, nodes, sources, this.#noiseBuffer);
    debris.playbackRate.value = 0.85;
    const filter = makeFilter(context, nodes, 'lowpass', 7000, 0.9);
    sweep(filter.frequency, time, 7000, 160, 0.95);
    const level = makeGain(context, nodes, 0);
    level.gain.setValueAtTime(SILENCE, time);
    level.gain.exponentialRampToValueAtTime(0.75, time + 0.004);
    level.gain.exponentialRampToValueAtTime(0.22, time + 0.2);
    level.gain.exponentialRampToValueAtTime(SILENCE, time + 1.15);
    debris.connect(filter);
    filter.connect(level);
    level.connect(this.#crashInput);
    debris.start(time, randomNoiseOffset(this.#noiseBuffer));
    debris.stop(time + 1.2);
  }

  #scheduleClank(context, time, index, nodes, sources) {
    const pitch = 380 + Math.random() * 900;
    const decay = 0.12 + Math.random() * 0.14;
    const carrier = makeOscillator(context, nodes, sources, 'square', pitch);
    const modulator = makeOscillator(context, nodes, sources, 'sine', pitch * 1.41);
    const modulationDepth = makeGain(context, nodes, pitch * 1.6);
    const ring = makeFilter(context, nodes, 'bandpass', pitch * 2.2, 7);
    const level = makeGain(context, nodes, 0);
    envelope(level.gain, time, 0.26 * (1 - index * 0.16), 0.002, decay);
    modulator.connect(modulationDepth);
    modulationDepth.connect(carrier.frequency);
    carrier.connect(ring);
    ring.connect(level);
    level.connect(this.#crashInput);
    carrier.start(time);
    modulator.start(time);
    carrier.stop(time + decay + 0.02);
    modulator.stop(time + decay + 0.02);
  }

  #disable() {
    this.#ready = false;
    this.#failed = true;
    this.#engineAudible = false;
    if (this.#layer) {
      this.#layer.dispose();
      this.#layer = null;
    }
    disconnectAll(this.#graphNodes);
    this.#graphNodes = [];
    const context = this.#context;
    this.#context = null;
    if (context && typeof context.close === 'function') {
      try {
        swallow(context.close());
      } catch {}
    }
  }
}
