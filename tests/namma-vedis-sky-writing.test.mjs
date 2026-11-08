import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createSkyWritingPlan, sampleStroke } from '../public/namma-vedis/sky-writing.mjs';
const view = () => ({ origin: new Vector3(0, 1.4, 0), f: new Vector3(0, 0, -1), r: new Vector3(1, 0, 0), u: new Vector3(0, 1, 0), fov: 70, aspect: 390 / 844 });

test('sky writing fits portrait and landscape views with bounded spark counts and no instant text reveal', () => {
  for (const aspect of [390 / 844, 844 / 390]) {
    const v = view(); v.aspect = aspect;
    const plan = createSkyWritingPlan('Happy Diwali', v);
    assert.equal(plan.comets.length, 6);
    assert.ok(plan.births.length > 400 && plan.births.length < 2000);
    assert.ok(plan.births.every(t => t >= 1.5 && t <= plan.writeEnd + 1e-6));
    assert.ok(plan.end < 8 && plan.end > plan.dissolveAt + 2.5);
    for (let i = 0; i < plan.targets.length; i += 3) {
      assert.ok(Math.abs(plan.targets[i]) < plan.width / 2);
      assert.equal(plan.targets[i + 2], -100);
      assert.ok(Number.isFinite(plan.targets[i + 1]));
    }
    assert.ok(plan.drifts.every(Number.isFinite));
    assert.ok(plan.comets.every(c => c.start.y < c.end.y && c.at + c.duration < Math.min(...plan.births)));
  }
});

test('travelling stroke tips reach the same target as each newly born letter spark', () => {
  const plan = createSkyWritingPlan('HAPPY DIWALI', view());
  let offset = 0;
  for (const stroke of plan.strokes) {
    const length = stroke.points.slice(1).reduce((v, p, i) => v + p.distanceTo(stroke.points[i]), 0) / plan.unit;
    const samples = Math.max(4, Math.ceil(length * 28));
    for (let j = 0; j <= samples; j++, offset++) {
      const time = plan.births[offset];
      const head = sampleStroke(stroke.points, (time - stroke.start) / stroke.duration);
      const target = new Vector3().fromArray(plan.targets, offset * 3);
      assert.ok(head.distanceTo(target) < .0001, 'spark follows the writing tip, not a separate fade-in');
    }
  }
  assert.equal(offset, plan.births.length);
});

test('personalized names preserve Unicode fallback and captured world coordinates', () => {
  const v = view(), seen = [];
  const plan = createSkyWritingPlan('For அபி', v, character => { seen.push(character); return [[[0, 0], [.7, 1]]]; });
  assert.deepEqual(seen, ['அ', 'பி'], 'Tamil vowel marks stay joined to their consonants');
  assert.ok(plan.targets.length > 0);
  const positions = plan.targets.slice(), center = plan.center.clone();
  v.origin.set(100, 100, 100); v.f.set(1, 0, 0); v.r.set(0, 0, 1);
  assert.deepEqual(plan.targets, positions); assert.deepEqual(plan.center, center);
});
