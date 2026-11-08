import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const PALM = [0, 5, 9, 13, 17];
const footprint = { atom: .10, sutli: .12, lakshmi: .065, flower: .152, spinner: .145,
  wala100: 1.7, wala1000: 2.7, wala10000: 3.9 };
export const handEffectScale = (kind, width) => clamp(width, .05, .11) * .7 / (footprint[kind] || .15);

// MediaPipe's world points are hand-relative, not positions in the AR room.
// Estimate camera depth from projected palm width, then use the same cover crop
// and projection as the camera image. No metric-depth/scene-mesh claim is made.
export function palmPose(result, camera, width, height, sourceWidth, sourceHeight) {
  const lm = result?.landmarks?.[0], wm = result?.worldLandmarks?.[0];
  if (lm?.length !== 21 || wm?.length !== 21 || ![width, height, sourceWidth, sourceHeight].every(v => v > 0)) return null;
  if (![...lm, ...wm].every(p => [p.x, p.y, p.z].every(Number.isFinite))) return null;
  const label = (result.handedness || result.handednesses)?.[0]?.[0]?.categoryName || '';
  const confidence = (result.handedness || result.handednesses)?.[0]?.[0]?.score ?? 1;
  if (confidence < .65) return null;
  const points = wm.map(p => new THREE.Vector3(p.x, -p.y, -p.z));
  const wrist = points[0];
  const extended = [[8, 6], [12, 10], [16, 14], [20, 18]]
    .filter(([tip, joint]) => points[tip].distanceTo(wrist) > points[joint].distanceTo(wrist) * 1.12).length;
  if (extended < 3) return null;
  const across = points[5].clone().sub(points[17]);
  const palmWidth = across.length();
  if (palmWidth < .025 || palmWidth > .16) return null;
  const back = wrist.clone().sub(points[9]).normalize();
  let normal = new THREE.Vector3().crossVectors(back, across).normalize();
  // The visible surface faces the camera on either hand. Edge-on hands have
  // unreliable depth and are deliberately rejected rather than jumping.
  if (normal.z < 0) normal.negate();
  if (normal.z < .22) return null;
  const right = new THREE.Vector3().crossVectors(normal, back).normalize();
  const localZ = new THREE.Vector3().crossVectors(right, normal).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, normal, localZ));
  const cover = Math.max(width / sourceWidth, height / sourceHeight);
  const covX = width / (sourceWidth * cover), covY = height / (sourceHeight * cover);
  const ndc = p => new THREE.Vector2((p.x - .5) * 2 / covX, (.5 - p.y) * 2 / covY);
  const a = ndc(lm[5]), b = ndc(lm[17]);
  const projection = camera.projectionMatrix.elements;
  const projectedSpan = Math.hypot((a.x - b.x) / projection[0], (a.y - b.y) / projection[5]);
  if (projectedSpan < .025) return null;
  const depth = Math.hypot(across.x, across.y) / projectedSpan;
  if (depth < .12 || depth > 1.4) return null;
  const center = PALM.reduce((p, i) => p.add(ndc(lm[i])), new THREE.Vector2()).multiplyScalar(1 / PALM.length);
  if (Math.abs(center.x) > .92 || Math.abs(center.y) > .92) return null;
  return { position: new THREE.Vector3(center.x * depth / projection[0], center.y * depth / projection[5], -depth),
    quaternion: q, width: clamp(palmWidth, .05, .11), label };
}

export class HandAnchor {
  ready = false; streak = 0; lastSeen = -Infinity; lockedLabel = null;
  pose = null;
  update(pose, now) {
    if (!pose || (this.lockedLabel && pose.label !== this.lockedLabel)) { this.invalidate(); return false; }
    this.streak++; this.lastSeen = now; this.pose = pose;
    this.ready = this.streak >= 3;
    return this.ready;
  }
  fresh(now) { if (now - this.lastSeen > 350) this.invalidate(); return this.ready; }
  invalidate() { this.ready = false; this.streak = 0; }
  lock() { this.lockedLabel = this.pose?.label || null; }
  unlock() { this.lockedLabel = null; }
}
