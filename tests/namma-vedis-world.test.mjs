import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { snapshotView, groundIntersection, applyWorldPose, PlacementGuide } from '../public/namma-vedis/world-space.mjs';
import { createWorldTracking } from '../public/namma-vedis/world-tracking.mjs';
import { AtomSequence, playAtomAftertone, ATOM_RING_DELAY, ATOM_RING_SECONDS } from '../public/namma-vedis/atom-aftertone.mjs';

test('walking and rotating changes the view, not a placed cracker or captured sky show', () => {
  const camera = new THREE.PerspectiveCamera(70, .5, .05, 900);
  camera.position.set(0, 1.4, 0); camera.updateMatrixWorld();
  const view = snapshotView(THREE, camera);
  const point = groundIntersection(THREE, camera.position, new THREE.Vector3(0, -1, -1).normalize(), 0);
  const sky = view.origin.clone().addScaledVector(view.f, 100);
  const projectedBefore = point.clone().project(camera);
  const p = camera.projectionMatrix.toArray();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .25);
  assert.equal(applyWorldPose(camera, { position: { x: 1.2, y: 1.5, z: -.3 }, rotation: q, intrinsics: p }), true);
  assert.deepEqual(point.toArray(), [0, 0, -1.4]);
  assert.deepEqual(sky.toArray(), [0, 1.4, -100]);
  assert.deepEqual(view.origin.toArray(), [0, 1.4, 0]);
  assert.ok(point.clone().project(camera).distanceTo(projectedBefore) > .1);
  // A future launch starts from the translated camera, not the scene origin.
  const next = groundIntersection(THREE, camera.position, new THREE.Vector3(0, -1, -1).normalize(), .7);
  assert.ok(Math.abs(next.x - 1.2) < 1e-10);
  assert.ok(Math.abs(next.y - .7) < 1e-10);
});

test('no floor ring is fabricated behind the camera or beyond placement range', () => {
  const origin = new THREE.Vector3(0, 1.4, 0);
  assert.equal(groundIntersection(THREE, origin, new THREE.Vector3(0, 1, 0), 0), null);
  assert.equal(groundIntersection(THREE, origin, new THREE.Vector3(0, -.04, -1).normalize(), 0), null);
});

test('a placed ring stays hidden through tracking loss, recovery, and mode changes', () => {
  const guide = new PlacementGuide();
  const state = { playing: true, ground: true, hidden: false, ready: true, hasSurface: true };
  assert.equal(guide.visible(state), true);
  guide.place();
  for (const changes of [{}, { ready: false }, { ground: false }, { hidden: true }, {}]) {
    assert.equal(guide.visible({ ...state, ...changes }), false);
  }
  guide.select();
  assert.equal(guide.visible(state), true);
  assert.equal(guide.visible({ ...state, hasSurface: false }), false);
});

test('bad pose data cannot corrupt a previously valid camera transform', () => {
  const camera = new THREE.PerspectiveCamera(); camera.position.set(2, 3, 4);
  assert.equal(applyWorldPose(camera, { position: { x: NaN, y: 0, z: 0 } }), false);
  assert.deepEqual(camera.position.toArray(), [2, 3, 4]);
});

