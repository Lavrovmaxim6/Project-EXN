const SITE = window.location.hostname;

function sendEvent(data) {
  try {
    chrome.runtime.sendMessage({ type: "EXN_EVENT", site: SITE, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        // Service worker was asleep, retry once after a short delay
        setTimeout(() => {
          try {
            chrome.runtime.sendMessage({ type: "EXN_EVENT", site: SITE, ...data });
          } catch(e) {}
        }, 500);
      }
    });
  } catch(e) {}
}

// Method 1: Standard paste event
document.addEventListener("paste", (e) => {
  const text = e.clipboardData?.getData("text") || "";
  sendEvent({ action: "paste", characters: text.length });
}, true);

// Method 2: Input event — catches paste in custom editors like ChatGPT
let lastLength = 0;
document.addEventListener("input", (e) => {
  const text = e.target?.value || e.target?.innerText || "";
  const currentLength = text.length;
  const diff = currentLength - lastLength;
  if (diff > 20) {
    sendEvent({ action: "paste", characters: diff });
  }
  lastLength = currentLength;
}, true);

// Method 3: File uploads
document.addEventListener("change", (e) => {
  if (e.target.type === "file") {
    const file = e.target.files[0];
    if (file) {
      sendEvent({ action: "file_upload", fileName: file.name, fileSize: file.size });
    }
  }
}, true);

// Method 4: Submit on Enter
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    sendEvent({ action: "submit" });
  }
}, true);

// Method 5: MutationObserver for ChatGPT DOM changes
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.length > 20) {
        sendEvent({ action: "paste", characters: node.textContent.length });
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });