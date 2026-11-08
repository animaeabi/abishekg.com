import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { deviceQuaternion, hasOrientation, modeForPitch } from '../public/namma-vedis/orientation.mjs';

function pitchFor(beta, gamma, screenAngle = 0, alpha = 0) {
  const q = deviceQuaternion(THREE, { a: alpha, b: beta, g: gamma }, screenAngle);
  const view = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return Math.asin(Math.max(-1, Math.min(1, view.y)));
}

test('pointing down switches from sky to floor; lifting the phone switches back', () => {
  assert.equal(modeForPitch('sky', pitchFor(0, 0)), 'ground');
  assert.equal(modeForPitch('ground', pitchFor(90, 0)), 'sky');
  assert.equal(modeForPitch('ground', pitchFor(135, 0)), 'sky');
});

test('landscape orientation still distinguishes forward from down', () => {
  assert.equal(modeForPitch('ground', pitchFor(0, 90, 90)), 'sky');
  assert.equal(modeForPitch('sky', pitchFor(0, 0, 90)), 'ground');
  assert.equal(modeForPitch('ground', pitchFor(0, -90, -90)), 'sky');
});

test('turning east or west does not change ground detection', () => {
  for (const alpha of [0, 90, 180, 270]) {
    assert.equal(modeForPitch('sky', pitchFor(10, 0, 0, alpha)), 'ground');
    assert.equal(modeForPitch('ground', pitchFor(90, 0, 0, alpha)), 'sky');
  }
});

test('hysteresis keeps the tray stable near the horizon', () => {
  assert.equal(modeForPitch('sky', -.25), 'sky');
  assert.equal(modeForPitch('ground', -.25), 'ground');
  assert.equal(modeForPitch('sky', -.34), 'ground');
  assert.equal(modeForPitch('ground', -.17), 'sky');
});

test('a phone without compass heading still supplies usable tilt', () => {
  assert.equal(hasOrientation({ alpha: null, beta: 30, gamma: 0 }), true);
  assert.equal(hasOrientation({ alpha: 0, beta: null, gamma: 0 }), false);
  assert.equal(hasOrientation({ alpha: 0, beta: 30, gamma: NaN }), false);
});
