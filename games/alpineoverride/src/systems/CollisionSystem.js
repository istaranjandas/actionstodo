import { COLLISION, NEAR_MISS } from '../config/constants.js';

const TELEPORT_LONGITUDINAL = 30;
const TELEPORT_LATERAL = 8;
const PLAYER_RESET_DISTANCE = 30;
const SWEEP_EPSILON = 1e-6;
const INITIAL_EVENT_POOL_SIZE = 16;

class VehicleTrack {
  constructor() {
    this.frame = -1;
    this.relZ = 0;
    this.dx = 0;
    this.inWindow = false;
    this.minGap = Infinity;
  }
}

class NearMissEvent {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.isOncoming = false;
    this.vehicleType = 'SEDAN';
    this.gap = 0;
    this.isUltraClose = false;
  }
}

export class CollisionSystem {
  constructor() {
    this.tracks = new Map();
    this.frame = 0;
    this.hasCrashed = false;
    this.sawPlayerCrashed = false;
    this.lastPlayerZ = NaN;

    this.eventPool = [];
    for (let i = 0; i < INITIAL_EVENT_POOL_SIZE; i += 1) {
      this.eventPool.push(new NearMissEvent());
    }

    this.nearMisses = [];
    this.result = {
      crashed: false,
      crashedVehicle: null,
      impactSide: 0,
      overlapping: false,
      nearMisses: this.nearMisses,
    };

    this.axisEnter = 0;
    this.axisExit = 0;
    this.contactTime = 0;
    this.contactIsSide = false;
  }

  check(playerBounds, activeVehicles, isIntangible = false) {
    this.frame += 1;
    const result = this.result;
    result.crashed = false;
    result.crashedVehicle = null;
    result.impactSide = 0;
    result.overlapping = false;
    if (this.nearMisses.length !== 0) this.nearMisses.length = 0;

    if (!playerBounds) return result;

    const playerZ = playerBounds.z;
    const playerX = playerBounds.localX;
    if (!Number.isFinite(playerZ) || !Number.isFinite(playerX)) return result;

    if (Number.isFinite(this.lastPlayerZ) && Math.abs(playerZ - this.lastPlayerZ) > PLAYER_RESET_DISTANCE) {
      this.beginNewRun();
    }
    this.lastPlayerZ = playerZ;

    if (playerBounds.isCrashed) {
      this.sawPlayerCrashed = true;
      return result;
    }
    if (this.sawPlayerCrashed) {
      this.sawPlayerCrashed = false;
      this.hasCrashed = false;
    }
    if (this.hasCrashed) return result;

    const vehicles = activeVehicles || [];
    const count = vehicles.length;
    const playerWidth = playerBounds.width;
    const playerLength = playerBounds.length;
    const forgiveness = COLLISION.HITBOX_FORGIVENESS;

    let crashedVehicle = null;
    let crashTime = Infinity;
    let crashIsSide = false;

    for (let i = 0; i < count; i += 1) {
      const vehicle = vehicles[i];
      if (!vehicle) continue;
      const relZ = vehicle.z - playerZ;
      const dx = vehicle.localX - playerX;
      if (!Number.isFinite(relZ) || !Number.isFinite(dx)) continue;

      const halfWidth = (playerWidth + vehicle.width) * 0.5 * forgiveness;
      const halfLength = (playerLength + vehicle.length) * 0.5 * forgiveness;
      const track = this.tracks.get(vehicle.id);

      let hit;
      if (track !== undefined && this.isHistoryValid(track, relZ, dx)) {
        hit = this.sweptContact(track.relZ, relZ, track.dx, dx, halfLength, halfWidth);
      } else {
        hit = this.staticContact(relZ, dx, halfLength, halfWidth);
      }

      if (isIntangible) {
        if (hit || this.staticContact(relZ, dx, halfLength, halfWidth)) result.overlapping = true;
      } else if (hit && this.contactTime < crashTime) {
        crashTime = this.contactTime;
        crashedVehicle = vehicle;
        crashIsSide = this.contactIsSide;
      }
    }

    const crashedThisFrame = crashedVehicle !== null;
    if (crashedThisFrame) {
      this.hasCrashed = true;
      result.crashed = true;
      result.crashedVehicle = crashedVehicle;
      result.impactSide = crashIsSide ? (crashedVehicle.localX < playerX ? -1 : 1) : 0;
    }

    const canAward =
      !crashedThisFrame &&
      !isIntangible &&
      Number.isFinite(playerBounds.speed) &&
      playerBounds.speed >= NEAR_MISS.MIN_PLAYER_SPEED;

    for (let i = 0; i < count; i += 1) {
      const vehicle = vehicles[i];
      if (!vehicle) continue;
      const relZ = vehicle.z - playerZ;
      const dx = vehicle.localX - playerX;
      if (!Number.isFinite(relZ) || !Number.isFinite(dx)) continue;

      const track = this.acquireTrack(vehicle.id);
      const historyValid = this.isHistoryValid(track, relZ, dx);

      if (vehicle.nearMissAwarded || crashedThisFrame) {
        track.inWindow = false;
        track.minGap = Infinity;
      } else {
        this.evaluateNearMiss(vehicle, track, historyValid, relZ, dx, playerWidth, playerLength, canAward);
      }

      track.relZ = relZ;
      track.dx = dx;
      track.frame = this.frame;
    }

    return result;
  }

