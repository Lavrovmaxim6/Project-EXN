console.log("[ExN] Content script loaded on:", window.location.hostname);

const SITE = window.location.hostname;

let blockModeEnabled = false;
let blockedUsers = [];
let currentUserEmail = "";

chrome.storage.local.get({ blockMode: false, blockedUsers: [], userIdentity: "" }, (data) => {
  blockModeEnabled = data.blockMode;
  blockedUsers = data.blockedUsers;
  currentUserEmail = (data.userIdentity || "").split("|")[0].trim();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockMode) blockModeEnabled = changes.blockMode.newValue;
  if (changes.blockedUsers) blockedUsers = changes.blockedUsers.newValue;
  if (changes.userIdentity) currentUserEmail = (changes.userIdentity.newValue || "").split("|")[0].trim();
});

function extractSignals(text) {
  const signals = { length: text.length, flags: [], counts: {} };
  if (/\$[\d,]+/.test(text)) signals.flags.push("currency_symbols");
  if (/\b\d{1,3}(,\d{3})*(\.\d{2})?\b/.test(text)) signals.flags.push("numeric_amounts");
  if (/revenue|profit|loss|budget|invoice|billing|payment|salary|compensation/i.test(text)) signals.flags.push("financial_terms");
  if (/q[1-4]\s+\d{4}|quarterly|fiscal|annual report/i.test(text)) signals.flags.push("financial_reporting");
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) signals.flags.push("ssn_pattern");
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) signals.flags.push("email_addresses");
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(text)) signals.flags.push("phone_numbers");
  if (/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/.test(text)) signals.flags.push("credit_card_pattern");
  if (/date of birth|dob|born on|passport|driver.?s license/i.test(text)) signals.flags.push("identity_document");
  if (/function\s*\(|const\s+\w+\s*=|import\s+{|class\s+\w+\s*{|def\s+\w+\(|SELECT\s+\*\s+FROM/i.test(text)) signals.flags.push("source_code");
  if (/api[_-]?key|secret[_-]?key|access[_-]?token|bearer\s+[a-z0-9]/i.test(text)) signals.flags.push("credentials_or_tokens");
  if (/github\.com|gitlab\.com|bitbucket/i.test(text)) signals.flags.push("code_repository");
  if (/whereas|hereinafter|indemnif|liability|confidential|nda|non-disclosure|attorney|counsel/i.test(text)) signals.flags.push("legal_language");
  if (/contract|agreement|terms|clause|jurisdiction|arbitration/i.test(text)) signals.flags.push("legal_document");
  if (/patient|diagnosis|prescription|hipaa|medical record|treatment|physician|dosage/i.test(text)) signals.flags.push("medical_content");
  if (/\bICD-\d+|\bCPT\s+\d+/i.test(text)) signals.flags.push("medical_codes");
  if (/employee|performance review|termination|severance|headcount|org chart/i.test(text)) signals.flags.push("hr_content");
  signals.counts.words = text.split(/\s+/).length;
  signals.counts.proper_nouns = (text.match(/\b[A-Z][a-z]{2,}\b/g) || []).length;
  signals.counts.lines = text.split("\n").length;
  signals.counts.flag_count = signals.flags.length;
  return signals;
}

function sendEvent(data) {
  console.log("[ExN] Sending event:", data.action, data.characters);
  try {
    chrome.runtime.sendMessage({ type: "EXN_EVENT", site: SITE, ...data });
  } catch(e) {}
}

function getLocalRisk(signals) {
  const criticalFlags = ["ssn_pattern", "credit_card_pattern", "credentials_or_tokens"];
  const hasCritical = signals.flags.some(f => criticalFlags.includes(f));
  if (hasCritical) return "BLOCK";
  if (signals.flags.length >= 3) return "BLOCK";
  return "ALLOW";
}

function showBlockNotice(flags) {
  const existing = document.getElementById("audit-ai-block");
  if (existing) existing.remove();

  const notice = document.createElement("div");
  notice.id = "audit-ai-block";
  notice.style.cssText = `
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 999999;
    background: #0d1117;
    border: 1px solid #ff4455;
    border-radius: 12px;
    padding: 16px 20px;
    max-width: 340px;
    box-shadow: 0 8px 32px rgba(255,68,85,0.2);
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  `;

  notice.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <div style="width:8px;height:8px;border-radius:50%;background:#ff4455;box-shadow:0 0 8px #ff4455;"></div>
      <span style="color:#ff4455;font-size:12px;font-weight:600;letter-spacing:0.05em;">AUDIT-AI — BLOCKED</span>
    </div>
    <p style="color:#e2e8f0;font-size:13px;margin:0 0 8px;">This content was blocked from being shared with an external AI tool.</p>
    <p style="color:#64748b;font-size:11px;margin:0;">Detected: ${flags.join(", ")}</p>
    <p style="color:#64748b;font-size:11px;margin:6px 0 0;">Contact your IT security team for assistance.</p>
  `;

  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 6000);
}

async function handlePaste(text, originalEvent = null, instruction = null) {
  console.log("[ExN] Paste detected, length:", text.length);
  const base = { action: "paste", characters: text.length, instruction };
  if (text.length >= 20) {
    const signals = extractSignals(text);
    console.log("[ExN] Signals:", signals.flags);
    const riskLevel = getLocalRisk(signals);
    const isUserBlocked = currentUserEmail && blockedUsers.includes(currentUserEmail);
    const isBlocked = riskLevel === "BLOCK" && (blockModeEnabled || isUserBlocked);

    sendEvent({ ...base, signals, blocked: isBlocked, content: text });

    if (isBlocked) {
      if (originalEvent) {
        originalEvent.preventDefault();
        originalEvent.stopImmediatePropagation();
      }
      showBlockNotice(signals.flags);
    }
    return;
  }
  sendEvent(base);
}

let isPasting = false;
let pasteDebounceTimer = null;

document.addEventListener("paste", (e) => {
  console.log("[ExN] Paste event fired");
  const text = e.clipboardData?.getData("text") || "";
  const activeEl = document.activeElement;
  const instruction = (activeEl?.value || activeEl?.innerText || activeEl?.textContent || "").trim().slice(0, 500) || null;
  isPasting = true;
  clearTimeout(pasteDebounceTimer);
  pasteDebounceTimer = setTimeout(() => { isPasting = false; }, 1500);
  handlePaste(text, e, instruction);
}, true);

let lastLength = 0;
document.addEventListener("input", (e) => {
  if (isPasting) return;
  const text = e.target?.value || e.target?.innerText || "";
  const diff = text.length - lastLength;
  if (diff > 20) {
    console.log("[ExN] Input event caught large diff:", diff);
    handlePaste(text.slice(-diff));
  }
  lastLength = text.length;
}, true);

document.addEventListener("change", (e) => {
  if (e.target.type === "file") {
    const file = e.target.files[0];
    if (file) sendEvent({ action: "file_upload", fileName: file.name, fileSize: file.size });
  }
}, true);

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) sendEvent({ action: "submit" });
}, true);

const observer = new MutationObserver((mutations) => {
  if (isPasting) return;
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.length > 20) {
        handlePaste(node.textContent);
      }
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true });