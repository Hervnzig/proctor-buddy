const API_BASE = "http://localhost:4310/api";
const WS_BASE = "ws://localhost:4310/signaling";

// State
let cameraStream = null;
let screenStream = null;
let currentStudent = null;
let currentSession = null;
let signalingSocket = null;
let peerConnection = null;
let returnTimer = null;
let returnSecondsLeft = 10;
let isMonitored = false;

// Check if current page is Canvas LMS or LTI Quiz Launch
function isCanvasPage() {
  const url = location.href.toLowerCase();
  const host = location.hostname.toLowerCase();
  return (
    host.includes("instructure.com") ||
    host.includes("quiz-lti-dub-prod") ||
    url.includes("/quizzes/") ||
    url.includes("/lti/launch") ||
    url.includes("quiz.html") ||
    url.includes("localhost:5173")
  );
}

// Attempt to extract Canvas user info from DOM or ENV
function extractCanvasStudentInfo() {
  let name = "";
  let email = "";

  // 1. Check window.ENV if accessible
  try {
    if (window.ENV?.current_user) {
      name = window.ENV.current_user.display_name || window.ENV.current_user.name || "";
      email = window.ENV.current_user.email || "";
    }
  } catch (e) {}

  // 2. DOM inspection for Canvas profile elements
  if (!name) {
    const profileEl = document.querySelector("#global_nav_profile_link .menu-item__text, .user_name, .profile-link, [data-testid='user-name']");
    if (profileEl) name = profileEl.textContent.trim();
  }

  return { name, email };
}

// Initialize UI when page loads
if (isCanvasPage()) {
  injectProctorUI();
}

