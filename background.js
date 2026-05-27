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

const RISK_RULES = {
  paste_large: { threshold: 1000, risk: "HIGH" },
  paste_small: { threshold: 1, risk: "MEDIUM" },
  file_upload: { risk: "HIGH" },
  submit: { risk: "LOW" },
  visit: { risk: "LOW" }
};

function getRisk(action, charCount = 0) {
  if (action === "paste") {
    return charCount >= RISK_RULES.paste_large.threshold
      ? RISK_RULES.paste_large.risk
      : RISK_RULES.paste_small.risk;
  }
  return RISK_RULES[action]?.risk || "LOW";
}

function captureIdentity() {
  chrome.storage.local.get("userIdentity", (data) => {
    if (data.userIdentity) return;

    const machineId = chrome.runtime.id.slice(0, 8).toUpperCase();

    chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }, (info) => {
      const email = (info && info.email) ? info.email : "unknown@company.com";
      const identity = `${email} | MACHINE-${machineId}`;
      chrome.storage.local.set({ userIdentity: identity });
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

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "EXN_EVENT") {
    getIdentity((identity) => {
      const entry = {
        id: Date.now(),
        user: identity,
        site: message.site,
        action: message.action,
        characters: message.characters || 0,
        fileName: message.fileName || null,
        fileSize: message.fileSize || null,
        timestamp: new Date().toISOString(),
        risk: getRisk(message.action, message.characters || 0)
      };
      saveLog(entry);
    });
  }
});

function pullHistory() {
  const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  AI_SITES.forEach((site) => {
    chrome.history.search(
      { text: site, startTime: oneMonthAgo, maxResults: 100 },
      (results) => {
        results.forEach((item) => {
          getIdentity((identity) => {
            const entry = {
              id: item.id,
              user: identity,
              site: site,
              action: "visit",
              characters: 0,
              fileName: null,
              fileSize: null,
              timestamp: new Date(item.lastVisitTime).toISOString(),
              risk: "LOW",
              source: "history"
            };
            saveLog(entry);
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
