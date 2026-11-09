import { Vector3 } from 'three';

const finitePoint = p => p && [p.x, p.y, p.z].every(Number.isFinite);
const median = values => { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };

// A feature is a measured point, not a plane. Require a local, two-dimensional
// patch at a consistent height before treating it as a floor/tabletop. Never
// substitute a camera-relative height or an arbitrary distance when it fails.
export function measuredSurface(hits, worldPoints, origin, ray) {
  if (!finitePoint(origin) || !finitePoint(ray) || ray.y >= -.06) return null;
  const seeds = (hits || []).filter(h => finitePoint(h.position) && Number.isFinite(h.distance) &&
    h.distance >= .15 && h.distance <= 6 && h.position.y < origin.y - .03 &&
    ['FEATURE_POINT', 'DETECTED_SURFACE'].includes(h.type)).sort((a, b) => a.distance - b.distance).slice(0, 5);
  for (const seed of seeds) {
    const radius = Math.min(.35, Math.max(.14, seed.distance * .12));
    const unique = new Map();
    for (const entry of worldPoints || []) {
      const p = entry.position;
      if (!finitePoint(p) || (Number.isFinite(entry.confidence) && entry.confidence < .3) ||
        Math.abs(p.y - seed.position.y) > .035 || Math.hypot(p.x - seed.position.x, p.z - seed.position.z) > radius) continue;
      unique.set(`${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`, p);
    }
    const candidates = [...unique.values()];
    if (candidates.length < 6) continue;
    const centerY = median(candidates.map(p => p.y));
    const support = candidates.filter(p => Math.abs(p.y - centerY) <= .015);
    if (support.length < 6) continue;
    const y = median(support.map(p => p.y)), distance = (y - origin.y) / ray.y;
    if (distance < .15 || distance > 6) continue;
    const point = new Vector3().copy(origin).addScaledVector(ray, distance);
    const center = support.reduce((p, q) => p.add(new Vector3(q.x, 0, q.z)), new Vector3()).divideScalar(support.length);
    let xx = 0, zz = 0, xz = 0, residual = 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of support) {
      xx += (p.x - center.x) ** 2; zz += (p.z - center.z) ** 2; xz += (p.x - center.x) * (p.z - center.z);
      residual += (p.y - y) ** 2;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    xx /= support.length; zz /= support.length; xz /= support.length;
    const minorVariance = (xx + zz - Math.hypot(xx - zz, 2 * xz)) / 2;
    // Reject walls/edges and taps beyond the observed patch. Do not extend a
    // tabletop plane across the whole room just because one point was detected.
    if (minorVariance < .000225 || Math.sqrt(residual / support.length) > .012 ||
      point.x < minX - .025 || point.x > maxX + .025 || point.z < minZ - .025 || point.z > maxZ + .025) continue;
    return { x: point.x, y, z: point.z, surface: true, support: support.length, source: 'measured-patch' };
  }
  return null;
}