function injectProctorUI() {
  if (document.getElementById("pb-canvas-overlay")) return;

  const detected = extractCanvasStudentInfo();

  // Overlay for onboarding
  const overlay = document.createElement("div");
  overlay.id = "pb-canvas-overlay";
  overlay.innerHTML = `
    <div class="pb-modal">
      <div class="pb-header">
        <span class="pb-badge">Canvas Proctor Buddy</span>
        <button id="pb-dismiss-btn" class="pb-btn-sm" style="background:transparent;border:0;color:#94a89d;">✕</button>
      </div>
      <h2 class="pb-title">Canvas Assessment Setup</h2>
      <p class="pb-subtitle">Your lecturer has enabled Proctor Buddy monitoring for this assessment. Complete your identity confirmation, camera, and full-screen setup to proceed.</p>

      <div class="pb-field-group">
        <label class="pb-label" for="pb-student-name">Student Full Name</label>
        <input id="pb-student-name" class="pb-input" placeholder="e.g. Jane Doe" value="${detected.name}" />
      </div>

      <div class="pb-field-group">
        <label class="pb-label" for="pb-student-email">Student Email / ID</label>
        <input id="pb-student-email" class="pb-input" placeholder="e.g. s1001@alueducation.com" value="${detected.email}" />
      </div>

      <div class="pb-field-group">
        <label class="pb-label" for="pb-session-code">Assessment Session ID</label>
        <input id="pb-session-code" class="pb-input" placeholder="Fetching active sessions or enter Session ID…" />
      </div>

      <div class="pb-row">
        <div id="pb-card-camera" class="pb-card-action">
          <div class="pb-card-icon">📷</div>
          <div class="pb-card-title">Webcam Feed</div>
          <div id="pb-status-camera" class="pb-card-status">Not connected</div>
          <video id="pb-preview-camera" class="pb-video-preview" autoplay playsinline muted style="display:none;"></video>
          <button id="pb-btn-camera" class="pb-btn-sm">Enable Camera</button>
        </div>

        <div id="pb-card-screen" class="pb-card-action">
          <div class="pb-card-icon">🖥️</div>
          <div class="pb-card-title">Full Screen Share</div>
          <div id="pb-status-screen" class="pb-card-status">Not sharing</div>
          <video id="pb-preview-screen" class="pb-video-preview" autoplay playsinline muted style="display:none;"></video>
          <button id="pb-btn-screen" class="pb-btn-sm">Share Full Screen</button>
        </div>
      </div>

      <button id="pb-btn-start" class="pb-btn-start" disabled>Start Monitored Canvas Quiz</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // Floating Status Bar (displayed while monitoring)
  const floatBar = document.createElement("div");
  floatBar.id = "pb-floating-bar";
  floatBar.className = "pb-hidden";
  floatBar.innerHTML = `
    <span class="pb-status-dot"></span>
    <video id="pb-mini-camera" class="pb-mini-camera" autoplay playsinline muted></video>
    <span class="pb-status-text">Proctor Buddy · Full Screen Monitored</span>
    <button id="pb-btn-remaximize" class="pb-pill-btn">Re-maximize</button>
  `;
  document.body.appendChild(floatBar);

  // Lockdown Modal (for fullscreen exit or unauthorized window switch)
  const lockdownModal = document.createElement("div");
  lockdownModal.id = "pb-lockdown-modal";
  lockdownModal.className = "pb-hidden";
  lockdownModal.innerHTML = `
    <div class="pb-lockdown-card">
      <div class="pb-lockdown-icon">⚠️</div>
      <h2 class="pb-lockdown-title">Proctoring Notice</h2>
      <p id="pb-lockdown-msg" class="pb-lockdown-msg">You have left full screen or switched away from the Canvas assessment. Please return immediately.</p>
      <div id="pb-lockdown-timer" class="pb-lockdown-timer">Return to quiz within 10s</div>
      <button id="pb-btn-return" class="pb-btn-return">Return to Full Screen Quiz</button>
    </div>
  `;
  document.body.appendChild(lockdownModal);

  // Allowed Platform Toast
  const allowedToast = document.createElement("div");
  allowedToast.id = "pb-allowed-platform-toast";
  allowedToast.className = "pb-hidden";
  allowedToast.innerHTML = `<span>✓</span><span id="pb-allowed-toast-msg">Permitted platform in use</span>`;
  document.body.appendChild(allowedToast);

  setupUIEventListeners();
  fetchLatestSession();
}

async function fetchLatestSession() {
  try {
    const res = await fetch(`${API_BASE}/sessions`);
    if (res.ok) {
      const sessions = await res.json();
      const live = sessions.find((s) => s.status === "live");
      if (live) {
        document.getElementById("pb-session-code").value = live.id;
        currentSession = live;
      }
    }
  } catch (e) {}
}

function setupUIEventListeners() {
  const btnCamera = document.getElementById("pb-btn-camera");
  const btnScreen = document.getElementById("pb-btn-screen");
  const btnStart = document.getElementById("pb-btn-start");
  const btnDismiss = document.getElementById("pb-dismiss-btn");
  const btnRemaximize = document.getElementById("pb-btn-remaximize");
  const btnReturn = document.getElementById("pb-btn-return");

  btnDismiss?.addEventListener("click", () => {
    document.getElementById("pb-canvas-overlay").classList.add("pb-hidden");
  });

  btnCamera?.addEventListener("click", async () => {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false
      });
      const vid = document.getElementById("pb-preview-camera");
      vid.srcObject = cameraStream;
      vid.style.display = "block";
      document.getElementById("pb-status-camera").textContent = "Webcam Ready ✓";
      document.getElementById("pb-card-camera").classList.add("pb-ready");
      btnCamera.textContent = "Camera Active";
      btnCamera.disabled = true;
      checkCanStart();
    } catch (err) {
      alert("Camera access denied: " + err.message);
    }
  });

  btnScreen?.addEventListener("click", async () => {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" }
      });
      const vid = document.getElementById("pb-preview-screen");
      vid.srcObject = screenStream;
      vid.style.display = "block";
      document.getElementById("pb-status-screen").textContent = "Screen Sharing Ready ✓";
      document.getElementById("pb-card-screen").classList.add("pb-ready");
      btnScreen.textContent = "Screen Active";
      btnScreen.disabled = true;
      checkCanStart();
    } catch (err) {
      alert("Full screen sharing required: " + err.message);
    }
  });

  btnStart?.addEventListener("click", startCanvasProctoring);

  btnRemaximize?.addEventListener("click", () => {
    requestDocumentFullscreen();
    chrome.runtime?.sendMessage({ type: "MAKE_QUIZ_FULLSCREEN" });
  });

  btnReturn?.addEventListener("click", () => {
    clearReturnWarning();
    requestDocumentFullscreen();
    chrome.runtime?.sendMessage({ type: "MAKE_QUIZ_FULLSCREEN" });
  });

  // Listen to Fullscreen changes
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
}

function checkCanStart() {
  const name = document.getElementById("pb-student-name")?.value.trim();
  const email = document.getElementById("pb-student-email")?.value.trim();
  const session = document.getElementById("pb-session-code")?.value.trim();
  const canStart = Boolean(name && email && session && cameraStream && screenStream);
  document.getElementById("pb-btn-start").disabled = !canStart;
}

// Start Monitored Quiz
async function startCanvasProctoring() {
  const name = document.getElementById("pb-student-name").value.trim();
  const email = document.getElementById("pb-student-email").value.trim();
  const sessionId = document.getElementById("pb-session-code").value.trim();

  const startBtn = document.getElementById("pb-btn-start");
  startBtn.textContent = "Connecting to Lecturer...";
  startBtn.disabled = true;

  try {
    // 1. Fetch latest session details from server
    const sessionRes = await fetch(`${API_BASE}/sessions/${sessionId}`);
    if (sessionRes.ok) {
      currentSession = await sessionRes.json();
    }

    // 2. Register student on Proctor Buddy server
    const studentRes = await fetch(`${API_BASE}/sessions/${sessionId}/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: name,
        studentNumber: email
      })
    });

    if (!studentRes.ok) {
      throw new Error("Unable to register with proctoring session.");
    }
    currentStudent = await studentRes.json();

    // Automatically set status to approved for Canvas extension
    await fetch(`${API_BASE}/sessions/${sessionId}/students/${currentStudent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "approved",
        cameraReady: true,
        screenReady: true
      })
    });

    // 3. Connect WebRTC signaling so lecturer sees live camera and screen on MonitoringWall
    connectWebRTC(sessionId, currentStudent.id);

    // 4. Force Full Screen
    requestDocumentFullscreen();
    chrome.runtime?.sendMessage({
      type: "START_CANVAS_SESSION",
      payload: {
        sessionId,
        studentId: currentStudent.id,
        studentName: name,
        studentEmail: email,
        quizUrl: location.href,
        allowWindowSwitching: currentSession?.allowWindowSwitching || false,
        allowedPlatforms: currentSession?.allowedPlatforms || ""
      }
    });

    // 5. Hide setup overlay, show floating proctoring bar
    document.getElementById("pb-canvas-overlay").classList.add("pb-hidden");
    const floatBar = document.getElementById("pb-floating-bar");
    floatBar.classList.remove("pb-hidden");
    const miniCam = document.getElementById("pb-mini-camera");
    if (miniCam && cameraStream) {
      miniCam.srcObject = cameraStream;
    }

    isMonitored = true;
    reportEvent("canvas-quiz-started", {
      url: location.href,
      quizMode: currentSession?.quizMode || "online",
      allowedPlatforms: currentSession?.allowedPlatforms || "none"
    });
  } catch (err) {
    alert("Connection error: " + err.message);
    startBtn.textContent = "Start Monitored Canvas Quiz";
    startBtn.disabled = false;
  }
}

// WebRTC Signaling to Proctor Buddy Lecturer Wall
function connectWebRTC(sessionId, studentId) {
  try {
    signalingSocket = new WebSocket(`${WS_BASE}?sessionId=${sessionId}&studentId=${studentId}`);
    peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    // Add camera tracks
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => peerConnection.addTrack(track, cameraStream));
    }
    // Add screen tracks
    if (screenStream) {
      screenStream.getTracks().forEach((track) => peerConnection.addTrack(track, screenStream));
    }

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && signalingSocket.readyState === WebSocket.OPEN) {
        signalingSocket.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
      }
    };

    signalingSocket.onopen = async () => {
      const cameraTrack = cameraStream?.getVideoTracks()[0];
      const screenTrack = screenStream?.getVideoTracks()[0];

      signalingSocket.send(JSON.stringify({
        type: "student-ready",
        cameraStreamId: cameraStream?.id,
        cameraTrackId: cameraTrack?.id,
        screenStreamId: screenStream?.id,
        screenTrackId: screenTrack?.id
      }));

      // Create offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      signalingSocket.send(JSON.stringify({ type: "offer", offer }));
    };

    signalingSocket.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.type === "answer") {
        await peerConnection.setRemoteDescription(msg.answer);
      } else if (msg.type === "candidate") {
        if (peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(msg.candidate);
        }
      }
    };
  } catch (err) {
    console.warn("WebRTC live stream connection error:", err);
  }
}

function onFullscreenChange() {
  if (!isMonitored) return;
  const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  if (!isFs) {
    showReturnWarning("You have exited full screen mode. Canvas assessments require full screen at all times.");
    reportEvent("canvas-fullscreen-exited");
  } else {
    clearReturnWarning();
    reportEvent("canvas-fullscreen-restored");
  }
}

// Window Switch messages from background.js
chrome.runtime?.onMessage?.addListener((message) => {
  if (!isMonitored) return;

  if (message?.type === "WINDOW_FOCUS_CHANGED" || message?.type === "TAB_SWITCHED") {
    const { inQuizWindow, inQuizTab, evaluation } = message;
    const isAway = (inQuizWindow === false) || (inQuizTab === false);

    if (isAway) {
      if (evaluation?.allowed) {
        // Allowed platform!
        showAllowedPlatformToast(evaluation.platform || "Permitted Platform");
        clearReturnWarning();
      } else {
        // Unauthorized window switch!
        const reason = evaluation?.reason || "Window switching is not permitted by your lecturer.";
        showReturnWarning(`Unauthorized window switch detected: ${reason}`);
      }
    } else {
      // Returned to quiz
      clearReturnWarning();
      hideAllowedPlatformToast();
    }
  }
});

function showReturnWarning(message) {
  const lockdownModal = document.getElementById("pb-lockdown-modal");
  const msgEl = document.getElementById("pb-lockdown-msg");
  const timerEl = document.getElementById("pb-lockdown-timer");
  if (!lockdownModal) return;

  msgEl.textContent = message;
  lockdownModal.classList.remove("pb-hidden");

  if (returnTimer) clearInterval(returnTimer);
  returnSecondsLeft = 10;
  timerEl.textContent = `Return to quiz within ${returnSecondsLeft}s`;

  returnTimer = setInterval(() => {
    returnSecondsLeft--;
    if (returnSecondsLeft > 0) {
      timerEl.textContent = `Return to quiz within ${returnSecondsLeft}s`;
    } else {
      clearInterval(returnTimer);
      returnTimer = null;
      timerEl.textContent = "Session lockout triggered. Contact lecturer.";
      reportEvent("canvas-student-lockout-timeout", { reason: message });
    }
  }, 1000);
}

function clearReturnWarning() {
  if (returnTimer) {
    clearInterval(returnTimer);
    returnTimer = null;
  }
  document.getElementById("pb-lockdown-modal")?.classList.add("pb-hidden");
}

function showAllowedPlatformToast(platform) {
  const toast = document.getElementById("pb-allowed-platform-toast");
  const msg = document.getElementById("pb-allowed-toast-msg");
  if (toast && msg) {
    msg.textContent = `Permitted platform in use: ${platform}`;
    toast.classList.remove("pb-hidden");
  }
}

function hideAllowedPlatformToast() {
  document.getElementById("pb-allowed-platform-toast")?.classList.add("pb-hidden");
}

function requestDocumentFullscreen() {
  const docEl = document.documentElement;
  const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
  req?.call(docEl).catch(() => {});
}

async function reportEvent(type, payload = {}) {
  if (!currentSession?.id || !currentStudent?.id) return;
  try {
    await fetch(`${API_BASE}/sessions/${currentSession.id}/students/${currentStudent.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        payload,
        timestamp: new Date().toISOString()
      })
    });
  } catch (e) {}
}
