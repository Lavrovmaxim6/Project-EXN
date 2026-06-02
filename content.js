console.log("[ExN] Content script loaded on:", window.location.hostname);

const SITE = window.location.hostname;

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
    chrome.runtime.sendMessage({ type: "EXN_EVENT", site: SITE, ...data }, () => {
      if (chrome.runtime.lastError) {
        setTimeout(() => {
          try { chrome.runtime.sendMessage({ type: "EXN_EVENT", site: SITE, ...data }); } catch(e) {}
        }, 500);
      }
    });
  } catch(e) {}
}

async function handlePaste(text) {
  console.log("[ExN] Paste detected, length:", text.length);
  const base = { action: "paste", characters: text.length };
  if (text.length >= 20) {
    const signals = extractSignals(text);
    console.log("[ExN] Signals:", signals.flags);
    if (signals.flags.length > 0) {
      sendEvent({ ...base, action: "paste", signals });
      return;
    }
  }
  sendEvent(base);
}

document.addEventListener("paste", (e) => {
  console.log("[ExN] Paste event fired");
  const text = e.clipboardData?.getData("text") || "";
  handlePaste(text);
}, true);

let lastLength = 0;
document.addEventListener("input", (e) => {
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
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.length > 20) {
        handlePaste(node.textContent);
      }
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true });