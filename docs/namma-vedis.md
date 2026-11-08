# Namma Pattas on abishekg.com

Public route: `/namma-vedis`, served as standalone HTML through an exact Vercel
rewrite. The portfolio and Unhinged routes are unchanged; no iframe or login.

The original Pattasu client code is reused at the user's explicit request:
https://pattasu-diwali.vercel.app/. Its Three.js renderer, shaders, synthesized
sound, eleven cracker types, props, smoke and paper effects remain, with credit
to @ikevinadams. Namma Pattas / நம்ம பட்டாசு branding, grand shows, Jailer-inspired
names and sparkling Happy Diwali lettering are retained.

The landing title cycles through Tamil, Hindi and Telugu in Latin letters every
1.8 seconds with a 180 ms transition. The existing `/namma-vedis` route remains
valid after the name change.

The landing footer shows only “Namma Pattas · by Abishek”. That name links to
`/namma-vedis/credits`, where original-experience and AR-engine notices remain.

## World placement

Camera mode now uses the pinned `@8thwall/engine-binary@1.0.0` distributed SLAM
runtime. It tracks translation and rotation together on mobile browsers,
including iOS Safari, independently of native WebXR support. The runtime is
copied unchanged into `/namma-vedis/xr/1.0.0/` by the prebuild/predev script. The full
license ships with it and is linked from the credits page.

The runtime owns camera capture and frame timing. Three.js uses the runtime's
wrapped GL context, tracked camera pose, calibrated projection, and cropped
camera texture for that same frame. The old gyro update cannot overwrite the
tracked pose. No secondary camera stream is opened. Responsive scale uses the
initial 1.4-unit camera height for approximate sizing, avoiding metric scale
calibration. Positional tracking remains enabled; the first valid `NORMAL` pose
unlocks placement, with no additional scan countdown. Limited tracking still
pauses effects and blocks placement. Model size is approximate rather than a
measured physical dimension.

The SLAM module preloads alongside the engine while the welcome page is open,
and versioned runtime files use a year-long immutable cache for return visits.
Camera permission is still requested only after Start. Scanning guidance asks
for gentle sideways translation while aiming at a well-lit floor. These changes
reduce initialization work; scan latency still needs on-phone measurement.

A ground tap copies a hit-test position (or intersects the tracked estimated
floor plane). Each prop, shadow, scorch, glow pulse, bouncing spark and scrap
keeps its placement height. Switching floor/table affects future placements.
Table fallback is a selected height; this does not provide arbitrary scene
meshing, semantic floor recognition or real-world occlusion.

Sky launches, multi-shot shows and delayed lettering capture their original
world origin and direction. They are not re-aimed as the phone moves. Artificial
screen shake is disabled in AR because it breaks camera alignment.

Automatic mode uses the tracked camera's elevation, not image recognition.
Straight-ahead and downward views use the floor tray. Sky starts at 24 degrees
above the horizon and returns to floor at 12 degrees, leaving a stable gap for
small hand movements. This also applies in portrait and landscape orientations.

The placement ring vanishes immediately on placement. It stays hidden through
camera movement and tracking recovery. Selecting a cracker or changing surface
arms it again. Tracking loss hides virtual content, pauses its simulation and
blocks placement until tracking recovers; no gyro-only fallback is labelled AR.
A clearly separate, explicitly chosen camera-free demo remains available after
startup failure.

## Atom bomb sequence

Atom placement locks all new ground, sky and lettering launches from fuse
through explosion and a 2.4-second cinematic ringing tail (after a 0.24-second
onset delay). The tone uses a restrained sine envelope through the existing
master mute and compressor. The lock releases on the oscillator's `ended`
event, including when audio has paused and resumed. A no-audio fallback keeps
the same pacing. Holding during the tail does not queue another launch. Sound
and camera processing pause when the page is backgrounded.

## Automatic palm placement (beta)

After Start camera, a background worker loads pinned MediaPipe Tasks Vision
0.10.32 and the Hand Landmarker float16 version 1 model. It borrows the AR
engine's existing video, with no second camera stream or permission prompt.
The download does not block floor initialization. Camera frames are processed
locally; only static SDK/WASM/model assets are fetched from jsDelivr and Google.

