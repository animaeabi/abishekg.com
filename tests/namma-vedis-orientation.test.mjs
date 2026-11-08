import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { deviceQuaternion, hasOrientation, modeForPitch } from '../public/namma-vedis/orientation.mjs';

function pitchFor(beta, gamma, screenAngle = 0, alpha = 0) {
  const q = deviceQuaternion(THREE, { a: alpha, b: beta, g: gamma }, screenAngle);
  const view = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return Math.asin(Math.max(-1, Math.min(1, view.y)));
}

test('pointing down or straight ahead selects floor; a deliberate upward tilt selects sky', () => {
  assert.equal(modeForPitch('sky', pitchFor(0, 0)), 'ground');
  for (const current of ['ground', 'sky']) {
    for (const beta of [75, 90, 100]) assert.equal(modeForPitch(current, pitchFor(beta, 0)), 'ground');
  }
  assert.equal(modeForPitch('ground', pitchFor(120, 0)), 'sky');
  assert.equal(modeForPitch('ground', pitchFor(135, 0)), 'sky');
});

test('both landscape orientations keep level views on the floor and upward views in the sky', () => {
  for (const side of [1, -1]) {
    for (const current of ['ground', 'sky']) {
      assert.equal(modeForPitch(current, pitchFor(0, 90 * side, 90 * side)), 'ground');
    }
    assert.equal(modeForPitch('sky', pitchFor(0, 0, 90 * side)), 'ground');
    assert.equal(modeForPitch('ground', pitchFor(180, 60 * side, 90 * side)), 'sky');
  }
});

test('turning east or west does not change ground detection', () => {
  for (const alpha of [0, 90, 180, 270]) {
    assert.equal(modeForPitch('sky', pitchFor(10, 0, 0, alpha)), 'ground');
    assert.equal(modeForPitch('sky', pitchFor(90, 0, 0, alpha)), 'ground');
    assert.equal(modeForPitch('ground', pitchFor(120, 0, 0, alpha)), 'sky');
  }
});

test('separate upward thresholds keep the tray stable while level always returns to floor', () => {
  const radians = Math.PI / 180;
  let mode = 'ground';
  for (const degrees of [-20, 0, 10, 18, 23, 21, 23.9]) {
    mode = modeForPitch(mode, degrees * radians); assert.equal(mode, 'ground');
  }
  mode = modeForPitch(mode, 24 * radians); assert.equal(mode, 'sky');
  for (const degrees of [26, 23, 18, 13, 12.1]) {
    mode = modeForPitch(mode, degrees * radians); assert.equal(mode, 'sky');
  }
  assert.equal(modeForPitch(mode, 12 * radians), 'ground');
  assert.equal(modeForPitch('sky', 0), 'ground');
});

test('a phone without compass heading still supplies usable tilt', () => {
  assert.equal(hasOrientation({ alpha: null, beta: 30, gamma: 0 }), true);
  assert.equal(hasOrientation({ alpha: 0, beta: null, gamma: 0 }), false);
  assert.equal(hasOrientation({ alpha: 0, beta: 30, gamma: NaN }), false);
});
