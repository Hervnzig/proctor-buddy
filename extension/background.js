const API_BASE = "http://localhost:4310/api";

let activeQuizSession = null;

// Initialize from storage
chrome.storage.local.get("activeCanvasQuiz", (data) => {
  if (data?.activeCanvasQuiz) {
    activeQuizSession = data.activeCanvasQuiz;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "START_CANVAS_SESSION") {
    activeQuizSession = {
      ...message.payload,
      tabId: sender?.tab?.id || message.payload?.tabId,
      windowId: sender?.tab?.windowId || message.payload?.windowId
    };
    chrome.storage.local.set({ activeCanvasQuiz: activeQuizSession });
    
    // Immediately force window to full screen
    const winId = activeQuizSession.windowId;
    if (winId) {
      chrome.windows.update(winId, { state: "fullscreen" }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "MAKE_QUIZ_FULLSCREEN" || message?.type === "PROCTOR_FORCE_FULLSCREEN") {
    const targetWinId = sender?.tab?.windowId || activeQuizSession?.windowId;
    if (targetWinId) {
      chrome.windows.update(targetWinId, { state: "fullscreen" }).catch(() => {});
    } else {
      chrome.windows.getCurrent((win) => {
        if (win?.id) chrome.windows.update(win.id, { state: "fullscreen" }).catch(() => {});
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "END_CANVAS_SESSION") {
    activeQuizSession = null;
    chrome.storage.local.remove("activeCanvasQuiz");
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "GET_ACTIVE_SESSION") {
    sendResponse({ session: activeQuizSession });
    return true;
  }

  if (message?.type === "CHECK_PLATFORM_ALLOWED") {
    const url = message.url;
    const result = evaluatePlatformAccess(url, activeQuizSession?.allowedPlatforms, activeQuizSession?.allowWindowSwitching);
    sendResponse(result);
    return true;
  }

  if (message?.type === "quizEvent" || message?.type === "REPORT_EVENT") {
    const payload = message.payload || {};
    postEvent(payload.type, payload.payload, payload.studentId, payload.sessionId).catch((err) => {
      console.error("Failed to forward event:", err);
    });
    sendResponse({ ok: true });
    return true;
  }
});

// Platform URL evaluator — determines if an external window or URL is permitted by lecturer
function evaluatePlatformAccess(destinationUrl, allowedPlatformsStr, allowWindowSwitching) {
  if (!destinationUrl) return { allowed: false, reason: "Unknown window destination" };
  
  // If window switching is strictly forbidden
  if (!allowWindowSwitching) {
    return {
      allowed: false,
      reason: "Window switching is not permitted for this assessment."
    };
  }

  try {
    const parsed = new URL(destinationUrl);
    const host = parsed.hostname.toLowerCase();
    
    // Always permit the Canvas quiz itself and internal monitoring endpoints
    if (host.includes("instructure.com") || host.includes("localhost") || host.includes("127.0.0.1")) {
      return { allowed: true, platform: "Canvas LMS Quiz" };
    }

    if (!allowedPlatformsStr || !allowedPlatformsStr.trim()) {
      return {
        allowed: false,
        reason: "No external platforms were whitelisted by your lecturer."
      };
    }

    // Parse comma-separated allowed list
    const allowedList = allowedPlatformsStr.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    for (const allowed of allowedList) {
      if (host.includes(allowed) || destinationUrl.toLowerCase().includes(allowed)) {
        return {
          allowed: true,
          platform: allowed,
          note: `Permitted platform match: ${allowed}`
        };
      }
    }

    return {
      allowed: false,
      reason: `Platform ${host} is not in the lecturer-approved allowed list (${allowedPlatformsStr}).`
    };
  } catch (err) {
    return { allowed: false, reason: "Invalid destination URL" };
  }
}

// Window focus monitoring
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (!activeQuizSession || windowId === chrome.windows.WINDOW_ID_NONE) return;

  if (activeQuizSession.windowId && windowId !== activeQuizSession.windowId) {
    // Student switched to another browser window
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
      const activeTab = tabs[0];
      const targetUrl = activeTab?.url || "";
      const evaluation = evaluatePlatformAccess(targetUrl, activeQuizSession.allowedPlatforms, activeQuizSession.allowWindowSwitching);

      // Notify the active quiz tab content script
      if (activeQuizSession.tabId) {
        chrome.tabs.sendMessage(activeQuizSession.tabId, {
          type: "WINDOW_FOCUS_CHANGED",
          inQuizWindow: false,
          targetUrl,
          evaluation
        }).catch(() => {});
      }

      // Record event to Proctor Buddy server
      postEvent(
        evaluation.allowed ? "allowed-platform-active" : "unauthorized-window-switch",
        {
          targetUrl,
          reason: evaluation.reason || evaluation.note,
          platform: evaluation.platform || "external"
        },
        activeQuizSession.studentId,
        activeQuizSession.sessionId
      ).catch(() => {});
    });
  } else if (activeQuizSession.windowId && windowId === activeQuizSession.windowId) {
    // Returned to quiz window
    if (activeQuizSession.tabId) {
      chrome.tabs.sendMessage(activeQuizSession.tabId, {
        type: "WINDOW_FOCUS_CHANGED",
        inQuizWindow: true
      }).catch(() => {});
    }
  }
});

// Tab switch monitoring within current window
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!activeQuizSession || activeInfo.tabId === activeQuizSession.tabId) return;

  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!tab) return;
    const targetUrl = tab.url || "";
    const evaluation = evaluatePlatformAccess(targetUrl, activeQuizSession.allowedPlatforms, activeQuizSession.allowWindowSwitching);

    if (activeQuizSession.tabId) {
      chrome.tabs.sendMessage(activeQuizSession.tabId, {
        type: "TAB_SWITCHED",
        inQuizTab: false,
        targetUrl,
        evaluation
      }).catch(() => {});
    }

    postEvent(
      evaluation.allowed ? "allowed-platform-active" : "unauthorized-window-switch",
      {
        targetUrl,
        reason: evaluation.reason || evaluation.note,
        platform: evaluation.platform || "external"
      },
      activeQuizSession.studentId,
      activeQuizSession.sessionId
    ).catch(() => {});
  });
});

async function postEvent(type, payload = {}, studentId = null, sessionId = null) {
  const sid = sessionId || activeQuizSession?.sessionId;
  const stid = studentId || activeQuizSession?.studentId;
  if (!sid) return;

  const url = stid
    ? `${API_BASE}/sessions/${sid}/students/${stid}/events`
    : `${API_BASE}/sessions/${sid}/events`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      payload: {
        url: activeQuizSession?.quizUrl || "Canvas Quiz",
        ...payload
      },
      timestamp: new Date().toISOString()
    })
  });
}
