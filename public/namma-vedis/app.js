/* Adapted from Pattasu by @ikevinadams: https://pattasu-diwali.vercel.app/ */

import * as THREE from 'three';
import { hasOrientation, deviceQuaternion, modeForPitch } from './orientation.mjs';
import { groundIntersection, PlacementGuide } from './world-space.mjs';
import { waitForWorldEngine, createWorldTracking } from './world-tracking.mjs';
import { AtomSequence, playAtomAftertone } from './atom-aftertone.mjs';
import { createCrackerModel, addCrackerLights } from './cracker-models.mjs';
import { WALA_CONFIGS, createWalaLayout } from './wala-layout.mjs';
import { SkyTracking, skyView } from './sky-tracking.mjs';
import { shellStar, shellFlight, skySound } from './sky-physics.mjs';
import { createSkyWritingPlan, sampleStroke, skyWritingVertex, skyWritingFragment } from './sky-writing.mjs';
import { createWalaBurn, walaIndexAt, renderWalaAudio, decorateWalaMaterial } from './wala-burn.mjs';
import { HandAnchor, palmPose, handEffectScale } from './hand-anchor.mjs';
import { HandObjectMotion, PALM_FUSES } from './hand-motion.mjs';
import { HandStabilizer } from './hand-stabilizer.mjs';
import { createHandTracking } from './hand-tracking.mjs';
import { HeadTargets, headPoses, freePose } from './object-placement.mjs';
const headTargets = new HeadTargets(), headStabilizer = new HandStabilizer(), inferenceGate = {};
let headTracker = null, objectAudio = null, objectPlacement = null, freeEditing = false, freePoint = { x: .5, y: .5 }, freeDistance = 1.2, freeSize = 1;
const handAnchor = new HandAnchor();
const handStabilizer = new HandStabilizer();
let handTracker = null, handWasReady = false, handAudio = null, skyAudio = null;
let atomRun = 0, atomOnPalm = false, palmMotion = null;
const atomSequence = new AtomSequence();
let worldTracking = null, trackingStarting = false;
const placementGuide = new PlacementGuide();
let tableSurface = false;
let cameraFeedRenderer = null, trackedCameraTexture = null, feedGeometry = null;
THREE.ColorManagement.enabled = false; // everything here is hand-graded, so it goes to the screen as written

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* unsupported */ } };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const FLOOR_H = 1.4, TABLE_H = .45; // how far below the phone the surface is, in metres
let floorY = -FLOOR_H;
// Roughly what each metal salt burns like: strontium red, barium green, copper blue, sodium gold, charcoal amber.
const C = {
  gold: [1, .74, .3], amber: [1, .4, .06], charcoal: [.9, .3, .05], red: [1, .13, .1], pink: [1, .18, .5],
  green: [.3, 1, .38], blue: [.32, .5, 1], violet: [.72, .32, 1], silver: [.92, .95, 1], white: [1, .96, .88],
};
const PAIRS = [[C.gold, C.red], [C.pink, C.silver], [C.green, C.gold], [C.blue, C.silver], [C.red, C.gold], [C.violet, C.gold], [C.silver, C.red]];

/* ---------- Renderer ---------- */
const stage = $('stage'), sceneEl = $('scene'), glCanvas = $('gl');
let video = $('cam');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
} catch (err) {
  $('bootError').textContent = "This browser couldn't start WebGL, which the fireworks need.";
  $('bootError').hidden = false;
  $('startBtn').disabled = true;
  $('startBtn').textContent = '3D graphics unavailable';
  $('note').textContent = 'This browser cannot start WebGL. Open this page in Safari or Chrome with hardware graphics enabled.';
  throw err;
}
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x000000, 1);
const scene = new THREE.Scene();
const world = new THREE.Group(); scene.add(world);
const skyWorld = new THREE.Group(); scene.add(skyWorld);
const skyTracking = new SkyTracking();
// Same stable coordinate frame as the sky bridge, independently visible while
// a head supplies its own image pose before world tracking has acquired a floor.
const objectFrame = new THREE.Group(); scene.add(objectFrame);
const objectWorld = new THREE.Group(); objectFrame.add(objectWorld);
const objectGuide = new THREE.Group(); objectFrame.add(objectGuide);
const objectAvailable = () => skyAvailable() || Boolean(objectPlacement?.type === 'head' && headTargets.get(objectPlacement.id, last));
const palmWorld = new THREE.Group(); scene.add(palmWorld); palmWorld.visible = false;
const handGuide = new THREE.Group(); scene.add(handGuide); handGuide.visible = false;
let effectSpace = world;
const roomPaused = () => Boolean(playing && worldTracking?.active && !worldTracking.ready);
let skyMotionReady = false;
const skyAvailable = () => !worldTracking?.active || worldTracking.ready || skyMotionReady;
const spacePaused = space => space === skyWorld ? !skyAvailable() : (space === objectWorld || space === objectFrame) ? !objectAvailable() : roomPaused() || (space === palmWorld && !palmMotion);
addCrackerLights(scene);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900);
scene.add(camera);

