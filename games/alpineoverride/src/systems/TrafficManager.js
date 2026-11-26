import { TrafficVehicle } from '../entities/TrafficVehicle.js';
import {
  LANE_X,
  ONCOMING_LANES,
  SAME_DIRECTION_LANES,
  PLAYER,
  QUALITY_CONFIG,
  SCORE,
  TRAFFIC,
  VEHICLE_CLASSES,
  VEHICLE_TYPES,
  clamp,
  getRoadCurve,
  isOncomingLane,
  lerp,
} from '../config/constants.js';

const LANE_COUNT = LANE_X.length;
const LANE_BIT_COUNT = Object.freeze([0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]);

const FAIRNESS_WINDOW = 1.2;
const PREVIOUS_WINDOW = 1.5;
const LOW_DIFFICULTY_MAX_BLOCKED = 2;
const HIGH_DIFFICULTY_MAX_BLOCKED = 3;
const BLOCKED_LANE_DIFFICULTY_SPLIT = 0.5;
const CLOSING_SPEED_GUARD = 0.5;
const ARRIVAL_HORIZON = 26;
const HYPOTHESIS_SPEED_BAND = 20;
const HYPOTHESIS_TIME_SLACK = 0.15;
const HYPOTHESIS_MIN_STEP = 0.05;
const HYPOTHESIS_MAX_STEP = 4;
const HYPOTHESIS_MAX_SAMPLES = 480;

const SPAWN_JITTER = 40;
const DESPAWN_AHEAD_MARGIN = 160;
const TELEPORT_DISTANCE = 240;
const PREFILL_RATIO = 0.4;
const PREFILL_CLEAR_DISTANCE = 80;
const PREFILL_ATTEMPTS_PER_VEHICLE = 12;
const INTERVAL_SPEED_FLOOR = 15;
const INTERVAL_SCALE_MIN = 0.45;
const INTERVAL_SCALE_MAX = 1.6;
const INTERVAL_JITTER = 0.2;
const RETRY_INTERVAL_RATIO = 0.35;
const ONCOMING_SHARE_START = 0.35;
const ONCOMING_SHARE_END = 0.55;
const TRUCK_EARLY_WEIGHT = 0.6;
const COEXIST_TIME_CAP = 60;

const FOLLOW_GAIN = 0.6;
const FOLLOW_BRAKE = 12;
const FOLLOW_ACCELERATION = 3;
const STOP_GAP = 2.5;
const ABREAST_CLEARANCE = 14;
const ABREAST_TRAIL_YIELD = 3;
const ABREAST_LEAD_BOOST = 1.5;
const PLAYER_FOLLOW_GAP = 10;
const PLAYER_LANE_MARGIN = 0.8;
const MAX_STEP_DELTA = 0.1;
const DEFAULT_TIER = 'MEDIUM';

function sortLaneFrontFirst(bucket, oncoming) {
  for (let index = 1; index < bucket.length; index += 1) {
    const vehicle = bucket[index];
    const key = oncoming ? -vehicle.z : vehicle.z;
    let cursor = index - 1;
    while (cursor >= 0 && (oncoming ? -bucket[cursor].z : bucket[cursor].z) > key) {
      bucket[cursor + 1] = bucket[cursor];
      cursor -= 1;
    }
    bucket[cursor + 1] = vehicle;
  }
}

function enforceSpacing(vehicle, leader) {
  const minimum = (leader.length + vehicle.length) * 0.5 + STOP_GAP;
  if (vehicle.isOncoming) {
    if (leader.z - vehicle.z < minimum) {
      vehicle.z = leader.z - minimum;
      if (vehicle.speed > leader.speed) vehicle.speed = leader.speed;
    }
  } else if (vehicle.z - leader.z < minimum) {
    vehicle.z = leader.z + minimum;
    if (vehicle.speed > leader.speed) vehicle.speed = leader.speed;
  }
}

