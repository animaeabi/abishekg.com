import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { measuredSurface } from '../public/namma-vedis/surface-placement.mjs';

const patch = (y, x = 0, z = -1.2) => {
  const points = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) points.push({ confidence: 1,
    position: { x: x + i * .04, y: y + Math.sin(i + j) * .002, z: z + j * .04 } });
  return points;
};
const origin = new Vector3(0, 1.4, 0);
const hit = y => ({ type: 'FEATURE_POINT', distance: Math.hypot(1.4 - y, 1.2), position: { x: 0, y, z: -1.2 } });
const ray = y => new Vector3(0, y, -1.2).sub(origin).normalize();

test('feature-point patches provide actual floor and tabletop heights without assuming camera height', () => {
  for (const y of [0, .4, .75, 1.1]) {
    const p = measuredSurface([hit(y)], patch(y), origin, ray(y));
    assert.ok(p?.surface); assert.ok(Math.abs(p.y - y) < .003); assert.ok(Math.abs(p.z + 1.2) < .006);
    assert.ok(p.support >= 20);
  }
});
test('isolated features, wall edges, absent hits and flat-map guesses cannot masquerade as a surface', () => {
  assert.equal(measuredSurface([], patch(.75), origin, ray(.75)), null);
  assert.equal(measuredSurface([hit(.75)], patch(.75).slice(0, 3), origin, ray(.75)), null);
  const edge = patch(.75).map(e => ({ position: { ...e.position, z: -1.2 } }));
  assert.equal(measuredSurface([hit(.75)], edge, origin, ray(.75)), null);
  assert.equal(measuredSurface([{ ...hit(.75), type: 'ESTIMATED_SURFACE' }], patch(.75), origin, ray(.75)), null);
});
test('a tabletop patch is not extrapolated into empty space beyond its edge', () => {
  const off = new Vector3(.3, .75, -1.2).sub(origin).normalize();
  assert.equal(measuredSurface([hit(.75)], patch(.75), origin, off), null);
});
test('surface estimation rejects unreliable points and selects a foreground table before the floor', () => {
  const table = hit(.75), floor = { ...hit(0), distance: 3, position: { x: 0, y: 0, z: -2.58 } };
  const points = [...patch(.75), ...patch(0, 0, -2.58), { confidence: 1, position: { x: NaN, y: .75, z: -1.2 } }];
  assert.ok(Math.abs(measuredSurface([floor, table], points, origin, ray(.75)).y - .75) < .003);
  assert.equal(measuredSurface([table], patch(.75).map(p => ({ ...p, confidence: .1 })), origin, ray(.75)), null);
  assert.equal(measuredSurface([table], patch(.75), origin, new Vector3(0, 1, 0)), null);
});