// Painted night, used on the start screen and when there is no camera.
function buildNight() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 1024);
  sky.addColorStop(0, '#07060f'); sky.addColorStop(.5, '#151029'); sky.addColorStop(.62, '#0d0a16'); sky.addColorStop(1, '#0d0a16');
  x.fillStyle = sky; x.fillRect(0, 0, 2048, 1024);
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(255,245,230,${rand(.12, .55)})`;
    x.beginPath(); x.arc(Math.random() * 2048, Math.random() * 470, rand(.4, .8), 0, TAU); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, depthWrite: false, toneMapped: false }));
  m.renderOrder = -10;
  return m;
}
const night = buildNight();
scene.add(night);

/* ---------- Light that falls on the real picture ----------
   The camera image is also a texture, so a burst can genuinely brighten the floor and walls the
   phone is looking at, grain and all, rather than laying a coloured glow on top of them. */
const shared = {
  uVideo: { value: null }, uHas: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uCov: { value: new THREE.Vector2(1, 1) },
};
const ADD = { transparent: true, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
const SAMPLE = `
  uniform sampler2D uVideo; uniform float uHas; uniform vec2 uRes; uniform vec2 uCov;
  vec3 room() { vec2 uv = (gl_FragCoord.xy / uRes - 0.5) * uCov + 0.5; return texture2D(uVideo, uv).rgb; }`;
// The feed is drawn in here too, rather than left under a see-through canvas, so sparks add to it the same way in every browser.
const camGain = { value: .8 };
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false, toneMapped: false,
  uniforms: { ...shared, uGain: camGain },
  vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `${SAMPLE} uniform float uGain; void main(){ gl_FragColor = vec4(room() * uGain, 1.0); }`,
}));
backdrop.frustumCulled = false; backdrop.renderOrder = -20; backdrop.visible = false;
scene.add(backdrop);
const skyLight = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  ...ADD,
  depthTest: true,
  uniforms: { ...shared, uC: { value: new THREE.Color(0, 0, 0) }, uCenter: { value: new THREE.Vector2(.5, .5) }, uLocal: { value: 0 } },
  vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.999999, 1.0); }',
  fragmentShader: `${SAMPLE} uniform vec3 uC; uniform vec2 uCenter; uniform float uLocal;
    void main(){ vec2 delta = gl_FragCoord.xy / uRes - uCenter; delta.x *= uRes.x / uRes.y;
      float falloff = mix(1.0, exp(-dot(delta, delta) * 5.0), uLocal);
      vec3 c = uHas > .5 ? room() * uC * 1.5 : uC * .1; gl_FragColor = vec4(c * falloff, 0.0); }`,
}));
skyLight.frustumCulled = false; skyLight.renderOrder = 0; skyLight.visible = false;
scene.add(skyLight);
let sceneLight = 0;
const sceneLightC = new THREE.Vector3(), sceneLightPoint = new THREE.Vector3(), projectedLight = new THREE.Vector3();
let sceneLightSpace = world, sceneLightLocal = false;
function lightScene(c, amt, point = null) {
  if (effectSpace === palmWorld || effectSpace === objectWorld || amt < sceneLight * .6) return;
  sceneLight = Math.max(sceneLight, amt);
  sceneLightC.set(c[0], c[1], c[2]);
  sceneLightSpace = effectSpace; sceneLightLocal = Boolean(point);
  if (point) sceneLightPoint.copy(point);
}

const FLOOR_GEO = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const pools = [];
for (let i = 0; i < 8; i++) {
  const m = new THREE.Mesh(FLOOR_GEO, new THREE.ShaderMaterial({
    ...ADD,
    depthTest: true,
    uniforms: { ...shared, uC: { value: new THREE.Color() } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `${SAMPLE} uniform vec3 uC; varying vec2 vP;
      void main(){
        float r = length(vP); if (r >= 1.0) discard;
        float f = 1.0 - r; f = f * f * (1.0 + 2.0 * f);
        vec3 c = uHas > .5 ? room() * uC * f * 1.15 + uC * f * .03 : uC * f * .34;
        gl_FragColor = vec4(c, 0.0);
      }`,
  }));
  m.frustumCulled = false; m.renderOrder = 1; m.visible = false;
  scene.add(m);
  pools.push(m);
}
let poolN = 0;
function floorGlow(x, z, c, intensity, radius, groundY = floorY) {
  if (poolN >= pools.length || effectSpace === objectWorld) return;
  if (effectSpace === palmWorld && palmMotion && palmMotion.state !== 'held' && palmMotion.position.y > palmMotion.floorY + .01) return;
  const m = pools[poolN++];
  m.position.set(x, groundY + .004, z);
  m.quaternion.identity();
  if (effectSpace === palmWorld) {
    if (palmMotion?.state === 'held') radius = Math.min(radius, handStabilizer.width * .44 / palmWorld.scale.x);
    m.position.applyMatrix4(palmWorld.matrixWorld); m.quaternion.copy(palmWorld.quaternion);
    m.scale.setScalar(radius * palmWorld.scale.x);
  } else m.scale.setScalar(radius);
  m.material.uniforms.uC.value.setRGB(c[0] * intensity, c[1] * intensity, c[2] * intensity);
  m.visible = true;
}
const pulses = [];
const floorPulse = (x, z, c, intensity, radius, decay, groundY = floorY) => pulses.push({ x, z, c, i: intensity, r: radius, d: decay, groundY, space: effectSpace });

/* ---------- Sparks: stretched along their motion, the way a camera shutter records them ---------- */
const N = 10000;
const F = { TRAIL: 1, TWINKLE: 2, BOUNCE: 4, CRACKLE: 8, LATE: 16, SEG: 32 };
const P = {};
for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'age', 'life', 'size', 'r', 'g', 'b', 'r2', 'g2', 'b2', 'drag', 'grav', 'tl', 'tt', 'str', 'glow', 'groundY']) P[k] = new Float32Array(N);
P.flag = new Uint8Array(N); P.hand = new Uint8Array(N); P.sky = new Uint8Array(N);
let head = 0, aliveCount = 0;
const outPos = new Float32Array(N * 3), outVel = new Float32Array(N * 3), outCol = new Float32Array(N * 4), outSize = new Float32Array(N * 3);
const QUAD = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), QUAD_I = [0, 1, 2, 0, 2, 3];
function instanced(...attrs) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(QUAD, 3));
  g.setIndex(QUAD_I);
  for (const [name, arr, size] of attrs) g.setAttribute(name, new THREE.InstancedBufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount = 0;
  return g;
}
const outHand = new Float32Array(N), outSky = new Float32Array(N);
const sparkGeo = instanced(['iSky', outSky, 1], ['iHand', outHand, 1], ['iPos', outPos, 3], ['iVel', outVel, 3], ['iCol', outCol, 4], ['iSize', outSize, 3]);
const sparkMat = new THREE.ShaderMaterial({
  ...ADD,
  depthTest: true,
  uniforms: { uSky: { value: skyWorld.matrixWorld }, uPalm: { value: palmWorld.matrixWorld }, uScale: { value: 1000 }, uMin: { value: 1.5 }, uRes: shared.uRes },
  vertexShader: `
    attribute float iSky; uniform mat4 uSky; attribute float iHand; uniform mat4 uPalm;
    attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec3 iSize;
    uniform float uScale; uniform float uMin; uniform vec2 uRes;
    varying vec4 vC; varying vec2 vP; varying float vH; varying float vR; varying float vG;
    void main() {
      mat4 space = iSky > .5 ? uSky : (iHand > .5 ? uPalm : mat4(1.0));
      vec4 a = viewMatrix * space * vec4(iPos, 1.0);
      if (a.z > -0.04) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      vec4 b = viewMatrix * space * vec4(iPos - iVel * iSize.y, 1.0);
      if (b.z > -0.04) b = a;
      vec4 pa = projectionMatrix * a, pb = projectionMatrix * b;
      vec2 sa = pa.xy / pa.w * uRes * 0.5, sb = pb.xy / pb.w * uRes * 0.5;
      float r = clamp(iSize.x * length(space[0].xyz) * uScale / -a.z, uMin, 520.0);
      vec2 d = sa - sb; float len = length(d);
      vec2 ux = len > 0.01 ? d / len : vec2(1.0, 0.0), uy = vec2(-ux.y, ux.x);
      float h = len * 0.5;
      vec2 s = (sa + sb) * 0.5 + ux * position.x * (h + r) + uy * position.y * r;
      gl_Position = vec4(s / (uRes * 0.5) * pa.w, pa.z, pa.w);
      vP = vec2(position.x * (h + r), position.y * r); vH = h; vR = r; vC = iCol; vG = iSize.z;
    }`,
  fragmentShader: `
    varying vec4 vC; varying vec2 vP; varying float vH; varying float vR; varying float vG;
    void main() {
      float d = length(vec2(max(abs(vP.x) - vH, 0.0), vP.y)) / vR;
      if (d >= 1.0) discard;
      float halo = pow(1.0 - d, 3.0);
      float core = 1.0 - smoothstep(0.02, 0.36, d);
      float along = vH > 0.5 ? clamp((vP.x + vH) / (2.0 * vH), 0.0, 1.0) : 1.0;
      vec3 c = vG > 0.5
        ? vC.rgb * halo * halo
        : vC.rgb * halo * 0.9 + mix(vC.rgb, vec3(1.0, 0.97, 0.92), 0.38) * core * 1.15;
      float fade = vG < -0.5 ? 1.0 : mix(0.12, 1.0, along * along);
      gl_FragColor = vec4(c * vC.a * fade, 0.0);
    }`,
});
const sparks = new THREE.Mesh(sparkGeo, sparkMat);
sparks.frustumCulled = false; sparks.renderOrder = 3;
scene.add(sparks);

function spawn(x, y, z, vx, vy, vz, life, size, c1, c2, drag, grav, flag = 0, tl = 0, str = .033, glow = 0, groundY = floorY) {
  const i = head; head = (head + 1) % N;
  P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
  P.hand[i] = effectSpace === palmWorld ? 1 : 0; P.sky[i] = effectSpace === skyWorld ? 1 : effectSpace === objectFrame || effectSpace === objectWorld ? 2 : 0;
  P.age[i] = 0; P.life[i] = life; P.size[i] = size;
  P.r[i] = c1[0]; P.g[i] = c1[1]; P.b[i] = c1[2]; P.r2[i] = c2[0]; P.g2[i] = c2[1]; P.b2[i] = c2[2];
  P.drag[i] = drag; P.grav[i] = grav; P.flag[i] = flag; P.tl[i] = tl; P.tt[i] = 0; P.str[i] = str; P.glow[i] = glow; P.groundY[i] = groundY;
  if (P.hand[i]) particleToRoom(P, i);
  else if (effectSpace === objectWorld) particleToObjectFrame(P, i);
  return i;
}
let quality = 1;
function updateSparks(dt) {
  let n = 0;
  const room = aliveCount < N * .78;
  const trailGap = quality > .8 ? .03 : .05;
  for (let i = 0; i < N; i++) {
    if (P.life[i] <= 0) continue;
    effectSpace = P.sky[i] === 2 ? objectFrame : P.sky[i] ? skyWorld : P.hand[i] ? palmWorld : world;
    if (spacePaused(effectSpace)) continue;
    P.age[i] += dt;
    const fl = P.flag[i];
    if (P.age[i] >= P.life[i]) {
      if (fl & F.CRACKLE) {
        const s = P.size[i];
        for (let k = 0; k < 6; k++) { const d = randDir(), v = rand(6, 16) * s; spawn(P.x[i], P.y[i], P.z[i], d[0] * v, d[1] * v, d[2] * v, rand(.1, .24), s * .5, C.white, C.gold, 3, 2, F.TWINKLE); }
        spawn(P.x[i], P.y[i], P.z[i], 0, 0, 0, .07, s * 3, C.white, C.gold, 0, 0, 0, 0, 0, 1);
      }
      P.life[i] = 0;
      continue;
    }
    if (fl & F.SEG) P.y[i] -= P.grav[i] * P.age[i] * dt; // a trail piece stays put and only sags; its velocity just sets its length
    else {
      const damp = Math.exp(-P.drag[i] * dt);
      P.vx[i] = P.vx[i] * damp + (P.sky[i] === 1 ? 1.3 * (1 - damp) : 0);
      P.vy[i] = P.vy[i] * damp - P.grav[i] * dt; P.vz[i] = P.vz[i] * damp + (P.sky[i] === 1 ? .45 * (1 - damp) : 0);
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
    }
    if ((fl & F.BOUNCE) && P.y[i] < P.groundY[i]) { P.y[i] = P.groundY[i]; P.vy[i] *= -.32; P.vx[i] *= .55; P.vz[i] *= .55; }
    const k = P.age[i] / P.life[i];
    const r = P.r[i] + (P.r2[i] - P.r[i]) * k, g = P.g[i] + (P.g2[i] - P.g[i]) * k, b = P.b[i] + (P.b2[i] - P.b[i]) * k;
    // Stars burn steadily and then gutter out; loose sparks just fade.
    let a = (fl & F.LATE) ? (k < .8 ? .94 + Math.random() * .06 : Math.pow(1 - (k - .8) / .2, 1.6)) : 1 - k * k;
    if (fl & F.TWINKLE) a *= Math.random() < .42 ? 1.25 : .16;
    if ((fl & F.TRAIL) && room) {
      P.tt[i] -= dt;
      if (P.tt[i] <= 0) {
        P.tt[i] = trailGap;
        spawn(P.x[i], P.y[i], P.z[i], P.vx[i], P.vy[i], P.vz[i], P.tl[i] * rand(.7, 1.1), P.size[i] * .46, [r * .95, g * .72, b * .5], C.charcoal, 0, P.grav[i] * .16, F.SEG, 0, Math.max(trailGap, dt) * 1.25, -1);
      }
    }
    outHand[n] = P.hand[i]; outSky[n] = P.sky[i];
    outPos[n * 3] = P.x[i]; outPos[n * 3 + 1] = P.y[i]; outPos[n * 3 + 2] = P.z[i];
    outVel[n * 3] = P.vx[i]; outVel[n * 3 + 1] = P.vy[i]; outVel[n * 3 + 2] = P.vz[i];
    outCol[n * 4] = r; outCol[n * 4 + 1] = g; outCol[n * 4 + 2] = b; outCol[n * 4 + 3] = a;
    outSize[n * 3] = P.size[i]; outSize[n * 3 + 1] = P.str[i]; outSize[n * 3 + 2] = P.glow[i];
    n++;
  }
  effectSpace = world;
  aliveCount = n;
  sparkGeo.instanceCount = n;
  for (const name of ['iSky', 'iHand', 'iPos', 'iVel', 'iCol', 'iSize']) sparkGeo.attributes[name].needsUpdate = true;
}

/* ---------- Smoke, and the paper a cracker leaves behind ---------- */
const M = 1400;
const S = {};
for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'age', 'life', 'size', 'grow', 'rot', 'spin', 'r', 'g', 'b', 'r2', 'g2', 'b2', 'a', 'drag', 'grav', 'wind', 'hard', 'groundY']) S[k] = new Float32Array(M);
S.hand = new Uint8Array(M); S.sky = new Uint8Array(M);
let sHead = 0;
const sPos = new Float32Array(M * 3), sCol = new Float32Array(M * 4), sSize = new Float32Array(M * 3);
const sHand = new Float32Array(M), sSky = new Float32Array(M);
const smokeGeo = instanced(['iSky', sSky, 1], ['iHand', sHand, 1], ['iPos', sPos, 3], ['iCol', sCol, 4], ['iSize', sSize, 3]);
const smokeTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 90; i++) {
    const a = rand(0, TAU), r = Math.pow(Math.random(), .7) * 36, px = 64 + Math.cos(a) * r, py = 64 + Math.sin(a) * r, s = rand(10, 26);
    const g = x.createRadialGradient(px, py, 0, px, py, s);
    g.addColorStop(0, 'rgba(255,255,255,.2)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(px - s, py - s, s * 2, s * 2);
  }
  return new THREE.CanvasTexture(c);
})();
const smokeMat = new THREE.ShaderMaterial({
  uniforms: { uTex: { value: smokeTex }, uSky: { value: skyWorld.matrixWorld }, uPalm: { value: palmWorld.matrixWorld } },
  transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  vertexShader: `
    attribute float iSky; uniform mat4 uSky; attribute float iHand; uniform mat4 uPalm;
    attribute vec3 iPos; attribute vec4 iCol; attribute vec3 iSize;
    varying vec2 vUv; varying vec4 vC; varying float vHard;
    void main() {
      vUv = position.xy * 0.5 + 0.5; vC = iCol; vHard = iSize.z;
      float c = cos(iSize.y), s = sin(iSize.y);
      vec2 offset = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSize.x;
      mat4 space = iSky > .5 ? uSky : (iHand > .5 ? uPalm : mat4(1.0));
      vec4 mv = viewMatrix * space * vec4(iPos, 1.0);
      // Landed paper lies on the original floor, rather than turning to face
      // the camera like airborne smoke. This keeps its shape fixed in AR.
      if (iSize.z > 1.5) mv = viewMatrix * space * vec4(iPos + vec3(offset.x, 0.0, offset.y), 1.0);
      else mv.xy += offset * length(space[0].xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform sampler2D uTex; varying vec2 vUv; varying vec4 vC; varying float vHard;
    void main() {
      float a = vC.a;
      if (vHard > 0.5) { // torn paper: a thin, ragged shred
        vec2 p = (vUv - 0.5) * 2.0;
        if (max(abs(p.x), abs(p.y) * 2.2) + 0.22 * sin(p.x * 7.0 + p.y * 11.0) > 0.8) discard;
      } else a *= texture2D(uTex, vUv).a;
      gl_FragColor = vec4(vC.rgb * a, a);
    }`,
});
const smoke = new THREE.Mesh(smokeGeo, smokeMat);
smoke.frustumCulled = false; smoke.renderOrder = 2;
scene.add(smoke);
function puff(x, y, z, vx, vy, vz, life, size, grow, lit, base, alpha, drag, grav, wind, hard = 0, groundY = floorY) {
  const i = sHead; sHead = (sHead + 1) % M;
  S.hand[i] = effectSpace === palmWorld ? 1 : 0; S.sky[i] = effectSpace === skyWorld ? 1 : effectSpace === objectFrame || effectSpace === objectWorld ? 2 : 0;
  S.x[i] = x; S.y[i] = y; S.z[i] = z; S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz; S.age[i] = 0; S.life[i] = life; S.size[i] = size; S.grow[i] = grow;
  S.rot[i] = rand(0, TAU); S.spin[i] = rand(-.5, .5) * (hard ? 12 : 1);
  S.r[i] = lit[0]; S.g[i] = lit[1]; S.b[i] = lit[2]; S.r2[i] = base[0]; S.g2[i] = base[1]; S.b2[i] = base[2];
  S.a[i] = alpha; S.drag[i] = drag; S.grav[i] = grav; S.wind[i] = wind; S.hard[i] = hard; S.groundY[i] = groundY;
  if (S.hand[i]) particleToRoom(S, i);
  else if (effectSpace === objectWorld) particleToObjectFrame(S, i);
}
const particlePoint = new THREE.Vector3(), particleVelocity = new THREE.Vector3(), particleMatrix = new THREE.Matrix3();
function particleToRoom(store, i) {
  particlePoint.set(store.x[i], store.y[i], store.z[i]).applyMatrix4(palmWorld.matrixWorld);
  particleMatrix.setFromMatrix4(palmWorld.matrixWorld);
  particleVelocity.set(store.vx[i], store.vy[i], store.vz[i]).applyMatrix3(particleMatrix);
  store.x[i] = particlePoint.x; store.y[i] = particlePoint.y; store.z[i] = particlePoint.z;
  store.vx[i] = particleVelocity.x; store.vy[i] = particleVelocity.y; store.vz[i] = particleVelocity.z;
  const scale = palmWorld.scale.x;
  store.size[i] *= scale; store.grav[i] *= scale;
  if (store.grow) { store.grow[i] *= scale; store.wind[i] *= scale; }
  store.groundY[i] = palmMotion?.floorY ?? floorY; store.hand[i] = 0;
}
// Detach emitted sparks/smoke from the moving crown immediately, keeping the
// settled camera frame. A nod moves the nozzle, never the old spark trail.
function particleToObjectFrame(store, i) {
  objectWorld.updateMatrix();
  particlePoint.set(store.x[i], store.y[i], store.z[i]).applyMatrix4(objectWorld.matrix);
  particleMatrix.setFromMatrix4(objectWorld.matrix);
  particleVelocity.set(store.vx[i], store.vy[i], store.vz[i]).applyMatrix3(particleMatrix);
  store.x[i] = particlePoint.x; store.y[i] = particlePoint.y; store.z[i] = particlePoint.z;
  store.vx[i] = particleVelocity.x; store.vy[i] = particleVelocity.y; store.vz[i] = particleVelocity.z;
  const scale = objectWorld.scale.x;
  store.size[i] *= scale; store.grav[i] *= scale;
  if (store.grow) { store.grow[i] *= scale; store.wind[i] *= scale; }
  // Unknown surfaces must not produce a fictitious horizontal collision shelf.
  store.groundY[i] = -1000;
  if (store.flag) store.flag[i] &= ~F.BOUNCE;
}
function updateSmoke(dt) {
  let n = 0;
  for (let i = 0; i < M; i++) {
    if (S.life[i] <= 0 || spacePaused(S.sky[i] === 2 ? objectFrame : S.sky[i] ? skyWorld : S.hand[i] ? palmWorld : world)) continue;
    S.age[i] += dt;
    if (S.age[i] >= S.life[i]) { S.life[i] = 0; continue; }
    const damp = Math.exp(-S.drag[i] * dt);
    S.vx[i] *= damp; S.vy[i] = S.vy[i] * damp - S.grav[i] * dt; S.vz[i] *= damp;
    S.x[i] += (S.vx[i] + S.wind[i]) * dt; S.y[i] += S.vy[i] * dt; S.z[i] += (S.vz[i] + S.wind[i] * .4) * dt;
    const hard = S.hard[i] > .5;
    if (hard) {
      if (S.y[i] <= S.groundY[i] + .002) { S.y[i] = S.groundY[i] + .002; S.vx[i] = S.vz[i] = S.vy[i] = 0; S.spin[i] = 0; S.grav[i] = 0; S.wind[i] = 0; }
      S.rot[i] += S.spin[i] * dt;
    } else {
      S.rot[i] += S.spin[i] * dt;
      S.size[i] += S.grow[i] * dt;
    }
    const k = S.age[i] / S.life[i], m = hard ? 0 : Math.min(1, k * 4);
    const lift = hard ? clamp(ambLum * 2.6, .28, 1.05) : 1;
    sHand[n] = S.hand[i]; sSky[n] = S.sky[i];
    sPos[n * 3] = S.x[i]; sPos[n * 3 + 1] = S.y[i]; sPos[n * 3 + 2] = S.z[i];
    sCol[n * 4] = (S.r[i] + (S.r2[i] - S.r[i]) * m) * lift; sCol[n * 4 + 1] = (S.g[i] + (S.g2[i] - S.g[i]) * m) * lift; sCol[n * 4 + 2] = (S.b[i] + (S.b2[i] - S.b[i]) * m) * lift;
    sCol[n * 4 + 3] = S.a[i] * (hard ? (k < .85 ? 1 : 1 - (k - .85) / .15) : Math.min(1, k * 7) * (1 - k));
    sSize[n * 3] = S.size[i]; sSize[n * 3 + 1] = S.rot[i];
    sSize[n * 3 + 2] = hard && S.y[i] <= S.groundY[i] + .0021 ? 2 : S.hard[i];
    n++;
  }
  smokeGeo.instanceCount = n;
  for (const name of ['iSky', 'iHand', 'iPos', 'iCol', 'iSize']) smokeGeo.attributes[name].needsUpdate = true;
}

/* ---------- Sound, all synthesized ---------- */
let actx = null, master = null, noiseBuf = null, verbIn = null, muted = false;
function syncAudioPlayback() {
  const sync = (context, paused) => {
    if (!context) return;
    if (document.hidden || paused) { if (context.state === 'running') context.suspend()?.catch(() => {}); }
    else if (context.state !== 'running') context.resume()?.catch(() => {});
  };
  sync(actx, spacePaused(effectSpace));
  if (handAudio?.actx !== actx) sync(handAudio?.actx, spacePaused(palmWorld));
  if (skyAudio?.actx !== actx) sync(skyAudio?.actx, spacePaused(skyWorld));
  if (objectAudio?.actx !== actx) sync(objectAudio?.actx, objectSoundPaused());
}
function ensureAudio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari: the silent switch mutes it */ }
    try { actx = new AC(); } catch { return; }
    master = actx.createGain();
    master.gain.value = muted ? 0 : .9;
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = .002; comp.release.value = .18;
    master.connect(comp); comp.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // An open street: a few hard slaps off nearby buildings, then a long dull tail.
    const len = Math.floor(actx.sampleRate * 3.2), ir = actx.createBuffer(2, len, actx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const o = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / actx.sampleRate;
        lp += ((Math.random() * 2 - 1) - lp) * clamp(.5 - t * .16, .05, .5);
        o[i] = lp * Math.pow(1 - i / len, 2.6) * .8;
      }
      for (const [at, g] of [[.07, .7], [.13, .5], [.21, .45], [.34, .3], [.52, .2]]) {
        const s = Math.floor((at + rand(0, .02)) * actx.sampleRate);
        for (let i = 0; i < 700; i++) o[s + i] += (Math.random() * 2 - 1) * g * (1 - i / 700);
      }
    }
    const verb = actx.createConvolver();
    verb.buffer = ir;
    verbIn = actx.createGain();
    verbIn.connect(verb); verb.connect(master);
  }
  if (effectSpace === world && !skyAudio?.actx) withEffectSpace(skyWorld, ensureAudio);
  syncAudioPlayback(); // Resume an interrupted context on the next permitted tap/frame.
}
addEventListener('touchend', () => { if (playing) ensureAudio(); }, { passive: true });
function route(node, pan, wet) {
  let out = node;
  const owned = [node];
  if (actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = clamp(pan || 0, -1, 1); node.connect(p); out = p; owned.push(p); }
  out.connect(master);
  if (wet) { const w = actx.createGain(); w.gain.value = wet; out.connect(w); w.connect(verbIn); owned.push(w); }
  return () => owned.forEach(n => n.disconnect());
}
function tone({ type = 'sine', f0, f1 = f0, dur, vol, pan = 0, wet = 0, delay = 0 }) {
  if (!actx || muted) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + .004);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); const disconnect = route(g, pan, wet);
  o.onended = () => { o.disconnect(); disconnect(); };
  o.start(t); o.stop(t + dur + .05);
}
function noise({ dur, vol, f0, f1 = f0, type = 'lowpass', q = .7, pan = 0, wet = 0, delay = 0, attack = .003, hold = false }) {
  if (!actx || muted) return;
  const t = actx.currentTime + delay;
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  if (hold) g.gain.setValueAtTime(vol, t + dur * .82);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g); const disconnect = route(g, pan, wet);
  s.onended = () => { s.disconnect(); f.disconnect(); disconnect(); };
  s.start(t, Math.random() * 1.5); s.stop(t + dur + .05);
}
const sfx = {
  // Launch tube: a soft low thump from nearby.
  lift(pan) { noise({ dur: .22, vol: .3, f0: 520, f1: 120, pan, wet: .12 }); tone({ f0: 170, f1: 62, dur: .16, vol: .32, pan }); },
  // A rocket leaving: a hiss that thins out as it climbs away.
  fizz(dur, pan) { noise({ dur, vol: .22, f0: 5400, f1: 1900, type: 'bandpass', q: .8, pan, attack: .04, wet: .35 }); },
  // A shell bursting high up: a sharp crack, a heavy body, then the street answers. You hear it after you see it.
  burst(p, size = 1) {
    const { delay, gain, cutoff } = skySound(skyDistance(p)), pan = panFor(p);
    noise({ dur: .05, vol: .7 * gain, f0: cutoff, type: 'lowpass', pan, wet: .9, delay });
    noise({ dur: .75 * size, vol: .6 * gain, f0: 1500, f1: 95, pan, wet: 1.1, delay });
    tone({ f0: 78, f1: 30, dur: .85 * size, vol: .75 * size * gain, pan, wet: .5, delay });
    return delay;
  },
  // A rocket's payload is small: all crack and very little body.
  crack(p) {
    const { delay, gain, cutoff } = skySound(skyDistance(p)), pan = panFor(p);
    noise({ dur: .04, vol: .8 * gain, f0: cutoff, type: 'lowpass', pan, wet: .9, delay });
    noise({ dur: .28, vol: .4 * gain, f0: 1800, f1: 240, pan, wet: .8, delay });
    tone({ f0: 140, f1: 60, dur: .18, vol: .3 * gain, pan, wet: .3, delay });
  },
  crackle(n, pan, start, spread) {
    let t = start;
    for (let i = 0; i < n; i++) {
      t += Math.random() < .22 ? rand(.02, .09) : rand(.002, .012);
      if (t > start + spread) t = start + Math.random() * spread;
      noise({ dur: .018, vol: rand(.05, .2), f0: rand(2200, 7500), type: 'bandpass', q: 1.2, pan: pan + rand(-.15, .15), wet: .35, delay: t });
    }
  },
  sizzle(dur, pan, delay) { noise({ dur, vol: .09, f0: 7200, f1: 3400, type: 'highpass', pan, delay, attack: .4, wet: .4 }); },
  pop(pan, delay, v = 1) {
    noise({ dur: .035, vol: .55 * v, f0: 1800, type: 'highpass', pan, wet: .3, delay });
    noise({ dur: .07, vol: .4 * v, f0: 2800, f1: 500, pan, wet: .3, delay });
    tone({ f0: 210, f1: 80, dur: .05, vol: .2 * v, pan, delay });
  },
  fuse(dur, pan) { noise({ dur, vol: .13, f0: 7500, f1: 5200, type: 'highpass', pan, hold: true }); this.crackle(Math.floor(dur * 24), pan, 0, dur); },
  fountain(dur, pan) {
    noise({ dur, vol: .14, f0: 3400, f1: 1300, pan, hold: true, attack: .4, wet: .16 });
    noise({ dur, vol: .045, f0: 5700, f1: 8000, type: 'highpass', pan, hold: true, attack: .6, wet: .08 });
  },
  spin(dur, pan) {
    noise({ dur, vol: .13, f0: 2400, f1: 5200, type: 'bandpass', q: .5, pan, hold: true, attack: .5, wet: .16 });
    noise({ dur, vol: .035, f0: 6500, f1: 2400, type: 'highpass', pan, hold: true, attack: .5 });
  },
  bomb(pan, power = 1) {
    const body = .55 + .45 * power;
    noise({ dur: .07, vol: body, f0: 1400, type: 'highpass', pan, wet: 1 });
    noise({ dur: .5 + .8 * power, vol: .95 * body, f0: 3600, f1: 60, pan, wet: .5 + .6 * power });
    tone({ f0: 150 - 58 * power, f1: 55 - 30 * power, dur: .4 + .8 * power, vol: body, pan, wet: .4 });
    if (power > .5) tone({ type: 'sawtooth', f0: 64, f1: 24, dur: .45, vol: .4 * power, pan });
  },
  // Someone else's Diwali, a few streets away.
  distant() {
    const pan = rand(-.9, .9), r = Math.random();
    if (r < .3) {
      const n = 8 + Math.floor(rand(0, 22));
      for (let i = 0; i < n; i++) { const delay = i * rand(.05, .08) + rand(0, .03); noise({ dur: .05, vol: rand(.03, .07), f0: 900, f1: 300, pan, wet: 1.3, delay }); }
    } else {
      noise({ dur: .6, vol: rand(.05, .11), f0: 420, f1: 80, pan, wet: 1.5 });
      tone({ f0: 60, f1: 30, dur: .55, vol: rand(.05, .14), pan, wet: .8 });
    }
  },
};
/* ---------- Where things are ---------- */
const fwd = new THREE.Vector3();
let W = 1, H = 1, dpr = 1;
const tmp = new THREE.Vector3();
function rayAt(cx, cy) { return new THREE.Vector3((cx / W) * 2 - 1, -(cy / H) * 2 + 1, .5).unproject(camera).sub(camera.position).normalize(); }
function floorPoint(ray) {
  return groundIntersection(THREE, camera.position, ray, floorY);
}
function placementPoint(cx, cy) {
  if (worldTracking?.active) {
    if (!worldTracking.ready) return null;
    const hit = worldTracking.hit(cx / W, cy / H, tableSurface);
    if (hit && [hit.x, hit.y, hit.z].every(Number.isFinite) && hit.y < camera.position.y - .05) {
      return new THREE.Vector3(hit.x, hit.y, hit.z);
    }
  }
  return floorPoint(rayAt(cx, cy));
}
function panFor(p) { tmp.copy(p); if (effectSpace !== world) effectSpace.localToWorld(tmp); tmp.applyMatrix4(camera.matrixWorldInverse); return clamp(tmp.x / Math.max(1, tmp.length()), -1, 1) * .85; }
function burnTip(model, progress, flame) {
  const tip = model.burn(progress, flame);
  return effectSpace !== world ? effectSpace.worldToLocal(tip) : tip;
}
function randDir() { const u = Math.random() * 2 - 1, t = Math.random() * TAU, s = Math.sqrt(1 - u * u); return [Math.cos(t) * s, u, Math.sin(t) * s]; }

/* ---------- Sky shells ---------- */
const emitters = [];
function withEffectSpace(space, work) {
  const before = effectSpace, sound = { actx, master, noiseBuf, verbIn };
  effectSpace = space;
  if (space !== world) ({ actx = null, master = null, noiseBuf = null, verbIn = null } = (space === palmWorld ? handAudio : space === skyWorld ? skyAudio : objectAudio) || {});
  try { return work(); }
  finally {
    if (space === palmWorld) handAudio = { actx, master, noiseBuf, verbIn };
    if (space === skyWorld) skyAudio = { actx, master, noiseBuf, verbIn };
    if (space === objectWorld || space === objectFrame) objectAudio = { actx, master, noiseBuf, verbIn };
    ({ actx, master, noiseBuf, verbIn } = sound); effectSpace = before;
  }
}
function addEmitter(emitter) {
  const update = emitter.update, space = effectSpace;
  emitter.space = space;
  emitter.update = dt => spacePaused(space) ? true : withEffectSpace(space, () => update(dt));
  emitters.push(emitter);
}
const skyEffect = work => (...args) => withEffectSpace(skyWorld, () => work(...args));
let shake = 0;
const glowAt = (p, size, c, life) => spawn(p.x, p.y, p.z, 0, 0, 0, life, size, c, c, 0, 0, 0, 0, 0, 1);
const SMOKE_BASE = [.065, .07, .08];
function shellSmoke(p, R, c, n = 16) {
  for (let i = 0; i < n * quality; i++) {
    const d = randDir(), r = R * Math.pow(Math.random(), .6) * .22;
    puff(p.x + d[0] * r, p.y + d[1] * r, p.z + d[2] * r, d[0] * 3, d[1] * 3 + .4, d[2] * 3, rand(4.5, 7.5), R * rand(.12, .22), R * .075, [c[0] * .38, c[1] * .38, c[2] * .38], SMOKE_BASE, rand(.1, .18), .65, -.12, 1.8);
  }
}
function burstCommon(p, R, c1, silent, size = 1) {
  glowAt(p, R * 1.5, c1, .16);
  glowAt(p, R * .7, C.white, .09);
  lightScene(c1, .13 * size, p);
  shellSmoke(p, R, c1);
  return silent ? .3 : sfx.burst(p, size);
}
function shellStars(p, n, R, k, life, size, c1, c2, grav, flag, tl) {
  const v = R * k, count = Math.floor(n * (quality > .8 ? 1 : .7)), phase = rand(0, TAU);
  for (let i = 0; i < count; i++) {
    const star = shellStar(i, count, phase), speed = v * star.speed;
    spawn(p.x, p.y, p.z, star.x * speed, star.y * speed, star.z * speed, life * star.life,
      size * star.size, c1, c2, k * star.drag, grav, flag, tl);
  }
}
const peony = skyEffect(function (p, silent, scale = 1, origin = skyOrigin()) {
  noteSkyActivity(2.5);
  const [a, b] = pick(PAIRS), D = p.distanceTo(origin), R = D * rand(.25, .29) * scale;
  burstCommon(p, R, a, silent, scale);
  shellStars(p, 230 * scale, R, 2, 2.15, D * .0115, a, b, 9.8, F.LATE, 0);
  shellStars(p, 80 * scale, R * .45, 2.3, 1.5, D * .009, b, C.white, 9.8, F.LATE, 0);
});
const chrysanthemum = skyEffect(function (p, silent, scale = 1, origin = skyOrigin()) {
  noteSkyActivity(3.45);
  const [a, b] = pick(PAIRS), D = p.distanceTo(origin), R = D * rand(.28, .32) * scale;
  burstCommon(p, R, a, silent, 1.2 * scale);
  shellStars(p, 210 * scale, R, 1.9, 2.5, D * .0115, C.white, a, 9.8, F.TRAIL | F.LATE, .5);
  shellStars(p, 45, R * .3, 2.2, 1.3, D * .01, b, b, 6, F.TWINKLE | F.LATE, 0);
});
const goldenRain = skyEffect(function (p, silent, _scale = 1, origin = skyOrigin()) {
  noteSkyActivity(6.1);
  const D = p.distanceTo(origin), R = D * rand(.24, .27);
  const delay = burstCommon(p, R, C.gold, silent, .85);
  shellStars(p, 175, R, 1.45, 4.3, D * .0095, C.gold, C.charcoal, 9.8, F.TRAIL | F.LATE, 1.15);
  if (!silent) sfx.sizzle(3.6, panFor(p), delay + .2);
});
const crackling = skyEffect(function (p, silent, _scale = 1, origin = skyOrigin()) {
  noteSkyActivity(2.2);
  const D = p.distanceTo(origin), R = D * rand(.22, .26);
  const delay = burstCommon(p, R, C.silver, silent, .75);
  shellStars(p, 110, R, 2, 1.25, D * .009, C.gold, C.silver, 9.8, F.CRACKLE | F.LATE, 0);
  if (!silent) sfx.crackle(90, panFor(p), delay + 1, 1.05);
});
// Every shell climbs to where you tapped before it breaks, so you see the tail and hear the tube first.
const launch = skyEffect(function (target, burst, T = rand(1.25, 1.65), silent = false, view = VIEW()) {
  noteSkyActivity();
  const start = view.origin.clone().lerp(target, .78); start.y = view.groundY ?? floorY;
  const size = target.distanceTo(view.origin) * .004;
  const pos = new THREE.Vector3(), last = start.clone();
  if (!silent) sfx.lift(panFor(target));
  let t = 0, carry = 0;
  addEmitter({ sky: true, update(dt) {
    t += dt;
    const k = Math.min(1, t / T);
    shellFlight(start, target, t, T, pos);
    carry += dt * 150; const count = Math.min(9, Math.floor(carry)); carry -= Math.floor(carry);
    for (let i = 0; i < count; i++) {
      const f = i / count;
      spawn(last.x + (pos.x - last.x) * f, last.y + (pos.y - last.y) * f, last.z + (pos.z - last.z) * f, rand(-1, 1), rand(-4, -1), rand(-1, 1), rand(.2, .45), size * rand(.6, 1.1), C.gold, C.charcoal, 1.5, 3, 0, 0, .06);
    }
    last.copy(pos);
    if (k >= 1) { burst(target.clone(), silent, 1, view.origin); return false; }
    return true;
  } });
});
// A rocket is a small motor with a small payload: it burns out, coasts for a beat in the dark, then cracks open into a few heavy comets.
const rocketBreak = skyEffect(function (p, origin = skyOrigin()) {
  noteSkyActivity(3.85);
  const D = p.distanceTo(origin), R = D * rand(.17, .2), c = pick([C.gold, C.gold, C.red, C.green, C.silver]);
  glowAt(p, R * 1.1, C.white, .09);
  lightScene(c, .08, p);
  shellSmoke(p, R, c, 8);
  sfx.crack(p);
  for (let i = 0; i < 34; i++) {
    const d = randDir(), v = R * 2.1 * rand(.65, 1.1);
    spawn(p.x, p.y, p.z, d[0] * v, (d[1] + .25) * v, d[2] * v, rand(1.7, 2.4), D * .0125, c, C.amber, 2.1, 17, F.TRAIL | F.LATE, rand(.8, 1.15));
  }
  for (let i = 0; i < 50; i++) {
    const d = randDir(), v = R * rand(1, 4);
    spawn(p.x, p.y, p.z, d[0] * v, d[1] * v, d[2] * v, rand(.25, .55), D * .0045, C.white, C.gold, 3.4, 9.8, F.TWINKLE);
  }
});
const rocket = skyEffect(function (target) {
  noteSkyActivity();
  const { r, origin, groundY } = VIEW();
  const start = origin.clone().lerp(target, .65); start.y = groundY;
  const pos = new THREE.Vector3(), last = start.clone();
  const bow = target.distanceTo(origin) * rand(.02, .045) * (Math.random() < .5 ? -1 : 1), wob = rand(0, TAU);
  const burn = rand(1.15, 1.4), T = burn + rand(.4, .55), ember = [.8, .3, .06];
  sfx.fizz(burn + .2, panFor(target));
  let t = 0;
  addEmitter({ sky: true, update(dt) {
    t += dt;
    const e = t < burn ? .8 * Math.pow(t / burn, 1.7) : .8 + .2 * (1 - Math.pow(1 - Math.min(1, (t - burn) / (T - burn)), 2));
    pos.lerpVectors(start, target, e).addScaledVector(r, Math.sin(Math.PI * e) * bow + Math.sin(t * 30 + wob) * .14 * (1 - e));
    const D = pos.distanceTo(origin);
    if (t < burn) {
      spawn(pos.x, pos.y, pos.z, pos.x - last.x, pos.y - last.y, pos.z - last.z, rand(.16, .26), D * .0024, C.white, C.charcoal, 0, 0, F.SEG, 0, 1, -1);
      for (let i = 0; i < 3; i++) {
        const f = Math.random();
        spawn(last.x + (pos.x - last.x) * f, last.y + (pos.y - last.y) * f, last.z + (pos.z - last.z) * f, rand(-2, 2), rand(-7, -1.5), rand(-2, 2), rand(.25, .6), D * rand(.0018, .0034), C.gold, C.charcoal, 1.2, 6, Math.random() < .3 ? F.TWINKLE : 0, 0, .05);
      }
      glowAt(pos, D * .012, C.gold, .05);
    } else spawn(pos.x, pos.y, pos.z, 0, 0, 0, .05, D * .0028, ember, ember, 0, 0);
    last.copy(pos);
    if (t >= T) { rocketBreak(target.clone(), origin); return false; }
    return true;
  } });
});
const VIEW = () => skyView(camera, skyWorld, floorY);
const skyOrigin = () => skyWorld.worldToLocal(camera.position.clone());
const skyDistance = p => skyWorld.localToWorld(p.clone()).distanceTo(camera.position);
const twelveShot = skyEffect(function (target) {
  noteSkyActivity();
  const view = VIEW(), { r, origin } = view, dist = target.distanceTo(origin);
  const dir = target.clone().sub(origin).normalize();
  let t = 0, n = 0;
  addEmitter({ sky: true, barrage: true, update(dt) {
    t += dt;
    while (n < 12 && n * .24 <= t) {
      const off = ((n % 2 ? 1 : -1) * (6 - Math.abs(n - 6))) * .05 + rand(-.015, .015);
      const d = dir.clone().addScaledVector(r, off).normalize().multiplyScalar(dist * rand(.88, 1.08)).add(origin);
      launch(d, (q, s, _scale, origin) => peony(q, s, .55, origin), rand(.85, 1.1), false, view);
      n++;
    }
    return n < 12;
  } });
});
const finale = skyEffect(function () {
  noteSkyActivity();
  const view = VIEW(), { f, r, u, origin } = view;
  const plan = [];
  for (let i = 0; i < 26; i++) plan.push({ at: i * .26 + rand(0, .16), fn: pick([peony, chrysanthemum, goldenRain, crackling]) });
  for (let i = 0; i < 7; i++) plan.push({ at: 7.1 + rand(0, .4), fn: chrysanthemum });
  plan.sort((a, b) => a.at - b.at);
  let t = 0, n = 0;
  addEmitter({ sky: true, finale: true, update(dt) {
    t += dt;
    while (n < plan.length && plan[n].at <= t) {
      const d = f.clone().addScaledVector(r, rand(-.34, .34)).addScaledVector(u, rand(-.28, .5)).normalize().multiplyScalar(rand(100, 140)).add(origin);
      launch(d, plan[n++].fn, rand(1.05, 1.45), false, view);
    }
    return n < plan.length;
  } });
  queueSkyWish(0, 'Happy Diwali', view);
});

/* ---------- Ground crackers, as objects ---------- */
function paperTex(draw) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}
const TEX = {
  spinner: paperTex((x) => {
    x.fillStyle = '#b63527'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#ecd183';
    for (let i = 0; i < 128; i += 32) x.fillRect(i, 0, 5, 128);
  }),
  flower: paperTex((x) => {
    x.fillStyle = '#a72731'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#e7b64e'; x.fillRect(0, 16, 128, 7); x.fillRect(0, 93, 128, 16);
    x.strokeStyle = '#f5dc94'; x.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const cx = 16 + i * 32;
      x.beginPath(); x.moveTo(cx, 40); x.lineTo(cx + 10, 57); x.lineTo(cx, 74); x.lineTo(cx - 10, 57); x.closePath(); x.stroke();
      x.beginPath(); x.arc(cx, 57, 4, 0, TAU); x.stroke();
    }
  }),
  atom: paperTex((x) => {
    x.fillStyle = '#2c6a41'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#e9c23a'; x.fillRect(0, 50, 128, 28);
    x.fillStyle = '#b3241c'; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(16 + i * 32, 64, 8, 0, TAU); x.fill(); }
    x.strokeStyle = '#d9c9a0'; x.lineWidth = 3;
    for (let y = 12; y < 128; y += 34) { x.beginPath(); x.moveTo(0, y); x.lineTo(128, y + 6); x.stroke(); }
  }),
  lakshmi: paperTex((x) => {
    x.fillStyle = '#c0281f'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#f0d27a'; x.fillRect(0, 44, 128, 40);
    x.fillStyle = '#c0281f'; x.beginPath(); x.arc(64, 64, 13, 0, TAU); x.fill();
  }),
  sutli: paperTex((x) => {
    x.fillStyle = '#6d5332'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#99794b'; x.lineWidth = 2;
    for (let i = -128; i < 128; i += 6) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke(); }
    x.strokeStyle = '#4a3820'; x.lineWidth = 1;
    for (let i = 0; i < 256; i += 9) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i - 128, 128); x.stroke(); }
  }),
  wala: paperTex((x) => {
    x.fillStyle = '#b81f1c'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#d7b975'; x.fillRect(0, 57, 128, 10);
    x.fillStyle = '#8c1816'; x.fillRect(0, 0, 3, 128);
    x.strokeStyle = 'rgba(255,226,176,.12)'; x.lineWidth = 1;
    for (let y = 8; y < 128; y += 13) { x.beginPath(); x.moveTo(0, y); x.lineTo(128, y + 3); x.stroke(); }
  }),
  shadow: paperTex((x) => {
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.55, 'rgba(0,0,0,.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.clearRect(0, 0, 128, 128); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }),
};
const G = {
  wala: new THREE.CylinderGeometry(.007, .007, .04, 8),
  plane: new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
};
let ambLum = .4;
function contactShadow(x, z, radius, opacity, groundY = floorY) {
  if (effectSpace === palmWorld) radius = Math.min(radius, handStabilizer.width * .42 / palmWorld.scale.x);
  const mat = new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, opacity, depthWrite: false, depthTest: true, toneMapped: false });
  const m = new THREE.Mesh(G.plane, mat);
  m.position.set(x, groundY + .003, z);
  m.scale.setScalar(radius);
  m.frustumCulled = false; m.renderOrder = 1;
  m.userData.contactShadow = true;
  if (effectSpace === objectWorld) m.visible = false;
  effectSpace.add(m);
  return m;
}
const dropProp = (p) => { p.model.dispose(); p.shadow.material.dispose(); p.shadow.removeFromParent(); };
function groundSmoke(x, y, z, c, n, size, rise) {
  for (let i = 0; i < n; i++) puff(x + rand(-.03, .03), y, z + rand(-.03, .03), rand(-.1, .1), rise * rand(.6, 1.2), rand(-.1, .1), rand(1.4, 2.8), size * rand(.7, 1.2), size * .55, c, [.22, .21, .2], rand(.09, .17), .6, -.05, .08);
}

const PAPER = [.72, .08, .07], PAPER2 = [.85, .62, .28];
function scatterPaper(x, y, z, n, speed, life, groundY) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), v = rand(.15, .6) * speed, c = Math.random() < .86 ? PAPER : PAPER2;
    puff(x, y, z, Math.cos(a) * v, rand(.6, 1.2) * speed, Math.sin(a) * v, life * rand(.75, 1.1), rand(.005, .01), 0, c, c, 1, 2.6, 4.6, .05, 1, groundY);
  }
}
// One routine, scaled by how much powder is packed inside.
const BOMBS = {
  atom: { kind: 'atom', shadow: .10, fuse: 1.7, power: 1 },
  sutli: { kind: 'sutli', shadow: .09, fuse: 1.2, power: .7 },
  lakshmi: { kind: 'lakshmi', shadow: .045, fuse: .9, power: .32 },
};
function bomb(p, b) {
  const groundY = p.y;
  const onPalm = effectSpace === palmWorld;
  const { power } = b, fuse = onPalm || effectSpace === objectWorld ? PALM_FUSES[b.kind] : b.fuse;
  const model = createCrackerModel(b.kind, TEX), R = .35 + .65 * power;
  let pan = panFor(p);
  model.group.position.copy(p); effectSpace.add(model.group);
  const prop = { model, shadow: contactShadow(p.x, p.z, b.shadow, .55, groundY) };
  sfx.fuse(fuse, pan);
  let t = 0;
  addEmitter({ ground: true, update(dt) {
    t += dt;
    if (onPalm && b === BOMBS.atom && t < fuse) $('effectStatus').textContent = `Atom bomb · ${palmMotion?.state === 'held' ? 'toss it' : palmMotion?.state === 'landed' ? 'on the floor' : 'in the air'} · ${(fuse - t).toFixed(1)}s`;
    const tip = burnTip(model, t / fuse, .05 + Math.random() * .08);
    if (t < fuse) {
      for (let k = 0; k < 5; k++) spawn(tip.x, tip.y, tip.z, rand(-1, 1), rand(.5, 2), rand(-1, 1), rand(.08, .24), .008, C.white, C.amber, 1.5, 4, F.TWINKLE, 0, .03, 0, groundY);
      floorGlow(p.x, p.z, [1, .55, .2], .12 + Math.random() * .1, .4, groundY);
      return true;
    }
    const grounded = effectSpace !== objectWorld && (!onPalm || palmMotion?.state === 'landed');
    if (effectSpace === objectWorld && objectPlacement) objectPlacement.detached = true;
    if (onPalm) palmMotion?.burst(); // Freeze this burst at its current room position.
    pan = panFor(p);
    dropProp(prop);
    const c = { x: p.x, y: groundY + (onPalm ? model.height * .5 : .18), z: p.z };
    glowAt(c, .7 * R, C.white, .075);
    glowAt(c, 1.1 * R, C.amber, .24);
    floorPulse(p.x, p.z, [1, .85, .6], 1.2 * power, 2.6 * R, 4.8, groundY);
    lightScene([1, .88, .68], .28 * power);
    if (power > .5) shake = (reduceMotion ? .2 : 1) * power;
    sfx.bomb(pan, power);
    if (b === BOMBS.atom) {
      atomSequence.burst();
      $('effectStatus').textContent = 'Let it ring…';
      const aftertoneRun = atomRun;
      playAtomAftertone(actx, master, () => {
        if (aftertoneRun !== atomRun) return;
        atomSequence.finish();
        $('effectStatus').hidden = true;
        // A hold started during the tail must not turn into a surprise launch.
        press = null;
      });
    }
    vibrate(power > .5 ? [90, 30, 140] : 40);
    for (let k = 0; k < 340 * power; k++) { const d = randDir(), v = rand(3, 13) * R; spawn(c.x, c.y, c.z, d[0] * v, (grounded ? Math.abs(d[1]) : d[1]) * v, d[2] * v, rand(.3, .9), rand(.012, .022), C.gold, C.red, 1.8, 9.8, F.BOUNCE, 0, .03, 0, groundY); }
    if (power > .5) for (let k = 0; k < 120; k++) { const a = (k / 120) * TAU, v = 13 * R; spawn(c.x, grounded ? groundY + .05 : c.y, c.z, Math.cos(a) * v, 0, Math.sin(a) * v, .32, .03, C.white, C.amber, 4.4, 0, 0, 0, .02); }
    for (let k = 0; k < 42 * power; k++) { const a = rand(0, TAU), v = rand(.3, 1.9) * R; puff(c.x + Math.cos(a) * .1, c.y, c.z + Math.sin(a) * .1, Math.cos(a) * v, rand(.3, 1.8), Math.sin(a) * v, rand(2.4, 5), rand(.25, .55) * R, .5 * R, [.9, .6, .3], [.24, .23, .22], rand(.16, .3), 1.2, -.08, .1); }
    for (let k = 0; k < 20 * power; k++) puff(c.x + rand(-.12, .12), c.y, c.z + rand(-.12, .12), rand(-.25, .25), rand(1.2, 3.4), rand(-.25, .25), rand(2.2, 4.2), rand(.2, .42), .4, [1, .7, .4], [.26, .25, .24], rand(.18, .3), 1, -.12, .08);
    scatterPaper(c.x, c.y, c.z, Math.ceil(46 * power), 2.6, 13, groundY);
    if (grounded) {
      const scorch = contactShadow(p.x, p.z, .7 * R, .75, groundY);
      let st = 0;
      addEmitter({ update(d) { st += d; if (st > 9) { scorch.material.opacity = .75 * (1 - (st - 9) / 3); if (st > 12) { scorch.material.dispose(); scorch.removeFromParent(); return false; } } return true; } });
    }
    return false;
  } });
}
// Flower pot / cone fountain: sustained upward spray, then falling embers.
// Counts accumulate per second so 30/60/120 Hz phones get the same fountain.
function flowerPot(p) {
  const groundY = p.y, model = createCrackerModel('flower', TEX);
  model.group.position.copy(p); effectSpace.add(model.group);
  const prop = { model, shadow: contactShadow(p.x, p.z, .13, .5, groundY) };
  const nozzle = p.clone(); nozzle.y += model.height + .006;
  const fuse = .85, burn = 9.5, cool = 4;
  let t = 0, carry = 0, smokeAt = 0, coreAt = 0, crackleAt = .25, lit = false, serial = 0;
  sfx.fuse(fuse, panFor(p));
  const fountain = { ground: true, flower: true, phase: 'fuse', update(dt) {
    t += dt;
    if (t < fuse) {
      const tip = burnTip(model, t / fuse);
      for (let k = 0; k < 3; k++) spawn(tip.x, tip.y, tip.z, rand(-.3, .3), rand(.4, 1.1), rand(-.3, .3), .18, .006, C.gold, C.amber, 1.4, 5, 0, 0, .025, 0, groundY);
      floorGlow(p.x, p.z, C.amber, .13, .3, groundY);
      return true;
    }
    const elapsed = t - fuse;
    if (elapsed < burn) {
      fountain.phase = 'fountain';
      if (!lit) { lit = true; sfx.fountain(burn - elapsed, panFor(p)); vibrate(10); }
      const heat = clamp(elapsed / .9, 0, 1) * clamp((burn - elapsed) / 1.4, 0, 1);
      model.burn(1, .5 * heat);
      carry += (160 + 150 * heat) * dt * quality;
      const whole = Math.floor(carry), count = Math.min(24, whole); carry -= whole;
      for (let k = 0; k < count; k++) {
        const angle = rand(0, TAU), white = Math.random() < .18;
        const radial = rand(.25, white ? .65 : 2.1) * (.25 + .75 * heat);
        const vy = rand(white ? 6.8 : 4.2, 8.4) * (.24 + .76 * heat);
        const flags = F.BOUNCE | (serial++ % 4 === 0 ? F.TRAIL : 0);
        spawn(nozzle.x + rand(-.005, .005), nozzle.y, nozzle.z + rand(-.005, .005),
          Math.cos(angle) * radial, vy, Math.sin(angle) * radial, rand(1.1, 1.9), rand(.006, .011),
          white ? C.white : C.gold, C.charcoal, .28, 9.8, flags, .22, .025, 0, groundY);
      }
      if (elapsed >= coreAt) {
        coreAt = elapsed + .035;
        glowAt(nozzle, .045 + .035 * heat, C.white, .055);
        glowAt(nozzle, .11 + .05 * heat, C.amber, .075);
      }
      floorGlow(p.x, p.z, C.gold, .15 + .22 * heat, .45 + .7 * heat, groundY);
      if (elapsed >= smokeAt) { smokeAt = elapsed + .12; groundSmoke(nozzle.x, nozzle.y, nozzle.z, [.6, .46, .27], 1, .045, .4); }
      if (elapsed >= crackleAt) {
        crackleAt = elapsed + rand(.18, .35);
        noise({ dur: .025, vol: .045 * heat + .01, f0: 4400, type: 'highpass', pan: panFor(p), wet: .12 });
      }
      return true;
    }
    fountain.phase = 'cooling'; model.extinguish();
    if (elapsed < burn + 1.2 && elapsed >= smokeAt) {
      smokeAt = elapsed + .2; groundSmoke(nozzle.x, nozzle.y, nozzle.z, [.24, .23, .21], 1, .035, .2);
    }
    if (elapsed >= burn + cool) { dropProp(prop); return false; }
    return true;
  } };
  addEmitter(fountain);
}

function sanguchakram(p) {
  const groundY = p.y, model = createCrackerModel('spinner', TEX);
  model.group.position.copy(p); effectSpace.add(model.group);
  const prop = { model, shadow: contactShadow(p.x, p.z, .11, .48, groundY) };
  const fuse = .75, burn = 7, cool = 3;
  let t = 0, angle = 0, carry = 0, smokeAt = 0, coreAt = 0, lit = false, serial = 0;
  sfx.fuse(fuse, panFor(p));
  const wheel = { ground: true, spinner: true, phase: 'fuse', update(dt) {
    t += dt;
    if (t < fuse) {
      const tip = burnTip(model, t / fuse);
      for (let k = 0; k < 3; k++) spawn(tip.x, tip.y, tip.z, rand(-.4, .4), rand(.3, .8), rand(-.4, .4), .16, .006, C.gold, C.amber, 1, 5, 0, 0, .025, 0, groundY);
      return true;
    }
    const elapsed = t - fuse;
    if (elapsed < burn) {
      wheel.phase = 'spinning';
      if (!lit) { lit = true; model.burn(1); model.extinguish(); sfx.spin(burn - elapsed, panFor(p)); vibrate(8); }
      const heat = clamp(elapsed / .8, 0, 1) * clamp((burn - elapsed) / 1.1, 0, 1);
      const oldAngle = angle; angle += (5 + 48 * heat) * dt * (reduceMotion ? .6 : 1);
      model.group.rotation.y = -angle;
      const color = elapsed > 2.4 && elapsed < 5.4 ? C.silver : C.gold;
      carry += (180 + 140 * heat) * dt * quality;
      const whole = Math.floor(carry), count = Math.min(24, whole); carry -= whole;
      for (let k = 0; k < count; k++) {
        // Sample THROUGH the rotation during this frame, avoiding discrete
        // spokes when a fast wheel is viewed on a slower phone.
        const a = oldAngle + (angle - oldAngle) * (k + .5) / count;
        const cs = Math.cos(a), sn = Math.sin(a), v = rand(2.2, 5.2) * (.3 + .7 * heat);
        const flags = F.BOUNCE | (serial++ % 5 === 0 ? F.TRAIL : 0);
        spawn(p.x + cs * .064, groundY + .023, p.z + sn * .064,
          (-sn + cs * .4) * v, rand(.12, .65), (cs + sn * .4) * v, rand(.35, .8), rand(.006, .01),
          color, C.amber, 1.2, 6.5, flags, .15, .025, 0, groundY);
      }
      if (elapsed >= coreAt) {
        coreAt = elapsed + .035;
        glowAt({ x: p.x + Math.cos(angle) * .064, y: groundY + .023, z: p.z + Math.sin(angle) * .064 }, .07, color, .05);
      }
      floorGlow(p.x, p.z, color, .13 + .16 * heat, .4 + .5 * heat, groundY);
      if (elapsed >= smokeAt) { smokeAt = elapsed + .16; groundSmoke(p.x, groundY + .04, p.z, [.42, .36, .27], 1, .04, .16); }
      return true;
    }
    wheel.phase = 'cooling'; model.extinguish();
    if (elapsed >= burn + cool) { dropProp(prop); return false; }
    return true;
  } };
  addEmitter(wheel);
}

// The loose garland stays anchored. Only a small section near the burn front
// recoils, in the vertex shader, without rewriting all 10,000 instance matrices.
const WALAS = WALA_CONFIGS;
function wala(p, w) {
  const groundY = p.y, n = w.n, large = n === 10000;
  const layout = createWalaLayout(p, effectSpace !== world ? new THREE.Quaternion() : camera.quaternion, w);
  const { points: pts, directions, cordPoints, scales, shades, kicks } = layout;
  const burn = createWalaBurn(w, layout.seed), clock = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ map: TEX.wala, roughness: .91, toneMapped: false });
  const cap = new THREE.MeshStandardMaterial({ color: 0xcba876, roughness: .97, toneMapped: false });
  decorateWalaMaterial(mat, clock); decorateWalaMaterial(cap, clock);
  const geometry = G.wala.clone(), fireAt = new Float32Array(n), kick = new Float32Array(n * 3);
  const inst = new THREE.InstancedMesh(geometry, [mat, cap, cap], n), dummy = new THREE.Object3D(), tint = new THREE.Color();
  inst.name = `wala-${n}`;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    dummy.position.copy(pts[i]); dummy.quaternion.setFromUnitVectors(up, directions[i]);
    dummy.scale.setScalar(scales[i]); dummy.updateMatrix();
    const reversed = n - 1 - i;
    inst.setMatrixAt(reversed, dummy.matrix);
    inst.setColorAt(reversed, tint.setRGB(shades[i], shades[i] * (.9 + .1 * burn.tone[i]), shades[i] * .86));
    fireAt[reversed] = burn.times[i]; kicks[i].toArray(kick, reversed * 3);
  }
  geometry.setAttribute('iWalaAt', new THREE.InstancedBufferAttribute(fireAt, 1));
  geometry.setAttribute('iWalaKick', new THREE.InstancedBufferAttribute(kick, 3));
  inst.instanceMatrix.needsUpdate = true; inst.instanceColor.needsUpdate = true;
  inst.frustumCulled = false; effectSpace.add(inst);
  const cordGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordPoints), cordPoints.length * 2, .002 * w.scale, 5, false);
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x9e917b, roughness: .98, toneMapped: false });
  const cord = new THREE.Mesh(cordGeo, cordMat); cord.name = `wala-fuse-${n}`; effectSpace.add(cord);
  const ashGeo = cordGeo.clone(), ashMat = new THREE.MeshStandardMaterial({ color: 0x312920, roughness: 1, transparent: true, opacity: .72, depthWrite: false, toneMapped: false });
  const ash = new THREE.Mesh(ashGeo, ashMat); ash.name = `wala-ash-${n}`; effectSpace.add(ash); ashGeo.setDrawRange(0, 0);
  const cordCount = cordGeo.index.count;
  let t = 0, i = 0, audioAt = 0, smokeAt = 0, lastHaptic = 0, paperTokens = 0, finished = false;
  const soundChunk = (from, to) => {
    if (!actx || muted || !actx.sampleRate) return;
    const chunk = renderWalaAudio(actx.sampleRate, burn, from, to);
    if (chunk.end === chunk.first) return;
    const buffer = actx.createBuffer(1, chunk.samples.length, actx.sampleRate);
    buffer.getChannelData(0).set(chunk.samples);
    const source = actx.createBufferSource(), gain = actx.createGain(); source.buffer = buffer;
    gain.gain.value = .9; source.connect(gain);
    const disconnect = route(gain, panFor(pts[Math.min(n - 1, chunk.first)]), .18);
    source.onended = () => { source.disconnect(); disconnect(); };
    source.start(actx.currentTime + Math.max(0, from - t) + .015);
  };
  const retireBodies = () => {
    if (finished) return;
    finished = true; inst.removeFromParent(); inst.dispose(); geometry.dispose(); mat.dispose(); cap.dispose();
    cord.removeFromParent(); cordGeo.dispose(); cordMat.dispose();
  };
  sfx.fuse(burn.fuse, panFor(pts[0]));
  const emitter = { ground: true, largeWala: large, wala: true, phase: 'fuse', burnt: 0, update(dt) {
    t += dt; clock.value = t;
    paperTokens = Math.min(10, paperTokens + dt * (large ? 65 : n === 1000 ? 42 : 30));
    if (!finished && audioAt < t + .09) {
      // Schedule real within-window snap offsets, not one sound per display frame.
      const from = Math.max(audioAt, t - .015), to = from + .12;
      soundChunk(from, to); audioAt = to;
    }
    if (t < burn.fuse) {
      const q = pts[0];
      spawn(q.x, q.y + .008, q.z, rand(-.15, .15), rand(.2, .7), rand(-.15, .15), .12, .004, C.amber, C.charcoal, 2, 4, F.TWINKLE, 0, .02, 0, groundY);
      return true;
    }
    const start = i;
    i = walaIndexAt(burn.times, t); emitter.burnt = i;
    if (i > start) {
      emitter.phase = 'crackling'; inst.count = n - i;
      const burnt = Math.floor(cordCount * i / n / 30) * 30;
      cordGeo.setDrawRange(burnt, cordCount - burnt); ashGeo.setDrawRange(0, burnt);
      const samples = Math.min(6, i - start);
      for (let j = 0; j < samples; j++) {
        const at = start + Math.floor((i - start - 1) * (samples === 1 ? 1 : j / (samples - 1)));
        const q = pts[at].clone().add(kicks[at]), energy = burn.energy[at];
        const count = Math.round((5 + energy * 9) * quality);
        for (let k = 0; k < count; k++) {
          const d = randDir(), speed = rand(.5, 3.5) * (.55 + energy * .4);
          spawn(q.x, q.y, q.z, d[0] * speed, Math.abs(d[1]) * speed, d[2] * speed,
            rand(.09, .36), rand(.004, .009), k % 4 ? C.gold : C.white, C.charcoal, 1.5, 9.8,
            F.BOUNCE | (k === 0 ? F.TRAIL : 0), .09, .018, 0, groundY);
        }
        const paper = Math.min(Math.floor(paperTokens), Math.ceil(w.paper * energy)); paperTokens -= paper;
        for (let k = 0; k < paper; k++) {
          const c = k % 4 ? PAPER : PAPER2, d = directions[at], side = rand(-1.6, 1.6);
          puff(q.x, q.y, q.z, d.x * side + rand(-.4, .4), rand(.45, 1.8), d.z * side + rand(-.4, .4),
            rand(7, 12), rand(.004, .013), 0, c, c, 1, 1.5, 6.5, .025, 1, groundY);
        }
        if (j === samples - 1 || energy > 1.25) {
          glowAt(q, .07 + energy * .065, C.white, rand(.025, .055));
          floorPulse(q.x, q.z, C.amber, .18 + .28 * energy, .16 + .2 * energy, 18, groundY);
        }
      }
      const q = pts[i - 1];
      if (t >= smokeAt) {
        puff(q.x + rand(-.02, .02), q.y + .02, q.z + rand(-.02, .02), rand(-.12, .12), rand(.18, .42), rand(-.12, .12),
          rand(2.7, 4.8), rand(.07, .15), rand(.12, .25), [.64, .48, .29], [.36, .34, .3], rand(.09, .16), .6, -.04, .05, 0, groundY);
        smokeAt = t + rand(.065, .14);
      }
      if (t - lastHaptic > .16) { vibrate(5); lastHaptic = t; }
    }
    if (i >= n) {
      retireBodies(); emitter.ground = false; emitter.largeWala = false; emitter.phase = 'afterglow';
      ashMat.opacity = .72 * Math.max(0, 1 - (t - burn.duration) / 3.2);
      if (t >= burn.duration + 3.2) { ash.removeFromParent(); ashGeo.dispose(); ashMat.dispose(); return false; }
    }
    return true;
  } };
  addEmitter(emitter);
}

/* ---------- The tray ---------- */
const ICONS = {
  rocket: '<path d="M12 3c3 2 4 5 4 8l-1.5 5h-5L8 11c0-3 1-6 4-8z"/><path d="M12 16v5M9.5 19l-1 2M14.5 19l1 2"/>',
  shot: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19"/>',
  twelve: '<rect x="4" y="13" width="16" height="8" rx="1"/><path d="M8 13v8M12 13v8M16 13v8M8 10V7M12 9V3M16 10V7"/>',
  rain: '<path d="M4 6c2-3 14-3 16 0"/><path d="M5 9v5M9 8v9M12 8v12M15 8v9M19 9v5"/>',
  crackle: '<circle cx="6" cy="7" r="1"/><circle cx="16" cy="5" r="1"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="13" r="1"/><circle cx="6" cy="17" r="1"/><circle cx="15" cy="19" r="1"/>',
  finale: '<path d="M7 3v4M7 11v4M3 9h4M9 9h4M17 8v3M17 14v3M13.5 12.5h3M18 12.5h3M10 18v3M8.5 19.5h3"/>',
  atom: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>',
  sutli: '<circle cx="11" cy="15" r="6.5"/><path d="M15.5 10.5L18 8c1-1 2.5-.5 3 1"/>',
  lakshmi: '<rect x="8" y="9" width="8" height="12" rx="1"/><path d="M12 9V5c0-1.5 2-2 3-1"/>',
  flower: '<path d="M7 21h10l-3-8h-4zM12 10V2M9 10 6 5M15 10l3-5M6 12 3 9M18 12l3-3"/>',
  spinner: '<path d="M12 4a8 8 0 1 1-8 8 6 6 0 1 1 6 6 4 4 0 1 1 4-4 2 2 0 1 1-2-2M4 4l2 2M20 3l-2 3M22 14h-3"/>',
  wala100: '<path d="M2 14c3-5 5 3 8-1s5 3 8-1 3-1 4 0"/><path d="M5 9l1 3M10 9l.5 3M15 8l.5 3M20 8l-.5 3"/>',
  wala1000: '<path d="M2 7c3-4 5 2 8-1s5 2 8-1 3-1 4 0"/><path d="M2 13c3-4 5 2 8-1s5 2 8-1 3-1 4 0"/><path d="M2 19c3-4 5 2 8-1s5 2 8-1 3-1 4 0"/>',
  wala10000: '<path d="M2 6h17a2 2 0 0 1 0 4H5a2 2 0 0 0 0 4h14a2 2 0 0 1 0 4H2"/><path d="M7 4v4m5-4v4m5 4v4m-5-4v4M7 16v4m5-4v4"/>',
};
const KINDS = {
  sky: [['rocket', 'Tiger Rocket'], ['shot', 'Sky shot'], ['rain', 'Golden rain'], ['crackle', 'Crackling'], ['twelve', '12 shot'], ['finale', 'Alapparai']],
  ground: [['atom', 'Atom bomb'], ['flower', 'Flower pot'], ['spinner', 'Sanguchakram'], ['sutli', 'Hukum Bomb'], ['lakshmi', 'Lakshmi'], ['wala100', '100 wala'], ['wala1000', '1,000 wala'], ['wala10000', '10,000 wala']],
};
const selected = { sky: 'rocket', ground: 'atom', royal: 'hukum' };
let royalOpen = false;
KINDS.royal = [['hukum', 'Hukum Reloaded'], ['diamond', 'Diamond Mazhai'], ['thangam', 'Thanga Vaanam']];
ICONS.hukum = '<path d="m2 6 5 5 5-8 5 8 5-5-3 14H5Z"/>';
ICONS.diamond = '<path d="m3 8 4-5h10l4 5-9 14ZM3 8h18M7 3l5 19 5-19"/>';
ICONS.thangam = ICONS.rain;
const pickerEl = $('picker'), hintEl = $('hint'), modeEl = $('mode'), surfaceBtn = $('surfaceBtn');
let mode = 'sky';
function renderPicker() {
  pickerEl.textContent = '';
  const tray = mode === 'sky' && royalOpen ? 'royal' : mode;
  $('extraTray').hidden = mode !== 'sky';
  pickerEl.dataset.tray = tray;
  for (const [id, name] of KINDS[tray]) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pick';
    b.setAttribute('aria-pressed', String(selected[tray] === id));
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id]}</svg><span>${name}</span>`;
    b.addEventListener('click', () => {
      const keep = pickerEl.scrollLeft;
      selected[tray] = id;
      placementGuide.select();
      renderPicker();
      pickerEl.scrollLeft = keep;
      ensureAudio();
      if (id === 'finale') hint('Tap the sky to set off the finale.', 3000);
    });
    pickerEl.appendChild(b);
  }
}
let hintTimer = 0;
function hint(text, ms) {
  hintEl.textContent = text;
  hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.remove('show'), ms);
}
const toldMode = {};
function setMode(m) {
  if (freeEditing || (playing && handAnchor.ready)) m = 'ground';
  if (m === mode) return;
  mode = m;
  updateModeLabel();
  surfaceBtn.hidden = handAnchor.ready || m !== 'ground';
  renderPicker();
  pickerEl.scrollLeft = 0;
  vibrate(10);
  if (playing && !uiHidden && !toldMode[m]) { toldMode[m] = true; hint(m === 'sky' ? 'Tap anywhere to burst it there.' : 'Aim at the floor and tap to place a cracker.', 3600); }
}
surfaceBtn.addEventListener('click', () => {
  tableSurface = !tableSurface;
  floorY = worldTracking?.active ? (tableSurface ? camera.position.y - TABLE_H : 0) : -(tableSurface ? TABLE_H : FLOOR_H);
  surfaceBtn.textContent = tableSurface ? 'On a table' : 'On the floor';
  placementGuide.select();
});

