// Correlated shell variation keeps a recognizable spherical break without the
// identical spoke lengths, sizes and burn times of a procedural wire sphere.
export function shellStar(index, count, phase, random = Math.random) {
  const y = 1 - (index + .5) / count * 2;
  const azimuth = phase + index * Math.PI * (3 - Math.sqrt(5));
  const latitude = Math.acos(y) + (random() - .5) * .075;
  const angle = azimuth + (random() - .5) * .1;
  const lobe = Math.sin(angle * 3 + phase) * Math.sin(latitude * 2) * .08;
  const speed = (index % 13 === 0 ? .56 : .86) + random() * .23 + lobe;
  return { x: Math.cos(angle) * Math.sin(latitude), y: Math.cos(latitude), z: Math.sin(angle) * Math.sin(latitude),
    speed, life: .75 + random() * .33, size: .65 + random() * .7, drag: .87 + random() * .26 };
}

export function shellFlight(start, target, elapsed, duration, out) {
  const k = Math.max(0, Math.min(1, elapsed / duration));
  out.lerpVectors(start, target, k);
  // Ballistic vertical motion: rapid rise followed by deceleration at the apex.
  out.y += .5 * 9.8 * duration * duration * k * (1 - k);
  return out;
}

export function skySound(distance) {
  const d = Math.max(1, distance);
  return { delay: Math.min(1.2, d / 343), gain: Math.max(.3, Math.min(1, 100 / d)), cutoff: Math.max(1300, 4300 - d * 12) };
}
