import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

/**
 * Detects face presence/count locally in the student browser. Camera frames are
 * passed to the model in-memory and are never included in the event payload.
 */
export async function startFaceTracking(video, onChange, onStatus) {
  onStatus("loading");
  const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const detector = await FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.65
  });

  let running = true;
  let frameId = 0;
  let previousCount = null;
  let absentFrames = 0;
  let multipleFrames = 0;
  let absenceReported = false;
  let multipleReported = false;
  let lastProcessedAt = 0;
  const minimumFrames = 3;
  onStatus("active");

  const scan = (timestamp) => {
    if (!running) return;
    frameId = requestAnimationFrame(scan);
    if (timestamp - lastProcessedAt < 700 || !video.videoWidth || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    lastProcessedAt = timestamp;

    try {
      const result = detector.detectForVideo(video, timestamp);
      const count = result.detections.length;
      absentFrames = count === 0 ? absentFrames + 1 : 0;
      multipleFrames = count > 1 ? multipleFrames + 1 : 0;

      if (count !== previousCount) {
        onChange({ kind: "face-count", count, stable: false });
        previousCount = count;
      }
      if (absentFrames >= minimumFrames && !absenceReported) {
        absenceReported = true;
        onChange({ kind: "face-not-detected", count: 0, stable: true });
      } else if (count > 0 && absenceReported) {
        absenceReported = false;
        onChange({ kind: "face-detected-again", count, stable: true });
      }
      if (multipleFrames >= minimumFrames && !multipleReported) {
        multipleReported = true;
        onChange({ kind: "multiple-faces-detected", count, stable: true });
      } else if (count < 2) {
        multipleReported = false;
      }
    } catch (error) {
      onStatus("error", error);
      running = false;
      detector.close();
      return;
    }
  };

  frameId = requestAnimationFrame(scan);
  return () => {
    running = false;
    cancelAnimationFrame(frameId);
    detector.close();
  };
}
