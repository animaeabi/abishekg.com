import { Vector3, Quaternion, MathUtils } from 'three';

const UP = new Vector3(0, 1, 0);
export const PALM_FUSES = { atom: 3.2, sutli: 2.8, lakshmi: 2.4 };

// Coordinates are in the AR room, not pixels or hand-relative landmarks.
// A released object never reacquires a hand. Its fuse belongs to the effect.
export class HandObjectMotion {
  state = 'held';
  velocity = new Vector3();
  samples = [];
  tiltSince = null;
  constructor({ position, quaternion, floorY, kind, now }) {
    this.position = position.clone(); this.quaternion = quaternion.clone();
    this.initialNormal = UP.clone().applyQuaternion(quaternion);
    this.floorY = Math.min(floorY, position.y); this.kind = kind;
    this.bomb = Boolean(PALM_FUSES[kind]); this.started = now;
    this.lastSample = now; this.samples.push({ p: position.clone(), time: now });
  }
  sample(position, quaternion, now) {
    if (this.state !== 'held' || now <= this.lastSample) return;
    const previous = this.samples.at(-1), elapsed = (now - previous.time) / 1000;
    // Ignore single-frame depth flips rather than launching across the room.
    if (position.distanceTo(previous.p) > Math.max(.12, elapsed * 4)) return;
    if (elapsed > .3) this.samples.length = 0;
    this.lastSample = now;
    this.samples.push({ p: position.clone(), time: now });
    while (this.samples.length > 2 && now - this.samples[0].time > 240) this.samples.shift();
    const first = this.samples[0], span = (now - first.time) / 1000;
    const travel = position.distanceTo(first.p);
    this.velocity.copy(position).sub(first.p).divideScalar(Math.max(.001, span));
    this.position.copy(position); this.quaternion.copy(quaternion);
    if (now - this.started < 220) return;
    // At least three observations: one noisy depth estimate is not a throw.
    if (this.bomb && this.samples.length >= 3 && span >= .09 && travel > .085 && this.velocity.length() > .8) {
      this.release(now, true); return;
    }
    const tilt = UP.clone().applyQuaternion(quaternion).angleTo(this.initialNormal);
    if (tilt > MathUtils.degToRad(this.bomb ? 24 : 18)) {
      this.tiltSince ??= now;
      if (now - this.tiltSince >= 65) this.release(now, false);
    } else this.tiltSince = null;
  }
  release(now, toss = false) {
    if (this.state !== 'held') return;
    this.state = 'airborne';
    if (toss && now - this.lastSample < 320) this.velocity.multiplyScalar(2.2).clampLength(0, 6);
    else this.velocity.set(0, 0, 0);
  }
  step(dt, now) {
    if (this.state === 'held' && now - this.lastSample > 240) {
      this.release(now, this.bomb && this.velocity.length() > .7 && now - this.lastSample < 320);
    }
    if (this.state !== 'airborne') return;
    // Analytic constant-acceleration integration gives the same path at 30/60/120Hz.
    const height = Math.max(0, this.position.y - this.floorY);
    const impact = (this.velocity.y + Math.sqrt(this.velocity.y ** 2 + 19.6 * height)) / 9.8;
    const travel = Math.min(dt, impact);
    this.position.addScaledVector(this.velocity, travel); this.position.y -= 4.9 * travel * travel;
    this.velocity.y -= 9.8 * travel;
    if (this.bomb) this.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, .3, .2).normalize(), dt * 5));
    else this.quaternion.slerp(new Quaternion(), 1 - Math.exp(-dt * 9));
    if (impact <= dt) {
      this.position.y = this.floorY; this.velocity.set(0, 0, 0);
      this.quaternion.identity(); this.state = 'landed';
    }
  }
  burst() { this.state = 'spent'; this.velocity.set(0, 0, 0); }
}
