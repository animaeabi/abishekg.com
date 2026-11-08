import * as THREE from 'three';

export const WALA_CONFIGS = {
  wala100: { n: 100, strands: 2, length: 1.05, width: .48, scale: 1, duration: 4.4, run: [3, 9], paper: 3 },
  wala1000: { n: 1000, strands: 4, length: 2.6, width: 1, scale: .85, duration: 11.5, run: [10, 38], paper: 2 },
  wala10000: { n: 10000, strands: 20, length: 3.8, width: 1.45, scale: .7, duration: 30, run: [45, 150], paper: 2 },
};

export function walaRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = Math.imul(value ^ value >>> 15, 1 | value);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// A loose, paired-sided garland around one spine. Randomness is sampled ONCE
// at placement; camera movement must never regenerate or shuffle the layout.
export function createWalaLayout(point, cameraQuaternion, config, seed = Math.floor(Math.random() * 4294967296)) {
  const random = walaRandom(seed), between = (a, b) => a + (b - a) * random();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuaternion);
  right.y = 0;
  if (right.lengthSq() < .01) right.set(1, 0, 0);
  right.normalize();
  const forward = new THREE.Vector3(right.z, 0, -right.x);
  const controls = [[-.25, -.5], [.42, -.38], [.46, -.20], [0, 0], [-.46, .20], [-.42, .38], [.25, .5]];
  const phase = between(0, Math.PI * 2);
  const curve = new THREE.CatmullRomCurve3(controls.map(([x, z], i) =>
    point.clone().addScaledVector(right, (x + between(-.065, .065)) * config.width)
      .addScaledVector(forward, (z + (i === 0 || i === 6 ? 0 : between(-.025, .025))) * config.length)));
  curve.arcLengthDivisions = 2048;
  const stations = config.n / config.strands;
  const centers = curve.getSpacedPoints(stations - 1), points = [], directions = [], scales = [], shades = [], kicks = [];
  for (let station = 0; station < stations; station++) {
    const u = station / (stations - 1), tangent = curve.getTangentAt(u);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const bundle = .88 + .12 * Math.sin(u * 19 + phase) + .05 * Math.sin(u * 47 + phase);
    const lanes = Array.from({ length: config.strands }, (_, i) => i);
    // The burn travels along the cord, but does not wipe each bundle left-right.
    for (let i = lanes.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [lanes[i], lanes[j]] = [lanes[j], lanes[i]]; }
    for (const strand of lanes) {
      const side = strand < config.strands / 2 ? -1 : 1;
      const rank = strand % (config.strands / 2);
      // Dense counts are loose layered packets on a single cord, not a flat
      // twenty-lane carpet. The compressed 10k footprint is an AR design choice.
      const column = rank % 3, layer = Math.floor(rank / 3);
      const offset = side * (.019 + column * .027) * bundle * config.scale + between(-.004, .004) * config.scale;
      const center = centers[station].clone().addScaledVector(normal, offset)
        .addScaledVector(tangent, between(-.005, .005) * config.scale);
      const scale = config.scale * between(.89, 1.1);
      center.y += .0071 * scale + (layer * .011 + between(0, .003)) * config.scale;
      points.push(center); scales.push(scale); shades.push(between(.7, 1));
      directions.push(normal.clone().multiplyScalar(side).addScaledVector(tangent, between(-.32, .5)).normalize());
      kicks.push(new THREE.Vector3(normal.x * side * between(.003, .019), between(.007, .032), normal.z * side * between(.003, .019)).multiplyScalar(config.scale));
    }
  }
  const cordPoints = curve.getSpacedPoints(192).map(p => p.add(new THREE.Vector3(0, .005 * config.scale, 0)));
  return { points, directions, cordPoints, scales, shades, kicks, right, forward, seed };
}