export class TrafficManager {
  constructor(scene, random = Math.random) {
    this.scene = scene ?? null;
    this.random = typeof random === 'function' ? random : Math.random;
    this.pools = {};
    this.vehicles = [];
    this.activeVehicles = [];
    this.laneBuckets = [];
    for (let lane = 0; lane < LANE_COUNT; lane += 1) this.laneBuckets.push([]);
    this.laneOrder = [...SAME_DIRECTION_LANES, ...ONCOMING_LANES];

    this.playerZ = 0;
    this.playerSpeed = 0;
    this.playerLocalX = NaN;
    this.difficulty = 0;
    this.maxBlockedLanes = LOW_DIFFICULTY_MAX_BLOCKED;
    this.spawnTimer = 0;
    this.needsPrefill = true;
    this.lastPlayerZ = NaN;
    this.qualityTier = DEFAULT_TIER;

    let nextId = 1;
    for (const type of VEHICLE_TYPES) {
      const size = TRAFFIC.POOL_SIZE[type] ?? 0;
      const pool = [];
      for (let index = 0; index < size; index += 1) {
        const vehicle = new TrafficVehicle(type, nextId);
        nextId += 1;
        pool.push(vehicle);
        this.vehicles.push(vehicle);
        if (this.scene) this.scene.add(vehicle.group);
      }
      this.pools[type] = pool;
    }
    this.poolCapacity = this.vehicles.length;

    this.setQualityTier(DEFAULT_TIER);
  }

  getActiveVehicles() {
    return this.activeVehicles;
  }

  setQualityTier(tier) {
    const config = QUALITY_CONFIG[tier] ?? QUALITY_CONFIG[DEFAULT_TIER];
    this.qualityTier = config.id;
    for (let index = 0; index < this.vehicles.length; index += 1) {
      const vehicle = this.vehicles[index];
      vehicle.setLightFx(config.lightReflections);
      vehicle.setShadows(config.shadows);
    }
  }

  notifyCrash(vehicle) {
    if (!vehicle || !vehicle.active) return;
    if (this.vehicles.indexOf(vehicle) === -1) return;
    vehicle.freeze();
  }

  notifyImpact(vehicle) {
    if (!vehicle || !vehicle.active) return;
    if (this.vehicles.indexOf(vehicle) === -1) return;
    vehicle.markImpact();
  }

  reset() {
    this.deactivateAll();
    this.spawnTimer = 0;
    this.needsPrefill = true;
    this.lastPlayerZ = NaN;
  }

  deactivateAll() {
    for (let index = 0; index < this.vehicles.length; index += 1) {
      const vehicle = this.vehicles[index];
      if (vehicle.active) vehicle.deactivate();
    }
    this.activeVehicles.length = 0;
  }

