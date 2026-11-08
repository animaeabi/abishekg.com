import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { applyWorldPose } from './world-space.mjs';

// A distant sky needs orientation, not a detected floor. Keep positional SLAM
// running for floor objects, and bridge only the sky while its map is limited.
export class SkyTracking {
  frameReady = false;
  motionEpoch = 0;
  bridged = false;
  tracked = false;
  aligned = false;
  alignment = new Quaternion();
  candidate = new PerspectiveCamera();
  previous = new Matrix4();
  delta = new Matrix4();
  inverse = new Matrix4();
  target = new Quaternion();

  accept(camera, reality, sensor, skyRoot) {
    if (!applyWorldPose(this.candidate, reality)) return false;
    this.frameReady = true;
    camera.projectionMatrix.copy(this.candidate.projectionMatrix);
    camera.projectionMatrixInverse.copy(this.candidate.projectionMatrixInverse);
    camera.fov = this.candidate.fov; camera.aspect = this.candidate.aspect;
    if (reality.trackingStatus === 'NORMAL') {
      camera.updateMatrixWorld(true); this.previous.copy(camera.matrixWorld);
      camera.position.copy(this.candidate.position); camera.quaternion.copy(this.candidate.quaternion);
      camera.updateMatrixWorld(true);
      if (this.bridged) {
        // Reconcile the sky's reference frame once, so recovering SLAM does not
        // jump old launches or lettering. Never transform any floor anchors.
        this.delta.copy(camera.matrixWorld).multiply(this.inverse.copy(this.previous).invert());
        skyRoot.applyMatrix4(this.delta); skyRoot.updateMatrixWorld(true);
      }
      this.aligned = Boolean(sensor);
      if (sensor) this.alignment.copy(camera.quaternion).multiply(this.target.copy(sensor).invert());
      this.bridged = false; this.tracked = true;
    } else if (!this.tracked && !this.bridged) {
      camera.position.set(0, 1.4, 0);
    }
    return true;
  }

  invalidateMotion(now) { this.motionEpoch = now; }

  canBridge({ granted, sensor, sampleTime, now, hidden = false }) {
    // Orientation events may be change-driven: a stationary phone must not
    // fall back to scanning. Invalidate on background/resume, not a short timer.
    return Boolean(!hidden && this.frameReady && granted && sensor && Number.isFinite(sampleTime) && now >= sampleTime && sampleTime >= this.motionEpoch &&
      [sensor.x, sensor.y, sensor.z, sensor.w].every(Number.isFinite) && sensor.lengthSq() > .9);
  }

  update(camera, state) {
    if (!this.canBridge(state)) return false;
    if (this.tracked && !this.aligned) {
      this.alignment.copy(camera.quaternion).multiply(this.target.copy(state.sensor).invert()); this.aligned = true;
    }
    this.target.copy(this.alignment).multiply(state.sensor).normalize();
    camera.quaternion.copy(this.target); camera.updateMatrixWorld(true);
    this.bridged = true;
    return true;
  }
}

// Every saved launch stays in the same sky frame across tracking transitions.
export function skyView(camera, root, groundY) {
  camera.updateMatrixWorld(true); root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const q = new Quaternion(), scale = new Vector3(), origin = new Vector3();
  new Matrix4().multiplyMatrices(inverse, camera.matrixWorld).decompose(origin, q, scale);
  return { origin, f: new Vector3(0, 0, -1).applyQuaternion(q), r: new Vector3(1, 0, 0).applyQuaternion(q),
    u: new Vector3(0, 1, 0).applyQuaternion(q), groundY: new Vector3(camera.position.x, groundY, camera.position.z).applyMatrix4(inverse).y,
    fov: camera.fov, aspect: camera.aspect };
}
