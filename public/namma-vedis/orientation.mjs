/** Orientation math from the reference's device camera, isolated for regression checks. */
export function hasOrientation(event) {
  return Number.isFinite(event.beta) && Number.isFinite(event.gamma);
}

export function deviceQuaternion(THREE, orientation, screenAngle = 0) {
  const radians = Math.PI / 180;
  const euler = new THREE.Euler(
    orientation.b * radians,
    (orientation.a || 0) * radians,
    -orientation.g * radians,
    'YXZ',
  );
  const back = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
  const screen = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1), -screenAngle * radians,
  );
  return new THREE.Quaternion().setFromEuler(euler).multiply(back).multiply(screen);
}

export function modeForPitch(current, pitch) {
  // Pitch is the camera's elevation above the horizon. Level and downward
  // views belong to the floor tray; sky requires a deliberate upward tilt.
  // Separate enter/exit angles keep small hand movements from flickering.
  const radians = Math.PI / 180;
  if (current === 'sky' && pitch <= 12 * radians) return 'ground';
  if (current === 'ground' && pitch >= 24 * radians) return 'sky';
  return current;
}
