function publishQuizEvent(type, payload = {}) {
  chrome.runtime.sendMessage({
    type: "quizEvent",
    payload: {
      type,
      payload: {
        url: location.href,
        ...payload
      }
    }
  });
}

function requestDocumentFullscreen() {
  if (!document.fullscreenElement) {
    const docEl = document.documentElement;
    const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
    req?.call(docEl).catch(() => {});
  }
}

window.addEventListener("message", (event) => {
  if (event.data?.type === "PROCTOR_FORCE_FULLSCREEN" || event.data?.type === "FORCE_FULLSCREEN") {
    chrome.runtime?.sendMessage?.({ type: "MAKE_QUIZ_FULLSCREEN" });
    requestDocumentFullscreen();
  }
});

try {
  const bc = new BroadcastChannel("proctor-buddy-quiz");
  bc.onmessage = (event) => {
    if (event.data?.type === "PROCTOR_FORCE_FULLSCREEN" || event.data?.type === "FORCE_FULLSCREEN") {
      chrome.runtime?.sendMessage?.({ type: "MAKE_QUIZ_FULLSCREEN" });
      requestDocumentFullscreen();
    }
  };
} catch {}

document.addEventListener("visibilitychange", () => {
  publishQuizEvent("quiz-visibility", { visibilityState: document.visibilityState });
});

window.addEventListener("blur", () => {
  publishQuizEvent("quiz-window-blur");
});

window.addEventListener("focus", () => {
  publishQuizEvent("quiz-window-focus");
});

window.addEventListener("copy", () => {
  publishQuizEvent("copy-attempt");
});

window.addEventListener("paste", () => {
  publishQuizEvent("paste-attempt");
});
