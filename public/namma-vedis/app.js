/* Adapted from Pattasu by @ikevinadams: https://pattasu-diwali.vercel.app/ */

import * as THREE from 'three';
import { hasOrientation, deviceQuaternion, modeForPitch } from './orientation.mjs';
import { snapshotView, groundIntersection, applyWorldPose, PlacementGuide } from './world-space.mjs';
import { waitForWorldEngine, createWorldTracking } from './world-tracking.mjs';
import { AtomSequence, playAtomAftertone } from './atom-aftertone.mjs';
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
  uniforms: { ...shared, uC: { value: new THREE.Color(0, 0, 0) } },
  vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `${SAMPLE} uniform vec3 uC;
    void main(){ vec3 c = uHas > .5 ? room() * uC * 1.5 : uC * .1; gl_FragColor = vec4(c, 0.0); }`,
}));
skyLight.frustumCulled = false; skyLight.renderOrder = 0; skyLight.visible = false;
world.add(skyLight);
let sceneLight = 0;
const sceneLightC = new THREE.Vector3();
function lightScene(c, amt) {
  if (amt < sceneLight * .6) return;
  sceneLight = Math.max(sceneLight, amt);
  sceneLightC.set(c[0], c[1], c[2]);
}

const FLOOR_GEO = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const pools = [];
for (let i = 0; i < 8; i++) {
  const m = new THREE.Mesh(FLOOR_GEO, new THREE.ShaderMaterial({
    ...ADD,
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
  world.add(m);
  pools.push(m);
}
let poolN = 0;
function floorGlow(x, z, c, intensity, radius, groundY = floorY) {
  if (poolN >= pools.length) return;
  const m = pools[poolN++];
  m.position.set(x, groundY + .004, z);
  m.scale.setScalar(radius);
  m.material.uniforms.uC.value.setRGB(c[0] * intensity, c[1] * intensity, c[2] * intensity);
  m.visible = true;
}
const pulses = [];
const floorPulse = (x, z, c, intensity, radius, decay, groundY = floorY) => pulses.push({ x, z, c, i: intensity, r: radius, d: decay, groundY });

/* ---------- Sparks: stretched along their motion, the way a camera shutter records them ---------- */
const N = 10000;
const F = { TRAIL: 1, TWINKLE: 2, BOUNCE: 4, CRACKLE: 8, LATE: 16, SEG: 32 };
const P = {};
for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'age', 'life', 'size', 'r', 'g', 'b', 'r2', 'g2', 'b2', 'drag', 'grav', 'tl', 'tt', 'str', 'glow', 'groundY']) P[k] = new Float32Array(N);
P.flag = new Uint8Array(N);
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
const sparkGeo = instanced(['iPos', outPos, 3], ['iVel', outVel, 3], ['iCol', outCol, 4], ['iSize', outSize, 3]);
const sparkMat = new THREE.ShaderMaterial({
  ...ADD,
  uniforms: { uScale: { value: 1000 }, uMin: { value: 1.5 }, uRes: shared.uRes },
  vertexShader: `
    attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec3 iSize;
    uniform float uScale; uniform float uMin; uniform vec2 uRes;
    varying vec4 vC; varying vec2 vP; varying float vH; varying float vR; varying float vG;
    void main() {
      vec4 a = viewMatrix * vec4(iPos, 1.0);
      if (a.z > -0.04) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      vec4 b = viewMatrix * vec4(iPos - iVel * iSize.y, 1.0);
      if (b.z > -0.04) b = a;
      vec4 pa = projectionMatrix * a, pb = projectionMatrix * b;
      vec2 sa = pa.xy / pa.w * uRes * 0.5, sb = pb.xy / pb.w * uRes * 0.5;
      float r = clamp(iSize.x * uScale / -a.z, uMin, 520.0);
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
      float core = smoothstep(0.36, 0.02, d);
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
world.add(sparks);

function spawn(x, y, z, vx, vy, vz, life, size, c1, c2, drag, grav, flag = 0, tl = 0, str = .033, glow = 0, groundY = floorY) {
  const i = head; head = (head + 1) % N;
  P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
  P.age[i] = 0; P.life[i] = life; P.size[i] = size;
  P.r[i] = c1[0]; P.g[i] = c1[1]; P.b[i] = c1[2]; P.r2[i] = c2[0]; P.g2[i] = c2[1]; P.b2[i] = c2[2];
  P.drag[i] = drag; P.grav[i] = grav; P.flag[i] = flag; P.tl[i] = tl; P.tt[i] = 0; P.str[i] = str; P.glow[i] = glow; P.groundY[i] = groundY;
  return i;
}
let quality = 1;
function updateSparks(dt) {
  let n = 0;
  const room = aliveCount < N * .78;
  const trailGap = quality > .8 ? .03 : .05;
  for (let i = 0; i < N; i++) {
    if (P.life[i] <= 0) continue;
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
      P.vx[i] *= damp; P.vy[i] = P.vy[i] * damp - P.grav[i] * dt; P.vz[i] *= damp;
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
    outPos[n * 3] = P.x[i]; outPos[n * 3 + 1] = P.y[i]; outPos[n * 3 + 2] = P.z[i];
    outVel[n * 3] = P.vx[i]; outVel[n * 3 + 1] = P.vy[i]; outVel[n * 3 + 2] = P.vz[i];
    outCol[n * 4] = r; outCol[n * 4 + 1] = g; outCol[n * 4 + 2] = b; outCol[n * 4 + 3] = a;
    outSize[n * 3] = P.size[i]; outSize[n * 3 + 1] = P.str[i]; outSize[n * 3 + 2] = P.glow[i];
    n++;
  }
  aliveCount = n;
  sparkGeo.instanceCount = n;
  for (const name of ['iPos', 'iVel', 'iCol', 'iSize']) sparkGeo.attributes[name].needsUpdate = true;
}

/* ---------- Smoke, and the paper a cracker leaves behind ---------- */
const M = 1400;
const S = {};
for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'age', 'life', 'size', 'grow', 'rot', 'spin', 'r', 'g', 'b', 'r2', 'g2', 'b2', 'a', 'drag', 'grav', 'wind', 'hard', 'groundY']) S[k] = new Float32Array(M);
let sHead = 0;
const sPos = new Float32Array(M * 3), sCol = new Float32Array(M * 4), sSize = new Float32Array(M * 3);
const smokeGeo = instanced(['iPos', sPos, 3], ['iCol', sCol, 4], ['iSize', sSize, 3]);
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
  uniforms: { uTex: { value: smokeTex } },
  transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  vertexShader: `
    attribute vec3 iPos; attribute vec4 iCol; attribute vec3 iSize;
    varying vec2 vUv; varying vec4 vC; varying float vHard;
    void main() {
      vUv = position.xy * 0.5 + 0.5; vC = iCol; vHard = iSize.z;
      float c = cos(iSize.y), s = sin(iSize.y);
      vec4 mv = viewMatrix * vec4(iPos, 1.0);
      mv.xy += vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSize.x;
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
world.add(smoke);
function puff(x, y, z, vx, vy, vz, life, size, grow, lit, base, alpha, drag, grav, wind, hard = 0, groundY = floorY) {
  const i = sHead; sHead = (sHead + 1) % M;
  S.x[i] = x; S.y[i] = y; S.z[i] = z; S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz; S.age[i] = 0; S.life[i] = life; S.size[i] = size; S.grow[i] = grow;
  S.rot[i] = rand(0, TAU); S.spin[i] = rand(-.5, .5) * (hard ? 12 : 1);
  S.r[i] = lit[0]; S.g[i] = lit[1]; S.b[i] = lit[2]; S.r2[i] = base[0]; S.g2[i] = base[1]; S.b2[i] = base[2];
  S.a[i] = alpha; S.drag[i] = drag; S.grav[i] = grav; S.wind[i] = wind; S.hard[i] = hard; S.groundY[i] = groundY;
}
function updateSmoke(dt) {
  let n = 0;
  for (let i = 0; i < M; i++) {
    if (S.life[i] <= 0) continue;
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
    sPos[n * 3] = S.x[i]; sPos[n * 3 + 1] = S.y[i]; sPos[n * 3 + 2] = S.z[i];
    sCol[n * 4] = (S.r[i] + (S.r2[i] - S.r[i]) * m) * lift; sCol[n * 4 + 1] = (S.g[i] + (S.g2[i] - S.g[i]) * m) * lift; sCol[n * 4 + 2] = (S.b[i] + (S.b2[i] - S.b[i]) * m) * lift;
    sCol[n * 4 + 3] = S.a[i] * (hard ? (k < .85 ? 1 : 1 - (k - .85) / .15) : Math.min(1, k * 7) * (1 - k));
    sSize[n * 3] = S.size[i]; sSize[n * 3 + 1] = S.rot[i]; sSize[n * 3 + 2] = S.hard[i];
    n++;
  }
  smokeGeo.instanceCount = n;
  for (const name of ['iPos', 'iCol', 'iSize']) smokeGeo.attributes[name].needsUpdate = true;
}

/* ---------- Sound, all synthesized ---------- */
let actx = null, master = null, noiseBuf = null, verbIn = null, muted = false;
function ensureAudio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari: the silent switch mutes it */ }
    actx = new AC();
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
  if (actx.state !== 'running') actx.resume(); // iOS parks it as "interrupted" when the camera starts
}
addEventListener('touchend', () => { if (playing) ensureAudio(); }, { passive: true });
function route(node, pan, wet) {
  let out = node;
  if (actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = clamp(pan || 0, -1, 1); node.connect(p); out = p; }
  out.connect(master);
  if (wet) { const w = actx.createGain(); w.gain.value = wet; out.connect(w); w.connect(verbIn); }
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
  o.connect(g); route(g, pan, wet);
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
  s.connect(f); f.connect(g); route(g, pan, wet);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + .05);
}
const sfx = {
  // Launch tube: a soft low thump from nearby.
  lift(pan) { noise({ dur: .22, vol: .3, f0: 520, f1: 120, pan, wet: .12 }); tone({ f0: 170, f1: 62, dur: .16, vol: .32, pan }); },
  // A rocket leaving: a hiss that thins out as it climbs away.
  fizz(dur, pan) { noise({ dur, vol: .22, f0: 5400, f1: 1900, type: 'bandpass', q: .8, pan, attack: .04, wet: .35 }); },
  // A shell bursting high up: a sharp crack, a heavy body, then the street answers. You hear it after you see it.
  burst(p, size = 1) {
    const dist = p.length(), delay = clamp(dist / 340, .18, .55), pan = panFor(p);
    noise({ dur: .05, vol: .7, f0: 3200, type: 'highpass', pan, wet: .9, delay });
    noise({ dur: .75 * size, vol: .6, f0: 1500, f1: 95, pan, wet: 1.1, delay });
    tone({ f0: 78, f1: 30, dur: .85 * size, vol: .75 * size, pan, wet: .5, delay });
    return delay;
  },
  // A rocket's payload is small: all crack and very little body.
  crack(p) {
    const delay = clamp(p.length() / 340, .18, .55), pan = panFor(p);
    noise({ dur: .04, vol: .8, f0: 3800, type: 'highpass', pan, wet: .9, delay });
    noise({ dur: .28, vol: .4, f0: 1800, f1: 240, pan, wet: .8, delay });
    tone({ f0: 140, f1: 60, dur: .18, vol: .3, pan, wet: .3, delay });
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
function panFor(p) { tmp.copy(p).applyMatrix4(camera.matrixWorldInverse); return clamp(tmp.x / Math.max(1, tmp.length()), -1, 1) * .85; }
function randDir() { const u = Math.random() * 2 - 1, t = Math.random() * TAU, s = Math.sqrt(1 - u * u); return [Math.cos(t) * s, u, Math.sin(t) * s]; }

/* ---------- Sky shells ---------- */
const emitters = [];
let shake = 0;
const glowAt = (p, size, c, life) => spawn(p.x, p.y, p.z, 0, 0, 0, life, size, c, c, 0, 0, 0, 0, 0, 1);
const SMOKE_BASE = [.14, .13, .135];
function shellSmoke(p, R, c, n = 16) {
  for (let i = 0; i < n * quality; i++) {
    const d = randDir(), r = R * Math.pow(Math.random(), .5) * .7;
    puff(p.x + d[0] * r, p.y + d[1] * r, p.z + d[2] * r, d[0] * 3, d[1] * 3, d[2] * 3, rand(4.5, 7.5), R * rand(.26, .4), R * .06, [c[0] * .75, c[1] * .75, c[2] * .75], SMOKE_BASE, rand(.11, .2), .8, .05, 3.2);
  }
}
function burstCommon(p, R, c1, silent, size = 1) {
  glowAt(p, R * 1.5, c1, .16);
  glowAt(p, R * .7, C.white, .09);
  lightScene(c1, .13 * size);
  shellSmoke(p, R, c1);
  return silent ? .3 : sfx.burst(p, size);
}
function shellStars(p, n, R, k, life, size, c1, c2, grav, flag, tl) {
  // Stars are packed evenly inside a real shell, so the break is a clean sphere rather than random clumps.
  const v = R * k, count = Math.floor(n * (quality > .8 ? 1 : .7)), phase = rand(0, TAU), ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i + .5) / count * 2, r = Math.sqrt(1 - y * y), a = phase + i * ga, s = v * rand(.94, 1.02);
    const dx = Math.cos(a) * r + rand(-.05, .05), dy = y + rand(-.05, .05), dz = Math.sin(a) * r + rand(-.05, .05);
    spawn(p.x, p.y, p.z, dx * s, dy * s, dz * s, life * rand(.82, 1.08), size * rand(.8, 1.2), c1, c2, k, grav, flag, tl);
  }
}
function peony(p, silent, scale = 1) {
  const [a, b] = pick(PAIRS), D = p.length(), R = D * rand(.25, .29) * scale;
  burstCommon(p, R, a, silent, scale);
  shellStars(p, 230 * scale, R, 2, 2.15, D * .0115, a, b, 9.8, F.LATE, 0);
  shellStars(p, 80 * scale, R * .45, 2.3, 1.5, D * .009, b, C.white, 9.8, F.LATE, 0);
}
function chrysanthemum(p, silent, scale = 1) {
  const [a, b] = pick(PAIRS), D = p.length(), R = D * rand(.28, .32) * scale;
  burstCommon(p, R, a, silent, 1.2 * scale);
  shellStars(p, 210 * scale, R, 1.9, 2.5, D * .0115, C.white, a, 9.8, F.TRAIL | F.LATE, .5);
  shellStars(p, 45, R * .3, 2.2, 1.3, D * .01, b, b, 6, F.TWINKLE | F.LATE, 0);
}
function goldenRain(p, silent) {
  const D = p.length(), R = D * rand(.24, .27);
  const delay = burstCommon(p, R, C.gold, silent, .85);
  shellStars(p, 175, R, 1.45, 4.3, D * .0095, C.gold, C.charcoal, 9.8, F.TRAIL | F.LATE, 1.15);
  if (!silent) sfx.sizzle(3.6, panFor(p), delay + .2);
}
function crackling(p, silent) {
  const D = p.length(), R = D * rand(.22, .26);
  const delay = burstCommon(p, R, C.silver, silent, .75);
  shellStars(p, 110, R, 2, 1.25, D * .009, C.gold, C.silver, 9.8, F.CRACKLE | F.LATE, 0);
  if (!silent) sfx.crackle(90, panFor(p), delay + 1, 1.05);
}
// Every shell climbs to where you tapped before it breaks, so you see the tail and hear the tube first.
function launch(target, burst, T = rand(.6, .78), silent = false, view = VIEW()) {
  const start = view.origin.clone().lerp(target, .32); start.y = view.groundY ?? floorY;
  const pos = new THREE.Vector3(), last = start.clone();
  if (!silent) sfx.lift(panFor(target));
  let t = 0;
  emitters.push({ update(dt) {
    t += dt;
    const k = Math.min(1, t / T), e = 1 - (1 - k) * (1 - k);
    pos.lerpVectors(start, target, e);
    const size = target.length() * .004;
    for (let i = 0; i < 4; i++) {
      const f = i / 4;
      spawn(last.x + (pos.x - last.x) * f, last.y + (pos.y - last.y) * f, last.z + (pos.z - last.z) * f, rand(-1, 1), rand(-4, -1), rand(-1, 1), rand(.2, .45), size * rand(.6, 1.1), C.gold, C.charcoal, 1.5, 3, 0, 0, .06);
    }
    last.copy(pos);
    if (k >= 1) { burst(target.clone(), silent); return false; }
    return true;
  } });
}
// A rocket is a small motor with a small payload: it burns out, coasts for a beat in the dark, then cracks open into a few heavy comets.
function rocketBreak(p) {
  const D = p.length(), R = D * rand(.17, .2), c = pick([C.gold, C.gold, C.red, C.green, C.silver]);
  glowAt(p, R * 1.1, C.white, .09);
  lightScene(c, .08);
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
}
function rocket(target) {
  const start = camera.position.clone().lerp(target, .2); start.y = floorY;
  const pos = new THREE.Vector3(), last = start.clone();
  const { r } = VIEW(), bow = target.length() * rand(.02, .045) * (Math.random() < .5 ? -1 : 1), wob = rand(0, TAU);
  const burn = rand(.95, 1.15), T = burn + rand(.32, .46), ember = [.8, .3, .06];
  sfx.fizz(burn + .2, panFor(target));
  let t = 0;
  emitters.push({ update(dt) {
    t += dt;
    const e = t < burn ? .8 * Math.pow(t / burn, 1.7) : .8 + .2 * (1 - Math.pow(1 - Math.min(1, (t - burn) / (T - burn)), 2));
    pos.lerpVectors(start, target, e).addScaledVector(r, Math.sin(Math.PI * e) * bow + Math.sin(t * 30 + wob) * .14 * (1 - e));
    const D = pos.length();
    if (t < burn) {
      spawn(pos.x, pos.y, pos.z, pos.x - last.x, pos.y - last.y, pos.z - last.z, rand(.16, .26), D * .0024, C.white, C.charcoal, 0, 0, F.SEG, 0, 1, -1);
      for (let i = 0; i < 3; i++) {
        const f = Math.random();
        spawn(last.x + (pos.x - last.x) * f, last.y + (pos.y - last.y) * f, last.z + (pos.z - last.z) * f, rand(-2, 2), rand(-7, -1.5), rand(-2, 2), rand(.25, .6), D * rand(.0018, .0034), C.gold, C.charcoal, 1.2, 6, Math.random() < .3 ? F.TWINKLE : 0, 0, .05);
      }
      glowAt(pos, D * .012, C.gold, .05);
    } else spawn(pos.x, pos.y, pos.z, 0, 0, 0, .05, D * .0028, ember, ember, 0, 0);
    last.copy(pos);
    if (t >= T) { rocketBreak(target.clone()); return false; }
    return true;
  } });
}
const VIEW = () => ({ ...snapshotView(THREE, camera), groundY: floorY });
function twelveShot(target) {
  const view = VIEW(), { r, origin } = view, dist = target.distanceTo(origin);
  const dir = target.clone().sub(origin).normalize();
  let t = 0, n = 0;
  emitters.push({ update(dt) {
    t += dt;
    while (n < 12 && n * .24 <= t) {
      const off = ((n % 2 ? 1 : -1) * (6 - Math.abs(n - 6))) * .05 + rand(-.015, .015);
      const d = dir.clone().addScaledVector(r, off).normalize().multiplyScalar(dist * rand(.88, 1.08)).add(origin);
      launch(d, (q, s) => peony(q, s, .55), rand(.42, .56), false, view);
      n++;
    }
    return n < 12;
  } });
}
function finale() {
  const view = VIEW(), { f, r, u, origin } = view;
  const plan = [];
  for (let i = 0; i < 26; i++) plan.push({ at: i * .26 + rand(0, .16), fn: pick([peony, chrysanthemum, goldenRain, crackling]) });
  for (let i = 0; i < 7; i++) plan.push({ at: 7.1 + rand(0, .4), fn: chrysanthemum });
  plan.sort((a, b) => a.at - b.at);
  let t = 0, n = 0;
  emitters.push({ finale: true, update(dt) {
    t += dt;
    while (n < plan.length && plan[n].at <= t) {
      const d = f.clone().addScaledVector(r, rand(-.34, .34)).addScaledVector(u, rand(-.28, .5)).normalize().multiplyScalar(rand(100, 140)).add(origin);
      launch(d, plan[n++].fn, rand(.45, .7), false, view);
    }
    return n < plan.length;
  } });
}

/* ---------- Ground crackers, as objects ---------- */
function paperTex(draw) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}
const TEX = {
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
    x.fillStyle = '#f0d27a'; x.fillRect(0, 54, 128, 18);
  }),
  shadow: paperTex((x) => {
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.55, 'rgba(0,0,0,.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.clearRect(0, 0, 128, 128); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }),
};
const G = {
  atom: new THREE.CylinderGeometry(.032, .032, .06, 20),
  sutli: new THREE.SphereGeometry(.045, 22, 16),
  lakshmi: new THREE.CylinderGeometry(.012, .012, .07, 12),
  wala: new THREE.CylinderGeometry(.007, .007, .04, 8),
  plane: new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
};
let ambLum = .4;
const propLevel = (flame) => clamp(ambLum * 2.4 + flame, .2, 1.25);
function contactShadow(x, z, radius, opacity, groundY = floorY) {
  const mat = new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, opacity, depthWrite: false, depthTest: false, toneMapped: false });
  const m = new THREE.Mesh(G.plane, mat);
  m.position.set(x, groundY + .003, z);
  m.scale.setScalar(radius);
  m.frustumCulled = false; m.renderOrder = 1;
  world.add(m);
  return m;
}
function makeProp(geom, tex, x, y, z, shadowR, groundY) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const m = new THREE.Mesh(geom, mat);
  m.position.set(x, groundY + y, z);
  world.add(m);
  return { m, mat, shadow: contactShadow(x, z, shadowR, .55, groundY), lit(flame) { mat.color.setScalar(propLevel(flame)); } };
}
const dropProp = (p) => { p.mat.dispose(); p.m.removeFromParent(); p.shadow.material.dispose(); p.shadow.removeFromParent(); };
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
  atom: { geo: G.atom, tex: TEX.atom, h: .06, shadow: .08, fuse: 1.7, power: 1 },
  sutli: { geo: G.sutli, tex: TEX.sutli, h: .09, shadow: .08, fuse: 1.2, power: .7 },
  lakshmi: { geo: G.lakshmi, tex: TEX.lakshmi, h: .07, shadow: .04, fuse: .9, power: .32 },
};
function bomb(p, b) {
  const groundY = p.y;
  const { power, fuse, h } = b, prop = makeProp(b.geo, b.tex, p.x, h / 2, p.z, b.shadow, groundY), pan = panFor(p), R = .35 + .65 * power;
  sfx.fuse(fuse, pan);
  let t = 0;
  emitters.push({ ground: true, update(dt) {
    t += dt;
    prop.lit(.05 + Math.random() * .08);
    if (t < fuse) {
      for (let k = 0; k < 5; k++) spawn(p.x, groundY + h + .012, p.z, rand(-1, 1), rand(.5, 2), rand(-1, 1), rand(.08, .24), .008, C.white, C.amber, 1.5, 4, F.TWINKLE, 0, .03, 0, groundY);
      floorGlow(p.x, p.z, [1, .55, .2], .12 + Math.random() * .1, .4, groundY);
      return true;
    }
    dropProp(prop);
    const c = { x: p.x, y: groundY + .18, z: p.z };
    glowAt(c, 3.2 * R, C.white, .12);
    glowAt(c, 2 * R, C.amber, .4);
    floorPulse(p.x, p.z, [1, .85, .6], 3.4 * power, 6 * R, 3.2, groundY);
    lightScene([1, .88, .68], power);
    if (power > .5) shake = (reduceMotion ? .2 : 1) * power;
    sfx.bomb(pan, power);
    if (b === BOMBS.atom) {
      atomSequence.burst();
      $('effectStatus').textContent = 'Let it ring…';
      playAtomAftertone(actx, master, () => {
        atomSequence.finish();
        $('effectStatus').hidden = true;
        // A hold started during the tail must not turn into a surprise launch.
        press = null;
      });
    }
    vibrate(power > .5 ? [90, 30, 140] : 40);
    for (let k = 0; k < 340 * power; k++) { const d = randDir(), v = rand(3, 13) * R; spawn(c.x, c.y, c.z, d[0] * v, Math.abs(d[1]) * v, d[2] * v, rand(.3, .9), rand(.012, .022), C.gold, C.red, 1.8, 9.8, F.BOUNCE, 0, .03, 0, groundY); }
    if (power > .5) for (let k = 0; k < 120; k++) { const a = (k / 120) * TAU, v = 13 * R; spawn(c.x, groundY + .05, c.z, Math.cos(a) * v, 0, Math.sin(a) * v, .32, .03, C.white, C.amber, 4.4, 0, 0, 0, .02); }
    for (let k = 0; k < 42 * power; k++) { const a = rand(0, TAU), v = rand(.3, 1.9) * R; puff(c.x + Math.cos(a) * .1, c.y, c.z + Math.sin(a) * .1, Math.cos(a) * v, rand(.3, 1.8), Math.sin(a) * v, rand(2.4, 5), rand(.25, .55) * R, .5 * R, [.9, .6, .3], [.24, .23, .22], rand(.16, .3), 1.2, -.08, .1); }
    for (let k = 0; k < 20 * power; k++) puff(c.x + rand(-.12, .12), c.y, c.z + rand(-.12, .12), rand(-.25, .25), rand(1.2, 3.4), rand(-.25, .25), rand(2.2, 4.2), rand(.2, .42), .4, [1, .7, .4], [.26, .25, .24], rand(.18, .3), 1, -.12, .08);
    scatterPaper(c.x, c.y, c.z, Math.ceil(46 * power), 2.6, 13, groundY);
    const scorch = contactShadow(p.x, p.z, .7 * R, .75, groundY);
    let st = 0;
    emitters.push({ update(d) { st += d; if (st > 9) { scorch.material.opacity = .75 * (1 - (st - 9) / 3); if (st > 12) { scorch.material.dispose(); scorch.removeFromParent(); return false; } } return true; } });
    return false;
  } });
}
// A wala is laid straight out ahead of you, so it runs up the screen, and burns from the far end back towards you.
const WALAS = {
  wala100: { n: 64, length: 1.1, waves: 2, amp: .04, gap: [.022, .062], paper: 2 },
  wala1000: { n: 260, length: 2, waves: 4, amp: .09, gap: [.012, .036], paper: 1 },
};
function wala(p, w) {
  const groundY = p.y;
  const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion); r.y = 0; r.normalize();
  const f = new THREE.Vector3(-r.z, 0, r.x), n = w.n, pts = [], mat = new THREE.MeshBasicMaterial({ map: TEX.wala, toneMapped: false });
  const inst = new THREE.InstancedMesh(G.wala, mat, n), dummy = new THREE.Object3D(), pan = panFor(p);
  const ahead = -((p.x - camera.position.x) * f.x + (p.z - camera.position.z) * f.z), shift = Math.max(0, .6 + w.length / 2 - ahead); // keep the near end in front of the phone
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), s = (u - .5) * w.length - shift, o = Math.sin(u * TAU * w.waves) * w.amp;
    pts.push(new THREE.Vector3(p.x + f.x * s + r.x * o, groundY, p.z + f.z * s + r.z * o));
  }
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    dummy.position.set(pts[i].x, groundY + .009, pts[i].z);
    dummy.rotation.set(Math.PI / 2, 0, Math.atan2(a.x - b.x, b.z - a.z) + (i % 2 ? .95 : -.95));
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.frustumCulled = false;
  world.add(inst);
  mat.color.setScalar(propLevel(0));
  let t = 0, i = 0, cursor = .35;
  const times = pts.map(() => { const at = cursor; cursor += Math.random() < .08 ? rand(.1, .22) : rand(w.gap[0], w.gap[1]); return at; });
  emitters.push({ ground: true, update(dt) {
    t += dt;
    while (i < n && times[i] <= t) {
      const q = pts[i], big = i % 24 === 23; // every so often one packed heavier than the rest
      dummy.scale.setScalar(.0001);
      dummy.position.set(q.x, groundY, q.z);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.instanceMatrix.needsUpdate = true;
      sfx.pop(pan + rand(-.1, .1), rand(0, .012), big ? 1.5 : rand(.65, 1));
      glowAt({ x: q.x, y: groundY + .04, z: q.z }, big ? .6 : .34, C.white, .06);
      floorPulse(q.x, q.z, [1, .72, .4], big ? 1.3 : .7, 1.1, 12, groundY);
      lightScene([1, .75, .45], big ? .16 : .07);
      for (let k = 0; k < 14; k++) { const d = randDir(), v = rand(1.5, 4.6); spawn(q.x, groundY + .04, q.z, d[0] * v, Math.abs(d[1]) * v, d[2] * v, rand(.1, .3), .012, C.white, C.amber, 2.2, 7, F.BOUNCE, 0, .03, 0, groundY); }
      scatterPaper(q.x, groundY + .03, q.z, w.paper, 1.4, 11, groundY);
      if (i % 3 === 0) groundSmoke(q.x, groundY + .06, q.z, [.5, .38, .24], 1, .1, .5);
      if (i % 6 === 0) vibrate(7);
      i++;
    }
    if (i >= n) { inst.removeFromParent(); inst.dispose(); mat.dispose(); return false; }
    return true;
  } });
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
  wala100: '<path d="M2 14c3-5 5 3 8-1s5 3 8-1 3-1 4 0"/><path d="M5 9l1 3M10 9l.5 3M15 8l.5 3M20 8l-.5 3"/>',
  wala1000: '<path d="M2 7c3-4 5 2 8-1s5 2 8-1 3-1 4 0"/><path d="M2 13c3-4 5 2 8-1s5 2 8-1 3-1 4 0"/><path d="M2 19c3-4 5 2 8-1s5 2 8-1 3-1 4 0"/>',
};
const KINDS = {
  sky: [['rocket', 'Tiger Rocket'], ['shot', 'Sky shot'], ['rain', 'Golden rain'], ['crackle', 'Crackling'], ['twelve', '12 shot'], ['finale', 'Alapparai']],
  ground: [['atom', 'Atom bomb'], ['sutli', 'Hukum Bomb'], ['lakshmi', 'Lakshmi'], ['wala100', '100 wala'], ['wala1000', '1000 wala']],
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
  if (m === mode) return;
  mode = m;
  updateModeLabel();
  surfaceBtn.hidden = m !== 'ground';
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

function fireAt(cx, cy) {
  if (atomSequence.busy) return false;
  if (worldTracking?.active && !worldTracking.ready) return false;
  const ray = rayAt(cx, cy), id = selected[mode === 'sky' && royalOpen ? 'royal' : mode];
  if (mode === 'sky') {
    placementGuide.place(); ring.visible = false; ring.material.opacity = 0;
    const p = ray.clone().multiplyScalar(rand(100, 135)).add(camera.position);
    if (royalOpen) { royalShow(id); return; }
    if (id === 'rocket') rocket(p);
    else if (id === 'shot') launch(p, Math.random() < .5 ? peony : chrysanthemum);
    else if (id === 'twelve') twelveShot(p);
    else if (id === 'rain') launch(p, goldenRain);
    else if (id === 'crackle') launch(p, crackling);
    else if (id === 'finale' && !emitters.some((e) => e.finale)) { finale(); queueSkyWish(7.5); }
    return;
  }
  if (emitters.filter((e) => e.ground).length >= 7) return;
  const spot = placementPoint(cx, cy);
  if (!spot) { hint("Move slowly and aim at a nearby surface.", 2500); return false; }
  placementGuide.place();
  ring.visible = false; ring.material.opacity = 0;
  if (id === 'atom') {
    atomSequence.begin();
    $('effectStatus').hidden = false;
    $('effectStatus').textContent = 'Atom bomb · fuse lit';
  }
  if (BOMBS[id]) bomb(spot, BOMBS[id]);
  else wala(spot, WALAS[id]);
}

/* ---------- Motion and look ---------- */
const orient = { a: 0, b: 0, g: 0, ok: false };
addEventListener('deviceorientation', (e) => {
  if (!hasOrientation(e)) return;
  orient.a = e.alpha ?? 0; orient.b = e.beta; orient.g = e.gamma; orient.ok = true;
  if (playing) updateModeLabel();
}, true);
const scrAngle = () => (screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : window.orientation || 0);
const qT = new THREE.Quaternion(), qC = new THREE.Quaternion(), lookE = new THREE.Euler(0, 0, 0, 'YXZ');
const look = { yaw: 0, pitch: .12 };
let gyro = false, primed = false;
function updateCamera(dt) {
  if (worldTracking?.active) {
    // Position and rotation are supplied together for the current camera frame.
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
  $('trackingStatus').hidden = ready || !worldTracking?.active;
  $('trackingStatus').textContent = ready ? '' : 'Move slowly over a well-lit, textured floor to find your space.';
  if (!ready) { ring.visible = false; ring.material.opacity = 0; }
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
      const valid = applyWorldPose(camera, reality);
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
    onError() { trackingState(false); hint('Tracking paused. Keep the floor in view or reload to start a new session.', 6000); },
  });
  await worldTracking.start();
  trackingStarting = false;
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
    gainTarget = clamp(.17 / Math.max(lum, .02), .2, .92);
    ambLum = lum * gainTarget;
  } catch (e) { /* frame not ready */ }
}

