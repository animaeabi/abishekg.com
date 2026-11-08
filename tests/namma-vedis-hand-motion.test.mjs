import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion, PerspectiveCamera } from 'three';
import { HandObjectMotion } from '../public/namma-vedis/hand-motion.mjs';

const make = (kind = 'atom') => new HandObjectMotion({ position: new Vector3(0, 1.2, -1),
  quaternion: new Quaternion(), floorY: 0, kind, now: 0 });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} vs ${b}`);

test('steady hand, small jitter and single-frame depth jumps do not throw a bomb', () => {
  const m = make();
  for (let time = 70; time <= 700; time += 70) {
    m.sample(new Vector3(Math.sin(time) * .004, 1.2, -1), new Quaternion(), time); m.step(.07, time);
  }
  assert.equal(m.state, 'held');
  m.sample(new Vector3(1, 3, -4), new Quaternion(), 770);
  assert.equal(m.state, 'held'); assert.ok(m.position.distanceTo(new Vector3(0, 1.2, -1)) < .01);
});

test('a brief dropout holds position; continued loss drops instead of hiding or teleporting', () => {
  const m = make('flower'); m.step(.1, 100); assert.equal(m.state, 'held'); near(m.position.y, 1.2);
  m.step(.01, 250); assert.equal(m.state, 'airborne'); assert.ok(m.position.y > 1.19);
  for (let i = 0; i < 60; i++) m.step(1 / 60, 270 + i * 1000 / 60);
  assert.equal(m.state, 'landed'); near(m.position.y, 0); near(m.quaternion.angleTo(new Quaternion()), 0);
});

test('relative tilt releases a fountain after a short dwell, then returning hands cannot move it', () => {
  const m = make('flower'), tilted = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), .36);
  m.sample(m.position, new Quaternion(), 210); m.sample(m.position, tilted, 280);
  assert.equal(m.state, 'held'); m.sample(m.position, tilted, 350); assert.equal(m.state, 'airborne');
  for (let i = 0; i < 60; i++) m.step(1 / 60, 350 + i * 1000 / 60);
  const landed = m.position.clone(); m.sample(new Vector3(1, 2, -3), new Quaternion(), 1400);
  assert.deepEqual(m.position.toArray(), landed.toArray()); near(m.quaternion.angleTo(new Quaternion()), 0);
});

test('upward throw inherits room velocity and follows the same trajectory across refresh rates', () => {
  const trajectories = [30, 60, 120].map(hz => {
    const m = make();
    for (const time of [70, 140, 210, 280]) m.sample(new Vector3(0, 1.2, -1), new Quaternion(), time);
    for (const [time, y] of [[350, 1.3], [420, 1.4]]) m.sample(new Vector3(0, y, -1), new Quaternion(), time);
    assert.equal(m.state, 'airborne'); assert.ok(m.velocity.y > 2);
    for (let i = 0; i < hz / 5; i++) m.step(1 / hz, 420 + (i + 1) * 1000 / hz);
    return m.position.y;
  });
  near(trajectories[0], trajectories[1]); near(trajectories[1], trajectories[2]);
});

test('burst freezes a flight origin and does not reattach to a hand', () => {
  const m = make(); m.release(0); m.step(.1, 100); m.burst(); const origin = m.position.clone();
  m.step(.5, 600); m.sample(new Vector3(4, 2, -3), new Quaternion(), 700);
  assert.equal(m.state, 'spent'); assert.deepEqual(m.position.toArray(), origin.toArray());
});

test('a camera moving around a still hand does not create throwing velocity', () => {
  const m = make(), hand = m.position.clone(), camera = new PerspectiveCamera();
  for (let time = 70; time < 1500; time += 70) {
    camera.position.set(time / 1000, 1.4, .2); camera.rotation.y = time / 4000; camera.updateMatrixWorld();
    const local = hand.clone().applyMatrix4(camera.matrixWorldInverse);
    const localQ = camera.quaternion.clone().invert();
    m.sample(local.applyMatrix4(camera.matrixWorld), camera.quaternion.clone().multiply(localQ), time);
    m.step(.07, time);
  }
  assert.equal(m.state, 'held'); assert.ok(m.velocity.length() < 1e-9);
});

test('floor impact position is independent of refresh rate and always upright', () => {
  const positions = [30, 60, 120].map(hz => {
    const m = make(); m.velocity.set(1.1, 1.5, -.8); m.release(0, true);
    for (let i = 0; i < 3 * hz; i++) m.step(1 / hz, (i + 1) * 1000 / hz);
    assert.equal(m.state, 'landed'); near(m.quaternion.angleTo(new Quaternion()), 0); return m.position;
  });
  assert.ok(positions[0].distanceTo(positions[1]) < 1e-7); assert.ok(positions[1].distanceTo(positions[2]) < 1e-7);
});

test('an isolated depth spike cannot throw the bomb, including when tracking is then lost', () => {
  const m = make();
  for (const time of [70, 140, 210, 280]) m.sample(new Vector3(0, 1.2, -1), new Quaternion(), time);
  m.sample(new Vector3(0, 1.2, -.8), new Quaternion(), 350);
  assert.equal(m.state, 'held'); m.step(.01, 600);
  assert.equal(m.state, 'airborne'); near(m.velocity.x, 0); near(m.velocity.z, 0);
});

test('flight and a held burst start at the stabilized visible object with no measurement snap', () => {
  for (const action of ['release', 'burst']) {
    const m = make(), visible = new Vector3(.03, 1.18, -.98), q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), .1);
    m.setHeldVisual(visible, q); m[action](100);
    assert.deepEqual(m.position.toArray(), visible.toArray()); near(m.quaternion.angleTo(q), 0);
  }
});
