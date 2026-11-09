# Namma Pattas — release and placement audit

Audit date: 9 November 2026. Baseline: `de8d518d29b1085f822203d2be2295fc8af309ae`. Live experience: https://abishekg.com/namma-vedis.

**Release recommendation: limited beta, with a real-device gate before a broad launch.** The existing experience is already public. This audit found and corrected reproducible defects; it does not establish that the product has zero bugs. The current product supports ground placement, an estimated table height, hand attachment and distant sky effects. “Place on any object or person” is an expansion of those capabilities, not a claim the current version can support.

**Evidence and verification limits**

- All 85 automated tests passed after the fixes. Tests run the application with real Three.js geometry and stubbed DOM drawing/WebGL; they cover placement, motion, timing, audio lifecycle, cleanup and stress. They do not validate GPU rendering, camera SLAM accuracy or perceived sound on a phone.
- The production build passed. Syntax and whitespace checks passed.
- Live HTML, the two AR entry scripts, the pinned MediaPipe JavaScript/WASM and the hand model returned HTTP 200. The versioned AR scripts have immutable caching; the HTML revalidates. This is a point-in-time availability check, not an offline guarantee.
- The live browser inspection reached the explicit “3D graphics unavailable” fallback. The audit browser has no working WebGL, so it could not validate the interactive AR visuals. No physical iPhone or Android session was available.
- A mixed-effect CPU run peaked at 8,245 sparks, 1,094 smoke/debris instances, 17 emitters and 16 effect-root objects. These are one run’s counts, not FPS or thermal measurements.
- A new stress case issued 200 twelve-shot taps over 20 simulated seconds: 14 peak sky emitters, then zero after completion.

**Confirmed defects corrected in this iteration**

| Priority | Reproduction / failure | Correction | Verification |
| --- | --- | --- | --- |
| High | Forty immediate twelve-shot taps created forty producers, scheduling 480 shells. Fixed-size particle buffers did not bound the producers or their future audio work. | Limit input cadence, allow at most two twelve-shot producers, and reject new user launches when the active sky workload reaches the admission limit. Existing shows finish normally. | The original adversarial test failed; now passes, with sustained-spam cleanup also checked. |
| High | Start a held launch, background the page, return. The stored press survived and could resume automatic launches without a new gesture. | Clear input on visibility changes, page exit, blur, tracking loss and lost pointer capture; block hidden-page launches. | Reproduced failure before the fix; passing regression afterward. |
| Medium | Two fingers toggle recording controls, but the first touch already ignited a cracker. | Touch taps commit on release. A second finger can cancel before ignition; ordinary taps still fire once. Mouse behavior and sky hold-to-repeat remain. | New gesture regression covers both two-finger cancellation and ordinary touch release. |
| Medium / defensive | An injected singular camera projection was accepted, replacing a valid pose with unusable projection data. Extreme finite quaternion values were also insufficiently constrained. | Validate quaternion magnitude and projection invertibility before changing the camera. Retain its last valid state on rejection. | Invalid-projection test failed before the fix; projection and quaternion rejection now pass. |

The gesture change is deliberately small but still needs a physical touch/hold/recording check on iOS and Android.

**What placement currently means**

| User tries… | Current behavior / gap | Required behavior |
| --- | --- | --- |
| Floor or a broad stationary surface | SLAM plus a hit test, falling back to an intersection with a horizontal plane. This does not understand the identity of the object under the tap. | Keep the preview and the placed position consistent; distinguish a reliable surface from an estimated plane. |
| Table, chair, box or sofa | “On a table” uses a camera-relative height estimate when a usable hit is absent. The estimate can be visibly wrong. No object-following tracker exists. | Surface confidence plus a depth/height adjustment when detection is uncertain. Moving the furniture should not silently move an unrelated world anchor. |
| Someone’s head | No head/face detector or head anchor is connected. Depending on aim, the tap is rejected or interpreted against the plane behind/below the person. | A dedicated head attachment, with head pose, target continuity and scale relative to the face. |
| A palm anywhere in frame | An accepted palm currently overrides the whole tray and receives placement even if the tap is elsewhere. This was useful for automatic hand play but conflicts with general object placement. | Resolve the target near the tap. An incidental hand must not hijack a head, table or sky tap. |
| Any object before a floor scan | Ground placement is blocked while positional tracking is limited. Sky can use orientation-only motion during this period. | Head/palm attachments should use their own tracking readiness. Offer free placement for uncertain stationary targets, with explicit depth adjustment. |
| Move behind an object/person | There is no general scene-depth or occlusion mesh. Effects can draw in front of something that should hide them. | Add target-specific occlusion where feasible; do not promise universal real-world collision or occlusion. |

