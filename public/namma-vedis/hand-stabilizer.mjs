import { Vector3, Quaternion, MathUtils } from 'three';

const alpha = (cutoff, dt) => 1 - Math.exp(-2 * Math.PI * cutoff * dt);

// Filter measurements once per camera result, not once per render. Quiet hands
// get strong smoothing; consistent motion raises the response rate. Gesture
// recognition uses the unfiltered measurements, independently of this display.
export class HandStabilizer {
  position = new Vector3(); quaternion = new Quaternion(); width = .08;
  velocity = new Vector3(); angularVelocity = new Vector3();
  previousPosition = new Vector3(); previousQuaternion = new Quaternion();
  delta = new Vector3(); rotation = new Quaternion();
  time = -Infinity; label = null; pendingJump = false;

  update(position, quaternion, width, time, label = '') {
    if (time <= this.time) return this;
    if (time - this.time > 500 || label !== this.label) {
      this.position.copy(position); this.quaternion.copy(quaternion); this.width = width;
      this.velocity.set(0, 0, 0); this.angularVelocity.set(0, 0, 0);
      this.pendingJump = false;
    } else {
      const jump = position.distanceTo(this.previousPosition) > .10 || quaternion.angleTo(this.previousQuaternion) > .8;
      if (jump && !this.pendingJump) {
        // Confirm large discontinuities with another observation. Ordinary
        // motion is not delayed, and throw recognition does not use this gate.
        this.pendingJump = true; this.time = time; return this;
      }
      this.pendingJump = false;
      const dt = MathUtils.clamp((time - this.time) / 1000, .001, .25);
      const derivativeAlpha = alpha(.8, dt);
      this.delta.copy(position).sub(this.previousPosition).divideScalar(dt);
      this.velocity.lerp(this.delta, derivativeAlpha);
      const distance = this.position.distanceTo(position);
      // A small resting deadband removes sub-pixel wobble without quantizing a
      // moving hand. World units are the same approximate metres as the AR room.
      const positionAlpha = alpha(.65 + Math.min(7, this.velocity.length() * 5), dt);
      if (distance > .0025) this.position.lerp(position, positionAlpha * (1 - .0025 / distance));

      this.rotation.copy(this.previousQuaternion).invert().premultiply(quaternion).normalize();
      if (this.rotation.w < 0) this.rotation.set(-this.rotation.x, -this.rotation.y, -this.rotation.z, -this.rotation.w);
      const angle = 2 * Math.acos(MathUtils.clamp(this.rotation.w, -1, 1));
      this.delta.set(this.rotation.x, this.rotation.y, this.rotation.z);
      if (this.delta.lengthSq() > 1e-12) this.delta.normalize().multiplyScalar(angle / dt);
      this.angularVelocity.lerp(this.delta, derivativeAlpha);
      const difference = this.quaternion.angleTo(quaternion), deadband = MathUtils.degToRad(1.2);
      const rotationAlpha = alpha(.65 + Math.min(5, this.angularVelocity.length() * .65), dt);
      if (difference > deadband) this.quaternion.slerp(quaternion, rotationAlpha * (1 - deadband / difference));
      this.width += (width - this.width) * alpha(.6, dt);
    }
    this.previousPosition.copy(position); this.previousQuaternion.copy(quaternion);
    this.time = time; this.label = label;
    return this;
  }
}