let lastSkyTap = -Infinity;
function fireAt(cx, cy) {
  if (document.hidden || !Number.isFinite(cx) || !Number.isFinite(cy) || atomSequence.busy) return false;
  if (freeEditing) { freePoint = { x: cx / W, y: cy / H }; updateObjectPreview(); return false; }
  const target = playing && mode === 'ground' ? headTargets.at(cx / W, cy / H, last) : null;
  if (!target && playing && mode === 'ground' && headTargets.candidateAt(cx / W, cy / H, last)) { hint('Hold steady for head placement.', 1500); return false; }
  const onPalm = !target && playing && handAnchor.ready;
  if (onPalm) setMode('ground');
  if (!target && worldTracking?.active && (mode === 'sky' ? !skyAvailable() : !worldTracking.ready)) {
    if (mode === 'ground') { hint('Still finding a surface. Use Place anywhere to choose your own spot.', 3500); $('freeBtn').hidden = false; }
    return false;
  }
  if (onPalm && emitters.some(e => e.ground && e.space === palmWorld)) { hint('Let this palm cracker finish first.', 2000); return false; }
  const ray = rayAt(cx, cy), id = selected[mode === 'sky' && royalOpen ? 'royal' : mode];
  if (mode === 'sky') {
    // Bound input producers as well as particle buffers: rapid twelve-shot taps
    // otherwise schedule hundreds of future shells and audio voices.
    const interval = id === 'twelve' ? 650 : 140;
    if (last - lastSkyTap < interval || emitters.filter(e => e.sky && !e.skyTail).length >= 18 ||
        (id === 'twelve' && emitters.filter(e => e.barrage).length >= 2) ||
        ((royalOpen || id === 'finale') && emitters.some(e => e.finale))) return false;
    lastSkyTap = last;
    placementGuide.place(); ring.visible = false; ring.material.opacity = 0;
    const p = skyWorld.worldToLocal(ray.clone().multiplyScalar(rand(100, 145)).add(camera.position));
    if (royalOpen) { royalShow(id); return; }
    if (id === 'rocket') rocket(p);
    else if (id === 'shot') launch(p, Math.random() < .5 ? peony : chrysanthemum);
    else if (id === 'twelve') twelveShot(p);
    else if (id === 'rain') launch(p, goldenRain);
    else if (id === 'crackle') launch(p, crackling);
    else if (id === 'finale' && !emitters.some((e) => e.finale)) { finale(); }
    return;
  }
  if (emitters.filter((e) => e.ground).length >= 7) return;
  if (id === 'flower' && emitters.filter(e => e.flower).length >= 3) { hint('Let a flower pot finish before adding another.', 2000); return false; }
  if (id === 'spinner' && emitters.filter(e => e.spinner).length >= 3) { hint('Let a Sanguchakram finish before adding another.', 2000); return false; }
  if (id === 'wala10000' && emitters.some((e) => e.largeWala)) { hint('Let this 10,000 wala finish first.', 2000); return false; }
  if (target) return placeObject('head', target);
  const spot = onPalm ? new THREE.Vector3(0, 0, 0) : placementPoint(cx, cy);
  if (!spot) { hint("No surface found here. Tap Place anywhere to position it yourself.", 2500); return false; }
  placementGuide.place();
  ring.visible = false; ring.material.opacity = 0;
  if (id === 'atom') {
    atomRun++; atomOnPalm = onPalm;
    atomSequence.begin();
    $('effectStatus').hidden = false;
    $('effectStatus').textContent = 'Atom bomb · fuse lit';
  }
  if (onPalm) {
    // Only retire palm residue. Room objects keep their original transforms.
    for (let i = emitters.length - 1; i >= 0; i--) if (emitters[i].space === palmWorld) {
      emitters[i].update(60); emitters.splice(i, 1);
    }
    for (let i = 0; i < N; i++) if (P.hand[i]) P.life[i] = 0;
    for (let i = 0; i < M; i++) if (S.hand[i]) S.life[i] = 0;
    for (let i = pulses.length - 1; i >= 0; i--) if (pulses[i].space === palmWorld) pulses.splice(i, 1);
    const pose = handAnchor.pose;
    const position = pose.worldPosition || pose.position.clone().applyMatrix4(camera.matrixWorld);
    const quaternion = pose.worldQuaternion || camera.quaternion.clone().multiply(pose.quaternion);
    palmMotion = new HandObjectMotion({ position, quaternion, floorY: worldTracking?.active ? 0 : -FLOOR_H, kind: id, now: last });
    const visual = handStabilizer.update(position, quaternion, pose.width, handAnchor.lastSeen, pose.label);
    palmWorld.position.copy(handGuide.visible ? handGuide.position : visual.position);
    palmWorld.quaternion.copy(handGuide.visible ? handGuide.quaternion : visual.quaternion);
    palmMotion.setHeldVisual(palmWorld.position, palmWorld.quaternion);
    palmWorld.scale.setScalar(handEffectScale(id, visual.width)); palmWorld.updateMatrixWorld(true);
    if (BOMBS[id]) hint('Toss your hand to throw. The fuse keeps counting down.', 3200);
    else hint('Tilt your palm to drop it. The fireworks keep going.', 3200);
    handAnchor.lock();
  }
  withEffectSpace(onPalm ? palmWorld : world, () => {
    if (onPalm) ensureAudio();
    if (BOMBS[id]) bomb(spot, BOMBS[id]);
    else if (id === 'flower') flowerPot(spot);
    else if (id === 'spinner') sanguchakram(spot);
    else wala(spot, WALAS[id]);
  });
}

