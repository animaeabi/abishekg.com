import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { palmPose, HandAnchor, handEffectScale } from '../public/namma-vedis/hand-anchor.mjs';
import { createHandTracking } from '../public/namma-vedis/hand-tracking.mjs';

function fixture(width = 390, height = 844, sourceWidth = 640, sourceHeight = 480) {
  const camera = new THREE.PerspectiveCamera(65, width / height, .05, 900);
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  points[0] = { x: 0, y: .055, z: 0 };
  for (const [base, x] of [[5, .035], [9, .012], [13, -.012], [17, -.035]]) {
    for (let j = 0; j < 4; j++) points[base + j] = { x, y: -.015 - j * .025, z: 0 };
  }
  const cover = Math.max(width / sourceWidth, height / sourceHeight);
  const covX = width / (sourceWidth * cover), covY = height / (sourceHeight * cover);
  const landmarks = points.map(p => {
    const projected = new THREE.Vector3(p.x, -p.y, -.5 - p.z).project(camera);
    return { x: .5 + projected.x * covX / 2, y: .5 - projected.y * covY / 2, z: p.z };
  });
  return { camera, args: [camera, width, height, sourceWidth, sourceHeight], result: {
    landmarks: [landmarks], worldLandmarks: [points], handedness: [[{ categoryName: 'Left', score: .99 }]],
  } };
}

test('palm position uses camera projection and cover crop in portrait and landscape', () => {
  for (const dimensions of [[390, 844, 640, 480], [844, 390, 480, 640], [390, 844, 720, 1280]]) {
    const f = fixture(...dimensions), pose = palmPose(f.result, ...f.args);
    assert.ok(pose); assert.ok(Math.abs(pose.position.z + .5) < 1e-6);
    assert.ok(Math.abs(pose.position.x) < 1e-6);
    assert.ok(Math.abs(pose.width - .07) < 1e-6);
    const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
    assert.ok(normal.z > .99, 'local floor plane faces the visible palm');
    assert.ok(Math.abs(pose.quaternion.length() - 1) < 1e-6);
  }
});

test('no hand, folded fingers, uncertain or invalid landmarks cannot become a placement surface', () => {
  const f = fixture();
  assert.equal(palmPose({}, ...f.args), null);
  for (const id of [8, 12, 16, 20]) f.result.worldLandmarks[0][id] = { ...f.result.worldLandmarks[0][0] };
  assert.equal(palmPose(f.result, ...f.args), null);
  const bad = fixture(); bad.result.landmarks[0][0].x = NaN;
  assert.equal(palmPose(bad.result, ...bad.args), null);
  const unsure = fixture(); unsure.result.handedness[0][0].score = .3;
  assert.equal(palmPose(unsure.result, ...unsure.args), null);
});

test('palm acquisition, stale data and hand identity are gated before placement', () => {
  const f = fixture(), pose = palmPose(f.result, ...f.args), anchor = new HandAnchor();
  assert.equal(anchor.update(pose, 0), false); assert.equal(anchor.update(pose, 70), false);
  assert.equal(anchor.update(pose, 140), true); anchor.lock();
  assert.equal(anchor.update({ ...pose, label: 'Right' }, 210), false);
  for (const time of [280, 350, 420]) anchor.update(pose, time);
  assert.equal(anchor.fresh(600), true); assert.equal(anchor.fresh(800), false);
  anchor.unlock(); for (const time of [850, 920, 990]) anchor.update({ ...pose, label: 'Right' }, time);
  assert.equal(anchor.ready, true);
});

test('all eight floor crackers fit the same palm, including every S-shaped wala', () => {
  const footprints = { atom: .10, sutli: .12, lakshmi: .065, flower: .152, spinner: .145, wala100: 1.7, wala1000: 2.7, wala10000: 3.9 };
  for (const [kind, size] of Object.entries(footprints)) assert.ok(Math.abs(handEffectScale(kind, .08) * size - .056) < 1e-9);
});

test('hand worker borrows the AR video, waits for its model and permits only one frame in flight', async t => {
  const saved = new Map(), sent = []; let worker, lost = 0, results = 0, stoppedTracks = 0, closed = 0;
  class Worker {
    constructor() { worker = this; }
    postMessage(data) { sent.push(data); }
    terminate() { this.terminated = true; }
    receive(data) { this.onmessage({ data }); }
  }
  const globals = { Worker, OffscreenCanvas: class {},
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) },
    createImageBitmap: async () => ({ close() { closed++; } }),
  };
  for (const [key, value] of Object.entries(globals)) { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true }); }
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const stream = { getTracks: () => [{ stop() { stoppedTracks++; } }] };
  const video = { srcObject: stream, readyState: 4, videoWidth: 640, videoHeight: 480, currentTime: 1 };
  const tracker = createHandTracking({ video, onResult: () => results++, onLost: () => lost++, onError: e => { throw e; } });
  t.after(() => tracker.stop());
  const boot = tracker.start(); tracker.tick(performance.now());
  assert.equal(sent.length, 1, 'only init, no frames before model readiness');
  worker.receive({ type: 'ready' }); await boot;
  const time = performance.now(); tracker.tick(time); await Promise.resolve();
  assert.equal(sent.filter(m => m.type === 'frame').length, 1);
  video.currentTime++; tracker.tick(time + 100); assert.equal(sent.filter(m => m.type === 'frame').length, 1);
  const frame = sent.at(-1);
  worker.receive({ type: 'result', result: {}, ...frame, type: 'result' }); assert.equal(results, 1);
  tracker.pause(); worker.receive({ ...frame, type: 'result', result: {} }); assert.equal(results, 1, 'late paused frame discarded');
  tracker.resume(); tracker.tick(time + 200); tracker.pause(); await Promise.resolve();
  assert.equal(closed, 1, 'capture completing after pause is released');
  tracker.stop(); assert.equal(worker.terminated, true); assert.ok(lost > 0);
  assert.equal(stoppedTracks, 0); assert.equal(video.srcObject, stream, 'the AR engine retains camera ownership');
});
