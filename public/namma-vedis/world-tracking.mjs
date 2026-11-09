import { Vector3 } from 'three';
import { measuredSurface } from './surface-placement.mjs';
// 8th Wall's distributed SLAM runtime supports positional WebAR on iOS Safari
// as well as Android. No gyro-only fallback is advertised as world tracking.
export function waitForWorldEngine(win = window, timeout = 30000) {
  if (win.XR8?.XrController) return Promise.resolve(win.XR8);
  return new Promise((resolve, reject) => {
    const finish = () => {
      if (!win.XR8?.XrController) return;
      cleanup(); resolve(win.XR8);
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('AR engine could not load. Check your connection and retry.')); }, timeout);
    const cleanup = () => { clearTimeout(timer); win.removeEventListener('xrloaded', finish); };
    win.addEventListener('xrloaded', finish);
    finish();
  });
}

export function createWorldTracking({ XR8, canvas, webgl2, onContext = () => {}, onGeometry = () => {}, onVideo, onPose, onFrame, onState, onError }) {
  let active = false, ready = false, started = false, resolveStart, rejectStart, startupTimer;
  let worldPoints = [], cachedSurface = null;
  const setReady = (value) => {
    if (value === ready) return;
    ready = value; cachedSurface = null; if (!value) worldPoints = []; onState(value);
  };
  const projection = (initial = false) => XR8.XrController.updateCameraProjectionMatrix({
    cam: { pixelRectWidth: canvas.width, pixelRectHeight: canvas.height, nearClipPlane: .05, farClipPlane: 900 },
    ...(initial ? { origin: { x: 0, y: 1.4, z: 0 }, facing: { x: 0, y: 0, z: 0, w: 1 } } : {}),
  });
  const fail = (error) => {
    setReady(false);
    if (!started) { clearTimeout(startupTimer); rejectStart?.(error instanceof Error ? error : new Error(String(error))); }
    else onError(error);
  };
  const pipeline = {
    name: 'namma-vedis-world',
    onStart(data) { onContext(data?.GLctx); onGeometry(data); projection(true); },
    onAttach({ video }) {
      if (!video) { fail(new Error('The AR camera did not provide a video feed.')); return; }
      onVideo(video);
      started = true; clearTimeout(startupTimer); resolveStart();
    },
    onCanvasSizeChange(data) { onGeometry(data); },
    onVideoSizeChange(data) { onGeometry(data); },
    onDeviceOrientationChange(data) { onGeometry(data); },
    onUpdate({ processCpuResult }) {
      const reality = processCpuResult?.reality;
      const valid = reality && onPose(reality);
      setReady(Boolean(valid && reality.trackingStatus === 'NORMAL'));
      worldPoints = ready ? (reality.worldPoints || []) : [];
    },
    onRender() { if (active) onFrame(); },
    onCameraStatusChange({ status }) {
      if (status === 'failed') fail(new Error('Camera access failed. Allow camera and motion access, then retry.'));
    },
    onException: fail,
    onPaused() { setReady(false); },
  };
  return {
    get active() { return active; },
    get ready() { return ready; },
    start() {
      active = true;
      return new Promise((resolve, reject) => {
        resolveStart = resolve; rejectStart = reject;
        startupTimer = setTimeout(() => fail(new Error('Camera startup timed out. Allow camera and motion access, then retry.')), 45000);
        try {
          // Models, camera translation and hand estimates must all use meters.
          // Responsive scale normalizes an assumed starting height and cannot
          // preserve physical dimensions across different starting positions.
          XR8.XrController.configure({ disableWorldTracking: false, scale: 'absolute', enableWorldPoints: true });
          XR8.addCameraPipelineModules([XR8.XrController.pipelineModule(), pipeline]);
          // The existing Three renderer shares this canvas/context. It resets
          // its GL state before each render; XR8 owns frame timing and camera.
          const run = XR8.run({ canvas, webgl2, allowedDevices: XR8.XrConfig.device().MOBILE,
            cameraConfig: { direction: XR8.XrConfig.camera().BACK } });
          if (run?.catch) run.catch(fail);
        } catch (error) { fail(error); }
      });
    },
    hit(x, y, _table = false, camera) {
      if (!ready || !camera || ![x, y].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) return null;
      const ray = new Vector3(x * 2 - 1, 1 - y * 2, .5).unproject(camera).sub(camera.position).normalize();
      const now = performance.now();
      if (cachedSurface && now - cachedSurface.time < 100 && Math.abs(x - cachedSurface.x) < .002 && Math.abs(y - cachedSurface.y) < .002 &&
        camera.position.distanceTo(cachedSurface.origin) < .01 && ray.angleTo(cachedSurface.ray) < .008) return cachedSurface.point ? { ...cachedSurface.point } : null;
      const hits = XR8.XrController.hitTest(x, y, ['FEATURE_POINT', 'DETECTED_SURFACE']) || [];
      const point = measuredSurface(hits, worldPoints, camera.position, ray);
      cachedSurface = { x, y, time: now, origin: camera.position.clone(), ray, point };
      return point ? { ...point } : null;
    },
    resize() { if (active && started) projection(); },
    pause() { if (active) { setReady(false); XR8.pause(); } },
    resume() { if (active) XR8.resume(); },
    stop() {
      active = false; setReady(false); clearTimeout(startupTimer);
      XR8.stop(); XR8.clearCameraPipelineModules();
    },
  };
}