  update(deltaTime, playerZ, playerSpeed, difficultyFactor, roadCurveFn, playerLocalX = NaN) {
    if (!Number.isFinite(playerZ)) return;
    const dt = Number.isFinite(deltaTime) ? clamp(deltaTime, 0, MAX_STEP_DELTA) : 0;
    const curveFn = typeof roadCurveFn === 'function' ? roadCurveFn : getRoadCurve;
    this.playerZ = playerZ;
    this.playerSpeed = Number.isFinite(playerSpeed) ? Math.max(0, playerSpeed) : 0;
    this.playerLocalX = Number.isFinite(playerLocalX) ? playerLocalX : NaN;
    this.difficulty = Number.isFinite(difficultyFactor) ? clamp(difficultyFactor, 0, 1) : 0;
    this.maxBlockedLanes =
      this.difficulty < BLOCKED_LANE_DIFFICULTY_SPLIT ? LOW_DIFFICULTY_MAX_BLOCKED : HIGH_DIFFICULTY_MAX_BLOCKED;

    if (Number.isFinite(this.lastPlayerZ) && Math.abs(playerZ - this.lastPlayerZ) > TELEPORT_DISTANCE) {
      this.deactivateAll();
      this.needsPrefill = true;
    }
    this.lastPlayerZ = playerZ;

    if (this.needsPrefill) {
      this.needsPrefill = false;
      this.prefill(curveFn);
      this.spawnTimer = this.computeSpawnInterval() * this.random();
    }

    this.simulate(dt, curveFn);
    this.recycle();

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const interval = this.computeSpawnInterval();
      let spawned = false;
      if (this.activeVehicles.length < this.computeMaxActive()) {
        spawned = this.trySpawn(playerZ - TRAFFIC.SPAWN_DISTANCE_AHEAD - this.random() * SPAWN_JITTER, curveFn);
      }
      this.spawnTimer = spawned
        ? interval * (1 + (this.random() * 2 - 1) * INTERVAL_JITTER)
        : interval * RETRY_INTERVAL_RATIO;
    }
  }

  computeSpawnInterval() {
    const base = lerp(TRAFFIC.BASE_SPAWN_INTERVAL, TRAFFIC.MIN_SPAWN_INTERVAL, this.difficulty);
    const speedScale = clamp(
      SCORE.REFERENCE_SPEED / Math.max(this.playerSpeed, INTERVAL_SPEED_FLOOR),
      INTERVAL_SCALE_MIN,
      INTERVAL_SCALE_MAX,
    );
    return base * speedScale;
  }

  computeMaxActive() {
    return Math.min(
      this.poolCapacity,
      Math.round(lerp(TRAFFIC.MAX_ACTIVE_BASE, TRAFFIC.MAX_ACTIVE_PEAK, this.difficulty)),
    );
  }

  simulate(dt, curveFn) {
    const buckets = this.laneBuckets;
    for (let lane = 0; lane < LANE_COUNT; lane += 1) buckets[lane].length = 0;
    const active = this.activeVehicles;
    for (let index = 0; index < active.length; index += 1) {
      const vehicle = active[index];
      vehicle.abreastCap = Infinity;
      vehicle.abreastBoost = 0;
      buckets[vehicle.lane].push(vehicle);
    }
    this.separateAbreastPairs();
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const bucket = buckets[lane];
      sortLaneFrontFirst(bucket, isOncomingLane(lane));
      for (let index = 0; index < bucket.length; index += 1) {
        const vehicle = bucket[index];
        const leader = index > 0 ? bucket[index - 1] : null;
        this.applyFollowing(vehicle, leader, dt);
        vehicle.advance(dt);
        if (leader !== null) enforceSpacing(vehicle, leader);
        this.keepClearOfPlayer(vehicle);
        vehicle.syncTransform(curveFn);
      }
    }
  }

  separateAbreastPairs() {
    const active = this.activeVehicles;
    for (let first = 0; first < active.length; first += 1) {
      const a = active[first];
      for (let second = first + 1; second < active.length; second += 1) {
        const b = active[second];
        if (a.lane === b.lane || a.isOncoming !== b.isOncoming || a.frozen || b.frozen) continue;
        if (Math.abs(a.z - b.z) >= (a.length + b.length) * 0.5 + ABREAST_CLEARANCE) continue;
        const aLeads = a.isOncoming ? a.z > b.z : a.z < b.z;
        const lead = aLeads ? a : b;
        const trail = aLeads ? b : a;
        lead.abreastBoost = ABREAST_LEAD_BOOST;
        const cap = Math.max(0, lead.speed - ABREAST_TRAIL_YIELD);
        if (cap < trail.abreastCap) trail.abreastCap = cap;
      }
    }
  }

  isBehindPlayerInLane(vehicle) {
    if (vehicle.isOncoming || !Number.isFinite(this.playerLocalX) || vehicle.z <= this.playerZ) return false;
    return Math.abs(vehicle.localX - this.playerLocalX) < (vehicle.width + PLAYER.WIDTH) * 0.5 + PLAYER_LANE_MARGIN;
  }

  keepClearOfPlayer(vehicle) {
    if (!this.isBehindPlayerInLane(vehicle)) return;
    const minimum = (vehicle.length + PLAYER.LENGTH) * 0.5 + STOP_GAP;
    if (vehicle.z - this.playerZ < minimum) {
      vehicle.z = this.playerZ + minimum;
      if (vehicle.speed > this.playerSpeed) vehicle.speed = this.playerSpeed;
    }
  }

  applyFollowing(vehicle, leader, dt) {
    if (vehicle.frozen) return;
    let desired = vehicle.cruiseSpeed;
    let isConstrained = false;
    if (leader !== null) {
      const gap = Math.abs(leader.z - vehicle.z) - (leader.length + vehicle.length) * 0.5;
      const followSpeed = Math.max(0, leader.speed + FOLLOW_GAIN * (gap - TRAFFIC.MIN_SAME_LANE_GAP));
      if (followSpeed < desired) {
        desired = followSpeed;
        isConstrained = true;
      }
    }
    if (this.isBehindPlayerInLane(vehicle)) {
      const gap = vehicle.z - this.playerZ - (vehicle.length + PLAYER.LENGTH) * 0.5;
      const followSpeed = Math.max(0, this.playerSpeed + FOLLOW_GAIN * (gap - PLAYER_FOLLOW_GAP));
      if (followSpeed < desired) {
        desired = followSpeed;
        isConstrained = true;
      }
    }
    if (!isConstrained && vehicle.abreastCap === Infinity) desired += vehicle.abreastBoost;
    if (vehicle.abreastCap < desired) desired = vehicle.abreastCap;
    if (desired < vehicle.speed) {
      vehicle.speed = Math.max(desired, vehicle.speed - FOLLOW_BRAKE * dt);
    } else {
      vehicle.speed = Math.min(desired, vehicle.speed + FOLLOW_ACCELERATION * dt);
    }
  }

  recycle() {
    const behindLimit = this.playerZ + TRAFFIC.DESPAWN_DISTANCE_BEHIND;
    const aheadLimit = this.playerZ - (TRAFFIC.SPAWN_DISTANCE_AHEAD + DESPAWN_AHEAD_MARGIN);
    const active = this.activeVehicles;
    let write = 0;
    for (let read = 0; read < active.length; read += 1) {
      const vehicle = active[read];
      if (!(vehicle.z <= behindLimit && vehicle.z >= aheadLimit)) {
        vehicle.deactivate();
      } else {
        active[write] = vehicle;
        write += 1;
      }
    }
    active.length = write;
  }

  prefill(curveFn) {
    const target = Math.round(this.computeMaxActive() * PREFILL_RATIO);
    const attempts = target * PREFILL_ATTEMPTS_PER_VEHICLE;
    const farZ = this.playerZ - TRAFFIC.SPAWN_DISTANCE_AHEAD;
    for (let attempt = 0; attempt < attempts && this.activeVehicles.length < target; attempt += 1) {
      const type = this.pickType();
      if (type === null) return;
      const vehicle = this.acquire(type);
      const nearZ = this.playerZ - PREFILL_CLEAR_DISTANCE - vehicle.length * 0.5;
      if (nearZ <= farZ) continue;
      this.trySpawnVehicle(vehicle, lerp(nearZ, farZ, this.random()), curveFn);
    }
  }

  trySpawn(z, curveFn) {
    const type = this.pickType();
    if (type === null) return false;
    return this.trySpawnVehicle(this.acquire(type), z, curveFn);
  }

  trySpawnVehicle(vehicle, z, curveFn) {
    if (vehicle === null || vehicle.active) return false;
    this.shuffleLaneOrder();
    for (let index = 0; index < LANE_COUNT; index += 1) {
      const lane = this.laneOrder[index];
      const speed = this.resolveSpawnSpeed(vehicle, lane, z);
      if (this.isSpawnSafe(lane, z, vehicle.length, speed)) {
        this.spawnVehicle(vehicle, lane, z, speed, curveFn);
        return true;
      }
    }
    return false;
  }

  spawnVehicle(vehicle, lane, z, speed, curveFn) {
    const spec = VEHICLE_CLASSES[vehicle.type];
    const paint = this.pickFrom(spec.colors);
    const trailer = spec.trailerColors ? this.pickFrom(spec.trailerColors) : undefined;
    vehicle.activate(lane, z, speed, paint, trailer);
    vehicle.syncTransform(curveFn);
    this.activeVehicles.push(vehicle);
  }

  pickFrom(list) {
    return list[Math.min(list.length - 1, Math.floor(this.random() * list.length))];
  }

  typeWeight(type) {
    const weight = VEHICLE_CLASSES[type].spawnWeight;
    return type === 'TRUCK' ? weight * lerp(TRUCK_EARLY_WEIGHT, 1, this.difficulty) : weight;
  }

  pickType() {
    let total = 0;
    for (let index = 0; index < VEHICLE_TYPES.length; index += 1) {
      const type = VEHICLE_TYPES[index];
      if (this.acquire(type) !== null) total += this.typeWeight(type);
    }
    if (total <= 0) return null;
    let roll = this.random() * total;
    let fallback = null;
    for (let index = 0; index < VEHICLE_TYPES.length; index += 1) {
      const type = VEHICLE_TYPES[index];
      if (this.acquire(type) === null) continue;
      fallback = type;
      roll -= this.typeWeight(type);
      if (roll <= 0) return type;
    }
    return fallback;
  }

  acquire(type) {
    const pool = this.pools[type];
    if (!pool) return null;
    for (let index = 0; index < pool.length; index += 1) {
      if (!pool[index].active) return pool[index];
    }
    return null;
  }

  shuffleLaneOrder() {
    const oncomingFirst = this.random() < lerp(ONCOMING_SHARE_START, ONCOMING_SHARE_END, this.difficulty);
    const primary = oncomingFirst ? ONCOMING_LANES : SAME_DIRECTION_LANES;
    const secondary = oncomingFirst ? SAME_DIRECTION_LANES : ONCOMING_LANES;
    const primaryFlip = this.random() < 0.5 ? 1 : 0;
    const secondaryFlip = this.random() < 0.5 ? 1 : 0;
    this.laneOrder[0] = primary[primaryFlip];
    this.laneOrder[1] = primary[1 - primaryFlip];
    this.laneOrder[2] = secondary[secondaryFlip];
    this.laneOrder[3] = secondary[1 - secondaryFlip];
  }

  resolveSpawnSpeed(vehicle, lane, z) {
    const spec = VEHICLE_CLASSES[vehicle.type];
    const oncoming = isOncomingLane(lane);
    const range = oncoming ? spec.oncomingSpeed : spec.sameDirectionSpeed;
    const base = lerp(range[0], range[1], this.random());
    const travel = oncoming ? 1 : -1;
    const playerSpeed = Math.max(this.playerSpeed, PLAYER.MIN_SPEED);
    let minimum = 0;
    let maximum = Infinity;
    const active = this.activeVehicles;
    for (let index = 0; index < active.length; index += 1) {
      const other = active[index];
      if (other.lane !== lane || other.frozen) continue;
      const otherIsNearer = other.z >= z;
      const nearerZ = otherIsNearer ? other.z : z;
      const nearerSpeed = otherIsNearer ? other.speed : base;
      const closing = oncoming ? playerSpeed + nearerSpeed : playerSpeed - nearerSpeed;
      const coexist =
        closing > CLOSING_SPEED_GUARD
          ? clamp((this.playerZ + TRAFFIC.DESPAWN_DISTANCE_BEHIND - nearerZ) / closing, 1e-3, COEXIST_TIME_CAP)
          : COEXIST_TIME_CAP;
      const spare =
        Math.abs(other.z - z) - (other.length + vehicle.length) * 0.5 - TRAFFIC.MIN_SAME_LANE_GAP;
      const slack = Math.max(0, spare) / coexist;
      if ((other.z - z) * travel > 0) {
        if (other.speed + slack < maximum) maximum = other.speed + slack;
      } else if (other.speed - slack > minimum) {
        minimum = other.speed - slack;
      }
    }
    if (minimum > maximum) return maximum;
    return clamp(base, minimum, maximum);
  }

  isSpawnSafe(lane, z, length, speed) {
    const active = this.activeVehicles;
    for (let index = 0; index < active.length; index += 1) {
      const other = active[index];
      const separation = Math.abs(other.z - z) - (other.length + length) * 0.5;
      if (other.lane === lane && separation < TRAFFIC.MIN_SAME_LANE_GAP) return false;
      if (other.lane !== lane && other.isOncoming === isOncomingLane(lane) && separation < ABREAST_CLEARANCE) {
        return false;
      }
    }
    return this.isTimingFair(lane, z, length, speed);
  }

  isTimingFair(lane, z, length, speed) {
    const reference = clamp(this.playerSpeed, PLAYER.MIN_SPEED, PLAYER.MAX_SPEED_CAP);
    const low = Math.max(PLAYER.MIN_SPEED, reference - HYPOTHESIS_SPEED_BAND);
    const high = Math.min(PLAYER.MAX_SPEED_CAP, reference + HYPOTHESIS_SPEED_BAND);
    let hypothesis = low;
    for (let sample = 0; sample < HYPOTHESIS_MAX_SAMPLES; sample += 1) {
      const sensitivity = this.evaluateHypothesis(lane, z, length, speed, hypothesis);
      if (sensitivity < 0) return false;
      if (hypothesis >= high) return true;
      const step = clamp(HYPOTHESIS_TIME_SLACK / Math.max(sensitivity, 1e-6), HYPOTHESIS_MIN_STEP, HYPOTHESIS_MAX_STEP);
      hypothesis = Math.min(high, hypothesis + step);
    }
    return false;
  }

  evaluateHypothesis(lane, z, length, speed, playerSpeed) {
    const closing = isOncomingLane(lane) ? playerSpeed + speed : playerSpeed - speed;
    if (closing <= CLOSING_SPEED_GUARD) return 0;
    const arrival = (this.playerZ - z) / closing;
    if (arrival > ARRIVAL_HORIZON) return ARRIVAL_HORIZON / closing;
    const pad = (length + PLAYER.LENGTH) * 0.5 / closing;
    const windowStart = arrival - FAIRNESS_WINDOW - pad;
    const windowEnd = arrival + FAIRNESS_WINDOW + pad;
    const previousStart = windowStart - PREVIOUS_WINDOW;
    let sensitivity = arrival / closing;
    let blocked = 1 << lane;
    let previous = 0;

    const active = this.activeVehicles;
    for (let index = 0; index < active.length; index += 1) {
      const other = active[index];
      const otherClosing = other.isOncoming ? playerSpeed + other.speed : playerSpeed - other.speed;
      if (otherClosing <= CLOSING_SPEED_GUARD) continue;
      const otherArrival = (this.playerZ - other.z) / otherClosing;
      const otherPad = (other.length + PLAYER.LENGTH) * 0.5 / otherClosing;
      const start = otherArrival - otherPad;
      const end = otherArrival + otherPad;
      if (end < 0 || start > ARRIVAL_HORIZON) continue;
      const otherSensitivity = otherArrival / otherClosing;
      if (otherSensitivity > sensitivity) sensitivity = otherSensitivity;
      const bit = 1 << other.lane;
      if (end >= windowStart && start <= windowEnd) blocked |= bit;
      if (end >= previousStart && start <= windowStart) previous |= bit;
    }

    const blockedCount = LANE_BIT_COUNT[blocked];
    if (blockedCount >= LANE_COUNT || blockedCount > this.maxBlockedLanes) return -1;
    if (blockedCount === LANE_COUNT - 1) {
      let freeLane = 0;
      while (freeLane < LANE_COUNT && (blocked & (1 << freeLane)) !== 0) freeLane += 1;
      if (freeLane > 0 && (previous & (1 << (freeLane - 1))) !== 0) return -1;
      if (freeLane < LANE_COUNT - 1 && (previous & (1 << (freeLane + 1))) !== 0) return -1;
    }
    return sensitivity;
  }
}