test('SLAM owns pose/render timing; limited tracking blocks placement until recovery', async () => {
  let modules, config, run, stopped = false, clears = 0, frames = 0;
  const states = [], projections = [];
  const XR8 = {
    XrController: { configure: c => config = c, pipelineModule: () => ({ name: 'reality' }),
      updateCameraProjectionMatrix: c => projections.push(c),
      hitTest: () => [{ type: 'DETECTED_SURFACE', distance: 2, position: { x: 1, y: .7, z: -2 } }] },
    XrConfig: { device: () => ({ MOBILE: 'mobile' }), camera: () => ({ BACK: 'back' }) },
    addCameraPipelineModules: m => modules = m, run: c => run = c,
    pause() {}, resume() {}, stop() { stopped = true; }, clearCameraPipelineModules() { clears++; },
  };
  const tracker = createWorldTracking({ XR8, canvas: { width: 780, height: 1688 }, webgl2: true,
    onVideo: v => assert.equal(v, 'same-camera-video'), onPose: r => Boolean(r.position),
    onState: v => states.push(v), onFrame: () => frames++, onError: e => { throw e; } });
  const start = tracker.start(), app = modules[1];
  app.onStart(); app.onAttach({ video: 'same-camera-video' }); await start;
  assert.equal(config.disableWorldTracking, false); assert.equal(config.scale, 'absolute');
  assert.equal(run.cameraConfig.direction, 'back'); assert.equal(run.allowedDevices, 'mobile');
  assert.equal(tracker.hit(.5, .5), null);
  app.onUpdate({ processCpuResult: { reality: { position: {}, trackingStatus: 'NORMAL' } } });
  const anchor = tracker.hit(.5, .5); assert.deepEqual(anchor, { x: 1, y: .7, z: -2 });
  app.onRender(); assert.equal(frames, 1);
  app.onUpdate({ processCpuResult: { reality: { position: {}, trackingStatus: 'LIMITED' } } });
  assert.equal(tracker.hit(.5, .5), null);
  app.onUpdate({ processCpuResult: { reality: { position: {}, trackingStatus: 'NORMAL' } } });
  assert.deepEqual(anchor, { x: 1, y: .7, z: -2 });
  tracker.resize(); assert.equal(projections.length, 2);
  assert.equal('origin' in projections[1], false, 'resize must not recenter existing objects');
  tracker.stop(); assert.equal(stopped, true); assert.equal(clears, 1); assert.equal(tracker.active, false);
  assert.deepEqual(states, [true, false, true, false]);
});

test('Atom bomb stays locked through fuse and ringing, releasing only when audio ends', () => {
  const sequence = new AtomSequence(); assert.equal(sequence.begin(), true);
  assert.equal(sequence.begin(), false); sequence.burst();
  const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const oscillator = { frequency: param, connect() {}, disconnect() {}, start(t) { this.startAt = t; }, stop(t) { this.stopAt = t; } };
  const gain = { gain: param, connect() {}, disconnect() {} };
  playAtomAftertone({ currentTime: 10, createOscillator: () => oscillator, createGain: () => gain }, {}, () => sequence.finish());
  assert.equal(sequence.busy, true);
  assert.equal(oscillator.startAt, 10 + ATOM_RING_DELAY);
  assert.equal(oscillator.stopAt, 10 + ATOM_RING_DELAY + ATOM_RING_SECONDS + .05);
  assert.equal(sequence.begin(), false);
  oscillator.onended();
  assert.equal(sequence.busy, false); assert.equal(sequence.begin(), true);
});

test('silent/no-audio fallback still lets the complete Atom sequence finish', () => {
  const sequence = new AtomSequence(); sequence.begin(); sequence.burst();
  let release, delay;
  playAtomAftertone(null, null, () => sequence.finish(), (cb, ms) => { release = cb; delay = ms; });
  assert.equal(sequence.busy, true); assert.ok(delay > 2600);
  release(); assert.equal(sequence.busy, false);
});

test('a rejected AR camera start reports failure and releases pipeline resources', async () => {
  let stopped = false, cleared = false;
  const XR8 = {
    XrController: { configure() {}, pipelineModule: () => ({}), updateCameraProjectionMatrix() {} },
    XrConfig: { device: () => ({ MOBILE: 'mobile' }), camera: () => ({ BACK: 'back' }) },
    addCameraPipelineModules() {}, run() { throw new Error('Camera denied'); },
    stop() { stopped = true; }, clearCameraPipelineModules() { cleared = true; },
  };
  const tracker = createWorldTracking({ XR8, canvas: {}, onVideo() {}, onPose() {}, onFrame() {}, onState() {}, onError() {} });
  await assert.rejects(tracker.start(), /Camera denied/);
  tracker.stop();
  assert.equal(tracker.active, false); assert.equal(tracker.ready, false);
  assert.equal(stopped && cleared, true);
});
