import * as THREE from 'three';

export const WALA_CONFIGS = {
  wala100: { n: 100, rows: 1, length: 1.6, amp: .025, rowGap: .10, scale: 1, gap: [.024, .05], paper: 2 },
  wala1000: { n: 1000, rows: 4, length: 3.8, amp: .014, rowGap: .10, scale: 1, gap: [.006, .012], paper: 1 },
  wala10000: { n: 10000, rows: 20, length: 5.6, amp: .01, rowGap: .085, scale: .7, gap: [.0022, .0038], paper: 1 },
};

// Capture the phone's horizontal X axis ONCE. The result lives in world space,
// never under the camera. Long strings fold into broad horizontal rows.
export function createWalaLayout(point, cameraQuaternion, config) {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuaternion);
  right.y = 0;
  if (right.lengthSq() < .01) right.set(1, 0, 0);
  right.normalize();
  const forward = new THREE.Vector3(right.z, 0, -right.x);
  const perRow = config.n / config.rows;
  const points = [], cordPoints = [];
  const cordStride = Math.max(1, Math.floor(perRow / 32));
  for (let i = 0; i < config.n; i++) {
    const row = Math.floor(i / perRow), j = i % perRow;
    const u = j / (perRow - 1), across = ((row % 2 ? 1 - u : u) - .5) * config.length;
    const depth = (row - (config.rows - 1) / 2) * config.rowGap + Math.sin(u * Math.PI * 4) * config.amp;
    const center = point.clone().addScaledVector(right, across).addScaledVector(forward, depth);
    if (j % cordStride === 0 || j === perRow - 1) cordPoints.push(center.clone().add(new THREE.Vector3(0, .006 * config.scale, 0)));
    // Alternating branches sit on either side of the connecting fuse.
    center.addScaledVector(forward, (i % 2 ? 1 : -1) * .012 * config.scale);
    center.y += .0075 * config.scale;
    points.push(center);
  }
  return { points, cordPoints, right, forward, perRow };
}
