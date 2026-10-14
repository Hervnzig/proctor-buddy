const canvasBadge = document.getElementById("canvasBadge");
const activeTabUrl = document.getElementById("activeTabUrl");
const windowPolicyText = document.getElementById("windowPolicyText");
const allowedPlatformsText = document.getElementById("allowedPlatformsText");
const launchProctorBtn = document.getElementById("launchProctorBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const statusMsg = document.getElementById("statusMsg");

// Check current active tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab) return;

  const url = tab.url || "";
  activeTabUrl.textContent = url;

  const isCanvas = url.includes("instructure.com") || url.includes("lti/launch") || url.includes("/quizzes") || url.includes("quiz");
  if (isCanvas) {
    canvasBadge.textContent = "Canvas Detected ✓";
    canvasBadge.style.color = "#4cd88c";
  } else {
    canvasBadge.textContent = "Other Page";
    canvasBadge.style.color = "#8fa597";
  }
});

// Check if there is an active session in storage
chrome.storage.local.get("activeCanvasQuiz", (data) => {
  if (data?.activeCanvasQuiz) {
    const session = data.activeCanvasQuiz;
    windowPolicyText.textContent = session.allowWindowSwitching ? "Permitted Tools" : "Strict (No Switching)";
    allowedPlatformsText.textContent = session.allowedPlatforms || "Canvas Only";
  }
});

launchProctorBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "SHOW_PROCTOR_SETUP" }).catch(() => {
        statusMsg.textContent = "Please refresh the Canvas tab if newly loaded.";
      });
      statusMsg.textContent = "Proctor setup opened in tab.";
    }
  });
});

fullscreenBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "MAKE_QUIZ_FULLSCREEN" });
  statusMsg.textContent = "Fullscreen requested.";
});
