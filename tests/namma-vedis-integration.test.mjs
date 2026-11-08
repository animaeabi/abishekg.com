// CPU integration checks for the real application, with only DOM drawing and
// WebGL rendering stubbed. These do not claim physical-camera/SLAM validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as RealThree from 'three';

test('actual app hides the ring, fixes debris height, and gates every launch until Atom audio finishes', async (t) => {
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
  const elements = new Map();
  const doc = { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, addEventListener: noop };
  const properties = new WeakMap();
  class Renderer {
    capabilities = { isWebGL2: true };
    properties = { get(o) { if (!properties.has(o)) properties.set(o, {}); return properties.get(o); } };
    setClearColor() {} setPixelRatio() {} setSize() {} render() {} resetState() {} dispose() {}
  }
  const globals = { __nammaTestThree: { ...RealThree, WebGLRenderer: Renderer }, document: doc,
    window: { isSecureContext: true }, navigator: {}, location: { search: '' }, screen: {},
    matchMedia: () => ({ matches: false }), addEventListener: noop, requestAnimationFrame: noop, devicePixelRatio: 1 };
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
  source += `\nexport const qa = { camera, world, ring, emitters, P, S, pulses, selected, atomSequence, placementGuide,
    fireAt, setMode, updateRing, step, queueSkyWish,
    init() { playing = true; floorY = 0; worldTracking = { active: true, ready: true, hit: () => null }; },
    setFloor(y) { floorY = y; },
    tick(dt) { for (let i = emitters.length - 1; i >= 0; i--) if (!emitters[i].update(dt)) emitters.splice(i, 1); },
  };`;
  const { qa } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
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
  const text = qa.world.children.find(o => o.isPoints);
  assert.ok(text); assert.ok(text.geometry.attributes.position.array[2] < -90, 'lettering remains in the original sky direction');

  // The new large string is an actual 10,000-instance object, anchored sideways.
  qa.setMode('ground'); qa.setFloor(0); qa.camera.position.set(0, 1.4, 0);
  qa.camera.rotation.set(-.7, 0, 0); qa.camera.updateMatrixWorld();
  qa.selected.ground = 'wala10000'; qa.fireAt(195, 422);
  const string = qa.world.getObjectByName('wala-10000');
  assert.ok(string?.isInstancedMesh); assert.equal(string.count, 10000);
  assert.ok(string.material.every(m => m.isMeshStandardMaterial && !m.transparent && m.depthWrite));
  assert.equal(qa.ring.visible, false);
  const matrices = string.instanceMatrix.array.slice(), version = string.instanceMatrix.version;
  const largeCount = qa.emitters.filter(e => e.largeWala).length;
  assert.equal(qa.fireAt(195, 422), false); assert.equal(qa.emitters.filter(e => e.largeWala).length, largeCount);
  qa.camera.position.set(2, 1.4, 1); qa.camera.rotation.y = 1; qa.camera.updateMatrixWorld();
  qa.tick(1);
  assert.ok(string.count < 10000 && string.count > 9700, 'burn advances through individual crackers');
  assert.deepEqual(string.instanceMatrix.array, matrices, 'camera movement and burning never rewrite placed transforms');
  assert.equal(string.instanceMatrix.version, version, 'no full matrix uploads during burning');
  qa.tick(42);
  assert.equal(qa.world.getObjectByName('wala-10000'), undefined);
  assert.equal(qa.world.getObjectByName('wala-fuse-10000'), undefined);
  assert.equal(qa.emitters.some(e => e.largeWala), false, 'completed string frees the next 10,000 launch');
});
