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
  const setReady = (value) => {
    if (value === ready) return;
    ready = value; onState(value);
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
          // Approximate size from the initial 1.4-unit camera height instead of
          // waiting for metric scale estimation. Positional SLAM and the NORMAL
          // tracking gate still control every placement and recovery.
          XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive' });
          XR8.addCameraPipelineModules([XR8.XrController.pipelineModule(), pipeline]);
          // The existing Three renderer shares this canvas/context. It resets
          // its GL state before each render; XR8 owns frame timing and camera.
          const run = XR8.run({ canvas, webgl2, allowedDevices: XR8.XrConfig.device().MOBILE,
            cameraConfig: { direction: XR8.XrConfig.camera().BACK } });
          if (run?.catch) run.catch(fail);
        } catch (error) { fail(error); }
      });
    },
    hit(x, y, table = false) {
      if (!ready) return null;
      const hits = XR8.XrController.hitTest(x, y) || [];
      const hit = hits.find(h => h.position && Number.isFinite(h.distance) && h.distance > .15 && h.distance < 8 &&
        (h.type === 'DETECTED_SURFACE' || h.type === 'ESTIMATED_SURFACE' || (table && h.type === 'FEATURE_POINT')));
      return hit?.position ? { ...hit.position } : null;
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
