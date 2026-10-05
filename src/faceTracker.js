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
  let lastMovementCueAt = -Infinity;
  let previousFaceCenter = null;
  let movingFrames = 0;
  let stillFrames = 0;
  let movementReported = false;
  const minimumFrames = 3;
  const movementThreshold = 0.065;
  const movementCueCooldown = 10000;
  onStatus("active");

  const scan = (timestamp) => {
    if (!running) return;
    frameId = requestAnimationFrame(scan);
    if (document.visibilityState === "hidden" || timestamp - lastProcessedAt < 1000 || !video.videoWidth || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (video.currentTime === scan.lastVideoTime) return;
    scan.lastVideoTime = video.currentTime;
    lastProcessedAt = timestamp;

    try {
      const result = detector.detectForVideo(video, timestamp);
      const count = result.detections.length;
      absentFrames = count === 0 ? absentFrames + 1 : 0;
      multipleFrames = count > 1 ? multipleFrames + 1 : 0;

      if (count === 1) {
        const box = result.detections[0].boundingBox;
        const center = {
          x: (box.originX + box.width / 2) / video.videoWidth,
          y: (box.originY + box.height / 2) / video.videoHeight
        };
        if (previousFaceCenter) {
          const distance = Math.hypot(center.x - previousFaceCenter.x, center.y - previousFaceCenter.y);
          movingFrames = distance >= movementThreshold ? movingFrames + 1 : 0;
          stillFrames = distance < movementThreshold ? stillFrames + 1 : 0;
          if (movingFrames >= 2 && !movementReported && timestamp - lastMovementCueAt >= movementCueCooldown) {
            movementReported = true;
            lastMovementCueAt = timestamp;
            onChange({ kind: "face-position-change", count, stable: true });
          } else if (stillFrames >= minimumFrames && movementReported) {
            movementReported = false;
            onChange({ kind: "face-position-settled", count, stable: true });
          }
        }
        previousFaceCenter = center;
      } else {
        previousFaceCenter = null;
        movingFrames = 0;
        stillFrames = 0;
      }

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