/* ---------- Head attachment and deliberate free placement ---------- */
let objectPreview = null, previewKind = null;
const objectBusy = () => emitters.some(e => e.space === objectWorld);
const objectScale = (kind, multiplier) => handEffectScale(kind, .10) * multiplier;
function detachHead() {
  if (objectPlacement?.type === 'head') objectPlacement.detached = true;
  headTargets.clear();
}
const objectSoundPaused = () => spacePaused(objectWorld) && !(objectPlacement && atomSequence.phase === 'ringing');
function syncObjectAudio() {
  const context = objectAudio?.actx;
  if (!context) return;
  if (document.hidden || objectSoundPaused()) { if (context.state === 'running') context.suspend()?.catch(() => {}); }
  else if (context.state !== 'running') context.resume()?.catch(() => {});
}
function objectPose(target) {
  if (target.framePosition) return { position: target.framePosition.clone(), quaternion: target.frameQuaternion.clone() };
  const position = objectFrame.worldToLocal(target.worldPosition.clone());
  const quaternion = objectFrame.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(target.worldQuaternion);
  return { position, quaternion };
}
function startAutoHeadTracking() {
  headTracker = createHandTracking({ video, inferenceGate, intervals: [110, 240],
    workerURL: new URL('./head-worker.js', import.meta.url),
    captureContext: () => ({ projectionMatrix: camera.projectionMatrix.clone(), matrix: camera.matrixWorld.clone(),
      quaternion: camera.quaternion.clone(), frameInverse: skyWorld.matrixWorld.clone().invert(),
      frameQuaternion: skyWorld.getWorldQuaternion(new THREE.Quaternion()).invert(), width: W, height: H }),
    onResult(result, time, frame) {
      if (!frame) return;
      const poses = headPoses(result, frame, frame.width, frame.height, video.videoWidth, video.videoHeight);
      for (const pose of poses) {
        pose.worldPosition = pose.position.clone().applyMatrix4(frame.matrix);
        pose.worldQuaternion = frame.quaternion.clone().multiply(pose.quaternion);
        pose.framePosition = pose.worldPosition.clone().applyMatrix4(frame.frameInverse);
        pose.frameQuaternion = frame.frameQuaternion.clone().multiply(pose.worldQuaternion);
      }
      headTargets.update(poses, time);
    },
    onLost() { headTargets.clear(); },
    onError() { detachHead(); hint('Head tracking is unavailable. Palm, floor, sky and Place anywhere are still available.', 4000); },
  });
  headTracker.start().catch(() => { headTargets.clear(); hint('Head detection is unavailable here. Use Place anywhere.', 3000); });
}
function updateObjectPlacement(now, dt) {
  if (objectPlacement?.type === 'head' && !objectPlacement.detached) {
    const target = headTargets.get(objectPlacement.id, now);
    if (target) {
      const pose = objectPose(target), visual = headStabilizer.update(pose.position, pose.quaternion, .15, target.time, String(target.id));
      const blend = 1 - Math.exp(-dt * 25);
      objectWorld.position.lerp(visual.position, blend); objectWorld.quaternion.slerp(visual.quaternion, blend);
      objectWorld.updateMatrixWorld(true); objectPlacement.lastSeen = target.time;
    } else if (now - objectPlacement.lastSeen > 600) {
      objectPlacement.detached = true;
      hint('Head moved out of view. This effect stays where it was.', 2500);
    }
  }
  if (objectPlacement && !objectBusy() && !atomSequence.busy) objectPlacement = null;
  objectWorld.visible = Boolean(objectPlacement) || objectBusy();
  updateObjectPreview();
  const targets = headTargets.targets.filter(p => p.streak >= 3 && now - p.time < 350);
  for (let i = 0; i < 2; i++) {
    const cue = $('headCue' + i), target = targets[i];
    cue.hidden = !playing || !target || mode !== 'ground' || freeEditing || uiHidden || !placementGuide.armed || atomSequence.busy || objectBusy();
    if (!cue.hidden) {
      cue.style.left = `${clamp(target.center.x, .08, .92) * 100}%`;
      cue.style.top = `${clamp(target.bounds.top, .10, .75) * 100}%`;
    }
  }
}
function clearObjectPreview() {
  objectPreview?.dispose(); objectPreview = null; previewKind = null; objectGuide.visible = false;
}
function updateObjectPreview() {
  if (!freeEditing) return;
  const kind = selected.ground;
  if (kind !== previewKind) {
    clearObjectPreview(); previewKind = kind;
    if (WALAS[kind]) {
      const layout = createWalaLayout(new THREE.Vector3(), new THREE.Quaternion(), { ...WALAS[kind], n: 100, strands: 2 }, 18);
      const group = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(layout.cordPoints), 80, .022, 6, false),
        new THREE.MeshStandardMaterial({ color: 0xc43120, roughness: .85 }));
      objectPreview = { group, dispose() { group.removeFromParent(); group.geometry.dispose(); group.material.dispose(); } };
    } else { objectPreview = createCrackerModel(kind, TEX); objectPreview.extinguish(); }
    objectGuide.add(objectPreview.group);
  }
  const pose = freePose(camera, freePoint.x, freePoint.y, freeDistance, objectFrame);
  objectGuide.visible = Boolean(pose) && !uiHidden;
  if (pose) {
    objectGuide.position.copy(pose.position); objectGuide.quaternion.copy(pose.quaternion);
    objectGuide.scale.setScalar(objectScale(kind, 6 * freeSize)); objectGuide.updateMatrixWorld(true);
  }
  $('placeBtn').disabled = !skyAvailable() || atomSequence.busy || objectBusy();
  $('placementHelp').textContent = skyAvailable() ? (worldTracking?.active && !worldTracking.ready ? 'Approximate placement · move gently' : 'Tap a spot · adjust · place') : 'Enable motion or move gently to establish tracking.';
}
function exitFreePlacement() {
  freeEditing = false; $('placementControls').hidden = true; clearObjectPreview(); placementGuide.select(); updateModeLabel();
}
function placeObject(type, target = null) {
  if (document.hidden || atomSequence.busy || objectBusy()) { hint('Let this attached effect finish first.', 2200); return false; }
  const kind = selected.ground;
  if (emitters.filter(e => e.ground).length >= 7 || (kind === 'flower' && emitters.filter(e => e.flower).length >= 3) ||
    (kind === 'spinner' && emitters.filter(e => e.spinner).length >= 3) || (kind === 'wala10000' && emitters.some(e => e.largeWala))) return false;
  let pose, scale;
  if (type === 'head') {
    if (!target || !headTargets.get(target.id, last)) return false;
    pose = objectPose(target); scale = objectScale(kind, 1.65);
    headStabilizer.time = -Infinity;
    headStabilizer.update(pose.position, pose.quaternion, .15, target.time, String(target.id));
  } else {
    if (!freeEditing || !skyAvailable()) return false;
    updateObjectPreview(); pose = { position: objectGuide.position.clone(), quaternion: objectGuide.quaternion.clone() };
    scale = objectGuide.scale.x;
  }
  objectWorld.position.copy(pose.position); objectWorld.quaternion.copy(pose.quaternion); objectWorld.scale.setScalar(scale);
  objectWorld.updateMatrixWorld(true);
  objectPlacement = { type, id: target?.id, lastSeen: target?.time ?? last, detached: type !== 'head' };
  if (freeEditing) exitFreePlacement();
  placementGuide.place(); ring.visible = false; ring.material.opacity = 0;
  for (let i = 0; i < 2; i++) $('headCue' + i).hidden = true;
  if (kind === 'atom') {
    atomRun++; atomOnPalm = false; atomSequence.begin();
    $('effectStatus').hidden = false; $('effectStatus').textContent = 'Atom bomb · fuse lit';
  }
  withEffectSpace(objectWorld, () => {
    ensureAudio(); const origin = new THREE.Vector3();
    if (BOMBS[kind]) bomb(origin, BOMBS[kind]);
    else if (kind === 'flower') flowerPot(origin);
    else if (kind === 'spinner') sanguchakram(origin);
    else wala(origin, WALAS[kind]);
  });
  objectWorld.visible = true;
  hint(type === 'head' ? 'A little celebration on your head. Move gently!' : worldTracking?.active && !worldTracking.ready ? 'Placed. Keep your phone near this spot while tracking settles.' : 'Placed. Move around to see it in your space.', 3500);
  return true;
}
$('freeBtn').addEventListener('click', () => {
  if (atomSequence.busy || objectBusy()) { hint('Let this effect finish first.', 2000); return; }
  freeEditing = true; freePoint = { x: .5, y: .44 }; freeDistance = 1.2; freeSize = 1;
  $('placementDepth').value = String(freeDistance); $('placementSize').value = String(freeSize);
  $('placementControls').hidden = false; setMode('ground'); updateModeLabel(); updateObjectPreview();
});
$('cancelPlacement').addEventListener('click', exitFreePlacement);
$('placeBtn').addEventListener('click', () => placeObject('free'));
$('placementDepth').addEventListener('input', e => { freeDistance = clamp(Number(e.target.value) || 1.2, .3, 4); updateObjectPreview(); });
$('placementSize').addEventListener('input', e => { freeSize = clamp(Number(e.target.value) || 1, .25, 2); updateObjectPreview(); });