  isHistoryValid(track, relZ, dx) {
    return (
      track.frame === this.frame - 1 &&
      Math.abs(relZ - track.relZ) <= TELEPORT_LONGITUDINAL &&
      Math.abs(dx - track.dx) <= TELEPORT_LATERAL
    );
  }

  computeAxisInterval(start, end, halfExtent) {
    const delta = end - start;
    if (delta > -SWEEP_EPSILON && delta < SWEEP_EPSILON) {
      if (Math.abs(end) < halfExtent) {
        this.axisEnter = -Infinity;
        this.axisExit = Infinity;
        return true;
      }
      return false;
    }
    const first = (-halfExtent - start) / delta;
    const second = (halfExtent - start) / delta;
    if (first < second) {
      this.axisEnter = first;
      this.axisExit = second;
    } else {
      this.axisEnter = second;
      this.axisExit = first;
    }
    return true;
  }

  sweptContact(prevRelZ, relZ, prevDx, dx, halfLength, halfWidth) {
    if (!this.computeAxisInterval(prevRelZ, relZ, halfLength)) return false;
    const longitudinalEnter = this.axisEnter;
    const longitudinalExit = this.axisExit;
    if (!this.computeAxisInterval(prevDx, dx, halfWidth)) return false;
    const lateralEnter = this.axisEnter;
    const lateralExit = this.axisExit;

    let start = longitudinalEnter > lateralEnter ? longitudinalEnter : lateralEnter;
    if (start < 0) start = 0;
    let end = longitudinalExit < lateralExit ? longitudinalExit : lateralExit;
    if (end > 1) end = 1;
    if (!(start < end)) return false;

    const contactRelZ = prevRelZ + (relZ - prevRelZ) * start;
    const contactDx = prevDx + (dx - prevDx) * start;
    this.contactTime = start;
    this.contactIsSide = halfWidth - Math.abs(contactDx) < halfLength - Math.abs(contactRelZ);
    return true;
  }

  staticContact(relZ, dx, halfLength, halfWidth) {
    const longitudinalPenetration = halfLength - Math.abs(relZ);
    const lateralPenetration = halfWidth - Math.abs(dx);
    if (longitudinalPenetration <= 0 || lateralPenetration <= 0) return false;
    this.contactTime = 1;
    this.contactIsSide = lateralPenetration < longitudinalPenetration;
    return true;
  }

  evaluateNearMiss(vehicle, track, historyValid, relZ, dx, playerWidth, playerLength, canAward) {
    const lateralGap = Math.max(0, Math.abs(dx) - (playerWidth + vehicle.width) * 0.5);
    const windowHalf = (playerLength + vehicle.length) * 0.5 + NEAR_MISS.LONGITUDINAL_THRESHOLD;
    const inside = relZ >= -windowHalf && relZ <= windowHalf;

    if (!historyValid) {
      track.inWindow = inside;
      track.minGap = inside ? lateralGap : Infinity;
      return;
    }

    if (inside) {
      if (!track.inWindow) {
        track.inWindow = true;
        track.minGap = lateralGap;
      } else if (lateralGap < track.minGap) {
        track.minGap = lateralGap;
      }
      return;
    }

    if (relZ > windowHalf) {
      let candidateGap = -1;
      if (track.inWindow) {
        candidateGap = track.minGap;
      } else if (track.relZ < -windowHalf) {
        candidateGap = lateralGap;
      }
      if (canAward && candidateGap >= 0 && candidateGap <= NEAR_MISS.LATERAL_THRESHOLD) {
        this.awardNearMiss(vehicle, candidateGap);
      }
    }

    track.inWindow = false;
    track.minGap = Infinity;
  }

  awardNearMiss(vehicle, gap) {
    const index = this.nearMisses.length;
    if (index >= this.eventPool.length) this.eventPool.push(new NearMissEvent());
    const event = this.eventPool[index];
    event.x = vehicle.worldX;
    event.y = vehicle.y + 1;
    event.z = vehicle.z;
    event.isOncoming = vehicle.isOncoming === true;
    event.vehicleType = vehicle.type;
    event.gap = gap;
    event.isUltraClose = gap <= NEAR_MISS.ULTRA_CLOSE_GAP;
    vehicle.nearMissAwarded = true;
    this.nearMisses.push(event);
  }

  acquireTrack(id) {
    let track = this.tracks.get(id);
    if (track === undefined) {
      track = new VehicleTrack();
      this.tracks.set(id, track);
    }
    return track;
  }

  releaseCrashLatch() {
    this.hasCrashed = false;
  }

  beginNewRun() {
    this.hasCrashed = false;
    this.sawPlayerCrashed = false;
    this.frame += 1;
  }

  reset() {
    this.tracks.forEach((track) => {
      track.frame = -1;
      track.relZ = 0;
      track.dx = 0;
      track.inWindow = false;
      track.minGap = Infinity;
    });
    this.frame += 2;
    this.hasCrashed = false;
    this.sawPlayerCrashed = false;
    this.lastPlayerZ = NaN;
    if (this.nearMisses.length !== 0) this.nearMisses.length = 0;
    this.result.crashed = false;
    this.result.crashedVehicle = null;
    this.result.impactSide = 0;
  }
}
