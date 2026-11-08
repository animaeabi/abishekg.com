import { Vector3 } from 'three';

// Monoline strokes: bright travelling tips actually trace each letter instead
// of fading a bitmap into view. Coordinates are x/right and y/up.
const GLYPHS = {
  A: [[[0,0],[.36,1],[.72,0]],[[.14,.4],[.58,.4]]],
  B: [[[.08,0],[.08,1],[.48,1],[.66,.88],[.66,.68],[.48,.52],[.08,.52]],[[.48,.52],[.7,.38],[.7,.15],[.5,0],[.08,0]]],
  C: [[[.7,.87],[.52,1],[.2,.96],[.04,.72],[.04,.28],[.2,.04],[.52,0],[.7,.14]]],
  D: [[[.08,0],[.08,1],[.4,1],[.65,.81],[.72,.5],[.65,.19],[.4,0],[.08,0]]],
  E: [[[.7,1],[.08,1],[.08,0],[.7,0]],[[.08,.51],[.58,.51]]],
  F: [[[.08,0],[.08,1],[.7,1]],[[.08,.53],[.58,.53]]],
  G: [[[.7,.88],[.5,1],[.2,.95],[.04,.7],[.04,.28],[.2,.03],[.5,0],[.7,.2],[.7,.48],[.43,.48]]],
  H: [[[.08,0],[.08,1]],[[.68,1],[.68,0]],[[.08,.5],[.68,.5]]],
  I: [[[.08,1],[.64,1]],[[.36,1],[.36,0]],[[.08,0],[.64,0]]],
  J: [[[.08,1],[.68,1],[.68,.22],[.53,.03],[.25,0],[.07,.18]]],
  K: [[[.08,0],[.08,1]],[[.7,1],[.08,.43],[.7,0]]],
  L: [[[.08,1],[.08,0],[.7,0]]],
  M: [[[.03,0],[.03,1],[.36,.5],[.69,1],[.69,0]]],
  N: [[[.06,0],[.06,1],[.68,0],[.68,1]]],
  O: [[[.36,1],[.12,.9],[.03,.6],[.06,.25],[.23,.03],[.48,0],[.68,.23],[.72,.6],[.6,.9],[.36,1]]],
  P: [[[.08,0],[.08,1],[.48,1],[.69,.86],[.69,.65],[.49,.5],[.08,.5]]],
  Q: [[[.36,1],[.12,.9],[.03,.6],[.06,.25],[.23,.03],[.48,0],[.68,.23],[.72,.6],[.6,.9],[.36,1]],[[.43,.26],[.76,-.08]]],
  R: [[[.08,0],[.08,1],[.48,1],[.69,.86],[.69,.65],[.49,.5],[.08,.5]],[[.4,.5],[.72,0]]],
  S: [[[.7,.86],[.5,1],[.2,.97],[.04,.77],[.13,.58],[.56,.42],[.71,.22],[.56,.02],[.23,0],[.04,.15]]],
  T: [[[0,1],[.72,1]],[[.36,1],[.36,0]]],
  U: [[[.05,1],[.05,.24],[.22,.02],[.5,.02],[.68,.24],[.68,1]]],
  V: [[[.02,1],[.36,0],[.7,1]]],
  W: [[[0,1],[.15,0],[.36,.58],[.57,0],[.72,1]]],
  X: [[[.02,1],[.7,0]],[[.7,1],[.02,0]]],
  Y: [[[.02,1],[.36,.52],[.7,1]],[[.36,.52],[.36,0]]],
  Z: [[[.02,1],[.7,1],[.02,0],[.7,0]]],
  '-': [[[.12,.5],[.6,.5]]],
  '.': [[[.34,0],[.38,0]]],
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

export function sampleStroke(points, progress, out = new Vector3()) {
  const lengths = [0]; let total = 0;
  for (let i = 1; i < points.length; i++) { total += points[i].distanceTo(points[i - 1]); lengths.push(total); }
  const distance = clamp(progress, 0, 1) * total;
  for (let i = 1; i < points.length; i++) if (distance <= lengths[i]) {
    return out.lerpVectors(points[i - 1], points[i], (distance - lengths[i - 1]) / Math.max(1e-9, lengths[i] - lengths[i - 1]));
  }
  return out.copy(points.at(-1));
}

export function createSkyWritingPlan(title, view, rasterize = () => []) {
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const letters = text => segmenter ? [...segmenter.segment(text)].map(part => part.segment) : Array.from(text);
  const normalized = letters(title.trim().toUpperCase()).slice(0, 36).join('') || 'HAPPY DIWALI';
  const words = normalized.split(/\s+/);
  let lines;
  if (normalized === 'HAPPY DIWALI') lines = ['HAPPY', 'DIWALI'];
  else if (normalized.length > 12 && words.length > 1) {
    let first = words.shift(); while (words.length > 1 && first.length < normalized.length / 2 - 3) first += ' ' + words.shift();
    lines = [first, words.join(' ')];
  } else lines = [normalized];
  const distance = 100, longest = Math.max(...lines.map(s => letters(s).length));
  const width = 2 * distance * Math.tan(view.fov * Math.PI / 360) * view.aspect * .76;
  const unit = Math.min(width / Math.max(1, longest * .96 - .24), distance * .095);
  const center = view.origin.clone().addScaledVector(view.f, distance).addScaledVector(view.u, 5);
  const worldPoint = (x, y) => center.clone().addScaledVector(view.r, x * unit).addScaledVector(view.u, y * unit);
  const strokes = [], targets = [], births = [], seeds = [], drifts = [];
  let letter = 0, end = 0;
  for (let row = 0; row < lines.length; row++) {
    const text = letters(lines[row]), left = -(text.length * .96 - .24) / 2;
    const baseline = (lines.length - 1) * .68 - row * 1.36 - .5;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (character === ' ') continue;
      const paths = GLYPHS[character] || rasterize(character);
      for (let k = 0; k < paths.length; k++) {
        const points = paths[k].map(([x, y]) => worldPoint(left + index * .96 + x, baseline + y));
        if (points.length < 2) continue;
        const length = points.slice(1).reduce((v, p, i) => v + p.distanceTo(points[i]), 0) / unit;
        const start = 1.5 + letter * .13 + k * .095, duration = .34 + length * .14;
        const samples = Math.max(4, Math.ceil(length * 28));
        const stroke = { points, start, duration, lane: letter % 6 };
        strokes.push(stroke); end = Math.max(end, start + duration);
        for (let j = 0; j <= samples; j++) {
          const p = sampleStroke(points, j / samples), seed = hash(targets.length + 1);
          targets.push(p.x, p.y, p.z); births.push(start + j / samples * duration); seeds.push(seed);
          const drift = view.r.clone().multiplyScalar((seed - .5) * unit * .8).addScaledVector(view.u, (.2 + hash(j + letter * 77)) * unit * .2);
          drifts.push(drift.x, drift.y, drift.z);
        }
      }
      letter++;
    }
  }
  const comets = Array.from({ length: 6 }, (_, i) => ({
    start: center.clone().addScaledVector(view.u, -unit * 3.1).addScaledVector(view.r, (i - 2.5) * unit * .18),
    end: center.clone().addScaledVector(view.r, (i - 2.5) * unit * .72).addScaledVector(view.u, -.15 * unit),
    at: i * .045, duration: .98,
  }));
  return { title, center, width, unit, strokes, comets, targets: new Float32Array(targets), births: new Float32Array(births),
    seeds: new Float32Array(seeds), drifts: new Float32Array(drifts), writeEnd: end, dissolveAt: end + .4, end: end + 3.1 };
}