/* ---------- Motion and look ---------- */
const orient = { a: 0, b: 0, g: 0, ok: false, time: -Infinity };
let lastSkyAvailable = false;
function motionState() {
  return { granted: gyro, sensor: orient.ok ? deviceQuaternion(THREE, orient, scrAngle()) : null,
    sampleTime: orient.time, now: performance.now(), hidden: document.hidden };
}
addEventListener('deviceorientation', (e) => {
  if (!hasOrientation(e)) { orient.ok = false; return; }
  orient.a = e.alpha ?? 0; orient.b = e.beta; orient.g = e.gamma; orient.ok = true; orient.time = performance.now();
  if (playing) updateModeLabel();
}, true);
const scrAngle = () => (screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : window.orientation || 0);
const qT = new THREE.Quaternion(), qC = new THREE.Quaternion(), lookE = new THREE.Euler(0, 0, 0, 'YXZ');
const look = { yaw: 0, pitch: .12 };
let gyro = false, primed = false;
function updateCamera(dt) {
  if (worldTracking?.active) {
    // Keep the last trustworthy position; motion bridges only sky rotation.
    skyMotionReady = !worldTracking.ready && Boolean(skyTracking.update(camera, motionState()));
    const available = Boolean(skyAvailable());
    if (available !== lastSkyAvailable) { lastSkyAvailable = available; syncAudioPlayback(); updateModeLabel(); }
  } else if (playing && gyro && orient.ok) {
    qT.copy(deviceQuaternion(THREE, orient, scrAngle()));
    if (!primed) { qC.copy(qT); primed = true; } else qC.slerp(qT, 1 - Math.exp(-dt * 26));
  } else {
    look.pitch = clamp(look.pitch, -1.25, 1.35);
    qC.setFromEuler(lookE.set(look.pitch, look.yaw, 0));
  }
  if (!worldTracking?.active) camera.quaternion.copy(qC);
  camera.updateMatrixWorld();
  camera.getWorldDirection(fwd);
  const pitch = Math.asin(clamp(fwd.y, -1, 1));
  setMode(modeForPitch(mode, pitch));
}

