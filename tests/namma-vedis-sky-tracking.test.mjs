import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Group, Quaternion, Vector3 } from 'three';
import { SkyTracking, skyView } from '../public/namma-vedis/sky-tracking.mjs';
import { shellStar, shellFlight, skySound } from '../public/namma-vedis/sky-physics.mjs';
const sensor = angle => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle);
const state = (q = sensor(0)) => ({ granted: true, sensor: q, now: 1000, sampleTime: 990 });
const pose = (camera, status, q = sensor(0), p = new Vector3(0, 1.4, 0)) => ({ trackingStatus: status, position: p, rotation: q, intrinsics: camera.projectionMatrix.toArray() });

test('sky starts on the first valid camera frame and permitted motion from the current session, without a floor lock', () => {
  const tracking = new SkyTracking(), camera = new PerspectiveCamera(70, .5), root = new Group();
  assert.equal(tracking.canBridge(state()), false, 'no fake camera pose before video intrinsics');
  assert.equal(tracking.accept(camera, pose(camera, 'LIMITED'), sensor(0), root), true);
  assert.equal(tracking.update(camera, state(sensor(.5))), true);
  assert.ok(camera.quaternion.angleTo(sensor(.5)) < 1e-7);
  assert.deepEqual(camera.position.toArray(), [0, 1.4, 0], 'motion does not invent positional tracking');
  assert.equal(tracking.canBridge({ ...state(), now: 100000 }), true, 'stationary phones do not need repeated orientation events');
  for (const overrides of [{ granted: false }, { sampleTime: -1 }, { sampleTime: 1100 }, { hidden: true }, { sensor: null }, { sensor: new Quaternion(NaN, 0, 0, 1) }]) {
    assert.equal(tracking.canBridge({ ...state(), ...overrides }), false);
  }
  tracking.invalidateMotion(1000);
  assert.equal(tracking.canBridge(state()), false, 'a previous tab session cannot supply motion after resume');
  assert.equal(tracking.canBridge({ ...state(), sampleTime: 1001, now: 1010 }), true);
});

test('limited tracking freezes position, preserves calibrated orientation, and ignores invalid poses', () => {
  const tracking = new SkyTracking(), camera = new PerspectiveCamera(), root = new Group();
  tracking.accept(camera, pose(camera, 'NORMAL', sensor(.4), new Vector3(3, 2, 1)), sensor(.1), root);
  tracking.accept(camera, pose(camera, 'LIMITED', sensor(2), new Vector3(100, 100, 100)), sensor(.3), root);
  tracking.update(camera, state(sensor(.3)));
  assert.deepEqual(camera.position.toArray(), [3, 2, 1]); assert.ok(camera.quaternion.angleTo(sensor(.6)) < 1e-7);
  assert.equal(tracking.accept(camera, { position: { x: NaN } }, null, root), false);
  assert.deepEqual(camera.position.toArray(), [3, 2, 1]);
});

test('recovering SLAM preserves the screen position of existing sky effects without moving floor anchors', () => {
  const tracking = new SkyTracking(), camera = new PerspectiveCamera(70, .5), root = new Group(), floor = new Group();
  const placed = new Vector3(1, 0, -2); floor.position.copy(placed);
  tracking.accept(camera, pose(camera, 'LIMITED'), null, root); tracking.update(camera, state(sensor(.3)));
  const point = skyView(camera, root, 0).origin.addScaledVector(camera.getWorldDirection(new Vector3()), 100);
  const before = point.clone().applyMatrix4(root.matrixWorld).project(camera);
  tracking.accept(camera, pose(camera, 'NORMAL', sensor(-.25), new Vector3(3, 1.8, -1)), sensor(.3), root);
  assert.ok(point.clone().applyMatrix4(root.matrixWorld).project(camera).distanceTo(before) < 1e-6);
  assert.deepEqual(floor.position.toArray(), placed.toArray());
  const rootMatrix = root.matrixWorld.clone();
  tracking.accept(camera, pose(camera, 'NORMAL', sensor(-.15), new Vector3(3.5, 1.8, -1)), sensor(.4), root);
  assert.deepEqual(root.matrixWorld.toArray(), rootMatrix.toArray(), 'normal camera motion never drags sky objects');
  assert.ok(point.clone().applyMatrix4(root.matrixWorld).project(camera).distanceTo(before) > .05);
  const localView = skyView(camera, root, 0);
  assert.ok(root.localToWorld(localView.origin.clone()).distanceTo(camera.position) < 1e-6);
  const target = localView.origin.clone().addScaledVector(localView.f, 100);
  const ndc = root.localToWorld(target).project(camera); assert.ok(Math.abs(ndc.x) < 1e-6 && Math.abs(ndc.y) < 1e-6);
});

test('late motion permission aligns to the existing world instead of snapping to magnetic north', () => {
  const tracking = new SkyTracking(), camera = new PerspectiveCamera(), root = new Group();
  tracking.accept(camera, pose(camera, 'NORMAL', sensor(.7)), null, root);
  tracking.update(camera, state(sensor(-1))); assert.ok(camera.quaternion.angleTo(sensor(.7)) < 1e-7);
  tracking.update(camera, state(sensor(-.8))); assert.ok(camera.quaternion.angleTo(sensor(.9)) < 1e-7);
});

test('shell flight decelerates vertically and reaches its exact captured burst point', () => {
  const start = new Vector3(0, 0, -80), end = new Vector3(10, 60, -100), out = new Vector3(), duration = 1.5;
  const a = shellFlight(start, end, 0, duration, out).clone();
  const b = shellFlight(start, end, .25, duration, out).clone();
  const c = shellFlight(start, end, 1.25, duration, out).clone();
  const d = shellFlight(start, end, 1.5, duration, out).clone();
  assert.deepEqual(a, start); assert.deepEqual(d, end); assert.ok(b.y - a.y > d.y - c.y);
  assert.deepEqual(shellFlight(start, end, 3, duration, out), end);
});

test('shell stars remain spherical with varied spokes, sizes, burn times, and distant reports', () => {
  let seed = 4; const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const stars = Array.from({ length: 230 }, (_, i) => shellStar(i, 230, .4, random));
  for (const star of stars) assert.ok(Math.abs(Math.hypot(star.x, star.y, star.z) - 1) < 1e-8 && star.life <= 1.08);
  assert.ok(Math.max(...stars.map(s => s.speed)) - Math.min(...stars.map(s => s.speed)) > .4);
  assert.ok(new Set(stars.map(s => s.size.toFixed(2))).size > 30);
  const near = skySound(90), far = skySound(180);
  assert.ok(far.delay > near.delay && far.gain < near.gain && far.cutoff < near.cutoff);
});
