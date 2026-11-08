import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCrackerModel } from '../public/namma-vedis/cracker-models.mjs';
import { createWalaLayout, WALA_CONFIGS } from '../public/namma-vedis/wala-layout.mjs';

for (const kind of ['atom', 'sutli', 'lakshmi']) {
  test(`${kind} has opaque lit geometry, a shrinking physical fuse, and owned-resource cleanup`, () => {
    const texture = new THREE.Texture(); let textureDisposed = false;
    texture.addEventListener('dispose', () => { textureDisposed = true; });
    const model = createCrackerModel(kind, { [kind]: texture });
    const geometryDisposals = new Map(), materialDisposals = new Map();
    model.group.traverse(mesh => {
      if (!mesh.isMesh) return;
      assert.ok(mesh.material.isMeshStandardMaterial);
      assert.equal(mesh.material.transparent, false); assert.equal(mesh.material.opacity, 1);
      assert.equal(mesh.material.depthTest, true); assert.equal(mesh.material.depthWrite, true);
      assert.ok(mesh.geometry.attributes.normal);
      geometryDisposals.set(mesh.geometry, 0); materialDisposals.set(mesh.material, 0);
    });
    for (const [g] of geometryDisposals) g.addEventListener('dispose', () => geometryDisposals.set(g, geometryDisposals.get(g) + 1));
    for (const [m] of materialDisposals) m.addEventListener('dispose', () => materialDisposals.set(m, materialDisposals.get(m) + 1));
    const bounds = new THREE.Box3().setFromObject(model.group, true);
    assert.ok(bounds.min.y >= -0.0001, 'model rests on the placement plane');
    assert.ok(bounds.max.y > .1 && bounds.max.z - bounds.min.z > .03, 'model has three-dimensional volume');
    model.group.position.set(2, .7, -3);
    const initialTip = model.burn(0), fuse = model.group.getObjectByName('solid-curved-fuse');
    const fullCount = fuse.geometry.drawRange.count;
    const halfTip = model.burn(.5);
    assert.ok(halfTip.y < initialTip.y); assert.ok(halfTip.y > .7 + model.height);
    assert.ok(fuse.geometry.drawRange.count < fullCount);
    model.burn(1); assert.equal(fuse.geometry.drawRange.count, 0);
    model.dispose(); model.dispose();
    assert.ok([...geometryDisposals.values()].every(n => n === 1));
    assert.ok([...materialDisposals.values()].every(n => n === 1));
    assert.equal(textureDisposed, false, 'shared wrapping texture survives another cracker');
  });
}

for (const [id, config] of Object.entries(WALA_CONFIGS)) {
  test(`${id} follows a continuous S curve and stays fixed when the view changes`, () => {
    for (const yaw of [0, Math.PI / 2, -1.2]) {
      const point = new THREE.Vector3(2, .8, -3);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.6, yaw, .12, 'YXZ'));
      const { points, directions, cordPoints, right, forward } = createWalaLayout(point, q, config);
      assert.equal(points.length, Number(id.slice(4)));
      assert.equal(directions.length, points.length);
      const across = cordPoints.map(p => p.clone().sub(point).dot(right));
      const depth = cordPoints.map(p => p.clone().sub(point).dot(forward));
      assert.ok(across[48] > config.width * .3 && across[144] < -config.width * .3, 'opposite rounded bends form an S');
      assert.ok(Math.abs(across[96]) < .01, 'curve crosses its center');
      for (let i = 1; i < cordPoints.length; i++) {
        assert.ok(depth[i] > depth[i - 1], 'no row reversal or jump to a new row');
        assert.ok(cordPoints[i].distanceTo(cordPoints[i - 1]) < config.length / 70, 'fuse stays continuous');
      }
      assert.ok(points.every(p => Math.abs(p.y - (.8 + .0075 * config.scale)) < 1e-8));
      assert.ok(directions.every(d => Math.abs(d.length() - 1) < 1e-8 && Math.abs(d.y) < 1e-8));
      const before = points.map(p => p.toArray());
      q.setFromEuler(new THREE.Euler(0, yaw + 1, 0)); point.set(10, 3, 5);
      assert.deepEqual(points.map(p => p.toArray()), before, 'layout does not retain camera/placement references');
    }
  });
}