8th Wall documents a single dynamically estimated horizontal ground plane and sensitivity to low-contrast, repetitive and reflective surfaces. It is not a general object-recognition system. See [World Tracking Issues](https://8thwall.org/docs/troubleshooting/world-tracking-issues).

**Recommended next iteration: playful placement with reliable fallback**

Use a shared placement adapter for `surface`, `palm`, `head` and `free` targets. It should supply position, rotation, scale, confidence, coordinate space and a stable session target identifier. Fireworks retain their existing fuse and effect state when the target moves or a released object changes space.

1. Resolve placement at the tap. Prefer a confident head or palm only when that target overlaps the tap; otherwise use a reliable surface. When no target is reliable, show a free-placement preview instead of silently choosing the floor behind it.
2. Lock the chosen target for the effect’s lifetime. A second person or hand entering the frame must not steal it. The identifier should describe tracking continuity within the session, not recognize someone’s identity.
3. Give brief tracking dropouts a short visual hold. If loss continues, fade an attached effect or detach a thrown projectile according to its state. Reacquisition must not restart a fuse or snap an airborne cracker back onto someone.
4. Fit the scale to the target. Miniature flower-pot crowns, a Sanguchakram halo and tiny wala garlands make the feature playful. Large effects need a small per-target concurrency limit.
5. Keep an adjustment path: tap to place, reposition the preview, adjust depth and scale, then ignite. If pinch becomes a scale gesture, the existing two-finger hide-controls shortcut must be redesigned; the visible hide button can remain.
6. Run additional vision work off the UI thread and schedule it with hand tracking. Load models after the camera is usable, not as another blocking startup requirement. Bound in-flight inference and particle/audio workloads.

**Head tracking is feasible.** MediaPipe Face Landmarker supplies face landmarks and optional facial transformation matrices intended for effects attachment. A stylized crown above a face is a practical next feature. It still needs tests for turning away, hair/hats, partial occlusion, multiple people and exit/re-entry. Facial landmarks do not give a precise mesh of the entire head or hairstyle. See [Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js).

**Recognizing an object is not enough to attach to it in 3D.** MediaPipe Object Detector returns categories and image bounding boxes. From those outputs alone, we cannot infer an accurate surface depth, orientation, occlusion boundary or a persistent moving-object anchor. The practical first version is automatic heads/hands plus stationary surface/free placement. Arbitrary moving-object attachment needs a separate tracking/depth approach and device benchmarks. See [Object Detector](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector?tab=Web).

**Remaining break-test matrix**

| Scenario | Current evidence | Gate before broad launch |
| --- | --- | --- |
| Rapid taps, overlapping barrages, repeated large walas | Automated limits and cleanup pass. | Repeat with real audio for ten minutes; watch memory, heat and frame pacing. |
| Tracking loss, sky-motion fallback and recovery | Pose/space isolation and recovery math pass. | Walk, rotate and look between plain sky and detailed ground; check for visible jumps and drift. |
| Hand tilt, brief occlusion, throw, midair burst, re-entry | Automated state and trajectory coverage passes. | Test real hand motion, two similar hands and partial/offscreen palms. |
| Denied camera, denied motion, slow/failed model download | Error/fallback paths inspected; camera rejection and worker behavior covered in tests. | Cold-load tests on limited mobile data and restricted browsers. |
| App switching, phone lock/call, mute and audio interruption | Input cancellation and audio pause/completion covered with stubs. | Real Safari/Chrome AudioContext interruption and Atom aftertone completion. |
| Portrait/landscape, controls hidden, two-finger gesture | Orientation math and gesture tests pass. | Actual touch targets, safe areas and recording flow in both orientations. |
| Plain walls, shiny tables, dark rooms, moving people | Known tracking limitations; no arbitrary-object attachment. | Test expectations and fallback messaging rather than implying reliable detection. |
| GPU/context loss, long-session thermal throttling | No physical-device validation; no proven app-level context-loss recovery. | Verify recovery or add a clear restart path if the camera/render loop stalls. |
| Links opened in messaging/social browsers | No physical embedded-browser validation. | Verify a usable path into Safari/Chrome if camera or motion is restricted. |

Minimum device coverage: a current iPhone in Safari and Chrome, an older supported iPhone, and a midrange Android in Chrome. Include cold/warm loads, permission denial, ten-minute mixed use, background/return, a real incoming call, low light and orientation changes. Target stable 30 FPS or better for ordinary use on the chosen baseline device; measure rather than infer performance from CPU tests.

**Launch decision**

The existing floor/palm/sky experience can proceed as a limited beta after the corrective deployment. A broad launch should wait for the real-device checks above. A launch that promises placement on heads and arbitrary objects should additionally wait for the placement-adapter and head/free-placement iteration. Those new capabilities were researched and scoped here; they were not silently added to this release.
