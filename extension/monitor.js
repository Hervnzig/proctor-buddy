const API_BASE = "http://localhost:4310/api";

const camera = document.getElementById("camera");
const statusElement = document.getElementById("status");
const sessionMetaElement = document.getElementById("sessionMeta");
const capturedElement = document.getElementById("captured");
const submitPrecheckButton = document.getElementById("submitPrecheck");
const endSessionButton = document.getElementById("endSession");
const canvas = document.getElementById("frameCanvas");
const context = canvas.getContext("2d");

const query = new URLSearchParams(location.search);
const sessionId = query.get("sessionId");
const snapshots = {};
let pollIntervalId = null;
let monitorIntervalId = null;
let faceDetector = null;

if (!sessionId) {
  statusElement.textContent = "Missing sessionId. Restart from extension popup.";
  throw new Error("Missing sessionId");
}

sessionMetaElement.textContent = `Session ID: ${sessionId}`;

setup().catch((error) => {
  statusElement.textContent = `Cannot start camera: ${error.message}`;
});

async function setup() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720 },
    audio: false
  });
  camera.srcObject = stream;
  await camera.play();
  statusElement.textContent = "Camera ready. Capture three background views.";
  postEvent("monitor-opened", { userAgent: navigator.userAgent });

  if ("FaceDetector" in window) {
    faceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
  }
}

document.querySelectorAll("[data-capture]").forEach((button) => {
  button.addEventListener("click", () => {
    const label = button.getAttribute("data-capture");
    snapshots[label] = captureCurrentFrame();
    renderShots();
  });
});

submitPrecheckButton.addEventListener("click", async () => {
  const required = ["left", "center", "right"];
  const missing = required.filter((key) => !snapshots[key]);
  if (missing.length > 0) {
    statusElement.textContent = `Missing captures: ${missing.join(", ")}`;
    return;
  }

  statusElement.textContent = "Submitting pre-check for approval...";
  const shots = required.map((label) => ({
    label,
    imageDataUrl: snapshots[label],
    timestamp: new Date().toISOString()
  }));

  const response = await fetch(`${API_BASE}/sessions/${sessionId}/precheck`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shots })
  });

  if (!response.ok) {
    statusElement.textContent = "Pre-check upload failed. Try again.";
    return;
  }

  postEvent("precheck-submitted", { shotCount: shots.length });
  statusElement.textContent = "Pre-check submitted. Waiting for proctor approval...";
  beginApprovalPolling();
});

endSessionButton.addEventListener("click", async () => {
  postEvent("session-ended-by-student");
  stopMonitoring();
  await chrome.storage.local.remove("currentSession");
  statusElement.textContent = "Session ended. You can close this tab.";
});

document.addEventListener("visibilitychange", () => {
  postEvent("monitor-visibility", { visibilityState: document.visibilityState });
});

window.addEventListener("blur", () => {
  postEvent("monitor-window-blur");
});

window.addEventListener("focus", () => {
  postEvent("monitor-window-focus");
});

document.addEventListener("fullscreenchange", () => {
  postEvent("fullscreen-changed", { fullScreen: Boolean(document.fullscreenElement) });
});

window.addEventListener("beforeunload", () => {
  postEvent("monitor-tab-closing");
});

function captureCurrentFrame() {
  context.drawImage(camera, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function renderShots() {
  capturedElement.innerHTML = Object.entries(snapshots)
    .map(([label, src]) => `<div><p>${label}</p><img src="${src}" alt="${label}"/></div>`)
    .join("");
}

function beginApprovalPolling() {
  clearInterval(pollIntervalId);
  pollIntervalId = setInterval(async () => {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/status`);
    if (!response.ok) {
      statusElement.textContent = "Unable to fetch session status.";
      return;
    }

    const status = await response.json();
    if (status.status === "approved") {
      clearInterval(pollIntervalId);
      statusElement.textContent = "Approved. Monitoring is active.";
      postEvent("session-approved", {
        approvedAt: status.approvedAt,
        approvedBy: status.approvedBy
      });
      startMonitoring();
    }
  }, 3000);
}

function startMonitoring() {
  clearInterval(monitorIntervalId);
  monitorIntervalId = setInterval(async () => {
    const faceCount = await detectFaces();

    postEvent("heartbeat", {
      faceCount,
      cameraReady: Boolean(camera?.srcObject)
    });

    if (faceCount === 0) {
      postEvent("anomaly-no-face");
    }

    if (faceCount > 1) {
      postEvent("anomaly-multiple-faces", { faceCount });
    }
  }, 5000);
}

function stopMonitoring() {
  clearInterval(pollIntervalId);
  clearInterval(monitorIntervalId);
}

async function detectFaces() {
  if (!faceDetector) {
    return -1;
  }

  context.drawImage(camera, 0, 0, canvas.width, canvas.height);
  const bitmap = await createImageBitmap(canvas);
  const faces = await faceDetector.detect(bitmap);
  bitmap.close();
  return faces.length;
}

async function postEvent(type, payload = {}) {
  try {
    await fetch(`${API_BASE}/sessions/${sessionId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        payload,
        timestamp: new Date().toISOString()
      })
    });
  } catch (error) {
    console.error("event post failed", error);
  }
}
