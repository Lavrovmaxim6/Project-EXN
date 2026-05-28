const AI_SITES = [
  "chatgpt.com",
  "chat.openai.com",
  "claude.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
  "www.perplexity.ai",
  "character.ai",
  "poe.com"
];

function captureIdentity() {
  chrome.storage.local.get("userIdentity", (data) => {
    if (data.userIdentity) return;
    const machineId = chrome.runtime.id.slice(0, 8).toUpperCase();
    chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }, (info) => {
      const email = (info && info.email) ? info.email : "unknown@company.com";
      chrome.storage.local.set({ userIdentity: `${email} | MACHINE-${machineId}` });
    });
  });
}

function getIdentity(callback) {
  chrome.storage.local.get("userIdentity", (data) => {
    callback(data.userIdentity || "unknown@company.com | unknown-machine");
  });
}

function saveLog(entry) {
  chrome.storage.local.get({ logs: [] }, (data) => {
    const logs = data.logs;
    const exists = logs.some(
      (l) => l.site === entry.site && l.timestamp === entry.timestamp && l.action === entry.action
    );
    if (exists) return;
    logs.unshift(entry);
    if (logs.length > 500) logs.pop();
    chrome.storage.local.set({ logs });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXN_EVENT") {
    getIdentity((identity) => {
      let risk = "LOW";
      if (message.severity === "CRITICAL" || message.severity === "HIGH") risk = "HIGH";
      else if (message.severity === "MEDIUM") risk = "MEDIUM";
      else if (message.action === "paste" && message.characters >= 1000) risk = "HIGH";
      else if (message.action === "paste") risk = "MEDIUM";
      else if (message.action === "file_upload") risk = "HIGH";

      const entry = {
        id: Date.now(),
        user: identity,
        site: message.site,
        action: message.action,
        characters: message.characters || 0,
        fileName: message.fileName || null,
        fileSize: message.fileSize || null,
        timestamp: new Date().toISOString(),
        risk,
        category: message.category || null,
        severity: message.severity || null,
        summary: message.summary || null,
        recommended_action: message.recommended_action || null,
        flags: message.flags || []
      };

      saveLog(entry);
    });
  }
  return true;
});

function pullHistory() {
  const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  AI_SITES.forEach((site) => {
    chrome.history.search(
      { text: site, startTime: oneMonthAgo, maxResults: 100 },
      (results) => {
        results.forEach((item) => {
          getIdentity((identity) => {
            saveLog({
              id: item.id,
              user: identity,
              site,
              action: "visit",
              characters: 0,
              fileName: null,
              fileSize: null,
              timestamp: new Date(item.lastVisitTime).toISOString(),
              risk: "LOW",
              source: "history",
              category: null,
              severity: null,
              summary: null,
              flags: []
            });
          });
        });
      }
    );
  });
}

chrome.runtime.onInstalled.addListener(() => {
  captureIdentity();
  pullHistory();
});

chrome.runtime.onStartup.addListener(() => {
  captureIdentity();
  pullHistory();
});