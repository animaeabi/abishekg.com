import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Group, Vector3, Quaternion } from 'three';
import { HeadTargets, headPoses, freePose } from '../public/namma-vedis/object-placement.mjs';
import { createHandTracking } from '../public/namma-vedis/hand-tracking.mjs';

function face() {
  const lm = Array.from({ length: 478 }, () => ({ x: .5, y: .5, z: 0 }));
  lm[234] = { x: .4, y: .5, z: 0 }; lm[454] = { x: .6, y: .5, z: 0 };
  lm[10] = { x: .5, y: .3, z: 0 }; lm[152] = { x: .5, y: .7, z: 0 };
  return { faceLandmarks: [lm] };
}
test('head crown projection matches video cover crop in portrait and landscape', () => {
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const camera = new PerspectiveCamera(67, w / h, .05, 900);
    const [pose] = headPoses(face(), camera, w, h, 640, 480);
    assert.ok(pose); assert.ok(pose.position.z < -.25); assert.ok(pose.position.z > -3.5);
    const projected = pose.position.clone().project(camera), cover = Math.max(w / 640, h / 480);
    const expected = (.5 - (.3 - .4 * .2)) * 2 / (h / (480 * cover));
    assert.ok(Math.abs(projected.x) < 1e-8); assert.ok(Math.abs(projected.y - expected) < 1e-8);
    assert.ok(pose.quaternion.angleTo(new Quaternion()) < 1e-8);
  }
});
test('invalid, distant and profile faces never create a placement target', () => {
  const camera = new PerspectiveCamera(67, 1, .05, 900), args = [camera, 512, 512, 512, 512];
  assert.deepEqual(headPoses({}, ...args), []);
  const broken = face(); broken.faceLandmarks[0][10].x = NaN;
  assert.deepEqual(headPoses(broken, ...args), []);
  const far = face(); far.faceLandmarks[0][234].x = .499; far.faceLandmarks[0][454].x = .501;
  assert.deepEqual(headPoses(far, ...args), []);
  const profile = face(); profile.faceLandmarks[0][454].z = 1;
  assert.deepEqual(headPoses(profile, ...args), []);
});
test('head association needs stable observations, tolerates brief loss, and never assigns a departed ID to a new face', () => {
  const tracker = new HeadTargets(), [pose] = headPoses(face(), new PerspectiveCamera(67, 1), 512, 512, 512, 512);
  tracker.update([pose], 0); assert.equal(tracker.at(.5, .5, 0), null); assert.ok(tracker.candidateAt(.5, .5, 0));
  tracker.update([pose], 110); tracker.update([pose], 220);
  const id = tracker.at(.5, .5, 220).id;
  tracker.update([], 330); tracker.update([pose], 440); assert.equal(tracker.at(.5, .5, 440).id, id);
  assert.equal(tracker.at(.1, .1, 440), null);
  tracker.update([], 1000); tracker.update([pose], 1110); assert.notEqual(tracker.targets[0].id, id);
  assert.equal(tracker.get(id, 1110), null);
});
test('ambiguous crossing faces receive new IDs rather than stealing an active attachment', () => {
  const tracker = new HeadTargets(), [pose] = headPoses(face(), new PerspectiveCamera(67, 1), 512, 512, 512, 512);
  tracker.update([{ ...pose, center: { x: .48, y: .5 } }, { ...pose, center: { x: .52, y: .5 } }], 0);
  const old = tracker.targets.map(t => t.id); tracker.update([pose], 110);
  assert.ok(!old.includes(tracker.targets[0].id));
});
test('free placement captures a finite fixed position in the reconciled frame', () => {
  const camera = new PerspectiveCamera(67, 390 / 844), frame = new Group();
  camera.position.set(1, 1.4, 3); camera.rotation.set(-.2, .4, 0); camera.updateMatrixWorld();
  frame.position.set(2, 0, 1); frame.rotation.y = .3; frame.updateMatrixWorld();
  const pose = freePose(camera, .5, .4, 1.2, frame), room = frame.localToWorld(pose.position.clone());
  assert.ok(Math.abs(room.distanceTo(camera.position) - 1.2) < 1e-8);
  const initial = pose.position.clone(); camera.position.x += 4; camera.updateMatrixWorld();
  assert.deepEqual(pose.position, initial);
  assert.equal(freePose(camera, .5, .4, NaN, frame), null);
});
test('hand and head workers share one inference slot fairly and a failed head worker cannot stop the hand', async t => {
  const saved = new Map(), workers = [], gate = {}, errors = [];
  class Worker {
    sent = []; constructor() { workers.push(this); }
    postMessage(data) { this.sent.push(data); }
    terminate() { this.terminated = true; }
    receive(data) { this.onmessage({ data }); }
  }
  const globals = { Worker, OffscreenCanvas: class {}, document: { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) }, createImageBitmap: async () => ({ close() {} }) };
  for (const [key, value] of Object.entries(globals)) { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true }); }
  t.after(() => { for (const [key, desc] of saved) { if (desc) Object.defineProperty(globalThis, key, desc); else delete globalThis[key]; } });
  const video = { readyState: 4, videoWidth: 640, videoHeight: 480, currentTime: 1 };
  const make = () => createHandTracking({ video, inferenceGate: gate, onResult() {}, onLost() {}, onError: e => errors.push(e) });
  const hand = make(), head = make(); t.after(() => { hand.stop(); head.stop(); });
  const boots = [hand.start(), head.start()]; workers.forEach(w => w.receive({ type: 'ready' })); await Promise.all(boots);
  const now = performance.now(); hand.tick(now); head.tick(now); await Promise.resolve();
  assert.equal(workers[0].sent.length, 2); assert.equal(workers[1].sent.length, 1);
  workers[0].receive({ ...workers[0].sent.at(-1), type: 'result', result: {} });
  video.currentTime++; hand.tick(now + 200); head.tick(now + 200); await Promise.resolve();
  assert.equal(workers[0].sent.length, 2, 'hand yields a pending slot to the head'); assert.equal(workers[1].sent.length, 2);
  workers[1].receive({ type: 'error', message: 'head model failed' });
  video.currentTime++; hand.tick(now + 400); await Promise.resolve();
  assert.equal(hand.active, true); assert.equal(head.active, false); assert.equal(workers[0].sent.length, 3); assert.equal(errors.length, 1);
});
