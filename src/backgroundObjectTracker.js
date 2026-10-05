import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite";

function waitFor(target, eventName) {
  return new Promise((resolve, reject) => {
    const onEvent = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("The recorded walkthrough could not be decoded.")); };
    const cleanup = () => {
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function seekTo(video, seconds) {
  if (Math.abs(video.currentTime - seconds) < 0.05) return;
  const seeking = waitFor(video, "seeked");
  video.currentTime = seconds;
  await seeking;
}

/**
 * Samples a few frames locally in the browser and returns category-level cues.
 * This is a generic object detector, not a complete room inventory or safety check.
 */
export async function analyzeBackgroundVideo(blob) {
  const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const detector = await ObjectDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
    runningMode: "VIDEO",
    maxResults: 8,
    scoreThreshold: 0.35
  });
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  const objects = new Map();
  let samples = 0;

  try {
    await waitFor(video, "loadedmetadata");
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitFor(video, "loadeddata");
    await video.play().catch(() => {});
    const duration = Math.min(video.duration || 0, 10);
    const sampleSeconds = Array.from({ length: Math.max(1, Math.min(6, Math.ceil(duration))) }, (_, index, all) => duration * (index + 0.5) / all.length);
    for (const seconds of sampleSeconds) {
      await seekTo(video, seconds);
      const result = detector.detectForVideo(video, Math.round(seconds * 1000));
      samples += 1;
      const frameLabels = new Map();
      for (const detection of result.detections) {
        const category = detection.categories?.[0];
        const label = category?.categoryName?.trim();
        const confidence = category?.score || 0;
        if (!label || confidence < 0.35) continue;
        frameLabels.set(label, Math.max(frameLabels.get(label) || 0, confidence));
      }
      for (const [label, confidence] of frameLabels) {
        const record = objects.get(label) || { label, sightings: 0, maxConfidence: 0, sampleSeconds: [] };
        record.sightings += 1;
        record.maxConfidence = Math.max(record.maxConfidence, confidence);
        record.sampleSeconds.push(Number(seconds.toFixed(1)));
        objects.set(label, record);
      }
    }
    return {
      status: "complete",
      sampleCount: samples,
      objects: [...objects.values()].sort((a, b) => b.sightings - a.sightings || b.maxConfidence - a.maxConfidence),
      note: "Approximate object categories from sampled video frames. The detector may miss, mislabel, or miscount items; lecturer confirmation is required."
    };
  } finally {
    detector.close();
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