/* ---------- Camera feed and layout ---------- */
let camOn = false;
const LONG_FOV = 67;
function updateFov() {
  const aspect = W / H;
  let v;
  if (camOn && video.videoWidth) {
    const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W / vw, H / vh);
    const f = (Math.max(vw, vh) / 2) / Math.tan((LONG_FOV / 2) * DEG);
    v = 2 * Math.atan((H / 2) / (f * s));
    shared.uCov.value.set(W / (vw * s), H / (vh * s));
  } else v = clamp(2 * Math.atan(Math.tan(36 * DEG) / Math.min(aspect, 1)), 50 * DEG, 78 * DEG);
  if (!worldTracking?.active) { camera.fov = v / DEG; camera.aspect = aspect; camera.updateProjectionMatrix(); }
  sparkMat.uniforms.uScale.value = (H * dpr / 2) / Math.tan(v / 2);
  sparkMat.uniforms.uMin.value = 1.1 * dpr;
}
function resize() {
  W = stage.clientWidth || innerWidth; H = stage.clientHeight || innerHeight;
  dpr = Math.min(devicePixelRatio || 1, quality > .8 ? 2 : 1.35);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  shared.uRes.value.set(W * dpr, H * dpr);
  updateFov();
  worldTracking?.resize();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 250));
video.addEventListener('loadedmetadata', updateFov);
video.addEventListener('resize', updateFov);