Showing one open hand automatically selects the floor-cracker tray, labels the
surface “Palm · Auto” and moves the ring onto the palm. Three consistent valid
results are required. The ring disappears when tapped; the cracker is scaled to
the palm. Its body and contact shadow follow the hand while held; sparks,
smoke and paper enter room coordinates immediately and never move with the hand. Every floor cracker is supported, including the three S-shaped walas.
Only one palm effect runs at a time; floor effects keep their original room
coordinates. Removing the hand returns the placement target to the floor/sky
angle logic. No Hand-mode selector or additional page is required.

Hand-local landmarks estimate the palm plane, size and camera depth. The
calibrated camera projection and visible cover crop map that estimate into the
room. This is not a measured hand mesh, precise depth sensor or finger occlusion.
Open fingers and a reasonably visible palm surface are required; side-on,
folded, low-confidence, out-of-view or stale results cannot accept a placement.

### Held-object stabilization

Palm depth uses the median of valid width/length estimates across all five palm
landmarks, so a single misplaced knuckle cannot determine the entire depth.
The held object and placement guide share a sample-timed position/rotation
filter. It suppresses small resting movement, smooths palm width, and raises
its response rate during sustained movement. Large one-frame discontinuities
need a confirming observation. New hand identity or a long gap resets the
filter instead of interpolating from an unrelated old hand.

Gesture detection uses the original measurements so visual smoothing does not
slow down a throw. It now requires two consecutive movements in the same
direction; an isolated depth spike is insufficient. Release and held bursts
start from the stabilized displayed transform, avoiding a snap back to the raw
measurement. Floor flight, upright landing and effect timers are unchanged.

Synthetic 70ms measurement-noise tests reduce position RMS to 26% and rotation
RMS to 24% of the injected noise. These are deterministic algorithm checks, not
measured on-device improvement. The actual application also verifies that its
rendered held root uses the filter, while existing toss/drop tests remain green.

### Throwing and dropping

A hand object has held, airborne, landed and spent states. After placement,
relative palm tilt releases it: 18 degrees for fountains, spinners and walas,
24 degrees for bombs, with a 65ms dwell and a short initial settling interval.
A bomb also releases on a deliberate toss measured across at least three room
position samples. Throw velocity is estimated over at most 240ms, amplified
2.2x for the miniature effect and capped at 6 units/second. Single-frame depth
jumps are rejected. Capture-time camera pose is retained with each inference
request, so inference latency does not substitute a later camera pose.

Brief missed landmarks retain the held object. More than 240ms without accepted
motion samples releases it rather than hiding, cancelling or restarting it.
Curled fingers and a more tilted palm can continue an already acquired hold;
new placements still require an open palm. Worker failure releases the current
object and leaves floor/sky AR available. Room tracking loss still pauses both
simulation and audio until the room coordinate system recovers.

Released objects follow a gravity trajectory, preserving their size, then land
upright at the captured estimated room floor height. Collision time is solved
within each frame so the landing position is consistent at 30/60/120Hz. The
fountain/spinner/string clock runs continuously during falling and landing.
The hand target has its own root and cannot drag a released object back.
Airborne contact shadows and floating scorch marks are suppressed.

Palm bombs use longer fuses: Atom 3.2s, Hukum 2.8s, Lakshmi 2.4s. Tapping starts
the existing fuse; no additional lighting gesture is required. Holding until
the deadline bursts the bomb in the hand; a late toss can burst in the air;
an early release lands before bursting. The burst freezes its origin and
emitted particles stay in the room. Atom shows the remaining time and retains
the existing ringing-completion lock. Floor-only bomb fuse timings are unchanged.

The worker uses one frame in flight at a maximum 512-pixel input dimension,
sampling less often while searching. Landmarks infer depth; this is a gravity
simulation against the AR floor estimate, not a measured hand mesh, room mesh,
real-world object collision or finger occlusion. Throw sensitivity, motion blur,
fast hand exits and perceived floor height still need physical-phone validation.

Primary references:
- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- https://developers.google.com/edge/mediapipe/solutions/setup_web

Acceptance still requires physical Safari/Chrome: open palm acquire/loss,
hand movement and rotation, simultaneous floor/palm effects, browser rotation,
mute and ringing, background/resume, and sustained frame-rate/temperature.
The automated tests use synthetic landmarks and mocked camera/worker plumbing;
they do not establish inference accuracy, rendering quality or device performance.

