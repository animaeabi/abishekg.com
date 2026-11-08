import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion, Euler } from 'three';
import { HandStabilizer } from '../public/namma-vedis/hand-stabilizer.mjs';

test('still-hand position, depth and rotation noise are substantially attenuated', t => {
  const filter = new HandStabilizer(), origin = new Vector3(.1, 1.2, -.6), identity = new Quaternion();
  let raw = 0, filtered = 0, rawRotation = 0, filteredRotation = 0, count = 0;
  filter.update(origin, identity, .08, 0, 'Left');
  for (let i = 1; i <= 120; i++) {
    const p = origin.clone().add(new Vector3(Math.sin(i * 2.1) * .009, Math.sin(i * 1.7) * .006, Math.sin(i * 2.3) * .025));
    const q = new Quaternion().setFromEuler(new Euler(Math.sin(i * 2) * .13, Math.cos(i * 1.8) * .07, Math.sin(i * 2.3) * .1));
    filter.update(p, q, .08 + Math.sin(i) * .005, i * 70, 'Left');
    if (i > 20) {
      raw += p.distanceToSquared(origin); filtered += filter.position.distanceToSquared(origin);
      rawRotation += q.angleTo(identity) ** 2; filteredRotation += filter.quaternion.angleTo(identity) ** 2; count++;
    }
  }
  const positionRatio = Math.sqrt(filtered / raw), rotationRatio = Math.sqrt(filteredRotation / rawRotation);
  t.diagnostic(JSON.stringify({ positionRatio, rotationRatio, positionRmsMm: 1000 * Math.sqrt(filtered / count) }));
  assert.ok(positionRatio < .4); assert.ok(rotationRatio < .4);
});

test('a deliberate moving hand remains responsive instead of sticking in the resting filter', () => {
  const filter = new HandStabilizer(), origin = new Vector3(0, 1.2, -.6);
  for (let i = 0; i < 10; i++) filter.update(origin, new Quaternion(), .08, i * 70);
  let target, rotation;
  for (let i = 1; i <= 15; i++) {
    target = origin.clone().add(new Vector3(i * .042, 0, 0));
    rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), i * .055);
    filter.update(target, rotation, .08, (i + 9) * 70);
  }
  assert.ok(filter.position.distanceTo(target) < .065);
  assert.ok(filter.quaternion.angleTo(rotation) < .14);
});

test('a single large tracking spike cannot move the displayed cracker', () => {
  const filter = new HandStabilizer(), origin = new Vector3(0, 1.2, -.6), q = new Quaternion();
  for (let i = 0; i < 8; i++) filter.update(origin, q, .08, i * 70);
  filter.update(new Vector3(.2, 1.2, -.6), new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1), .08, 560);
  assert.deepEqual(filter.position.toArray(), origin.toArray()); assert.equal(filter.quaternion.angleTo(q), 0);
  filter.update(origin, q, .08, 630); assert.deepEqual(filter.position.toArray(), origin.toArray());
});

test('reacquisition resets, duplicate timestamps do not refilter, and quaternion sign changes are invisible', () => {
  const filter = new HandStabilizer(), q = new Quaternion(), p = new Vector3(0, 1, -.5);
  filter.update(p, q, .08, 0, 'Left');
  filter.update(new Vector3(1, 1, -.5), q, .08, 0, 'Left'); assert.equal(filter.position.x, 0);
  filter.update(p, new Quaternion(0, 0, 0, -1), .08, 70, 'Left'); assert.equal(filter.quaternion.angleTo(q), 0);
  filter.update(new Vector3(1, 1, -.5), q, .08, 800, 'Left'); assert.equal(filter.position.x, 1);
  filter.update(p, q, .07, 870, 'Right'); assert.equal(filter.position.x, 0); assert.equal(filter.width, .07);
});
