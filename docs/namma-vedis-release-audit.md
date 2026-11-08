# Namma Vedi’s release audit — November 8, 2026

Recommendation: share the current update with a small test group. Complete a
physical-phone pass before a broad release. Automated checks cover the actual
simulation and geometry; this environment cannot establish camera tracking
quality, scan latency or mobile GPU frame rates.

## Added effects

- **Flower pot:** opaque cone, burning fuse, rising gold-and-white fountain,
  falling sparks, localized light, smoke, hiss/crackle and a cooling body.
- **Sanguchakram:** opaque coiled disc, burning fuse, rotation around a fixed
  floor position, low tangential gold/silver sparks and a spent stationary disc.
- Both retain captured placement height and position. The existing ring and
  Atom audio completion rules apply. Three of each are allowed within the
  shared seven-ground-effect limit. Particle rates accumulate by elapsed time.

The visual behavior was researched before implementation using manufacturer
and retailer explanations. TNT identifies flower pots as cone fountains;
Phantom describes sustained ground fountains and ground spinners. Sivakasi
manufacturers list flower pots and ground chakkars. These references informed
the simulation; no product imagery or packaging was copied.

- https://tntfireworks.com/fireworks/cat/fountains/3419-sparkling-flower-pots-fountain
- https://fireworks.com/safety/fireworks-university/fountains
- https://fireworks.com/safety/fireworks-university/ground-spinners
- https://stdfireworks.in/
- https://sonnyfireworks.com/products/ground-chakkar-deluxe-5-pcs/

## Findings and corrections

| Finding | Correction |
| --- | --- |
| Settled paper turned toward the camera | Render landed pieces in the original floor plane |
| Spark shader used reversed `smoothstep` edges | Use increasing edges and invert the result |
| Bomb glow obscured detailed debris and sparks | Reduce white flash, floor pulse and room illumination |
| Sky burst size depended on distance from session zero | Capture launch origin and calculate range from it |
| Settled sky text rebuilt vertices throughout its lifetime | Precompute starts and stop buffer updates after entrance |
| Completed audio voices lacked explicit disconnection | Disconnect owned source/filter/panner/gain nodes on completion |
| Tracking loss froze visuals while audio continued | Suspend and resume audio with tracking readiness |
| Back navigation could restore a stopped tracker | Pause persisted pages and resume on restored `pageshow` |
| Long cracker names clipped in tray buttons | Allow content-sized buttons within the existing horizontal tray |

## Verification

- All 30 Node checks pass across orientation, models, layout and application
  integration; JavaScript syntax check and Next.js static export pass.
- Integration uses the real application and Three.js math, with DOM drawing
  and WebGL stubbed. It checks fountain/spinner fuse, active and cooling phases,
  fixed roots under camera movement, spark directions, cleanup, launch origin,
  settled paper/text, audio cleanup, tracking pause and Back/Forward lifecycle.
- One 45-second simulated stress run combined three flower pots, three
  Sanguchakrams, a 10,000 wala and a Hukum grand show. Observed peaks: 8,333 of
  10,000 spark slots, 1,056 of 1,400 smoke/paper slots, 13 emitters and 27 world
  objects. Temporary props and emitters cleaned up. Counts vary with randomness;
  this is a workload/lifecycle check, not a phone performance measurement.
- A Blender render of the actual exported meshes was inspected for cone/disc
  shape, solid surfaces and fuse placement. It is not a browser or AR capture.

## Remaining release gate

Use physical iPhone Safari, iPhone Chrome and Android Chrome to check:

1. Cold startup, camera permission and time to usable floor placement.
2. Walking around the new effects and settled paper; turning away from and back
   to a sky show; loss/recovery of tracking in a featureless view.
3. A full 10,000 wala with a grand show for stutter, heating and visual quality.
4. Mute, Atom ringing completion, background/return, browser Back/Forward and
   landscape rotation. Confirm no new placement is accepted during Atom's tail.

The tracker uses approximate responsive scale and an estimated floor plane,
not scene meshing or real-world occlusion. Physical tracking can drift in dark
or featureless views. The preceding startup optimizations remove extra waits;
actual startup speed still needs on-phone measurement.


## Automatic hand throwing update — November 8, 2026

The palm no longer controls whether an active effect exists or its clock runs.
Each placed hand object has an independent motion state. Tilting drops a running
flower pot, spinner or wala; moving a bomb with a deliberate toss gives it a
ballistic flight. Objects land upright and retain their original effect timer.
Atom/Hukum/Lakshmi palm fuses are 3.2/2.8/2.4 seconds. Bombs burst at their current
held, airborne or landed position, with Atom still gated by its completed tone.

Camera pose is captured with the inference frame. A separate hand guide prevents
reacquisition from moving a released object. All emitted particles remain in room
space, and no scorch plane floats under an airborne burst. Brief hand loss is
tolerated; sustained loss drops the object without cancelling its effect.

51 automated checks pass, including all eight crackers dropping, fountain timer
continuity, held/midair/floor bursts, noise rejection, camera-motion compensation,
refresh-rate consistency, audio lock and worker camera ownership. The production
Next build passes. These checks use real application logic with mocked drawing
and camera input, not measured phone tracking. Physical Safari/Chrome acceptance
still needs tilt/toss sensitivity, motion blur, floor alignment and GPU smoothness.


## Held-object jitter correction — November 8, 2026

Replaced direct packet-following with a shared adaptive position/rotation filter
for the held body and ring, a small resting deadband, smoothed palm size and
confirmation of large discontinuities. Palm depth now combines ten landmark
baselines and takes the median of valid estimates. Raw measurements remain
available to throw detection, which now rejects isolated spikes. Flight and
held bursts begin at the displayed object rather than snapping to raw tracking.

All 59 automated checks pass, including synthetic noise attenuation, deliberate
movement response, single-knuckle depth noise, false-throw rejection, and real
application integration. The production build passes. Physical-phone camera
jitter, occlusion and motion-blur behavior still require device validation.


## Wala garland effects revision — November 8, 2026

100/1,000/10,000 now use varied S curves, paired-sided paper bodies and dense
layered packets rather than a uniform flat grid. A seeded timeline gives short
runs, hesitations, varied accents and a faster final section. Local vertex-shader
recoil preserves anchored instance matrices. Smaller warm flashes, ballistic
paper, accumulating smoke and a fading charred cord replace the uniform wipe.
Audio mixes irregular snap offsets into short bounded buffers and disposes every
per-window node. No borrowed recordings or product imagery ship with the site.

67 automated checks pass, covering exact counts, seeded variation, frame-rate
independent completion, nonuniform intervals, audio clipping/bounds and cleanup,
shader transform order, mixed-effect limits, and all existing palm/drop behavior.
The geometry was inspected through a CPU top-view projection. The browser preview
failed because its launcher passes unsupported Vite flags to Next; no working
application command was modified to compensate. Real GPU rendering, audio feel
and physical Safari/Chrome AR performance still need a device pass.
