# Namma Vedi’s on abishekg.com

Public route: `/namma-vedis`, served as standalone HTML through an exact Vercel
rewrite. The portfolio and Unhinged routes are unchanged; no iframe or login.

The original Pattasu client code is reused at the user's explicit request:
https://pattasu-diwali.vercel.app/. Its Three.js renderer, shaders, synthesized
sound, eleven cracker types, props, smoke and paper effects remain, with credit
to @ikevinadams. Namma Vedi’s / நம்ம வெடி branding, grand shows, Jailer-inspired
names and sparkling Happy Diwali lettering are retained.

## World placement

Camera mode now uses the pinned `@8thwall/engine-binary@1.0.0` distributed SLAM
runtime. It tracks translation and rotation together on mobile browsers,
including iOS Safari, independently of native WebXR support. The runtime is
copied unchanged into `/namma-vedis/xr/1.0.0/` by the prebuild/predev script. The full
license ships with it and is linked in the welcome-screen attribution.

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

100, 1,000 and 10,000 wala options contain their stated instance counts. Each
forms a single flowing S-shaped garland with a connecting fuse; larger counts
form a fuller garland following the same curve. Bodies follow its local bends.
The shape captures the view once and remains fixed in world space. Burning reduces the
instance draw count instead of uploading every transform again. Particle/audio
events are batched per frame and only one 10,000 string can run at a time. The
10,000 sequence takes approximately 30 seconds, excluding tracking pauses.

- `node --test tests/namma-vedis-*.test.mjs`: orientation, world coordinates,
  camera translation, reticle lifecycle, tracking loss/recovery, startup failure,
  audio completion gate, opaque model geometry and disposal, continuous S-shaped
  layout, all 10,000 instances and their lifecycle in the actual application.
  All 31 checks pass, including level/upward mode selection, fountain/spinner lifecycle, fixed centers,
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
