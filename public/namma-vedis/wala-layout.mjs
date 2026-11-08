import * as THREE from 'three';

export const WALA_CONFIGS = {
  wala100: { n: 100, strands: 1, length: 1.6, width: .65, scale: 1, gap: [.024, .05], paper: 2 },
  wala1000: { n: 1000, strands: 4, length: 2.6, width: 1, scale: .85, gap: [.006, .012], paper: 1 },
  wala10000: { n: 10000, strands: 20, length: 3.8, width: 1.45, scale: .7, gap: [.0022, .0038], paper: 1 },
};

// One flowing S-shaped garland. Capture the view only at placement, then keep
// every curve, body and fuse in world coordinates as the camera moves.
export function createWalaLayout(point, cameraQuaternion, config) {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuaternion);
  right.y = 0;
  if (right.lengthSq() < .01) right.set(1, 0, 0);
  right.normalize();
  const forward = new THREE.Vector3(right.z, 0, -right.x);
  const controls = [[-.25, -.5], [.42, -.38], [.46, -.20], [0, 0], [-.46, .20], [-.42, .38], [.25, .5]];
  const curve = new THREE.CatmullRomCurve3(controls.map(([x, z]) =>
    point.clone().addScaledVector(right, x * config.width).addScaledVector(forward, z * config.length)));
  curve.arcLengthDivisions = 2048;
  const stations = config.n / config.strands;
  const centers = curve.getSpacedPoints(stations - 1), points = [], directions = [];
  for (let station = 0; station < stations; station++) {
    const tangent = curve.getTangentAt(station / (stations - 1));
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    for (let strand = 0; strand < config.strands; strand++) {
      const index = points.length, side = index % 2 ? 1 : -1;
      // Bigger walas make a fuller garland following the SAME S, not rows.
      const offset = config.strands === 1 ? side * .012 * config.scale
        : (strand - (config.strands - 1) / 2) * .045 * config.scale;
      const center = centers[station].clone().addScaledVector(normal, offset);
      center.y += .0075 * config.scale;
      points.push(center);
      directions.push(normal.clone().multiplyScalar(side).addScaledVector(tangent, .25).normalize());
    }
  }
  const cordPoints = curve.getSpacedPoints(192).map(p => p.add(new THREE.Vector3(0, .006 * config.scale, 0)));
  return { points, directions, cordPoints, right, forward };
}