/* ---------- Input ---------- */
let playing = false, press = null, uiHidden = false;
const REPEAT = .45;
const fingers = new Map();
function toggleUi(force) {
  uiHidden = force === undefined ? !uiHidden : force;
  $('ui').hidden = uiHidden;
  $('showBtn').hidden = !uiHidden;
  if (uiHidden) hint('Controls hidden for recording. Two-finger tap brings them back.', 2400);
}
stage.addEventListener('pointerdown', (e) => {
  if (!playing || (e.target.closest && e.target.closest('button, #picker'))) return;
  e.preventDefault();
  ensureAudio();
  fingers.set(e.pointerId, performance.now());
  if (fingers.size === 2 && e.pointerType === 'touch') {
    const first = Math.min(...fingers.values());
    if (performance.now() - first < 320) { toggleUi(); press = null; return; }
  }
  press = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, dragged: false, t: 0, fired: false, mouse: e.pointerType === 'mouse' };
  try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (worldTracking?.active || gyro) { fireAt(e.clientX, e.clientY); press.fired = true; hintEl.classList.remove('show'); }
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
  if (!gyro && !press.dragged && !press.fired && e.type === 'pointerup') { fireAt(e.clientX, e.clientY); hintEl.classList.remove('show'); }
  press = null;
}
stage.addEventListener('pointerup', endPress);
stage.addEventListener('pointercancel', endPress);
stage.addEventListener('contextmenu', (e) => e.preventDefault());
function holdRepeat(dt) {
  if (atomSequence.busy || !press || mode !== 'sky' || royalOpen || ['finale', 'twelve'].includes(selected.sky) || (!gyro && press.dragged)) return;
  press.t += dt;
  if (press.t >= REPEAT) { press.t = 0; press.fired = true; fireAt(press.x, press.y); }
}
function applyMute() {
  if (master) master.gain.value = muted ? 0 : .9;
  $('icoSound').hidden = muted; $('icoMuted').hidden = !muted;
  $('muteBtn').setAttribute('aria-label', muted ? 'Turn sound on' : 'Mute sound');
}
$('muteBtn').addEventListener('click', () => { muted = !muted; ensureAudio(); applyMute(); });
$('hideBtn').addEventListener('click', () => toggleUi(true));
$('showBtn').addEventListener('click', () => toggleUi(false));

// Silence the moment the page isn't on screen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) worldTracking?.pause(); else worldTracking?.resume();
  if (!actx) return;
  if (document.hidden) actx.suspend(); else if (playing) actx.resume();
});

async function requestMotionAccess() {
  if (typeof DeviceOrientationEvent === 'undefined') return 'unavailable';
  if (typeof DeviceOrientationEvent.requestPermission !== 'function') return 'granted';
  try { return await DeviceOrientationEvent.requestPermission(); } catch { return 'denied'; }
}
function updateModeLabel() {
  if (worldTracking?.active) {
    modeEl.textContent = (mode === 'sky' ? 'Sky' : 'Floor') + (worldTracking.ready ? ' · AR' : ' · Scanning');
    $('motionBtn').hidden = true; return;
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
  hint(worldTracking?.active ? 'Scan the floor slowly. Tap to place; select a cracker again for a new ring.' : 'Demo: drag to look around, then tap to light a cracker.', 6000);
  if (wishName) queueSkyWish(1, `For ${wishName}`);
}
$('startBtn').addEventListener('click', () => beginExperience(true));
$('demoBtn').addEventListener('click', () => beginExperience(false));
$('motionBtn').addEventListener('click', async () => {
  gyro = (await requestMotionAccess()) === 'granted'; primed = false; updateModeLabel();
  hint(gyro ? 'Move your phone. Sky and floor switch automatically as motion arrives.' : 'Motion is blocked. Enable Motion & Orientation Access in Safari settings, then reload.', 6500);
});
modeEl.addEventListener('click', () => {
  if (worldTracking?.active || (gyro && orient.ok)) { hint('Automatic: point down for the floor, lift up for the sky.', 3500); return; }
  look.pitch = mode === 'sky' ? -.75 : .12;
});
addEventListener('pagehide', () => {
  worldTracking?.stop();
  const feed = video.srcObject;
  if (feed && typeof feed.getTracks === 'function') feed.getTracks().forEach(track => track.stop());
  if (actx) actx.suspend();
});
addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return;
  if (e.key === 'Escape') toggleUi(false);
  if (e.code === 'Space' && playing && !e.target.closest('button')) { e.preventDefault(); fireAt(W / 2, H * .35); }
});


/* ---------- Namma Vedi’s additions: grand shows and wishes ---------- */
const wishParams = new URLSearchParams(location.search);
let wishName = (wishParams.get('to') || '').slice(0, 24);
let wishFrom = (wishParams.get('from') || 'Abishek').slice(0, 24);
let wishMessage = (wishParams.get('wish') || '').slice(0, 100);
let activeLettering = null;
function queueSkyWish(delay = 0, title = 'Happy Diwali') {
  const view = VIEW();
  let elapsed = 0;
  emitters.push({ update(dt) {
    elapsed += dt;
    if (elapsed < delay) return true;
    writeSky(title, view);
    return false;
  } });
}
function writeSky(title = 'Happy Diwali', view = VIEW()) {
  if (activeLettering) activeLettering.cancel();
  const glyph = document.createElement('canvas'); glyph.width = 1024; glyph.height = 180;
  const x = glyph.getContext('2d');
  let fontSize = 118;
  x.font = `${fontSize}px "Yatra One", Georgia, serif`;
  while (x.measureText(title).width > 940 && fontSize > 30) { fontSize -= 2; x.font = `${fontSize}px "Yatra One", Georgia, serif`; }
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.fillText(title, 512, 90);
  const pixels = x.getImageData(0, 0, 1024, 180).data;
  const { f, r, u, origin } = view, distance = 100;
  const center = f.clone().multiplyScalar(distance).addScaledVector(u, 5).add(origin);
  const worldWidth = 2 * distance * Math.tan(view.fov * DEG / 2) * view.aspect * .84;
  const coordinates = [];
  for (let y = 0; y < 180; y += 4) for (let xx = 0; xx < 1024; xx += 4) {
    if (pixels[(y * 1024 + xx) * 4 + 3] > 110) {
      const p = center.clone().addScaledVector(r, (xx - 512) / 1024 * worldWidth).addScaledVector(u, (90 - y) / 1024 * worldWidth);
      coordinates.push(p.x, p.y, p.z);
    }
  }
  const positions = new Float32Array(coordinates), target = positions.slice();
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  const d = dot.getContext('2d'), glow = d.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, '#ffffff'); glow.addColorStop(.18, '#fff2c9'); glow.addColorStop(.5, '#ffb54299'); glow.addColorStop(1, '#ffb54200');
  d.fillStyle = glow; d.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(dot);
  const mat = new THREE.PointsMaterial({ color: 0xffd295, size: worldWidth / 250, map: texture, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const lettering = new THREE.Points(geo, mat); lettering.renderOrder = 9; lettering.frustumCulled = false; world.add(lettering);
  let t = 0, dead = false;
  const cancel = () => { if (dead) return; dead = true; lettering.removeFromParent(); geo.dispose(); mat.dispose(); texture.dispose(); if (activeLettering?.cancel === cancel) activeLettering = null; };
  activeLettering = { cancel };
  emitters.push({ update(dt) {
    if (dead) return false;
    t += dt;
    const progress = reduceMotion ? 1 : clamp(t / 1.2, 0, 1), ease = 1 - Math.pow(1 - progress, 3);
    for (let i = 0; i < positions.length; i += 3) {
      const start = center.clone().addScaledVector(u, -18).addScaledVector(r, Math.sin(i * 2.15) * worldWidth * .35);
      positions[i] = start.x + (target[i] - start.x) * ease;
      positions[i + 1] = start.y + (target[i + 1] - start.y) * ease;
      positions[i + 2] = start.z + (target[i + 2] - start.z) * ease;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = Math.min(1, t / .4) * Math.min(1, (9 - t) / 1.5) * (.92 + .08 * Math.sin(t * 5));
    if (t >= 9) { cancel(); return false; }
    return true;
  } });
  hint(wishMessage || (wishFrom ? `இனிய தீபாவளி · With love, ${wishFrom}` : 'இனிய தீபாவளி'), 5000);
}
function diamondBurst(p, silent) {
  const D = p.length(), R = D * .29;
  const delay = burstCommon(p, R, C.silver, silent, 1.2);
  shellStars(p, 260, R, 1.65, 3.2, D * .01, C.white, C.blue, 6, F.TRAIL | F.TWINKLE | F.LATE, .7);
  shellStars(p, 100, R * .48, 1.8, 2.5, D * .009, C.silver, C.violet, 8, F.TWINKLE, 0);
  if (!silent) sfx.sizzle(2.8, panFor(p), delay);
}
function royalShow(kind) {
  if (emitters.some(e => e.finale)) { hint('Let this grand show finish its moment.', 2300); return; }
  const view = VIEW(), { f, r, u, origin } = view, plan = [], count = reduceMotion ? 16 : kind === 'hukum' ? 42 : 36;
  for (let i = 0; i < count; i++) {
    const x = kind === 'hukum' ? ((i % 3) - 1) * .28 : kind === 'thangam' ? ((i % 6) / 5 - .5) * .9 : rand(-.4, .4);
    const y = kind === 'hukum' ? .08 + (Math.floor(i / 3) % 3) * .15 : kind === 'thangam' ? .15 + Math.floor(i / 6) * .025 : rand(-.12, .4);
    const p = f.clone().addScaledVector(r, x).addScaledVector(u, y).normalize().multiplyScalar(rand(115, 145)).add(origin);
    const fn = kind === 'thangam' ? goldenRain : kind === 'diamond' ? diamondBurst : (q, silent) => chrysanthemum(q, silent, 1.2);
    plan.push({ at: i * .19, p, fn });
  }
  let elapsed = 0, n = 0, written = false;
  emitters.push({ finale: true, update(dt) {
    elapsed += dt;
    while (n < plan.length && plan[n].at <= elapsed) { const shot = plan[n++]; launch(shot.p, shot.fn, .65, false, view); }
    if (!written && elapsed > 6) { written = true; writeSky('Happy Diwali', view); }
    return elapsed < 14;
  } });
}
$('royalBtn').addEventListener('click', () => {
  royalOpen = !royalOpen;
  $('royalBtn').setAttribute('aria-pressed', String(royalOpen));
  $('royalBtn').textContent = royalOpen ? 'Classic crackers' : 'Grand shows ✦';
  renderPicker();
});
$('wishBtn').addEventListener('click', () => {
  if (!playing || atomSequence.busy || (worldTracking?.active && !worldTracking.ready)) return;
  placementGuide.place(); ring.visible = false; ring.material.opacity = 0;
  writeSky('Happy Diwali');
});


/* ---------- Surface ring ---------- */
const ring = new THREE.Mesh(new THREE.RingGeometry(.3, .307, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffae2b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false }));
ring.frustumCulled = false; ring.renderOrder = 4;
world.add(ring);
function updateRing(time) {
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
  const trackingLost = playing && worldTracking?.active && !worldTracking.ready;
  const dt = trackingLost ? 0 : Math.min(.05, raw);
  world.visible = !trackingLost;
  last = now;
  const time = now / 1000;
  if (trackingLost) {
    updateCamera(0); autoDim(Math.min(.05, raw));
    renderer.render(scene, camera);
    return;
  }
  if (!playing) { look.yaw = Math.sin(time * .1) * .04; look.pitch = .14; attract(dt); }
  updateCamera(dt);
  poolN = 0;
  if (playing) {
    holdRepeat(dt); autoDim(dt); adaptQuality(raw, dt);
    distantT -= dt;
    if (distantT <= 0 && !atomSequence.busy) { distantT = rand(2.5, 8); sfx.distant(); }
  }
  for (let i = emitters.length - 1; i >= 0; i--) if (!emitters[i].update(dt)) emitters.splice(i, 1);
  for (let i = pulses.length - 1; i >= 0; i--) {
    const f = pulses[i];
    floorGlow(f.x, f.z, f.c, f.i, f.r, f.groundY);
    f.i -= f.i * f.d * dt + dt * .3;
    if (f.i <= .02) pulses.splice(i, 1);
  }
  for (let i = poolN; i < pools.length; i++) pools[i].visible = false;
  updateSparks(dt);
  updateSmoke(dt);
  updateRing(time);
  if (sceneLight > .002) {
    skyLight.visible = true;
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
