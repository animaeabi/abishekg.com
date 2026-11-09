import { Vector3, Quaternion, Matrix4, MathUtils } from 'three';

// Face landmarks are image measurements, not metric scene geometry. Estimate
// depth from adult face dimensions; preserve the camera's actual cover crop.
export function headPoses(result, camera, width, height, sourceWidth, sourceHeight) {
  if (![width, height, sourceWidth, sourceHeight].every(v => v > 0)) return [];
  const cover = Math.max(width / sourceWidth, height / sourceHeight);
  const covX = width / (sourceWidth * cover), covY = height / (sourceHeight * cover);
  const p = camera.projectionMatrix.elements;
  const point = l => new Vector3((l.x - .5) * 2 / covX, (.5 - l.y) * 2 / covY, -l.z * 2 / covX);
  return (result?.faceLandmarks || []).flatMap(lm => {
    if (lm.length < 468 || !lm.every(l => [l.x, l.y, l.z].every(Number.isFinite))) return [];
    const left = point(lm[234]), right = point(lm[454]), top = point(lm[10]), chin = point(lm[152]);
    const shape = l => new Vector3(l.x, -l.y * sourceHeight / sourceWidth, -l.z);
    const x = shape(lm[454]).sub(shape(lm[234])).normalize(), y = shape(lm[10]).sub(shape(lm[152])).normalize();
    const z = x.clone().cross(y).normalize();
    if (z.z < .28) return []; // Strong profiles/backs have unreliable crown depth.
    y.crossVectors(z, x).normalize();
    const span = Math.hypot((right.x - left.x) / p[0], (right.y - left.y) / p[5]);
    const depth = .15 * Math.hypot(x.x, x.y) / span;
    if (!Number.isFinite(depth) || depth < .25 || depth > 3.5 || span < .035) return [];
    const crown = top.clone().add(top.clone().sub(chin).multiplyScalar(.20));
    const position = new Vector3(crown.x * depth / p[0], crown.y * depth / p[5], -depth);
    const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
    const bx = Math.abs(right.x - left.x) * .65, by = Math.abs(top.y - chin.y);
    const center = top.clone().add(chin).multiplyScalar(.5);
    return [{ position, quaternion, width: .15, center: { x: (center.x + 1) / 2, y: (1 - center.y) / 2 },
      bounds: { left: (center.x - bx + 1) / 2, right: (center.x + bx + 1) / 2,
        top: (1 - crown.y) / 2 - .025, bottom: (1 - chin.y) / 2 + .025 }, span: Math.max(bx, by * .5) }];
  });
}

// Session-only spatial association, not face recognition. Ambiguity or a long
// absence gets a new target ID; a running effect cannot jump to that new ID.
export class HeadTargets {
  targets = []; serial = 0;
  update(poses, time) {
    const previous = this.targets, used = new Set();
    if (!poses.length) { this.targets = previous.filter(p => time - p.time < 500); return; }
    this.targets = poses.map(pose => {
      const candidates = previous.filter(p => !used.has(p.id) && time - p.time < 500 &&
        Math.hypot(p.center.x - pose.center.x, p.center.y - pose.center.y) < Math.min(.12, pose.span * .55) &&
        Math.abs(Math.log(p.span / pose.span)) < .4);
      const match = candidates.length === 1 ? candidates[0] : null;
      if (match) used.add(match.id);
      return { ...pose, id: match?.id ?? ++this.serial, streak: (match?.streak || 0) + 1, time };
    });
  }
  candidateAt(x, y, now) {
    return this.targets.filter(p => now - p.time < 500 && x >= p.bounds.left && x <= p.bounds.right && y >= p.bounds.top && y <= p.bounds.bottom)
      .sort((a, b) => Math.hypot(a.center.x - x, a.center.y - y) - Math.hypot(b.center.x - x, b.center.y - y))[0] || null;
  }
  at(x, y, now) { const target = this.candidateAt(x, y, now); return target?.streak >= 3 && now - target.time < 350 ? target : null; }
  get(id, now) { return this.targets.find(p => p.id === id && now - p.time < 350) || null; }
  clear() { this.targets = []; }
}

export function freePose(camera, x, y, distance, frame) {
  if (![x, y, distance].every(Number.isFinite) || distance < .25 || distance > 5) return null;
  const ray = new Vector3(x * 2 - 1, 1 - y * 2, .5).unproject(camera).sub(camera.position).normalize();
  const position = camera.position.clone().addScaledVector(ray, distance);
  frame.worldToLocal(position);
  const rotation = frame.getWorldQuaternion(new Quaternion()).invert();
  return { position, quaternion: rotation, scale: MathUtils.clamp(distance / 1.5, .25, 2) };
}
