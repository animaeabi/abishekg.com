# Namma Vedi’s on abishekg.com

Public route: `/namma-vedis`, served as a standalone, top-level page using an
exact Vercel rewrite to `/namma-vedis/index.html`. The portfolio and Unhinged
routes are unchanged. There is no iframe or ChatGPT sign-in requirement.

At the user's explicit request this reuses the supplied Pattasu site's HTML,
CSS, Three.js renderer, shaders, camera texture and exposure logic, particle
physics, ground geometry, smoke, paper debris, synthesized audio, and original
eleven cracker implementations. Source: https://pattasu-diwali.vercel.app/
Original creator credit to @ikevinadams is retained on the welcome screen.

Narrow changes:

- Namma Vedi’s / நம்ம வெடி branding and fan-inspired Jailer 2 effect names.
- Camera access requested from Start; permission/camera errors are shown on
  the welcome screen rather than silently substituting a night sky.
- Motion permission requested from the same tap. A delayed first event no
  longer permanently disables the gyro after the reference's 400 ms deadline.
- Null compass heading is accepted when beta/gamma tilt data is valid.
- Original quaternion transform and pitch hysteresis retained for automatic
  Sky / Surface found switching. Floor and table height remain selectable.
- Grand shows: Hukum Reloaded, Diamond Mazhai, Thanga Vaanam.
- World-space sparkling Happy Diwali lettering, including grand finales.
- A visible restore button supplements the original two-finger UI gesture.
- Camera tracks stop when the page is left.

Automatic floor selection is based on phone orientation, just like Pattasu;
it is not visual floor recognition or WebXR plane tracking. The live camera
is used locally as a texture; no microphone, recording, or uploads are used.

Validation: `node --test tests/namma-vedis-orientation.test.mjs`,
`node --check public/namma-vedis/app.js`, and `npm run build`.
The cloud QA browser does not expose WebGL or physical motion/camera hardware,
so actual hardware rendering must be checked on a phone.
