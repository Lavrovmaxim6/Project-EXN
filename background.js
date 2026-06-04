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

const SERVER_URL = "http://localhost:3000";

async function classifyWithServer(signals, apiKey) {
  const response = await fetch(`${SERVER_URL}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signals, apiKey })
  });
  return await response.json();
}

async function captureIdentity() {
  // Get Chrome profile email (only works if signed into Chrome with Google)
  const info = await new Promise(resolve =>
    chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }, resolve)
  );
  const email = (info && info.email) ? info.email : "unknown";

  // Get hostname + system username from local server
  let hostname = "unknown-machine";
  let username = null;
  try {
    const res = await fetch(`${SERVER_URL}/identity`);
    const json = await res.json();
    if (json.hostname) hostname = json.hostname;
    if (json.username) username = json.username;
  } catch (_) {}

  const displayEmail = (email !== "unknown") ? email : (username || "unknown");
  chrome.storage.local.set({ userIdentity: `${displayEmail} | ${hostname}` });
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
    getIdentity(async (identity) => {
      let risk = "LOW";
      let category = null, severity = null, summary = null, recommended_action = null, flags = [];

      if (message.action === "paste" && message.signals) {
        flags = message.signals.flags || [];
        try {
          const stored = await chrome.storage.local.get("exnApiKey");
          const apiKey = stored.exnApiKey;
          if (apiKey && flags.length > 0) {
            const result = await classifyWithServer(message.signals, apiKey);
            if (result) {
              category = result.category;
              severity = result.severity;
              summary = result.summary;
              recommended_action = result.recommended_action;
            }
          }
        } catch(e) {
          console.error("[ExN] Classification error:", e);
        }
      }

      if (severity === "CRITICAL" || severity === "HIGH") risk = "HIGH";
      else if (severity === "MEDIUM") risk = "MEDIUM";
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
        risk, category, severity, summary, recommended_action, flags
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

setInterval(() => fetch("http://localhost:3000/health").catch(() => {}), 25000);