function attachTrackedFeed(feedVideo) {
  video = feedVideo;
  shared.uVideo.value?.dispose();
  const vt = new THREE.VideoTexture(video);
  vt.colorSpace = THREE.NoColorSpace; vt.minFilter = THREE.LinearFilter; vt.magFilter = THREE.LinearFilter; vt.generateMipmaps = false;
  shared.uVideo.value = vt; shared.uHas.value = 1;
  camOn = true; night.visible = false; backdrop.visible = true;
  updateFov();
}
function trackingState(ready) {
  skyMotionReady = !ready && Boolean(skyTracking.canBridge(motionState()));
  $('trackingStatus').hidden = ready || !worldTracking?.active;
  $('trackingStatus').textContent = ready ? '' : 'Aim at a detailed patch of floor and move gently sideways.';
  if (!ready) { clearInput(); ring.visible = false; ring.material.opacity = 0; }
  syncAudioPlayback();
  updateModeLabel();
}
async function startWorldCamera() {
  trackingStarting = true;
  const XR8 = await waitForWorldEngine();
  floorY = 0;
  worldTracking = createWorldTracking({ XR8, canvas: glCanvas, webgl2: renderer.capabilities.isWebGL2,
    onContext(context) {
      // XR8 wraps WebGL state. Render through the same wrapped context, as its
      // official Three.js integration does, instead of bypassing that state.
      renderer.dispose();
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, context, antialias: false, alpha: false });
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.setClearColor(0x000000, 1);
      resize();
    },
    onGeometry(data) {
      if (!data) return;
      feedGeometry = { ...feedGeometry, ...data };
      const { GLctx, videoWidth, videoHeight } = feedGeometry;
      if (!GLctx || !videoWidth || !videoHeight) return;
      cameraFeedRenderer?.destroy();
      cameraFeedRenderer = XR8.GlTextureRenderer.create({ GLctx, toTexture: { width: glCanvas.width, height: glCanvas.height }, flipY: false });
    },
    onVideo: attachTrackedFeed,
    onPose(reality) {
      const sensor = motionState();
      const valid = skyTracking.accept(camera, reality, sensor.sampleTime >= skyTracking.motionEpoch ? sensor.sensor : null, skyWorld);
      if (valid) {
        if (reality.realityTexture && cameraFeedRenderer) {
          if (!trackedCameraTexture) { trackedCameraTexture = new THREE.Texture(); trackedCameraTexture.colorSpace = THREE.NoColorSpace; }
          const texture = cameraFeedRenderer.render({ renderTexture: reality.realityTexture,
            viewport: XR8.GlTextureRenderer.fillTextureViewport(feedGeometry.videoWidth, feedGeometry.videoHeight, glCanvas.width, glCanvas.height) });
          renderer.properties.get(trackedCameraTexture).__webglTexture = texture;
          shared.uVideo.value = trackedCameraTexture;
          shared.uCov.value.set(1, 1); // XR8 has already cropped/rotated this exact tracked frame.
        }
        sparkMat.uniforms.uScale.value = H * dpr * camera.projectionMatrix.elements[5] / 2;
        sparkMat.uniforms.uMin.value = 1.1 * dpr;
      }
      return valid;
    },
    onFrame() { renderer.resetState(); step(performance.now()); },
    onState: trackingState,
    onError() { skyTracking.frameReady = false; trackingState(false); hint('Camera tracking paused. Move gently or reload to reconnect.', 6000); },
  });
  await worldTracking.start();
  trackingStarting = false;
}

function handState() {
  if (handWasReady !== handAnchor.ready) {
    handWasReady = handAnchor.ready;
    if (!atomSequence.busy && !emitters.some(e => e.ground && e.space === palmWorld)) placementGuide.select();
  }
  syncAudioPlayback(); updateModeLabel();
  if (atomOnPalm && atomSequence.phase === 'ringing') $('effectStatus').textContent = 'Let it ring…';
}
function cancelPalmEffect() {
  for (let i = emitters.length - 1; i >= 0; i--) if (emitters[i].space === palmWorld) emitters.splice(i, 1);
  const geometries = new Set(), materials = new Set();
  for (const child of [...palmWorld.children]) {
    if (child === ring) continue;
    child.traverse(object => {
      if (object.geometry && object.geometry !== G.plane && object.geometry !== G.wala) geometries.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      if (object.isInstancedMesh) object.dispose();
    }); child.removeFromParent();
  }
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  for (let i = 0; i < N; i++) if (P.hand[i]) P.life[i] = 0;
  for (let i = 0; i < M; i++) if (S.hand[i]) S.life[i] = 0;
  for (let i = pulses.length - 1; i >= 0; i--) if (pulses[i].space === palmWorld) pulses.splice(i, 1);
  if (atomOnPalm && atomSequence.busy) { atomRun++; atomSequence.finish(); $('effectStatus').hidden = true; press = null; }
  handAudio?.actx?.close()?.catch(() => {}); handAudio = null;
  handAnchor.unlock(); palmMotion = null; palmWorld.visible = false;
}
function startAutoHandTracking() {
  handTracker?.stop();
  handTracker = createHandTracking({ video, inferenceGate,
    captureContext: () => ({ projectionMatrix: camera.projectionMatrix.clone(), matrix: camera.matrixWorld.clone(),
      quaternion: camera.quaternion.clone(), width: W, height: H }),
    onResult(result, time, frame) {
      const pose = palmPose(result, frame || camera, frame?.width || W, frame?.height || H, video.videoWidth, video.videoHeight, palmMotion?.state === 'held' && emitters.some(e => e.ground && e.space === palmWorld));
      if (pose) {
        pose.worldPosition = pose.position.clone().applyMatrix4(frame?.matrix || camera.matrixWorld);
        pose.worldQuaternion = (frame?.quaternion || camera.quaternion).clone().multiply(pose.quaternion);
      }
      handAnchor.update(pose, time);
      handState();
    },
    onLost() { handAnchor.invalidate(); handState(); },
    onError() {
      handAnchor.invalidate(); palmMotion?.release(performance.now()); handState();
      hint('Palm tracking is unavailable. Floor and sky still work.', 4000);
    },
  });
  // Background download/inference must never hold up the floor camera.
  setTimeout(() => { if (playing && !headTracker) startAutoHeadTracking(); }, 1200);
  handTracker.start().then(() => { if (playing && !headTracker) startAutoHeadTracking(); }).catch(() => {
    if (playing && !headTracker) startAutoHeadTracking();
    handAnchor.invalidate(); palmMotion?.release(performance.now()); handState();
    hint('Palm tracking is unavailable here. Floor and sky still work.', 4000);
  });
}
// Sparks are light, so they vanish against a bright view. Dim the feed to suit, like stopping a camera down.
const lumC = document.createElement('canvas'); lumC.width = lumC.height = 16;
const lumX = lumC.getContext('2d', { willReadFrequently: true });
let lumT = 0, gainTarget = .8;
function autoDim(dt) {
  camGain.value += (gainTarget - camGain.value) * (1 - Math.exp(-dt * 2));
  lumT -= dt;
  if (lumT > 0 || !camOn || !video.videoWidth) return;
  lumT = 1;
  try {
    lumX.drawImage(video, 0, 0, 16, 16);
    const d = lumX.getImageData(0, 0, 16, 16).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += .3 * d[i] + .59 * d[i + 1] + .11 * d[i + 2];
    const lum = s / (d.length / 4) / 255;
    gainTarget = mode === 'sky' ? clamp(.32 / Math.max(lum, .02), .45, .96) : clamp(.17 / Math.max(lum, .02), .2, .92);
    ambLum = lum * gainTarget;
  } catch (e) { /* frame not ready */ }
}

/* ---------- Input ---------- */
let playing = false, press = null, uiHidden = false;
const REPEAT = .45;
const fingers = new Map();
function clearInput() { press = null; fingers.clear(); }
addEventListener('blur', clearInput);
function toggleUi(force) {
  uiHidden = force === undefined ? !uiHidden : force;
  $('ui').hidden = uiHidden;
  $('showBtn').hidden = !uiHidden;
  if (uiHidden) hint('Controls hidden for recording. Two-finger tap brings them back.', 2400);
}
stage.addEventListener('pointerdown', (e) => {
  if (!playing || (e.target.closest && e.target.closest('button, input, #picker, #placementControls'))) return;
  e.preventDefault();
  ensureAudio();
  fingers.set(e.pointerId, performance.now());
  if (fingers.size === 2 && e.pointerType === 'touch') {
    const first = Math.min(...fingers.values());
    if (performance.now() - first < 320) { toggleUi(); press = null; return; }
  }
  press = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, dragged: false, t: 0, fired: false, mouse: e.pointerType === 'mouse' };
  try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  // Commit touch taps on release, so a second finger can cancel the launch
  // and toggle recording controls without accidentally igniting a cracker.
  if (e.pointerType !== 'touch' && (worldTracking?.active || gyro)) { fireAt(e.clientX, e.clientY); press.fired = true; hintEl.classList.remove('show'); }
});
stage.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  press.x = e.clientX; press.y = e.clientY;
  if (Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > 8) press.dragged = true;
  if (!worldTracking?.active && !gyro && press.dragged) {
    const k = (camera.fov * DEG) / H, s = press.mouse ? -1 : 1;
    look.yaw += dx * k * s; look.pitch += dy * k * s;
  }
});
function endPress(e) {
  fingers.delete(e.pointerId);
  if (!press || e.pointerId !== press.id) return;
  if (!press.dragged && !press.fired && e.type === 'pointerup') { fireAt(e.clientX, e.clientY); hintEl.classList.remove('show'); }
  press = null;
}
stage.addEventListener('pointerup', endPress);
stage.addEventListener('pointercancel', endPress);
stage.addEventListener('lostpointercapture', endPress);
stage.addEventListener('contextmenu', (e) => e.preventDefault());
function holdRepeat(dt) {
  if (document.hidden || freeEditing || atomSequence.busy || !press || mode !== 'sky' || royalOpen || ['finale', 'twelve'].includes(selected.sky) || (!gyro && press.dragged)) return;
  press.t += dt;
  if (press.t >= REPEAT) { press.t = 0; press.fired = true; fireAt(press.x, press.y); }
}
function applyMute() {
  if (master) master.gain.value = muted ? 0 : .9;
  if (handAudio?.master) handAudio.master.gain.value = muted ? 0 : .9;
  if (skyAudio?.master) skyAudio.master.gain.value = muted ? 0 : .9;
  if (objectAudio?.master) objectAudio.master.gain.value = muted ? 0 : .9;
  $('icoSound').hidden = muted; $('icoMuted').hidden = !muted;
  $('muteBtn').setAttribute('aria-label', muted ? 'Turn sound on' : 'Mute sound');
}
$('muteBtn').addEventListener('click', () => { muted = !muted; ensureAudio(); applyMute(); });
$('hideBtn').addEventListener('click', () => toggleUi(true));
$('showBtn').addEventListener('click', () => toggleUi(false));

// Silence the moment the page isn't on screen.
document.addEventListener('visibilitychange', () => {
  clearInput();
  skyTracking.invalidateMotion(performance.now()); orient.ok = false; skyMotionReady = false;
  if (document.hidden) worldTracking?.pause(); else worldTracking?.resume();
  if (document.hidden) handTracker?.pause(); else handTracker?.resume();
  if (document.hidden) { headTracker?.pause(); detachHead(); } else headTracker?.resume();
  syncAudioPlayback();
});

async function requestMotionAccess() {
  if (typeof DeviceOrientationEvent === 'undefined') return 'unavailable';
  if (typeof DeviceOrientationEvent.requestPermission !== 'function') return 'granted';
  try { return await DeviceOrientationEvent.requestPermission(); } catch { return 'denied'; }
}
function updateModeLabel() {
  $('freeBtn').hidden = mode !== 'ground' || freeEditing;
  if (freeEditing) {
    modeEl.textContent = 'Place anywhere'; surfaceBtn.hidden = true; $('trackingStatus').hidden = true;
    $('motionBtn').hidden = skyAvailable() || gyro; $('motionBtn').textContent = 'Enable motion'; return;
  }
  if (playing && handAnchor.ready) {
    modeEl.textContent = 'Palm · Auto'; surfaceBtn.hidden = true; $('motionBtn').hidden = true;
    $('trackingStatus').hidden = true; return;
  }
  surfaceBtn.hidden = mode !== 'ground';
  if (worldTracking?.active) {
    const sky = mode === 'sky', ready = sky ? skyAvailable() : worldTracking.ready;
    $('trackingStatus').hidden = ready;
    $('trackingStatus').textContent = sky ? (gyro ? 'Move your phone gently to reconnect sky motion.' : 'Enable motion to use the sky while floor tracking starts.') : 'Aim at a detailed patch of floor and move gently sideways.';
    modeEl.textContent = (sky ? 'Sky' : 'Floor') + (worldTracking.ready ? ' · AR' : sky ? (ready ? ' · Motion' : ' · Waiting') : ' · Scanning');
    $('motionBtn').hidden = !sky || ready || gyro; return;
  }
  const auto = gyro && orient.ok;
  modeEl.textContent = (mode === 'sky' ? 'Sky' : 'Floor') + (auto ? ' · Auto' : gyro ? ' · Waiting for motion' : ' · Manual');
  $('motionBtn').hidden = auto;
  $('motionBtn').textContent = gyro ? 'Motion help' : 'Enable motion';
}
async function beginExperience(useCamera = true) {
  const btn = $('startBtn');
  btn.disabled = true; btn.textContent = 'Opening camera…';
  ensureAudio();
  // Invoke permission requests in the Start gesture. Keep listening when the
  // first sensor event is delayed; never permanently disable auto after 400ms.
  const motionPromise = requestMotionAccess();
  try {
    if (useCamera) await startWorldCamera();
  } catch (error) {
    worldTracking?.stop(); worldTracking = null; trackingStarting = false;
    renderer.resetState(); floorY = -FLOOR_H; camera.position.set(0, 0, 0);
    const message = error?.name === 'NotAllowedError'
      ? 'Allow camera access in Safari or Chrome, then tap Start camera again.'
      : error?.name === 'NotFoundError'
        ? 'No camera was found. Open this page on your phone to use the live view.'
        : (error?.message || 'AR could not start. Close other camera apps and retry in Safari or Chrome.');
    $('note').textContent = message;
    $('note').hidden = false;
    $('demoBtn').hidden = false;
    btn.disabled = false; btn.textContent = 'Start camera';
    await motionPromise;
    return;
  }
  gyro = (await motionPromise) === 'granted';
  primed = false;
  look.yaw = 0; look.pitch = .12;
  playing = true; distantT = 2;
  P.life.fill(0); S.life.fill(0); emitters.length = 0; pulses.length = 0;
  placementGuide.select();
  if (worldTracking?.active) trackingState(worldTracking.ready);
  $('start').hidden = true; $('ui').hidden = false;
  renderPicker(); applyMute(); updateModeLabel();
  ensureAudio();
  try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch {}
  if (worldTracking?.active) startAutoHandTracking();
  hint(worldTracking?.active ? 'Tilt up and tap for sky fireworks. Aim down at a detailed floor for ground crackers.' : 'Demo: drag to look around, then tap to light a cracker.', 6000);
  if (wishName) queueSkyWish(1, `For ${wishName}`);
}
$('startBtn').addEventListener('click', () => beginExperience(true));
$('demoBtn').addEventListener('click', () => beginExperience(false));
$('motionBtn').addEventListener('click', async () => {
  gyro = (await requestMotionAccess()) === 'granted'; primed = false; updateModeLabel();
  hint(gyro ? 'Move your phone. Sky and floor switch automatically as motion arrives.' : 'Motion is blocked. Enable Motion & Orientation Access in Safari settings, then reload.', 6500);
});
modeEl.addEventListener('click', () => {
  if (handAnchor.ready) { hint('Palm found. Tap a miniature cracker, then tilt to drop or toss a bomb.', 4000); return; }
  if (worldTracking?.active || (gyro && orient.ok)) { hint('Straight ahead or down: floor. Tilt upward for the sky.', 3500); return; }
  look.pitch = mode === 'sky' ? -.75 : .6;
});
addEventListener('pagehide', (event) => {
  clearInput();
  skyTracking.invalidateMotion(performance.now()); orient.ok = false; skyMotionReady = false;
  if (event.persisted) handTracker?.pause(); else handTracker?.stop();
  if (event.persisted) headTracker?.pause(); else headTracker?.stop();
  detachHead();
  if (event.persisted) worldTracking?.pause();
  else {
    worldTracking?.stop();
    const feed = video.srcObject;
    if (feed && typeof feed.getTracks === 'function') feed.getTracks().forEach(track => track.stop());
  }
  if (actx) actx.suspend();
  if (handAudio?.actx) handAudio.actx.suspend();
  if (skyAudio?.actx) skyAudio.actx.suspend();
  if (objectAudio?.actx) objectAudio.actx.suspend();
});
addEventListener('pageshow', (event) => {
  if (!event.persisted || document.hidden) return;
  skyTracking.invalidateMotion(performance.now()); orient.ok = false; skyMotionReady = false;
  press = null; fingers.clear(); last = performance.now();
  worldTracking?.resume();
  handTracker?.resume(); headTracker?.resume();
  if (playing) ensureAudio();
});
addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return;
  if (e.key === 'Escape') { if (freeEditing) exitFreePlacement(); toggleUi(false); }
  if (e.code === 'Space' && playing && !e.target.closest('button')) { e.preventDefault(); fireAt(W / 2, H * .35); }
});


