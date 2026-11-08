import { walaRandom } from './wala-layout.mjs';

// Deliberately irregular runs with brief hesitations and a denser closing run.
// This is an artistic simulation, not measured timing of a physical product.
export function createWalaBurn(config, seed) {
  const random = walaRandom(seed ^ 0xA511E9B3), n = config.n;
  const times = new Float64Array(n), energy = new Float32Array(n), tone = new Float32Array(n);
  let i = 0, at = 0;
  while (i < n) {
    const run = Math.floor(config.run[0] + random() * (config.run[1] - config.run[0]));
    const pace = (.28 + random() * 1.15) * (i > n * .87 ? .58 : 1);
    if (i) at += .025 + random() ** 2 * .17;
    for (let j = 0; j < run && i < n; j++, i++) {
      at += config.duration / n * pace * (.22 + random() * 1.5);
      times[i] = at;
      energy[i] = .45 + random() * .6 + (random() < .12 ? .45 : 0);
      tone[i] = random();
    }
  }
  const duration = config.duration * (.96 + random() * .08), fuse = .65;
  const first = times[0], span = times[n - 1] - first;
  for (let j = 0; j < n; j++) times[j] = fuse + (times[j] - first) / span * duration;
  energy[n - 1] = 1.25;
  return { times, energy, tone, duration: times[n - 1], fuse };
}

export function walaIndexAt(times, time) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (times[mid] <= time) lo = mid + 1; else hi = mid; }
  return lo;
}

// Mix one short, bounded audio window. The individual snap offsets survive
// display frame batching; dense chains don't collapse to one identical pop/frame.
export function renderWalaAudio(sampleRate, burn, from, to) {
  const length = Math.ceil((to - from + .085) * sampleRate), samples = new Float32Array(length);
  const first = walaIndexAt(burn.times, from - 1e-7), end = walaIndexAt(burn.times, to - 1e-7);
  const stride = Math.max(1, Math.ceil((end - first) / 96));
  for (let i = first; i < end; i += stride) {
    const start = Math.round((burn.times[i] - from) * sampleRate), color = burn.tone[i];
    const gain = (.13 + color * .04) * burn.energy[i] * Math.min(1.4, Math.sqrt(stride));
    let random = (i + 1) * 2654435761 >>> 0, low = 0;
    const duration = .032 + .028 * color, count = Math.ceil(duration * sampleRate);
    for (let j = 0; j < count && start + j < length; j++) {
      random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
      const noise = (random >>> 0) / 2147483648 - 1, t = j / sampleRate;
      low += (noise - low) * .24;
      const snap = noise * Math.exp(-t * (260 + color * 170));
      const body = low * Math.exp(-t * 85) + Math.sin(t * (170 + color * 220) * Math.PI * 2) * Math.exp(-t * 115) * .3;
      if (start + j >= 0) samples[start + j] += (snap + body) * Math.min(1, t / .0005) * gain;
    }
  }
  for (let i = 0; i < length; i++) samples[i] = .82 * Math.tanh(samples[i] * 1.35);
  return { samples, first, end };
}

export function decorateWalaMaterial(material, clock) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uWalaTime = clock;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      uniform float uWalaTime;
      attribute float iWalaAt;
      attribute vec3 iWalaKick;
    `);
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      float recoil = sin(clamp((uWalaTime - iWalaAt + .12) / .12, 0.0, 1.0) * 1.5707963);
      mvPosition.xyz += iWalaKick * recoil;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
    `);
  };
  material.customProgramCacheKey = () => 'namma-wala-recoil-v1';
}
