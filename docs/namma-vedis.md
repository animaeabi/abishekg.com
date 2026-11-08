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
copied unchanged into `/namma-vedis/xr/` by the prebuild/predev script. The full
license ships with it and is linked in the welcome-screen attribution.

The runtime owns camera capture and frame timing. Three.js uses the runtime's
wrapped GL context, tracked camera pose, calibrated projection, and cropped
camera texture for that same frame. The old gyro update cannot overwrite the
tracked pose. No secondary camera stream is opened. Scene positions are in
meters, with absolute-scale estimation and an initial floor scan.

A ground tap copies a hit-test position (or intersects the tracked estimated
floor plane). Each prop, shadow, scorch, glow pulse, bouncing spark and scrap
keeps its placement height. Switching floor/table affects future placements.
Table fallback is a selected height; this does not provide arbitrary scene
meshing, semantic floor recognition or real-world occlusion.

Sky launches, multi-shot shows and delayed lettering capture their original
world origin and direction. They are not re-aimed as the phone moves. Artificial
screen shake is disabled in AR because it breaks camera alignment.

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

Ground bodies use opaque, depth-writing, physically shaded geometry with rounded
paper bodies, pressed caps, raised bindings and a curved fuse that burns back to
the body. Floor light, contact shadows, sparks and smoke depth-test against these
bodies; a glow no longer paints the camera image over the solid object.

100, 1,000 and 10,000 wala options contain their stated instance counts. Each
captures the camera's horizontal right vector once at placement. Longer strings
fold into broad horizontal rows, with a connecting fuse. Burning reduces the
instance draw count instead of uploading every transform again. Particle/audio
events are batched per frame and only one 10,000 string can run at a time. The
10,000 sequence takes approximately 32 seconds, excluding tracking pauses.

- `node --test tests/namma-vedis-*.test.mjs`: orientation, world coordinates,
  camera translation, reticle lifecycle, tracking loss/recovery, startup failure,
  audio completion gate, opaque model geometry and disposal, horizontal string
  layout, all 10,000 instances and their lifecycle in the actual application.
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
