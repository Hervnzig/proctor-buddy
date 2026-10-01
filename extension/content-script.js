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
