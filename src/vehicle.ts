import { MathUtils } from 'three';
import type { DrivingInput } from './controls';
import { GRID_POSITION, ROAD_HALF_WIDTH, Track } from './track';

export const MAX_FORWARD = 74;
export const MAX_BOOST_SPEED = 101;
export const MIN_BOOST_CHARGE = 0.12;
const MAX_REVERSE = 12;
const VEHICLE_CLEARANCE = 1.55;
const MIN_DRIFT_SPEED = 9;
const BOOST_DRAIN_PER_SECOND = 0.48;

export class Vehicle {
  x = 0;
  z = 0;
  heading = 0;
  velocityX = 0;
  velocityZ = 0;
  distance = 0;
  steer = 0;
  slip = 0;
  drifting = false;
  wrongWay = false;
  impact = 0;
  throttle = false;
  braking = false;
  boost = 0;
  boosting = false;
  charging = false;
  private driftBlend = 0;

  constructor(private readonly track: Track) {
    this.restart();
  }

  get speed(): number {
    return Math.hypot(this.velocityX, this.velocityZ);
  }

  restart(): void {
    this.boost = 0;
    this.reset(GRID_POSITION);
  }

  reset(distance = this.distance): void {
    const sample = this.track.at(distance);
    this.x = sample.x;
    this.z = sample.z;
    this.heading = Math.atan2(sample.tx, -sample.tz);
    this.distance = sample.distance;
    this.velocityX = 0;
    this.velocityZ = 0;
    this.steer = 0;
    this.slip = 0;
    this.impact = 0;
    this.drifting = false;
    this.driftBlend = 0;
    this.wrongWay = false;
    this.throttle = false;
    this.braking = false;
    this.boosting = false;
    this.charging = false;
  }

  update(dt: number, input: DrivingInput): void {
    this.impact = MathUtils.damp(this.impact, 0, 10, dt);
    this.steer = MathUtils.damp(this.steer, input.steer, 11, dt);
    const forwardSpeed = this.velocityX * Math.sin(this.heading) - this.velocityZ * Math.cos(this.heading);
    this.throttle = input.throttle && !input.brake;
    this.braking = input.brake;
    this.boosting = !input.brake && this.boost > 0
      && (this.boosting || (input.boost && this.boost >= MIN_BOOST_CHARGE));
    this.drifting = input.drift && input.steer !== 0 && !this.boosting && forwardSpeed >= MIN_DRIFT_SPEED;
    this.driftBlend = MathUtils.damp(this.driftBlend, Number(this.drifting), 12, dt);
    const turnRate = (1.65 - Math.min(Math.abs(forwardSpeed) / MAX_FORWARD, 1) * 0.62)
      * (1 + 0.36 * this.driftBlend);
    const steeringSpeed = MathUtils.clamp(forwardSpeed / 8, -0.62, 1);
    const steeringAuthority = this.throttle && forwardSpeed >= 0 ? Math.max(0.32, steeringSpeed) : steeringSpeed;
    this.heading += this.steer * turnRate * steeringAuthority * dt;
    this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));

    const fx = Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const rx = -fz;
    const rz = fx;
    let longitudinal = this.velocityX * fx + this.velocityZ * fz;
    let lateral = this.velocityX * rx + this.velocityZ * rz;

    if (this.boosting) {
      const burstTime = Math.min(dt, this.boost / BOOST_DRAIN_PER_SECOND);
      longitudinal = Math.min(MAX_BOOST_SPEED, longitudinal + 48 * burstTime);
      this.boost = Math.max(0, this.boost - BOOST_DRAIN_PER_SECOND * burstTime);
    } else if (input.brake) {
      longitudinal = Math.max(-MAX_REVERSE, longitudinal - (longitudinal > 0 ? 45 : 10) * dt);
    } else if (input.throttle) {
      const acceleration = 31 - 19 * MathUtils.clamp(longitudinal / MAX_FORWARD, 0, 1);
      if (longitudinal < MAX_FORWARD) longitudinal = Math.min(MAX_FORWARD, longitudinal + acceleration * dt);
    }
    if (!this.boosting && longitudinal > MAX_FORWARD) {
      longitudinal = MathUtils.damp(longitudinal, MAX_FORWARD, 1.9, dt);
    }
    const normalDrag = this.throttle ? 0.09 : 0.48;
    const drag = this.boosting ? 0.045 : MathUtils.lerp(normalDrag, 0.24, this.driftBlend);
    longitudinal *= Math.exp(-drag * dt);
    lateral *= Math.exp(-MathUtils.lerp(8.4, 2.65, this.driftBlend) * dt);
    this.slip = lateral;

    this.velocityX = fx * longitudinal + rx * lateral;
    this.velocityZ = fz * longitudinal + rz * lateral;
    this.x += this.velocityX * dt;
    this.z += this.velocityZ * dt;

    const sample = this.track.nearest(this.x, this.z, this.distance);
    this.distance = sample.distance;
    const nx = -sample.tz;
    const nz = sample.tx;
    const offset = (this.x - sample.x) * nx + (this.z - sample.z) * nz;
    const limit = ROAD_HALF_WIDTH - VEHICLE_CLEARANCE;
    if (Math.abs(offset) > limit) {
      const side = Math.sign(offset);
      const penetration = offset - side * limit;
      this.x -= nx * penetration;
      this.z -= nz * penetration;
      const outwardSpeed = (this.velocityX * nx + this.velocityZ * nz) * side;
      if (outwardSpeed > 0) {
        this.impact = Math.max(this.impact, MathUtils.clamp(outwardSpeed / 24, 0, 1));
        this.velocityX = (this.velocityX - nx * side * outwardSpeed * 1.14) * 0.91;
        this.velocityZ = (this.velocityZ - nz * side * outwardSpeed * 1.14) * 0.91;
      }
    }
    const advance = this.velocityX * sample.tx + this.velocityZ * sample.tz;
    this.wrongWay = this.speed > 5 && advance < -4;
    this.charging = false;
    if (this.drifting && this.impact < 0.09 && Math.abs(offset) < limit - 0.45) {
      const slipQuality = MathUtils.smoothstep(Math.abs(lateral) / Math.max(1, longitudinal), 0.035, 0.20);
      const speedQuality = MathUtils.smoothstep(advance, 5, 26);
      const gained = 0.75 * slipQuality * speedQuality * dt;
      this.charging = gained > 0 && this.boost < 1;
      this.boost = Math.min(1, this.boost + gained);
    }
  }
}
