import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WALA_CONFIGS, createWalaLayout } from '../public/namma-vedis/wala-layout.mjs';
import { createWalaBurn, walaIndexAt, renderWalaAudio, decorateWalaMaterial } from '../public/namma-vedis/wala-burn.mjs';

for (const [id, config] of Object.entries(WALA_CONFIGS)) {
  test(`${id}: loose layout is reproducible, varied and retains exactly the advertised count`, () => {
    const point = new THREE.Vector3(), q = new THREE.Quaternion();
    const a = createWalaLayout(point, q, config, 7), b = createWalaLayout(point, q, config, 7), c = createWalaLayout(point, q, config, 23);
    assert.equal(a.points.length, config.n); assert.deepEqual(a.points, b.points);
    assert.notDeepEqual(a.cordPoints, c.cordPoints);
    assert.ok(Math.max(...a.scales) - Math.min(...a.scales) > config.scale * .18);
    assert.ok(Math.max(...a.shades) - Math.min(...a.shades) > .25);
    assert.ok(a.kicks.every(k => k.y > 0 && k.length() < .05));
    assert.ok(a.points.every(p => p.length() < config.length));
  });
  test(`${id}: irregular burn consumes every body and is independent of refresh rate`, () => {
    for (const seed of [1, 7, 23, 105]) {
      const burn = createWalaBurn(config, seed), gaps = [];
      assert.equal(burn.times.length, config.n); assert.equal(walaIndexAt(burn.times, .64), 0);
      assert.ok(burn.duration > config.duration * .95 && burn.duration < config.duration * 1.05 + .65);
      for (let i = 1; i < config.n; i++) { assert.ok(burn.times[i] > burn.times[i - 1]); gaps.push(burn.times[i] - burn.times[i - 1]); }
      const sorted = gaps.toSorted((a, b) => a - b);
      assert.ok(sorted[Math.floor(sorted.length * .95)] / sorted[Math.floor(sorted.length * .1)] > 4, 'varied runs and hesitations');
      assert.ok(burn.energy.some(v => v > 1.2) && burn.energy.some(v => v < .6), 'nonperiodic accents');
      const counts = [30, 60, 120].map(hz => {
        let index = 0;
        for (let frame = 1; frame <= Math.ceil((burn.duration + .1) * hz); frame++) index = walaIndexAt(burn.times, frame / hz);
        return index;
      });
      assert.deepEqual(counts, [config.n, config.n, config.n]);
    }
  });
}

test('wala audio preserves sub-frame transients, stays finite and never clips', () => {
  const burn = createWalaBurn(WALA_CONFIGS.wala10000, 7);
  const silent = renderWalaAudio(22050, burn, 0, .12); assert.ok(silent.samples.every(v => v === 0));
  const a = renderWalaAudio(22050, burn, .64, .76), b = renderWalaAudio(22050, burn, 2, 2.12);
  assert.ok(a.end - a.first > 1); assert.ok(a.samples.some(v => Math.abs(v) > .01));
  assert.ok(a.samples.every(v => Number.isFinite(v) && Math.abs(v) < .83));
  assert.notDeepEqual(a.samples, b.samples); assert.ok(a.samples.length < 5000);
});

test('recoil is confined to instance-local room coordinates and shares one clock', () => {
  const material = new THREE.MeshStandardMaterial(), clock = { value: 1 };
  decorateWalaMaterial(material, clock);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader };
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uWalaTime, clock);
  const instance = shader.vertexShader.indexOf('instanceMatrix * mvPosition');
  const kick = shader.vertexShader.indexOf('mvPosition.xyz += iWalaKick');
  const view = shader.vertexShader.indexOf('modelViewMatrix * mvPosition');
  assert.ok(instance >= 0 && kick > instance && view > kick);
  assert.equal(shader.vertexShader.includes('#include <project_vertex>'), false);
  material.dispose();
});
