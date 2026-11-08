export const ATOM_RING_DELAY = .24;
export const ATOM_RING_SECONDS = 2.4;

// One atomic sequence: fuse -> explosion -> ringing tail -> ready. The gate
// releases on audio completion, so a suspended audio context cannot skip it.
export class AtomSequence {
  phase = 'ready';
  get busy() { return this.phase !== 'ready'; }
  begin() {
    if (this.busy) return false;
    this.phase = 'fuse'; return true;
  }
  burst() { if (this.phase === 'fuse') this.phase = 'ringing'; }
  finish() { this.phase = 'ready'; }
}

export function playAtomAftertone(context, destination, done, schedule = setTimeout) {
  if (!context || !destination) {
    schedule(done, (ATOM_RING_DELAY + ATOM_RING_SECONDS + .05) * 1000);
    return;
  }
  const start = context.currentTime + ATOM_RING_DELAY;
  const end = start + ATOM_RING_SECONDS;
  const oscillator = context.createOscillator(), gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(2650, start);
  oscillator.frequency.exponentialRampToValueAtTime(2100, end);
  // Cinematic ear-ring impression at restrained amplitude, under the normal
  // master mute/volume and compressor. No added reverb extends the release.
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(.085, start + .08);
  gain.gain.setValueAtTime(.055, start + .65);
  gain.gain.exponentialRampToValueAtTime(.0001, end);
  oscillator.connect(gain); gain.connect(destination);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); done(); };
  oscillator.start(start); oscillator.stop(end + .05);
}
