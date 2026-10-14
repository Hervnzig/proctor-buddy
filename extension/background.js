const API_BASE = "http://localhost:4310/api";

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "MAKE_QUIZ_FULLSCREEN" || message?.type === "PROCTOR_FORCE_FULLSCREEN") {
    if (sender?.tab?.windowId) {
      chrome.windows.update(sender.tab.windowId, { state: "fullscreen" });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.windowId) {
          chrome.windows.update(tabs[0].windowId, { state: "fullscreen" });
        }
      });
    }
    return;
  }

  if (message?.type !== "quizEvent") {
    return;
  }

  postEvent(message.payload).catch((error) => {
    console.error("Failed to forward event:", error);
  });
});

async function postEvent(eventPayload) {
  const { currentSession } = await chrome.storage.local.get("currentSession");
  if (!currentSession?.id) {
    return;
  }

  await fetch(`${API_BASE}/sessions/${currentSession.id}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: eventPayload.type,
      payload: eventPayload.payload,
      timestamp: new Date().toISOString()
    })
  });
}