export const skyWritingVertex = `
  uniform float uTime; uniform float uDissolve; uniform float uScale; uniform float uSize; uniform float uMotion;
  attribute float aBirth; attribute float aSeed; attribute vec3 aDrift;
  varying float vAlpha; varying float vHeat;
  void main() {
    float age = uTime - aBirth;
    float loose = max(0.0, uTime - uDissolve - aSeed * .45);
    vec3 p = position + aDrift * loose * uMotion;
    p.y -= loose * loose * 1.25 * uMotion;
    float flicker = .83 + .17 * sin(uTime * 17.0 + aSeed * 80.0);
    vAlpha = step(0.0, age) * clamp(age / .07, 0.0, 1.0) * pow(clamp(1.0 - loose / 2.1, 0.0, 1.0), 1.4) * mix(1.0, flicker, uMotion);
    vHeat = max(exp(-max(age, 0.0) * 4.0), 1.0 - clamp(loose / 1.7, 0.0, 1.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * uScale / max(.1, -mv.z) * (.78 + aSeed * .5), 1.0, 28.0);
    if (age < 0.0 || mv.z > -.05) { vAlpha = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }
  }
`;
export const skyWritingFragment = `
  varying float vAlpha; varying float vHeat;
  void main() {
    float radius = length(gl_PointCoord - .5) * 2.0;
    if (radius >= 1.0 || vAlpha < .005) discard;
    float halo = pow(1.0 - radius, 2.0);
    float core = 1.0 - smoothstep(.04, .35, radius);
    vec3 warm = mix(vec3(.75, .16, .015), vec3(1.0, .62, .16), vHeat);
    gl_FragColor = vec4((warm * halo + vec3(1.0, .96, .78) * core * vHeat) * vAlpha, 0.0);
  }
`;
