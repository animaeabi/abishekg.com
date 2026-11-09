// Positions are copied at placement. Camera updates must never reparent or
// recompute an existing effect from a screen coordinate.
export function snapshotView(THREE, camera) {
  return {
    origin: camera.position.clone(),
    f: camera.getWorldDirection(new THREE.Vector3()),
    r: new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
    u: new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
    fov: camera.fov, aspect: camera.aspect,
  };
}

export function groundIntersection(THREE, origin, ray, height, maxDistance = 8) {
  if (ray.y >= -.03) return null;
  const distance = (height - origin.y) / ray.y;
  if (distance <= 0 || distance > maxDistance) return null;
  return new THREE.Vector3().copy(origin).addScaledVector(ray, distance);
}

const candidateProjections = new WeakMap();
export function applyWorldPose(camera, reality) {
  if (!reality) return false;
  const { position: p, rotation: q, intrinsics: projection } = reality;
  if (!p || !q || !projection || projection.length !== 16 ||
      ![p.x, p.y, p.z, q.x, q.y, q.z, q.w, ...projection].every(Number.isFinite)) return false;
  const norm = Math.hypot(q.x, q.y, q.z, q.w);
  if (norm < .5 || norm > 1.5 || projection[0] <= 0 || projection[5] <= 0) return false;
  let candidate = candidateProjections.get(camera);
  if (!candidate) { candidate = camera.projectionMatrix.clone(); candidateProjections.set(camera, candidate); }
  candidate.fromArray(projection);
  const determinant = candidate.determinant();
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return false;
  camera.position.set(p.x, p.y, p.z);
  camera.quaternion.set(q.x, q.y, q.z, q.w).normalize();
  camera.projectionMatrix.copy(candidate);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.fov = 2 * Math.atan(1 / projection[5]) * 180 / Math.PI;
  camera.aspect = projection[5] / projection[0];
  camera.updateMatrixWorld(true);
  return true;
}

export class PlacementGuide {
  armed = true;
  place() { this.armed = false; }
  select() { this.armed = true; }
  visible({ playing, ground, hidden, ready, hasSurface }) {
    return this.armed && playing && ground && !hidden && ready && hasSurface;
  }
}