## Validation

Flower pot is a solid decorated cone with a 0.85-second fuse, a 9.5-second
gold-and-white fountain, falling sparks, a restrained hiss/crackle and a
four-second cooling finish. Sanguchakram is a solid coiled disc with a
0.75-second fuse, a seven-second gold/silver ground spin and three seconds of
cooling. Their roots, contact shadows and spark bounce planes retain the
placement coordinates. The disc rotates around its own center. Three of each
may coexist within the shared seven-ground-effect limit. Both obey the Atom
completion gate and hide the placement ring when placed.

The November 8 release audit also fixes landed paper facing the camera,
undefined reversed-edge spark shading, oversized bomb glow, sky burst sizing
relative to the session origin, repeated updates to settled sky lettering,
sound-node cleanup and Back/Forward restoration. Audio pauses with tracking
loss so a fountain or ringing tail cannot finish while its visuals are frozen.
See `namma-vedis-release-audit.md` for results and remaining device checks.

Ground bodies use opaque, depth-writing, physically shaded geometry with rounded
paper bodies, pressed caps, raised bindings and a curved fuse that burns back to
the body. Floor light, contact shadows, sparks and smoke depth-test against these
bodies; a glow no longer paints the camera image over the solid object.

100, 1,000 and 10,000 wala options contain their stated instance counts.
Each placement creates a new, stable asymmetric S with paired-sided bodies,
varied paper shades, imperfect angles and sizes. Dense 10,000 bodies form small
layered packets around one cord instead of twenty flat parallel lanes. The
compressed footprint is an AR presentation choice, not a physical scale claim.

Seeded burst runs alternate faster clusters and short hesitations, with
nonperiodic accents and a denser closing run. Typical fuse-to-last-pop times are
about 5 / 12 / 30 seconds, followed by a 3.2-second fading charred cord. A small
section near the burn front hops in the vertex shader; instance matrices remain
fixed. Sparks, torn paper, local light and smoke follow the moving burn front.

Short synthesized audio buffers retain within-frame snap timing; dense events
are mixed before playback instead of creating hundreds of sound nodes. Work is
bounded to 96 representative pops per audio window, six visual burst samples
per frame and shared particle pools. Only one active 10,000 string is allowed.
Hand holding, throwing/dropping, upright landing and world anchoring are retained.
See `namma-wala-effects.md` for research, artistic choices and verification limits.

- `node --test tests/namma-vedis-*.test.mjs`: orientation, world coordinates,
  camera translation, reticle lifecycle, tracking loss/recovery, startup failure,
  audio completion gate, opaque model geometry and disposal, continuous S-shaped
  layout, all 10,000 instances and their lifecycle in the actual application.
  All 67 checks pass, including wala layout variation, burst cadence, bounded
  audio synthesis, local recoil shader wiring, held-object stabilization, robust depth,
  responsive deliberate movement, continuous release, automatic palm selection, all eight palm effects
  dropping upright, continuous fountain timing, held/midair/landed bomb bursts,
  throw noise rejection, camera-pose compensation, refresh-rate-independent flight
  and landing, independent room effects/audio, hand loss recovery, worker
  readiness/camera ownership, level/upward mode selection, fixed centers,
  translated sky origins, settled paper/lettering, sound cleanup and recovery.
- `node --check public/namma-vedis/app.js`
- `npm run build`: Next.js export plus local AR runtime assets.

CPU integration stubs only DOM drawing/WebGL and does not validate physical
tracking. The cloud QA browser has no WebGL or physical camera/motion sensors.
On-phone acceptance: scan a textured, well-lit floor; place Atom; confirm ring
vanishes; step sideways around its debris; confirm new effects are blocked
until ringing ends; select another cracker to re-arm the ring. Launch a sky
show, turn away and return, and check its original location. Also check camera
permission denial, low-texture/dark tracking loss, landscape rotation and
background/resume. Runtime tracking can drift in darkness or featureless views.

Primary integration references:
- https://8thwall.org/docs/api/engine/xrcontroller/configure
- https://8thwall.org/docs/api/engine/xrcontroller/pipelinemodule
- https://8thwall.org/docs/api/engine/xrcontroller/hittest
- https://github.com/8thwall/archive/blob/main/reality/app/xr/js/src/threejs-renderer.ts
