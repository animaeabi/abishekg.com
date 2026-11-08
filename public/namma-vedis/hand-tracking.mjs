// Borrow the AR engine's existing video. Never request, replace or stop its
// camera stream. One inference at a time, off-thread, with bounded input size.
export function createHandTracking({ video, onResult, onLost, onError }) {
  let worker, active = false, loaded = false, paused = false, busy = false, epoch = 0, lastAt = -Infinity, lastVideo = -1;
  let bootTimer, workTimer, resolveBoot, rejectBoot;
  let interval = 140;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const lose = () => onLost();
  function stop() {
    active = false; loaded = false; epoch++; busy = false;
    rejectBoot?.(new Error('Hand tracking stopped.')); rejectBoot = null;
    clearTimeout(bootTimer); clearTimeout(workTimer); worker?.terminate(); worker = null;
    lose();
  }
  function fail(error) {
    const e = error instanceof Error ? error : new Error(String(error));
    rejectBoot?.(e); rejectBoot = null; stop(); onError(e);
  }
  return {
    get active() { return active; },
    async start() {
      if (!globalThis.Worker || !globalThis.createImageBitmap || !globalThis.OffscreenCanvas) {
        throw new Error('Automatic palm placement is unavailable in this browser.');
      }
      active = true;
      const boot = new Promise((resolve, reject) => { resolveBoot = resolve; rejectBoot = reject; });
      // Attach rejection handling immediately while camera permission is pending.
      boot.catch(() => {});
      try {
        worker = new Worker(new URL('./hand-worker.js', import.meta.url));
        worker.onerror = () => fail(new Error('Hand tracking could not load. Check your connection and retry.'));
        worker.onmessage = ({ data }) => {
          if (!active) return;
          if (data.type === 'ready') { loaded = true; clearTimeout(bootTimer); resolveBoot(); rejectBoot = null; }
          if (data.type === 'error') { fail(new Error(data.message)); return; }
          if (data.type === 'result') {
            clearTimeout(workTimer); busy = false;
            interval = data.result?.landmarks?.length ? 70 : 140;
            if (!paused && data.epoch === epoch && performance.now() - data.time < 350 &&
                data.width === video.videoWidth && data.height === video.videoHeight) onResult(data.result, data.time);
            else lose();
          }
        };
        bootTimer = setTimeout(() => fail(new Error('Hand tracking download timed out. Check your connection and retry.')), 45000);
        worker.postMessage({ type: 'init' });
        await boot;
      } catch (error) { stop(); throw error; }
    },
    tick(now) {
      if (!active || !loaded || paused || busy || video.readyState < 2 || !video.videoWidth || !video.videoHeight || now - lastAt < interval || video.currentTime === lastVideo) return;
      busy = true; lastAt = now; lastVideo = video.currentTime;
      const width = video.videoWidth, height = video.videoHeight, frameEpoch = epoch;
      const size = 512 / Math.max(width, height);
      canvas.width = Math.round(width * size); canvas.height = Math.round(height * size);
      try { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); } catch (error) { fail(error); return; }
      workTimer = setTimeout(() => fail(new Error('Hand tracking stopped responding. Reload to try again.')), 5000);
      createImageBitmap(canvas).then(bitmap => {
        if (!active || paused || frameEpoch !== epoch) { bitmap.close(); busy = false; clearTimeout(workTimer); return; }
        worker.postMessage({ type: 'frame', bitmap, time: now, epoch: frameEpoch, width, height }, [bitmap]);
      }).catch(fail);
    },
    pause() { paused = true; epoch++; lose(); },
    resume() { paused = false; epoch++; lastVideo = -1; lose(); },
    stop,
  };
}
