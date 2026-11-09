// CPU integration checks for the real application, with only DOM drawing and
// WebGL rendering stubbed. These do not claim physical-camera/SLAM validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as RealThree from 'three';

test('actual app: placement, new ground effects, release regressions and mixed-effect stress', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const noop = () => {};
  const context = new Proxy({
    createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 600 }), getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
  }, { get: (o, k) => k in o ? o[k] : noop });
  function element() {
    return { width: 390, height: 844, clientWidth: 390, clientHeight: 844, style: {}, dataset: {}, children: [], handlers: {},
      classList: { add: noop, remove: noop }, hidden: false, scrollLeft: 0,
      getContext: () => context, setAttribute: noop, addEventListener(name, cb) { this.handlers[name] = cb; },
      appendChild(child) { this.children.push(child); }, closest: () => null,
    };
  }
  const elements = new Map(), events = new Map(), documentEvents = new Map();
  const onEvent = (name, callback) => { if (!events.has(name)) events.set(name, []); events.get(name).push(callback); };
  const doc = { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, addEventListener(name, callback) { documentEvents.set(name, callback); } };
  const properties = new WeakMap();
  class Renderer {
    capabilities = { isWebGL2: true };
    properties = { get(o) { if (!properties.has(o)) properties.set(o, {}); return properties.get(o); } };
    setClearColor() {} setPixelRatio() {} setSize() {} render() {} resetState() {} dispose() {}
  }
  const globals = { __nammaTestThree: { ...RealThree, WebGLRenderer: Renderer }, document: doc,
    window: { isSecureContext: true }, navigator: {}, location: { search: '' }, screen: {},
    matchMedia: () => ({ matches: false }), addEventListener: onEvent, requestAnimationFrame: noop, devicePixelRatio: 1 };
  const previous = new Map();
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const path = new URL('../public/namma-vedis/app.js', import.meta.url);
  let source = await readFile(path, 'utf8');
  source = source.replace("import * as THREE from 'three';", 'const THREE = globalThis.__nammaTestThree;');
  source = source.replace(/from '(\.\/[^']+)'/g, (_, p) => `from '${new URL(p, path).href}'`);
  source += `\nexport const qa = { headTargets, objectWorld, objectFrame, objectGuide, placeObject, updateObjectPlacement, exitFreePlacement,
    get objectPlacement() { return objectPlacement; }, syncObjectAudio,
    useObjectAudio(context) { objectAudio = context ? { actx: context, master: context.createGain() } : null; },
    heads(poses) { for (const offset of [-220, -110, 0]) headTargets.update(poses, last + offset); },
    get now() { return last; },
    camera, world, skyWorld, skyTracking, palmWorld, handGuide, handAnchor, ring, emitters, P, S, pulses, selected, atomSequence, placementGuide,
    get pointerDown() { return Boolean(press); }, get motion() { return palmMotion; },
    sensor(enabled, stale = false) { gyro = enabled; orient.ok = enabled; orient.a = 0; orient.b = 140; orient.g = 0; orient.time = performance.now() - (stale ? 1000 : 0); if (stale) skyTracking.invalidateMotion(performance.now() - 500); },
    useSkyAudio(context) { skyAudio = context ? { actx: context, master: context.createGain() } : null; }, get lettering() { return activeLettering; }, get queuedWish() { return pendingSkyWish; }, cancelPalmEffect, syncAudioPlayback, sparkMat, smokeMat, outHand, sHand, handState,
    fireAt, setMode, updateCamera, updateRing, step, queueSkyWish, writeSky, scatterPaper, updateSmoke, sSize, smokeGeo, trackingState,
    flowerPot, sanguchakram, wala, WALAS, royalShow, finale, rocket, twelveShot, peony, chrysanthemum, goldenRain, crackling, diamondBurst, launch, tone, noise,
    init() { playing = true; floorY = 0; worldTracking = { active: true, ready: true, hit: () => null, resize() {} }; },
    setFloor(y) { floorY = y; },
    setTracker(tracker) { worldTracking = tracker; },
    useAudio(context) { actx = context; master = context?.createGain(); verbIn = context?.createGain(); noiseBuf = {}; },
    useHandAudio(context) { handAudio = context ? { actx: context, master: context.createGain() } : null; },
    palm(pose) { for (let i = 0; i < 3; i++) handAnchor.update(pose, last); handState(); },
    clearParticles() { P.life.fill(0); S.life.fill(0); head = 0; sHead = 0; },
    simulate(seconds, hz = 60) { for (let j = 0; j < Math.ceil(seconds * hz); j++) step(last + 1000 / hz); },
    simulateHand(seconds, hz = 60) { for (let j = 0; j < Math.ceil(seconds * hz); j++) { handAnchor.lastSeen = last + 1000 / hz; step(last + 1000 / hz); } },
    stats() { return { sparks: sparkGeo.instanceCount, smoke: smokeGeo.instanceCount, emitters: emitters.length, objects: world.children.length + skyWorld.children.length }; },
    tick(dt) { for (let i = emitters.length - 1; i >= 0; i--) if (!emitters[i].update(dt)) emitters.splice(i, 1); },
  };`;
  const { qa } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  await t.test('tracked level view stays on the floor tray and upward tilt switches without chatter', () => {
    qa.init(); qa.setMode('sky');
    for (const pitch of [0, -.1, .15, .3, .4]) {
      qa.camera.rotation.set(pitch, .7, .2, 'YXZ'); qa.updateCamera(1 / 60);
      assert.equal(elements.get('picker').dataset.tray, 'ground');
      assert.equal(elements.get('mode').textContent, 'Floor · AR');
    }
    qa.camera.rotation.set(.55, .7, .2, 'YXZ'); qa.updateCamera(1 / 60);
    assert.equal(elements.get('picker').dataset.tray, 'sky');
    qa.camera.rotation.set(.3, .7, .2, 'YXZ'); qa.updateCamera(1 / 60);
    assert.equal(elements.get('picker').dataset.tray, 'sky');
    qa.camera.rotation.set(0, .7, .2, 'YXZ'); qa.updateCamera(1 / 60);
    assert.equal(elements.get('picker').dataset.tray, 'ground');
    // The camera-free demo's mode button still clears the new sky threshold.
    qa.setTracker(null); elements.get('mode').handlers.click(); qa.updateCamera(1 / 60);
    assert.equal(elements.get('picker').dataset.tray, 'sky');
    elements.get('mode').handlers.click(); qa.updateCamera(1 / 60);
    assert.equal(elements.get('picker').dataset.tray, 'ground');
  });
  qa.init(); qa.camera.position.set(0, 1.4, 0); qa.camera.rotation.x = -.7; qa.camera.updateMatrixWorld();
  qa.setMode('ground'); qa.updateRing(1); assert.equal(qa.ring.visible, true);
  qa.fireAt(195, 422); assert.equal(qa.ring.visible, false); assert.equal(qa.atomSequence.phase, 'fuse');
  const emitterCount = qa.emitters.length;
  qa.fireAt(195, 422); assert.equal(qa.emitters.length, emitterCount, 'repeat Atom tap blocked');
  qa.setMode('sky'); qa.fireAt(195, 200); assert.equal(qa.emitters.length, emitterCount, 'sky launch blocked');
  elements.get('wishBtn').handlers.click(); assert.equal(qa.emitters.length, emitterCount, 'sky lettering blocked');
  // Changing the next surface must not lift a burning cracker, its scorch, or debris.
  qa.setFloor(.9); qa.camera.position.x = 1; qa.camera.updateMatrixWorld();
  qa.tick(1.8); assert.equal(qa.atomSequence.phase, 'ringing');
  assert.ok(qa.pulses.length > 0); assert.equal(qa.pulses.at(-1).groundY, 0);
  const paper = [...qa.S.life].findIndex((life, i) => life > 0 && qa.S.hard[i] > .5);
  assert.ok(paper >= 0); assert.equal(qa.S.groundY[paper], 0);
  const scorch = qa.world.children.find(o => o.material?.map && o.position.y === .003);
  assert.ok(scorch, 'scorch stays on original floor');
  const originalScorch = scorch.position.clone();
  qa.camera.position.set(2, 1.4, -1); qa.camera.rotation.y = .5; qa.camera.updateMatrixWorld();
  assert.deepEqual(scorch.position.toArray(), originalScorch.toArray());
  qa.setMode('ground'); qa.updateRing(2); assert.equal(qa.ring.visible, false);
  t.mock.timers.tick(2600); assert.equal(qa.atomSequence.busy, true);
  t.mock.timers.tick(100); assert.equal(qa.atomSequence.busy, false);
  qa.selected.ground = 'sutli'; qa.fireAt(195, 422);
  assert.ok(qa.emitters.some(e => e.ground), 'next cracker is accepted after the ringing tail');
  // Delayed sky lettering must use the original view, even if the user turns.
  qa.setMode('sky'); qa.camera.rotation.set(0, 0, 0); qa.camera.position.set(2, 1.4, -1); qa.camera.updateMatrixWorld();
  qa.queueSkyWish(1); qa.camera.position.set(20, 1.4, 10); qa.camera.rotation.y = Math.PI; qa.camera.updateMatrixWorld();
  qa.tick(1.1);
  const text = qa.skyWorld.children.find(o => o.isPoints);
  assert.ok(text); assert.ok(text.geometry.attributes.position.array[2] < -90, 'lettering remains in the original sky direction');

  // The large S-shaped string is an actual 10,000-instance anchored object.
  qa.setMode('ground'); qa.setFloor(0); qa.camera.position.set(0, 1.4, 0);
  qa.camera.rotation.set(-.7, 0, 0); qa.camera.updateMatrixWorld();
  qa.selected.ground = 'wala10000'; qa.fireAt(195, 422);
  const string = qa.world.getObjectByName('wala-10000');
  assert.ok(string?.isInstancedMesh); assert.equal(string.count, 10000);
  assert.ok(string.material.every(m => m.isMeshStandardMaterial && !m.transparent && m.depthWrite));
  assert.equal(string.geometry.attributes.iWalaAt.count, 10000);
  assert.equal(string.geometry.attributes.iWalaKick.count, 10000);
  assert.ok(string.instanceColor, 'individual paper shades break up the repeated bodies');
  assert.equal(qa.ring.visible, false);
  const matrices = string.instanceMatrix.array.slice(), version = string.instanceMatrix.version;
  const largeCount = qa.emitters.filter(e => e.largeWala).length;
  assert.equal(qa.fireAt(195, 422), false); assert.equal(qa.emitters.filter(e => e.largeWala).length, largeCount);
  qa.camera.position.set(2, 1.4, 1); qa.camera.rotation.y = 1; qa.camera.updateMatrixWorld();
  qa.tick(1);
  assert.ok(string.count < 10000 && string.count > 9000, 'burn advances through individual crackers');
  assert.deepEqual(string.instanceMatrix.array, matrices, 'camera movement and burning never rewrite placed transforms');
  assert.equal(string.instanceMatrix.version, version, 'no full matrix uploads during burning');
  qa.tick(42);
  assert.equal(qa.world.getObjectByName('wala-10000'), undefined);
  assert.equal(qa.world.getObjectByName('wala-fuse-10000'), undefined);
  assert.equal(qa.world.getObjectByName('wala-ash-10000'), undefined, 'charred cord finishes its afterglow and is disposed');
  assert.equal(qa.emitters.some(e => e.largeWala), false, 'completed string frees the next 10,000 launch');
  qa.simulate(45);

  await t.test('flower pot builds a sustained fountain, stays anchored and cleans up', () => {
    qa.init(); qa.setMode('ground'); qa.camera.position.set(0, 1.4, 0); qa.camera.rotation.set(-.7, 0, 0); qa.camera.updateMatrixWorld();
    qa.selected.ground = 'flower'; qa.fireAt(195, 422);
    const pot = qa.world.getObjectByName('cracker-flower'), emitter = qa.emitters.find(e => e.flower);
    assert.ok(pot && emitter); assert.equal(emitter.phase, 'fuse'); assert.equal(qa.ring.visible, false);
    const original = pot.position.clone(); qa.simulate(1.6);
    assert.equal(emitter.phase, 'fountain');
    assert.ok([...qa.P.vy].some((v, i) => qa.P.life[i] > 0 && v > 3), 'upward fountain jets');
    qa.camera.position.set(2, 1.4, -1); qa.camera.rotation.y = .8; qa.camera.updateMatrixWorld(); qa.setFloor(.8);
    qa.simulate(4); assert.deepEqual(pot.position.toArray(), original.toArray());
    assert.equal(emitter.phase, 'fountain', 'a sustained fountain, not a bomb that disappears');
    for (let i = 0; i < qa.P.life.length; i++) if (qa.P.life[i] > 0 && (qa.P.flag[i] & 4)) assert.equal(qa.P.groundY[i], 0);
    qa.simulate(5.2); assert.equal(emitter.phase, 'cooling'); assert.equal(pot.getObjectByName('burning-fuse-tip').visible, false);
    qa.simulate(4); assert.equal(qa.world.getObjectByName('cracker-flower'), undefined); assert.equal(qa.emitters.some(e => e.flower), false);
    qa.setFloor(0);
  });

  await t.test('Sanguchakram rotates around its fixed center and emits low circular sparks', () => {
    qa.clearParticles(); const point = new RealThree.Vector3(1, 0, -2); qa.sanguchakram(point);
    const disc = qa.world.getObjectByName('cracker-spinner'), emitter = qa.emitters.find(e => e.spinner);
    qa.simulate(1.5); assert.equal(emitter.phase, 'spinning');
    const angle = disc.rotation.y; qa.camera.position.x += 2; qa.camera.updateMatrixWorld(); qa.simulate(.4);
    assert.notEqual(disc.rotation.y, angle); assert.deepEqual(disc.position.toArray(), point.toArray());
    const live = [...qa.P.life].map((life, i) => life > 0 && (qa.P.flag[i] & 4) ? i : -1).filter(i => i >= 0);
    assert.ok(live.length > 60); assert.ok(live.every(i => qa.P.y[i] < .2), 'spinner stays close to the floor');
    assert.ok(live.some(i => qa.P.x[i] < point.x) && live.some(i => qa.P.x[i] > point.x));
    assert.ok(live.some(i => qa.P.z[i] < point.z) && live.some(i => qa.P.z[i] > point.z));
    qa.simulate(6.2); assert.equal(emitter.phase, 'cooling'); const stoppedAngle = disc.rotation.y;
    qa.simulate(.5); assert.equal(disc.rotation.y, stoppedAngle);
    qa.simulate(3); assert.equal(qa.world.getObjectByName('cracker-spinner'), undefined);
  });

  await t.test('sky burst size is invariant to world-origin translation and captures launch origin', () => {
    const random = Math.random; Math.random = () => .5;
    try {
      for (const burst of [qa.peony, qa.chrysanthemum, qa.goldenRain, qa.crackling, qa.diamondBurst]) {
        qa.clearParticles(); burst(new RealThree.Vector3(0, 35, -100), true, 1, new RealThree.Vector3(0, 1.4, 0));
        const sizes = qa.P.size.slice(), velocities = qa.P.vx.slice();
        qa.clearParticles(); burst(new RealThree.Vector3(180, 35, -40), true, 1, new RealThree.Vector3(180, 1.4, 60));
        assert.deepEqual(qa.P.size, sizes); assert.deepEqual(qa.P.vx, velocities);
      }
      qa.camera.position.set(2, 1.4, 3); qa.camera.updateMatrixWorld(); let received;
      qa.launch(new RealThree.Vector3(2, 35, -100), (_p, _s, _scale, origin) => { received = origin; }, .5, true);
      qa.camera.position.set(50, 1.4, 50); qa.tick(.6); assert.deepEqual(received.toArray(), [2, 1.4, 3]);
    } finally { Math.random = random; }
  });

  await t.test('settled paper lies flat while lettering animates on the GPU without vertex uploads', () => {
    qa.clearParticles(); qa.scatterPaper(1, .1, -2, 4, .1, 10, 0); qa.updateSmoke(1);
    assert.equal(qa.smokeGeo.instanceCount, 4);
    for (let i = 0; i < 4; i++) assert.equal(qa.sSize[i * 3 + 2], 2);
    const positions = qa.S.x.slice(0, 4); qa.camera.rotation.y += 1; qa.camera.updateMatrixWorld(); qa.updateSmoke(.1);
    assert.deepEqual(qa.S.x.slice(0, 4), positions);
    qa.writeSky(); qa.tick(1.3); const letters = qa.skyWorld.children.find(o => o.isPoints);
    const version = letters.geometry.attributes.position.version, fixed = letters.geometry.attributes.position.array.slice();
    const clock = letters.material.uniforms.uTime.value;
    qa.tick(.4); assert.ok(letters.material.uniforms.uTime.value > clock);
    assert.equal(letters.geometry.attributes.position.version, version); assert.deepEqual(letters.geometry.attributes.position.array, fixed);
    qa.simulate(15);
  });

  await t.test('all grand shows reserve the lettering for after their final shells and spark tails', () => {
    for (const show of [() => qa.finale(), ...['hukum', 'thangam', 'diamond'].map(kind => () => qa.royalShow(kind))]) {
      qa.init(); qa.clearParticles(); show();
      let firstWriting = null;
      for (let frame = 0; frame < 30 * 60; frame++) {
        qa.simulate(1 / 60);
        const lettering = qa.skyWorld.getObjectByName('sky-writing');
        if (qa.emitters.some(e => e.sky)) assert.equal(lettering, undefined, 'no wording while a shell is climbing or its stars remain');
        if (lettering && firstWriting === null) firstWriting = frame / 60;
      }
      assert.ok(firstWriting > 9 && firstWriting < 16, 'the finale follows the completed show, not its old six-second timer');
      assert.equal(qa.lettering, null); assert.equal(qa.queuedWish, null);
      assert.equal(qa.emitters.length, 0, 'writing, comets, and pending requests clean up');
    }
  });

  await t.test('the wish button waits for long golden trails, deduplicates taps, and restarts after a new rocket', () => {
    qa.init(); qa.clearParticles(); qa.camera.rotation.set(0, 0, 0); qa.camera.updateMatrixWorld();
    const target = qa.camera.position.clone().add(new RealThree.Vector3(0, 30, -100));
    qa.launch(target, qa.goldenRain, .5, true);
    for (let i = 0; i < 5; i++) elements.get('wishBtn').handlers.click();
    qa.simulate(5);
    assert.equal(qa.lettering, null);
    assert.equal(qa.emitters.filter(e => e.skyWish && !e.cancelled).length, 1);
    qa.simulate(1.8); assert.ok(qa.lettering);
    const old = qa.skyWorld.getObjectByName('sky-writing'), originalView = qa.lettering.view;
    let disposed = 0; old.geometry.addEventListener('dispose', () => disposed++); old.material.addEventListener('dispose', () => disposed++);
    qa.rocket(target);
    assert.equal(qa.lettering, null); assert.equal(old.parent, null); assert.equal(disposed, 2);
    qa.camera.rotation.y = 1; qa.camera.position.x += 3; qa.camera.updateMatrixWorld();
    qa.simulate(4); assert.equal(qa.lettering, null, 'no writing while the new rocket still burns');
    qa.simulate(2); assert.ok(qa.lettering); assert.equal(qa.lettering.view, originalView, 'restart stays at the original world location');
    qa.simulate(8); assert.equal(qa.emitters.length, 0);
  });

  await t.test('sparks trace letters progressively, pause with tracking, dissipate and release GPU resources', () => {
    qa.init(); qa.clearParticles(); qa.queueSkyWish(); qa.simulate(1 / 60);
    const object = qa.skyWorld.getObjectByName('sky-writing'), { plan } = qa.lettering;
    const births = object.geometry.attributes.aBirth.array;
    let disposed = 0; object.geometry.addEventListener('dispose', () => disposed++); object.material.addEventListener('dispose', () => disposed++);
    qa.simulate(.7);
    assert.ok([...births].every(b => b > object.material.uniforms.uTime.value), 'rising comets precede any wording');
    qa.simulate(1.5);
    const clock = object.material.uniforms.uTime.value, appeared = [...births].filter(b => b <= clock).length;
    assert.ok(appeared > 0 && appeared < births.length, 'only the traversed parts of each letter are lit');
    const fixed = object.geometry.attributes.position.array.slice();
    qa.setTracker({ active: true, ready: false, hit: () => null }); qa.simulate(2);
    assert.equal(object.material.uniforms.uTime.value, clock, 'tracking loss must not skip writing or dissolution');
    qa.setTracker({ active: true, ready: true, hit: () => null });
    qa.camera.rotation.y += 1; qa.camera.position.x += 2; qa.camera.updateMatrixWorld();
    qa.simulate(plan.dissolveAt - clock + .1);
    assert.equal(qa.emitters.find(e => e.skyWriting).phase, 'dissolving');
    assert.deepEqual(object.geometry.attributes.position.array, fixed, 'walking does not move the world-space letter targets');
    assert.ok(object.material.uniforms.uTime.value > object.material.uniforms.uDissolve.value);
    qa.simulate(3); assert.equal(qa.lettering, null); assert.equal(object.parent, null); assert.equal(disposed, 2);
  });

  await t.test('three fountains, three spinners, 10,000 wala and a grand show remain bounded', () => {
    qa.init(); qa.clearParticles(); qa.camera.position.set(0, 1.4, 0); qa.camera.rotation.set(-.7, 0, 0); qa.camera.updateMatrixWorld(); qa.setMode('ground');
    for (const id of ['flower', 'spinner']) {
      qa.selected.ground = id;
      for (let i = 0; i < 3; i++) qa.fireAt(180 + i * 10, 422);
      assert.equal(qa.fireAt(195, 422), false, 'fourth continuous effect is capped');
    }
    qa.selected.ground = 'wala10000'; qa.fireAt(195, 422); qa.royalShow('hukum');
    const peak = { sparks: 0, smoke: 0, emitters: 0, objects: 0 };
    for (let i = 0; i < 45 * 60; i++) {
      qa.simulate(1 / 60); const stats = qa.stats();
      for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], stats[key]);
    }
    assert.ok(peak.sparks <= 10000 && peak.smoke <= 1400 && peak.objects < 45 && peak.emitters < 40);
    assert.ok(qa.P.x.every(Number.isFinite) && qa.S.y.every(Number.isFinite));
    assert.equal(qa.emitters.length, 0); assert.equal(qa.world.children.some(o => o.name.startsWith('cracker-') || o.name.startsWith('wala-')), false);
    t.diagnostic('CPU mixed-effect peak (not device FPS): ' + JSON.stringify(peak));
  });

  await t.test('finished sounds disconnect every per-sound audio node', () => {
    const nodes = [], param = () => ({ value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop });
    const node = (type) => { const value = { type, gain: param(), frequency: param(), Q: param(), pan: param(), connects: [], disconnected: 0,
      connect(target) { this.connects.push(target); }, disconnect() { this.disconnected++; this.connects = []; }, start: noop, stop: noop }; nodes.push(value); return value; };
    const context = { currentTime: 0, state: 'running', sampleRate: 8000,
      createBuffer: (_channels, length) => { const samples = new Float32Array(length); return { getChannelData: () => samples }; },
      createGain: () => node('gain'), createStereoPanner: () => node('panner'),
      createOscillator: () => node('oscillator'), createBufferSource: () => node('source'), createBiquadFilter: () => node('filter') };
    qa.useAudio(context); const persistent = nodes.length;
    qa.tone({ f0: 300, dur: .2, vol: .1, wet: .2 }); qa.noise({ f0: 2000, dur: .2, vol: .1, wet: .2 });
    qa.wala(new RealThree.Vector3(0, 0, -1), qa.WALAS.wala100); qa.tick(.7);
    assert.ok(nodes.some(n => n.buffer?.getChannelData?.(0).some(v => v !== 0)), 'wala schedules synthesized snap buffers');
    for (const n of nodes) if (n.onended) n.onended();
    assert.ok(nodes.slice(persistent).every(n => n.disconnected === 1 && n.connects.length === 0));
    assert.ok(nodes.slice(0, persistent).every(n => n.disconnected === 0)); qa.useAudio(null); qa.tick(20);
  });

  await t.test('browser Back restores a paused AR session instead of a stopped camera', () => {
    const counts = { pause: 0, resume: 0, stop: 0 };
    qa.setTracker({ active: true, ready: true, pause() { counts.pause++; }, resume() { counts.resume++; }, stop() { counts.stop++; } });
    for (const cb of events.get('pagehide')) cb({ persisted: true });
    assert.deepEqual(counts, { pause: 1, resume: 0, stop: 0 });
    for (const cb of events.get('pageshow')) cb({ persisted: true });
    assert.deepEqual(counts, { pause: 1, resume: 1, stop: 0 });
    for (const cb of events.get('pagehide')) cb({ persisted: false }); assert.equal(counts.stop, 1);
  });

  await t.test('tracking loss pauses long sounds together with the visual effect', () => {
    const tracker = { active: true, ready: false };
    const context = { state: 'running', createGain: () => ({}), suspend() { this.state = 'suspended'; return Promise.resolve(); }, resume() { this.state = 'running'; return Promise.resolve(); } };
    qa.setTracker(tracker); qa.useAudio(context); qa.trackingState(false); assert.equal(context.state, 'suspended');
    tracker.ready = true; qa.trackingState(true); assert.equal(context.state, 'running');
    qa.useAudio(null);
  });

  const palm = () => ({ position: new RealThree.Vector3(0, -.1, -.55),
    quaternion: new RealThree.Quaternion().setFromAxisAngle(new RealThree.Vector3(1, 0, 0), Math.PI / 2), width: .08, label: 'Left' });
  await t.test('automatic palm placement moves only palm effects while floor effects keep running', () => {
    qa.init(); qa.camera.position.set(0, 1.4, 0); qa.camera.rotation.set(-.7, 0, 0); qa.setMode('ground'); qa.camera.updateMatrixWorld();
    qa.selected.ground = 'flower'; qa.fireAt(195, 422);
    const floorPot = qa.world.getObjectByName('cracker-flower'), original = floorPot.position.clone();
    qa.palm(palm()); qa.simulateHand(.05); qa.updateRing(0);
    assert.equal(elements.get('mode').textContent, 'Palm · Auto'); assert.equal(qa.ring.parent === qa.handGuide, true); assert.equal(qa.ring.visible, true);
    qa.fireAt(195, 422); const handPot = qa.palmWorld.getObjectByName('cracker-flower');
    assert.ok(handPot); assert.equal(qa.ring.visible, false);
    assert.equal(qa.fireAt(195, 422), false, 'one active palm effect');
    qa.simulateHand(1.5);
    const before = handPot.getWorldPosition(new RealThree.Vector3());
    const moved = palm();
    for (let i = 1; i <= 10; i++) { moved.position.x = i * .025; qa.palm(moved); qa.simulateHand(.05); }
    assert.ok(handPot.getWorldPosition(new RealThree.Vector3()).distanceTo(before) > .2);
    assert.deepEqual(floorPot.position.toArray(), original.toArray());
    assert.ok(qa.P.life.some(v => v > 0));
    assert.ok(qa.P.hand.every(v => v === 0), 'emitted sparks stay in the room, independent of the hand');
    assert.equal(qa.sparkMat.uniforms.uPalm.value, qa.palmWorld.matrixWorld);
    assert.equal(qa.smokeMat.uniforms.uPalm.value, qa.palmWorld.matrixWorld);
    const handEmitter = qa.emitters.find(e => e.flower && e.space === qa.palmWorld);
    qa.handAnchor.invalidate(); qa.handState(); qa.simulate(2);
    assert.equal(qa.palmWorld.visible, true); assert.equal(handEmitter.phase, 'fountain');
    assert.equal(qa.motion.state, 'landed'); assert.equal(qa.palmWorld.position.y, 0);
    assert.ok(qa.palmWorld.quaternion.angleTo(new RealThree.Quaternion()) < 1e-9);
    assert.equal(qa.ring.parent, qa.world); assert.equal(elements.get('mode').textContent, 'Floor · AR');
    assert.ok(qa.emitters.some(e => e.flower && e.space === qa.world), 'floor keeps its own lifetime');
    qa.palm(moved); qa.simulateHand(16); assert.equal(qa.emitters.some(e => e.ground), false);
    qa.cancelPalmEffect(); qa.handAnchor.invalidate(); qa.handState();
  });

  await t.test('the rendered held cracker uses stabilization while the hand remains still', () => {
    qa.init(); qa.camera.position.set(0, 1.4, 0); qa.camera.rotation.set(0, 0, 0); qa.camera.updateMatrixWorld();
    qa.palm(palm()); qa.simulateHand(.1); qa.selected.ground = 'flower'; qa.fireAt(195, 422);
    const origin = palm().position.clone().applyMatrix4(qa.camera.matrixWorld); let raw = 0, shown = 0;
    for (let i = 1; i <= 40; i++) {
      const noisy = palm(); const offset = new RealThree.Vector3(Math.sin(i * 2.1) * .009, Math.sin(i * 1.7) * .006, Math.sin(i * 2.3) * .025);
      noisy.position.add(offset); noisy.quaternion.multiply(new RealThree.Quaternion().setFromAxisAngle(new RealThree.Vector3(0, 0, 1), Math.sin(i * 2) * .1));
      qa.palm(noisy); qa.simulateHand(.07);
      if (i > 10) { raw += offset.lengthSq(); shown += qa.palmWorld.position.distanceToSquared(origin); }
    }
    assert.ok(Math.sqrt(shown / raw) < .45, `rendered/measurement noise ratio: ${Math.sqrt(shown / raw)}`);
    assert.equal(qa.motion.state, 'held'); assert.equal(qa.ring.visible, false);
    qa.cancelPalmEffect(); qa.handAnchor.invalidate(); qa.handState(); qa.clearParticles();
  });

  await t.test('every floor cracker dispatches on the palm, drops to the floor and releases its owned geometry', () => {
    for (const id of ['atom', 'sutli', 'lakshmi', 'flower', 'spinner', 'wala100', 'wala1000', 'wala10000']) {
      qa.init(); qa.palm(palm()); qa.simulateHand(.05); qa.selected.ground = id; qa.fireAt(195, 422);
      assert.ok(qa.emitters.some(e => e.ground && e.space === qa.palmWorld), id);
      if (id === 'wala10000') assert.equal(qa.palmWorld.getObjectByName('wala-10000').count, 10000);
      qa.simulateHand(1.1);
      const tilted = palm(); tilted.quaternion.multiply(new RealThree.Quaternion().setFromAxisAngle(new RealThree.Vector3(0, 0, 1), .5));
      qa.palm(tilted); qa.simulateHand(.15); assert.equal(qa.motion.state, 'airborne', id);
      qa.simulateHand(.9); assert.equal(qa.motion.state, 'landed', id); assert.equal(qa.palmWorld.position.y, 0);
      qa.simulateHand(id === 'wala10000' ? 40 : 20); t.mock.timers.tick(3000);
      assert.equal(qa.atomSequence.busy, false); assert.equal(qa.emitters.some(e => e.ground && e.space === qa.palmWorld), false, id);
      qa.cancelPalmEffect(); assert.ok(qa.palmWorld.children.every(o => o === qa.ring));
      qa.handAnchor.invalidate(); qa.handState();
    }
  });

  await t.test('hand loss drops the object, keeps audio running and waits for the complete Atom tail', () => {
    const context = () => ({ state: 'running', createGain: () => ({}),
      suspend() { this.state = 'suspended'; return Promise.resolve(); }, resume() { this.state = 'running'; return Promise.resolve(); }, close() { this.state = 'closed'; return Promise.resolve(); } });
    qa.init(); qa.palm(palm()); qa.simulateHand(.05); qa.selected.ground = 'atom'; qa.fireAt(195, 422);
    const room = context(), hand = context(); qa.useAudio(room); qa.useHandAudio(hand);
    qa.handAnchor.invalidate(); qa.handState(); assert.equal(room.state, 'running'); assert.equal(hand.state, 'running');
    qa.useAudio(null); qa.useHandAudio(null); qa.simulate(1.2);
    assert.equal(qa.motion.state, 'landed'); assert.equal(qa.atomSequence.phase, 'fuse');
    qa.simulate(2.1); assert.equal(qa.atomSequence.phase, 'ringing');
    assert.equal(qa.fireAt(195, 422), false); t.mock.timers.tick(2700); assert.equal(qa.atomSequence.busy, false);
    qa.cancelPalmEffect(); qa.handAnchor.invalidate(); qa.handState();
  });

  await t.test('a flower pot drops on a small tilt without restarting its fountain and lands upright', () => {
    qa.init(); qa.camera.position.set(0, 1.4, 0); qa.camera.rotation.set(0, 0, 0); qa.camera.updateMatrixWorld();
    qa.palm(palm()); qa.simulateHand(.05); qa.selected.ground = 'flower'; qa.fireAt(195, 422);
    qa.simulateHand(2); const fountain = qa.emitters.find(e => e.flower && e.space === qa.palmWorld);
    const pot = qa.palmWorld.getObjectByName('cracker-flower'); assert.equal(fountain.phase, 'fountain');
    const tilted = palm(); tilted.quaternion.multiply(new RealThree.Quaternion().setFromAxisAngle(new RealThree.Vector3(0, 0, 1), Math.PI / 8));
    qa.palm(tilted); qa.simulateHand(.12); assert.equal(qa.motion.state, 'airborne');
    assert.equal(fountain.phase, 'fountain'); assert.equal(qa.palmWorld.getObjectByName('cracker-flower'), pot);
    qa.simulateHand(.6); assert.equal(qa.motion.state, 'landed'); assert.equal(qa.palmWorld.position.y, 0);
    const landed = qa.palmWorld.position.clone(); const moved = palm(); moved.position.x = .3;
    qa.palm(moved); qa.simulateHand(.4); assert.deepEqual(qa.palmWorld.position.toArray(), landed.toArray());
    assert.ok(qa.palmWorld.quaternion.angleTo(new RealThree.Quaternion()) < 1e-9);
    qa.simulateHand(7.4); assert.equal(fountain.phase, 'cooling', 'original burn clock continues through the fall');
    qa.simulateHand(5); qa.cancelPalmEffect(); qa.handAnchor.invalidate(); qa.handState();
  });

  await t.test('a held bomb gets time to throw, then bursts in the hand if never released', () => {
    qa.init(); qa.palm(palm()); qa.simulateHand(.05); qa.selected.ground = 'atom'; qa.fireAt(195, 422);
    qa.simulateHand(2.5); assert.equal(qa.atomSequence.phase, 'fuse'); assert.equal(qa.motion.state, 'held');
    qa.simulateHand(.75); assert.equal(qa.atomSequence.phase, 'ringing'); assert.equal(qa.motion.state, 'spent');
    assert.ok(qa.palmWorld.position.y > .5); assert.equal(qa.palmWorld.getObjectByName('cracker-atom'), undefined);
    assert.ok(qa.P.hand.every(v => v === 0));
    assert.equal(qa.palmWorld.children.some(o => o.userData.contactShadow), false, 'no floating scorch under a hand burst');
    t.mock.timers.tick(2700); qa.cancelPalmEffect(); qa.handAnchor.invalidate(); qa.handState();
  });

  await t.test('a late upward toss bursts midair at the moving bomb, then cannot follow a returning hand', () => {
    qa.init(); qa.palm(palm()); qa.simulateHand(.05); qa.selected.ground = 'atom'; qa.fireAt(195, 422);
    qa.simulateHand(2.8);
    for (let i = 1; i <= 8; i++) { const pose = palm(); pose.position.y += i * .025; qa.palm(pose); qa.simulateHand(1 / 60); }
    assert.equal(qa.motion.state, 'airborne'); const thrown = qa.palmWorld.position.clone();
    qa.handAnchor.invalidate(); qa.handState(); qa.simulate(.32);
    assert.equal(qa.atomSequence.phase, 'ringing'); assert.equal(qa.motion.state, 'spent');
    const burst = qa.palmWorld.position.clone(); assert.ok(burst.y > thrown.y && burst.y > .6);
    assert.ok(qa.S.life.some((v, i) => v > 0 && qa.S.hard[i] > .5 && qa.S.y[i] > .6), 'paper starts at the air burst');
    qa.palm(palm()); qa.simulateHand(.2); assert.deepEqual(qa.palmWorld.position.toArray(), burst.toArray());
    assert.ok(qa.S.groundY.every((v, i) => qa.S.life[i] <= 0 || v === 0), 'debris falls to the room floor');
    t.mock.timers.tick(2700); qa.cancelPalmEffect(); qa.handAnchor.invalidate(); qa.handState();
  });
  await t.test('sky launches during floor scanning, while ground objects and ground audio remain paused', () => {
    qa.init(); qa.clearParticles(); qa.camera.rotation.set(0, 0, 0); qa.camera.updateMatrixWorld();
    qa.flowerPot(new RealThree.Vector3(0, 0, -2)); qa.simulate(1.5);
    const particle = [...qa.P.life].findIndex((life, i) => life > 0 && !qa.P.sky[i]);
    assert.ok(particle >= 0); const frozenAge = qa.P.age[particle];
    const tracker = { active: true, ready: false, hit: () => null }; qa.setTracker(tracker);
    qa.skyTracking.accept(qa.camera, { position: { x: 0, y: 1.4, z: 0 }, rotation: new RealThree.Quaternion(),
      intrinsics: qa.camera.projectionMatrix.toArray(), trackingStatus: 'LIMITED' }, null, qa.skyWorld);
    qa.sensor(true); qa.updateCamera(1 / 60); qa.trackingState(false);
    assert.equal(elements.get('mode').textContent, 'Sky · Motion');
    assert.equal(elements.get('trackingStatus').hidden, true);
    qa.selected.sky = 'shot'; qa.fireAt(195, 200);
    assert.ok(qa.emitters.some(e => e.sky && e.space === qa.skyWorld));
    qa.setMode('ground'); assert.equal(qa.fireAt(195, 422), false, 'motion never bypasses the floor lock');
    qa.simulate(2.4);
    assert.equal(qa.world.visible, false); assert.equal(qa.skyWorld.visible, true);
    assert.equal(qa.P.age[particle], frozenAge, 'ground particle clocks stay paused');
    assert.ok([...qa.P.life].some((life, i) => life > 0 && qa.P.sky[i]));
    assert.ok([...qa.S.life].some((life, i) => life > 0 && qa.S.sky[i]));
    const context = () => ({ state: 'running', createGain: () => ({}),
      suspend() { this.state = 'suspended'; return Promise.resolve(); }, resume() { this.state = 'running'; return Promise.resolve(); } });
    const groundSound = context(), skySound = context(); qa.useAudio(groundSound); qa.useSkyAudio(skySound); qa.syncAudioPlayback();
    assert.equal(groundSound.state, 'suspended'); assert.equal(skySound.state, 'running');
    qa.sensor(true, true); qa.updateCamera(1 / 60);
    assert.equal(skySound.state, 'suspended', 'motion from before a background/resume stops sky audio together with its visuals');
    assert.equal(qa.fireAt(195, 200), false);
    qa.sensor(false); qa.updateCamera(1 / 60); assert.equal(qa.fireAt(195, 200), false);
    qa.useAudio(null); qa.useSkyAudio(null); tracker.ready = true; qa.trackingState(true); qa.simulate(20);
  });

  await t.test('rapid tapping cannot stack dozens of twelve-shot producers', () => {
    qa.init(); qa.camera.rotation.set(.8, 0, 0); qa.camera.updateMatrixWorld(); qa.setMode('sky'); qa.selected.sky = 'twelve';
    qa.simulate(1);
    for (let i = 0; i < 40; i++) qa.fireAt(195, 200);
    const producers = qa.emitters.filter(e => e.sky).length;
    qa.simulate(12);
    assert.ok(producers <= 3, `40 simultaneous taps created ${producers} sky producers`);
  });

  await t.test('backgrounding cancels a held launch instead of restarting it on return', () => {
    qa.init(); qa.camera.rotation.set(.8, 0, 0); qa.camera.updateMatrixWorld(); qa.setMode('sky'); qa.selected.sky = 'shot';
    qa.setTracker({ active: true, ready: true, pause() { this.ready = false; }, resume() { this.ready = true; } });
    const e = { pointerId: 99, pointerType: 'touch', clientX: 195, clientY: 200, target: elements.get('stage'), preventDefault() {} };
    elements.get('stage').handlers.pointerdown(e); assert.equal(qa.pointerDown, true);
    doc.hidden = true; documentEvents.get('visibilitychange')();
    const retainedPress = qa.pointerDown;
    doc.hidden = false; documentEvents.get('visibilitychange')();
    elements.get('stage').handlers.pointercancel({ ...e, type: 'pointercancel' }); qa.simulate(10);
    assert.equal(retainedPress, false, 'a press survives backgrounding and can auto-launch without a new tap');
  });

  await t.test('two-finger control toggle does not fire; a normal touch release fires exactly once', () => {
    qa.init(); qa.camera.rotation.set(.8, 0, 0); qa.camera.updateMatrixWorld(); qa.setMode('sky'); qa.selected.sky = 'shot'; qa.simulate(1);
    const stage = elements.get('stage'), event = id => ({ pointerId: id, pointerType: 'touch', clientX: 195, clientY: 200, target: stage, preventDefault() {} });
    const count = qa.emitters.length;
    stage.handlers.pointerdown(event(1)); stage.handlers.pointerdown(event(2));
    stage.handlers.pointerup({ ...event(1), type: 'pointerup' }); stage.handlers.pointerup({ ...event(2), type: 'pointerup' });
    assert.equal(qa.emitters.length, count, 'recording gesture cannot ignite a cracker');
    elements.get('showBtn').handlers.click();
    stage.handlers.pointerdown(event(3)); assert.equal(qa.emitters.length, count);
    stage.handlers.pointerup({ ...event(3), type: 'pointerup' });
    assert.equal(qa.emitters.length, count + 1); qa.simulate(10);
  });

  await t.test('sustained sky tap spam stays bounded and releases every producer after input stops', () => {
    qa.init(); qa.camera.rotation.set(.8, 0, 0); qa.camera.updateMatrixWorld(); qa.setMode('sky'); qa.selected.sky = 'twelve';
    let peak = 0;
    for (let i = 0; i < 200; i++) {
      qa.fireAt(195, 200); qa.simulate(.1);
      peak = Math.max(peak, qa.emitters.filter(e => e.sky).length);
    }
    qa.simulate(12); assert.ok(peak <= 27, `peak sky producers: ${peak}`); assert.equal(qa.emitters.length, 0);
    t.diagnostic(`Audit: 200 taps over 20 simulated seconds; peak sky producers ${peak}; zero after completion.`);
  });

  await t.test('head taps attach without a floor scan; tracking loss cannot transfer an effect to another head', () => {
    qa.init(); qa.camera.rotation.set(0, 0, 0); qa.camera.position.set(0, 1.4, 0); qa.camera.updateMatrixWorld(); qa.setMode('ground');
    qa.skyWorld.position.set(0, 0, 0); qa.skyWorld.quaternion.identity(); qa.skyWorld.updateMatrixWorld(); qa.simulate(.1);
    const makeHead = (x = .5) => ({ center: { x, y: .35 }, bounds: { left: x - .12, right: x + .12, top: .2, bottom: .5 }, span: .3,
      worldPosition: new RealThree.Vector3((x - .5) * 2, 1.7, -.8), worldQuaternion: new RealThree.Quaternion(), width: .15 });
    qa.setTracker({ active: true, ready: false, hit: () => null }); qa.sensor(false); qa.heads([makeHead()]);
    qa.selected.ground = 'flower'; qa.fireAt(195, 280);
    assert.equal(qa.objectPlacement.type, 'head'); const id = qa.objectPlacement.id;
    assert.equal(qa.ring.visible, false); assert.ok(qa.emitters.some(e => e.flower && e.space === qa.objectWorld));
    assert.equal(qa.world.children.some(o => o.name === 'flower'), false);
    // Keep this face fresh while a second one appears. Only the selected ID follows.
    for (let i = 0; i < 12; i++) { qa.headTargets.update([makeHead(.51), makeHead(.85)], qa.now + 100); qa.simulate(.1); }
    assert.equal(qa.objectPlacement.id, id); assert.ok(qa.objectWorld.position.x < .2);
    const spark = [...qa.P.life].findIndex((life, i) => life > 0 && qa.P.sky[i] === 2);
    assert.ok(spark >= 0, 'head emits actual sparks before floor acquisition');
    const origin = [qa.P.x[spark], qa.P.y[spark], qa.P.z[spark]];
    qa.objectWorld.position.x += .4; qa.objectWorld.updateMatrixWorld();
    assert.deepEqual([qa.P.x[spark], qa.P.y[spark], qa.P.z[spark]], origin, 'old sparks do not follow a moved nozzle');
    qa.headTargets.clear(); qa.setTracker({ active: true, ready: true, hit: () => null }); qa.simulate(.7);
    assert.equal(qa.objectPlacement.detached, true); const held = qa.objectWorld.position.clone();
    qa.heads([makeHead(.6)]); qa.simulate(.2); assert.deepEqual(qa.objectWorld.position, held);
    qa.headTargets.clear(); qa.simulate(20); assert.equal(qa.objectPlacement, null); assert.equal(qa.objectWorld.children.length, 0);
  });

  await t.test('free placement previews before ignition, stays fixed after walking, and retains Atom gating', () => {
    qa.init(); qa.headTargets.clear(); qa.setMode('ground'); qa.selected.ground = 'atom';
    elements.get('freeBtn').handlers.click();
    assert.equal(elements.get('placementControls').hidden, false); assert.equal(qa.atomSequence.busy, false);
    elements.get('placementDepth').handlers.input({ target: { value: '2.2' } });
    elements.get('placementSize').handlers.input({ target: { value: '.7' } });
    qa.fireAt(230, 360); assert.equal(qa.atomSequence.busy, false, 'preview tap must not ignite');
    const preview = qa.objectGuide.position.clone();
    elements.get('placeBtn').handlers.click();
    assert.equal(qa.objectPlacement.type, 'free'); assert.equal(qa.atomSequence.phase, 'fuse');
    assert.equal(elements.get('placementControls').hidden, true); assert.deepEqual(qa.objectWorld.position, preview);
    qa.camera.position.x += 1; qa.camera.rotation.y += .5; qa.camera.updateMatrixWorld(); qa.simulate(1);
    assert.deepEqual(qa.objectWorld.position, preview); assert.equal(qa.fireAt(195, 422), false);
    qa.simulate(2.3); assert.equal(qa.atomSequence.phase, 'ringing'); assert.equal(qa.fireAt(195, 422), false);
    const sound = { state: 'running', createGain: () => ({}), suspend() { this.state = 'suspended'; return Promise.resolve(); }, resume() { this.state = 'running'; return Promise.resolve(); } };
    qa.useObjectAudio(sound); qa.setTracker({ active: true, ready: false, hit: () => null }); qa.sensor(false); qa.updateCamera(1 / 60);
    qa.syncObjectAudio(); assert.equal(sound.state, 'running', 'losing a target must not strand the Atom aftertone gate');
    qa.useObjectAudio(null); qa.init();
    t.mock.timers.tick(2700); assert.equal(qa.atomSequence.busy, false); qa.simulate(15);
    assert.equal(qa.objectWorld.children.length, 0);
    qa.selected.ground = 'wala1000'; elements.get('freeBtn').handlers.click();
    assert.ok(qa.objectGuide.children.length); elements.get('cancelPlacement').handlers.click();
    assert.equal(qa.objectGuide.children.length, 0); assert.equal(elements.get('placementControls').hidden, true);
  });

  await t.test('a pending head blocks accidental floor placement; a confirmed head never hijacks sky or an unrelated floor tap', () => {
    qa.init(); qa.camera.position.set(0, 1.4, 0); qa.camera.rotation.set(-.6, 0, 0); qa.camera.updateMatrixWorld(); qa.setMode('ground');
    const pose = { center: { x: .2, y: .25 }, bounds: { left: .1, right: .3, top: .1, bottom: .4 }, span: .2,
      worldPosition: new RealThree.Vector3(-.3, 1.7, -1), worldQuaternion: new RealThree.Quaternion() };
    qa.headTargets.clear(); qa.headTargets.update([pose], qa.now); qa.selected.ground = 'spinner';
    const count = qa.emitters.length; assert.equal(qa.fireAt(78, 211), false); assert.equal(qa.emitters.length, count);
    qa.heads([pose]); qa.fireAt(300, 550); assert.ok(qa.emitters.some(e => e.spinner && e.space === qa.world));
    assert.equal(qa.objectPlacement, null);
    qa.setMode('sky'); qa.selected.sky = 'shot'; qa.fireAt(78, 211); assert.equal(qa.objectPlacement, null);
    qa.headTargets.clear(); qa.simulate(20);
  });

  await t.test('miniature 10,000 wala stays on its head while a separate palm spinner keeps its original behavior', () => {
    qa.init(); qa.camera.position.set(0, 1.4, 0); qa.camera.rotation.set(0, 0, 0); qa.camera.updateMatrixWorld(); qa.setMode('ground');
    const pose = { center: { x: .25, y: .25 }, bounds: { left: .1, right: .4, top: .1, bottom: .4 }, span: .3,
      worldPosition: new RealThree.Vector3(-.3, 1.65, -1.2), worldQuaternion: new RealThree.Quaternion() };
    qa.heads([pose]); qa.selected.ground = 'wala10000'; qa.fireAt(95, 210);
    const string = qa.objectWorld.getObjectByName('wala-10000'); assert.ok(string?.isInstancedMesh); assert.equal(string.count, 10000);
    const headPosition = qa.objectWorld.position.clone();
    qa.palm(palm()); qa.simulateHand(.05); qa.selected.ground = 'spinner'; qa.fireAt(260, 500);
    assert.ok(qa.emitters.some(e => e.spinner && e.space === qa.palmWorld));
    assert.ok(qa.emitters.some(e => e.largeWala && e.space === qa.objectWorld));
    assert.deepEqual(qa.objectWorld.position, headPosition);
    qa.handAnchor.invalidate(); qa.handState(); qa.headTargets.clear(); qa.simulate(50, 30);
    assert.equal(qa.objectWorld.children.length, 0); qa.cancelPalmEffect();
    assert.equal(qa.emitters.length, 0);
  });

  await t.test('nearby objects stay in room coordinates when the sky reference frame recovers', () => {
    qa.init(); qa.headTargets.clear(); qa.handAnchor.invalidate(); qa.setMode('ground'); qa.selected.ground = 'flower';
    qa.camera.position.set(0, 1.4, 0); qa.camera.rotation.set(0, 0, 0); qa.camera.updateMatrixWorld();
    qa.skyWorld.position.set(0, 0, 0); qa.skyWorld.quaternion.identity(); qa.skyWorld.updateMatrixWorld(); qa.simulate(.05);
    elements.get('freeBtn').handlers.click(); elements.get('placeBtn').handlers.click(); qa.simulate(1);
    const position = qa.objectWorld.getWorldPosition(new RealThree.Vector3());
    const rotation = qa.objectWorld.getWorldQuaternion(new RealThree.Quaternion());
    const projected = position.clone().project(qa.camera);
    // Simulate the exact root correction made when sky motion rejoins SLAM.
    qa.skyWorld.position.set(1.2, -.3, .7); qa.skyWorld.rotation.y = .6; qa.skyWorld.updateMatrixWorld(); qa.simulate(.05);
    assert.ok(qa.objectWorld.getWorldPosition(new RealThree.Vector3()).distanceTo(position) < 1e-8, 'sky recovery moved the placed flower pot');
    assert.ok(qa.objectWorld.getWorldQuaternion(new RealThree.Quaternion()).angleTo(rotation) < 1e-8);
    assert.ok(qa.objectWorld.getWorldPosition(new RealThree.Vector3()).project(qa.camera).distanceTo(projected) < 1e-8);
    const tracker = { active: true, ready: false, hit: () => null, resize() {} }; qa.setTracker(tracker);
    qa.skyTracking.frameReady = true; qa.sensor(true); qa.simulate(.2);
    assert.equal(qa.objectFrame.visible, false, 'nearby objects must hide while positional tracking is lost, even if sky motion works');
    tracker.ready = true; qa.simulate(20); assert.equal(qa.objectWorld.children.length, 0);
    qa.skyWorld.position.set(0, 0, 0); qa.skyWorld.quaternion.identity(); qa.skyWorld.updateMatrixWorld();
  });

  await t.test('motion-only sky cannot authorize a new nearby placement', () => {
    qa.init(); qa.setMode('ground'); qa.selected.ground = 'flower';
    qa.setTracker({ active: true, ready: false, hit: () => null, resize() {} }); qa.skyTracking.frameReady = true; qa.sensor(true);
    elements.get('freeBtn').handlers.click(); qa.simulate(.05);
    assert.equal(elements.get('placeBtn').disabled, true);
    assert.equal(qa.placeObject('free'), false); assert.equal(qa.objectPlacement, null);
    elements.get('cancelPlacement').handlers.click(); qa.init(); qa.sensor(false);
  });

});
