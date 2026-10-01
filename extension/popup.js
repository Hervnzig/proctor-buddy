const API_BASE = "http://localhost:4310/api";

const studentInput = document.getElementById("studentId");
const quizInput = document.getElementById("quizId");
const startButton = document.getElementById("startBtn");
const statusElement = document.getElementById("status");

startButton.addEventListener("click", async () => {
  const studentId = studentInput.value.trim();
  const quizId = quizInput.value.trim();

  if (!studentId || !quizId) {
    statusElement.textContent = "Student ID and Quiz ID are required.";
    return;
  }

  try {
    statusElement.textContent = "Creating session...";
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const response = await fetch(`${API_BASE}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        quizId,
        quizUrl: activeTab?.url || null
      })
    });

    if (!response.ok) {
      throw new Error("Unable to create session");
    }

    const session = await response.json();
    await chrome.storage.local.set({
      currentSession: {
        id: session.id,
        studentId,
        quizId,
        quizTabId: activeTab?.id || null
      }
    });

    await chrome.tabs.create({ url: chrome.runtime.getURL(`monitor.html?sessionId=${session.id}`) });
    statusElement.textContent = "Session started. Complete pre-check in monitor tab.";
  } catch (error) {
    statusElement.textContent = `Error: ${error.message}`;
  }
});