/* ---------- Namma Vedi’s additions: grand shows and wishes ---------- */
const wishParams = new URLSearchParams(location.search);
let wishName = (wishParams.get('to') || '').slice(0, 24);
let wishFrom = (wishParams.get('from') || 'Abishek').slice(0, 24);
let wishMessage = (wishParams.get('wish') || '').slice(0, 100);
let activeLettering = null, pendingSkyWish = null, skyTail = null;
function noteSkyActivity(seconds = 0) {
  if (!playing) return; // The landing-page background is not a running show.
  if (activeLettering) {
    const { title, view, cancel } = activeLettering;
    cancel();
    queueSkyWish(0, title, view);
  }
  if (seconds <= 0) return;
  if (skyTail) { skyTail.remaining = Math.max(skyTail.remaining, seconds); return; }
  const tail = { sky: true, skyTail: true, remaining: seconds, update(dt) {
    tail.remaining -= dt;
    if (tail.remaining > 0) return true;
    if (skyTail === tail) skyTail = null;
    return false;
  } };
  skyTail = tail; addEmitter(tail);
}
const queueSkyWish = skyEffect(function (delay = 0, title = 'Happy Diwali', view = VIEW()) {
  if (pendingSkyWish) pendingSkyWish.cancelled = true;
  if (activeLettering) activeLettering.cancel();
  let elapsed = 0;
  const queued = { skyWish: true, cancelled: false, update(dt) {
    if (queued.cancelled) return false;
    elapsed += dt;
    if (elapsed < delay || atomSequence.busy || emitters.some(e => e.sky)) return true;
    if (pendingSkyWish === queued) pendingSkyWish = null;
    writeSky(title, view);
    return false;
  } };
  pendingSkyWish = queued; addEmitter(queued);
});
// Keep personalized names, including non-Latin glyphs. Default letters have
// actual pen strokes; unfamiliar glyphs use short, progressively lit scan lines.
function rasterizeWishGlyph(character) {
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 128;
  const x = canvas.getContext('2d');
  x.font = '88px "Yatra One", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#fff'; x.fillText(character, 48, 64, 88);
  const pixels = x.getImageData(0, 0, 96, 128).data, strokes = [];
  for (let y = 12; y < 116; y += 6) {
    let start = -1;
    for (let xx = 4; xx <= 92; xx += 2) {
      const lit = xx < 92 && pixels[(y * 96 + xx) * 4 + 3] > 100;
      if (lit && start < 0) start = xx;
      if (!lit && start >= 0) { strokes.push([[start / 128, (116 - y) / 104], [xx / 128, (116 - y) / 104]]); start = -1; }
    }
  }
  return strokes;
}
const writeSky = skyEffect(function (title = 'Happy Diwali', view = VIEW()) {
  if (activeLettering) activeLettering.cancel();
  const plan = createSkyWritingPlan(title, view, rasterizeWishGlyph);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(plan.targets, 3));
  geo.setAttribute('aBirth', new THREE.BufferAttribute(plan.births, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(plan.seeds, 1));
  geo.setAttribute('aDrift', new THREE.BufferAttribute(plan.drifts, 3));
  const mat = new THREE.ShaderMaterial({ ...ADD, uniforms: {
    uTime: { value: 0 }, uDissolve: { value: plan.dissolveAt }, uScale: sparkMat.uniforms.uScale,
    uSize: { value: plan.unit * .065 }, uMotion: { value: reduceMotion ? .25 : 1 },
  }, vertexShader: skyWritingVertex, fragmentShader: skyWritingFragment });
  const lettering = new THREE.Points(geo, mat);
  lettering.name = 'sky-writing'; lettering.renderOrder = 9; lettering.frustumCulled = false; skyWorld.add(lettering);
  let t = 0, dead = false, trailBudget = 0;
  const pos = new THREE.Vector3();
  const cancel = () => {
    if (dead) return;
    dead = true; lettering.removeFromParent(); geo.dispose(); mat.dispose();
    if (activeLettering?.cancel === cancel) activeLettering = null;
  };
  activeLettering = { title, view, plan, cancel };
  const size = plan.unit * .045;
  const tip = (p, count) => {
    glowAt(p, size * 4, C.gold, .06);
    for (let i = 0; i < count; i++) {
      spawn(p.x, p.y, p.z, rand(-.7, .7), rand(-1.2, .3), rand(-.5, .5), rand(.18, .42), size * rand(.5, .9), C.white, C.amber, .5, 1.5, F.TWINKLE);
    }
  };
  noise({ dur: 1.15, vol: .045, f0: 1800, f1: 4200, type: 'bandpass', pan: panFor(plan.center), wet: .08, attack: .12 });
  const emitter = { skyWriting: true, phase: 'rising', update(dt) {
    if (dead) return false;
    t += dt; mat.uniforms.uTime.value = t;
    emitter.phase = t < 1.5 ? 'rising' : t < plan.dissolveAt ? 'writing' : 'dissolving';
    trailBudget += dt * (reduceMotion ? 18 : 36);
    const count = Math.min(2, Math.floor(trailBudget)); trailBudget -= Math.floor(trailBudget);
    for (const comet of plan.comets) {
      const age = (t - comet.at) / comet.duration;
      if (age < 0 || age > 1) continue;
      pos.lerpVectors(comet.start, comet.end, 1 - Math.pow(1 - age, 2));
      tip(pos, count);
    }
    for (const stroke of plan.strokes) {
      if (t >= stroke.start && t <= stroke.start + stroke.duration) {
        sampleStroke(stroke.points, (t - stroke.start) / stroke.duration, pos);
        tip(pos, count);
      } else if (t >= stroke.start - .3 && t < stroke.start) {
        // The lifted sparks fan out into moving writing tips, never a text card.
        const comet = plan.comets[stroke.lane], travel = (t - stroke.start + .3) / .3;
        pos.lerpVectors(comet.end, stroke.points[0], travel * travel * (3 - 2 * travel));
        tip(pos, count);
      }
    }
    if (t >= plan.end) {
      cancel();
      if (wishMessage) hint(wishMessage, 5000);
      else if (wishParams.has('from') && wishFrom) hint(`With love, ${wishFrom}`, 4000);
      return false;
    }
    return true;
  } };
  addEmitter(emitter);
});
const diamondBurst = skyEffect(function (p, silent, _scale = 1, origin = skyOrigin()) {
  noteSkyActivity(4.4);
  const D = p.distanceTo(origin), R = D * .29;
  const delay = burstCommon(p, R, C.silver, silent, 1.2);
  shellStars(p, 260, R, 1.65, 3.2, D * .01, C.white, C.blue, 6, F.TRAIL | F.TWINKLE | F.LATE, .7);
  shellStars(p, 100, R * .48, 1.8, 2.5, D * .009, C.silver, C.violet, 8, F.TWINKLE, 0);
  if (!silent) sfx.sizzle(2.8, panFor(p), delay);
});
const royalShow = skyEffect(function (kind) {
  if (emitters.some(e => e.finale)) { hint('Let this grand show finish its moment.', 2300); return; }
  const view = VIEW(), { f, r, u, origin } = view, plan = [], count = reduceMotion ? 16 : kind === 'hukum' ? 42 : 36;
  for (let i = 0; i < count; i++) {
    const x = kind === 'hukum' ? ((i % 3) - 1) * .28 : kind === 'thangam' ? ((i % 6) / 5 - .5) * .9 : rand(-.4, .4);
    const y = kind === 'hukum' ? .08 + (Math.floor(i / 3) % 3) * .15 : kind === 'thangam' ? .15 + Math.floor(i / 6) * .025 : rand(-.12, .4);
    const p = f.clone().addScaledVector(r, x).addScaledVector(u, y).normalize().multiplyScalar(rand(115, 145)).add(origin);
    const fn = kind === 'thangam' ? goldenRain : kind === 'diamond' ? diamondBurst : (q, silent, _scale, origin) => chrysanthemum(q, silent, 1.2, origin);
    plan.push({ at: i * .19, p, fn });
  }
  noteSkyActivity();
  let elapsed = 0, n = 0;
  addEmitter({ sky: true, finale: true, update(dt) {
    elapsed += dt;
    while (n < plan.length && plan[n].at <= elapsed) { const shot = plan[n++]; launch(shot.p, shot.fn, 1.25, false, view); }
    return n < plan.length;
  } });
  queueSkyWish(0, 'Happy Diwali', view);
});
$('royalBtn').addEventListener('click', () => {
  royalOpen = !royalOpen;
  $('royalBtn').setAttribute('aria-pressed', String(royalOpen));
  $('royalBtn').textContent = royalOpen ? 'Classic crackers' : 'Grand shows ✦';
  renderPicker();
});
$('wishBtn').addEventListener('click', () => {
  if (!playing || atomSequence.busy || !skyAvailable()) return;
  ensureAudio();
  placementGuide.place(); ring.visible = false; ring.material.opacity = 0;
  queueSkyWish();
});


/* ---------- Surface ring ---------- */
const ring = new THREE.Mesh(new THREE.RingGeometry(.3, .307, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffae2b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false }));
ring.frustumCulled = false; ring.renderOrder = 4;
world.add(ring);
function updateRing(time) {
  if (freeEditing) { ring.visible = false; ring.material.opacity = 0; return; }
  if (playing && handAnchor.ready) {
    if (ring.parent !== handGuide) handGuide.add(ring);
    ring.visible = placementGuide.armed && !uiHidden && !atomSequence.busy && !emitters.some(e => e.ground && e.space === palmWorld);
    ring.material.opacity = ring.visible ? .6 : 0;
    ring.position.set(0, .005, 0);
    ring.scale.setScalar(handStabilizer.width * .38 / .3);
    return;
  }
  if (ring.parent !== world) world.add(ring);
  const eligible = !atomSequence.busy && placementGuide.armed && playing && mode === 'ground' && !uiHidden && (!worldTracking?.active || worldTracking.ready);
  const spot = eligible ? placementPoint(W / 2, H / 2) : null;
  ring.visible = placementGuide.visible({ playing, ground: mode === 'ground', hidden: uiHidden,
    ready: !worldTracking?.active || worldTracking.ready, hasSurface: Boolean(spot) });
  if (!ring.visible) { ring.material.opacity = 0; return; }
  ring.material.opacity = .6;
  ring.position.copy(spot); ring.position.y += .005;
  ring.scale.setScalar(1 + Math.sin(time * 3.2) * .06);
}

/* ---------- Loop ---------- */
let last = performance.now(), attractT = 1, distantT = 3, frameEma = 16, qualT = 3;
function attract(dt) {
  attractT -= dt;
  if (attractT > 0) return;
  attractT = rand(1.5, 2.6);
  const p = rayAt(rand(.25, .75) * W, rand(.1, .22) * H).multiplyScalar(rand(105, 130));
  pick([peony, chrysanthemum, goldenRain, crackling])(p, true);
}
function adaptQuality(rawDt, dt) {
  frameEma += (rawDt * 1000 - frameEma) * .05;
  qualT -= dt;
  if (qualT > 0 || quality <= .6 || !playing) return;
  qualT = 2;
  if (frameEma > 25) { quality = .6; resize(); }
}
function step(now) {
  const raw = Math.max(0, (now - last) / 1000);
  const dt = Math.min(.05, raw);
  if (playing) {
    handTracker?.tick(now); headTracker?.tick(now); handAnchor.fresh(now);
    if (handWasReady !== handAnchor.ready) handState();
    if (handAnchor.ready) {
      const pose = handAnchor.pose;
      const target = pose.worldPosition || pose.position.clone().applyMatrix4(camera.matrixWorld);
      const rotation = pose.worldQuaternion || camera.quaternion.clone().multiply(pose.quaternion);
      const blend = handGuide.visible ? 1 - Math.exp(-dt * 25) : 1;
      const visual = handStabilizer.update(target, rotation, pose.width, handAnchor.lastSeen, pose.label);
      handGuide.position.lerp(visual.position, blend); handGuide.quaternion.slerp(visual.quaternion, blend);
      handGuide.updateMatrixWorld(true);
      if (!roomPaused()) {
        palmMotion?.setHeldVisual(palmWorld.position, palmWorld.quaternion);
        palmMotion?.sample(target, rotation, handAnchor.lastSeen);
      }
    }
    if (palmMotion && !roomPaused()) {
      palmMotion.step(dt, now);
      if (palmMotion.state === 'held') {
        palmWorld.position.copy(handGuide.position); palmWorld.quaternion.copy(handGuide.quaternion);
        palmMotion.setHeldVisual(palmWorld.position, palmWorld.quaternion);
      } else {
        palmWorld.position.copy(palmMotion.position); palmWorld.quaternion.copy(palmMotion.quaternion);
      }
      palmWorld.updateMatrixWorld(true);
      for (const child of palmWorld.children) if (child.userData.contactShadow) {
        child.visible = palmMotion.state === 'held' || palmMotion.position.y <= palmMotion.floorY + .01;
      }
    }
    if (!atomSequence.busy && !emitters.some(e => e.ground && e.space === palmWorld)) handAnchor.unlock();
  }
  const trackingLost = roomPaused();
  world.visible = !trackingLost;
  handGuide.visible = playing && handAnchor.ready && !trackingLost;
  palmWorld.visible = playing && Boolean(palmMotion) && !trackingLost;
  last = now;
  const time = now / 1000;
  if (!playing) { look.yaw = Math.sin(time * .1) * .04; look.pitch = .14; attract(dt); }
  updateCamera(dt);
  skyWorld.visible = skyAvailable();
  objectFrame.position.copy(skyWorld.position); objectFrame.quaternion.copy(skyWorld.quaternion); objectFrame.updateMatrixWorld(true);
  updateObjectPlacement(now, dt);
  objectFrame.visible = playing && (objectAvailable() || headTargets.targets.some(p => now - p.time < 350));
  syncObjectAudio();
  poolN = 0;
  if (playing) {
    holdRepeat(dt); autoDim(dt); adaptQuality(raw, dt);
    distantT -= dt;
    if (distantT <= 0 && !atomSequence.busy) { distantT = rand(2.5, 8); sfx.distant(); }
  }
  for (let i = emitters.length - 1; i >= 0; i--) if (!emitters[i].update(dt)) emitters.splice(i, 1);
  for (let i = pulses.length - 1; i >= 0; i--) {
    const f = pulses[i];
    if (spacePaused(f.space || world)) continue;
    withEffectSpace(f.space || world, () => floorGlow(f.x, f.z, f.c, f.i, f.r, f.groundY));
    f.i -= f.i * f.d * dt + dt * .3;
    if (f.i <= .02) pulses.splice(i, 1);
  }
  for (let i = poolN; i < pools.length; i++) pools[i].visible = false;
  updateSparks(dt);
  updateSmoke(dt);
  updateRing(time);
  if (sceneLight > .002 && !spacePaused(sceneLightSpace)) {
    skyLight.visible = true;
    skyLight.material.uniforms.uLocal.value = sceneLightLocal ? 1 : 0;
    if (sceneLightLocal) {
      projectedLight.copy(sceneLightPoint); sceneLightSpace.localToWorld(projectedLight);
      if (projectedLight.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0) skyLight.visible = false;
      projectedLight.project(camera);
      skyLight.material.uniforms.uCenter.value.set(projectedLight.x * .5 + .5, projectedLight.y * .5 + .5);
    }
    skyLight.material.uniforms.uC.value.setRGB(sceneLightC.x * sceneLight, sceneLightC.y * sceneLight, sceneLightC.z * sceneLight);
    sceneLight *= Math.exp(-dt * 7);
  } else skyLight.visible = false;
  if (worldTracking?.active) { shake = 0; sceneEl.style.transform = ''; }
  else if (shake > 0) {
    shake = Math.max(0, shake - dt * 2.4);
    sceneEl.style.transform = shake > 0 ? `translate(${rand(-9, 9) * shake}px, ${rand(-9, 9) * shake}px) scale(1.03)` : '';
  }
  renderer.render(scene, camera);
}
function frame(now) {
  requestAnimationFrame(frame);
  if (!trackingStarting && !worldTracking?.active) step(now);
}

resize();
renderPicker();
if (!window.isSecureContext) { $('note').textContent = 'The camera and motion sensors only work from an https:// link. Here you get a painted night sky.'; $('note').hidden = false; }
window.__ready = true;
requestAnimationFrame(frame);
