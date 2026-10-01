const API_BASE = "http://localhost:4310/api";

chrome.runtime.onMessage.addListener((message) => {
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
