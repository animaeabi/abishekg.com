// Inference stays on-device, on the existing rear camera, off the render thread.
let detector;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const { FilesetResolver, FaceLandmarker } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm');
      detector = await FaceLandmarker.createFromOptions(files, {
        canvas: new OffscreenCanvas(512, 512),
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 2, minFaceDetectionConfidence: .7,
        minFacePresenceConfidence: .7, minTrackingConfidence: .7,
        outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
      });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      try {
        const result = detector.detectForVideo(data.bitmap, data.time);
        self.postMessage({ type: 'result', result, time: data.time, epoch: data.epoch, width: data.width, height: data.height });
      } finally { data.bitmap.close(); }
    }
  } catch (error) { self.postMessage({ type: 'error', message: error?.message || 'Head tracking unavailable.' }); }
};
