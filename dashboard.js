let allLogs = [];
let currentFilter = "ALL";
let currentSearch = "";

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function getDetails(log) {
  if (log.summary) return log.summary;
  const parts = [];
  if (log.characters > 0) parts.push(log.characters.toLocaleString() + " chars");
  if (log.fileName) parts.push(log.fileName);
  if (log.fileSize) parts.push((log.fileSize / 1024).toFixed(1) + " KB");
  if (log.source === "history") parts.push("history");
  return parts.join(" · ") || "—";
}



function renderEvents() {
  const list = document.getElementById("event-list");

  allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  let filtered = allLogs.filter(log => {
    const matchFilter = currentFilter === "ALL" || log.risk === currentFilter;
    const searchTerm = currentSearch.toLowerCase();
    const matchSearch = !searchTerm ||
      (log.site || "").toLowerCase().includes(searchTerm) ||
      (log.user || "").toLowerCase().includes(searchTerm) ||
      (log.action || "").toLowerCase().includes(searchTerm);
    return matchFilter && matchSearch;
  });

  document.getElementById("event-count-label").textContent = filtered.length + " events";

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state">No events match current filter</div>';
    return;
  }

  list.innerHTML = filtered.map(log => `
    <div class="event-row">
      <span class="cell ts">${formatTime(log.timestamp)}</span>
      <span class="cell user-cell" title="${log.user || 'unknown'}">
        <span class="user-email">${(log.user || "unknown").split("|")[0].trim()}</span>
        <span class="user-machine">${log.user && log.user.includes("|") ? log.user.split("|")[1].trim() : ""}</span>
      </span>
      <span class="cell site">${log.site || "—"}</span>
      <span class="cell"><span class="action-pill">${log.action || "—"}</span></span>
      <span class="cell"><span class="risk-pill risk-${log.risk}">${log.risk}</span></span>
      <span class="cell detail">${log.blocked ? `<span class="blocked-badge">BLOCKED</span>` : ""}${log.category ? `<span style="color:var(--amber);font-family:var(--mono);font-size:10px;margin-right:6px;">[${log.category}]</span>` : ""}${getDetails(log)}</span>
    </div>
  `).join("");
}

function renderBreakdowns() {
  const siteCounts = {};
  allLogs.forEach(l => { if (l.site) siteCounts[l.site] = (siteCounts[l.site] || 0) + 1; });
  const siteBox = document.getElementById("site-breakdown");
  const sortedSites = Object.entries(siteCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  siteBox.innerHTML = sortedSites.length ? sortedSites.map(([site, count]) => `
    <div class="mini-row">
      <span class="mini-name">${site}</span>
      <span class="mini-count">${count}</span>
    </div>
  `).join("") : '<div class="mini-row"><span class="mini-count">No data yet</span></div>';

  const actionCounts = {};
  allLogs.forEach(l => { if (l.action) actionCounts[l.action] = (actionCounts[l.action] || 0) + 1; });
  const actionBox = document.getElementById("action-breakdown");
  const sortedActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]);
  actionBox.innerHTML = sortedActions.length ? sortedActions.map(([action, count]) => `
    <div class="mini-row">
      <span class="mini-name action">${action}</span>
      <span class="mini-count">${count}</span>
    </div>
  `).join("") : '<div class="mini-row"><span class="mini-count">No data yet</span></div>';
}

function renderUserBreakdown() {
  const userStats = {};
  allLogs.forEach(l => {
    const key = l.user || "unknown";
    if (!userStats[key]) userStats[key] = { total: 0, high: 0 };
    userStats[key].total++;
    if (l.risk === "HIGH") userStats[key].high++;
  });

  const sorted = Object.entries(userStats).sort((a, b) => b[1].total - a[1].total);
  const box = document.getElementById("user-breakdown");

  if (!sorted.length) {
    box.innerHTML = '<div class="mini-row"><span class="mini-count">No users yet</span></div>';
    return;
  }

  box.innerHTML = sorted.map(([user, stats]) => {
    const parts = user.split("|");
    const email = parts[0].trim();
    const machine = parts[1] ? parts[1].trim() : "";
    const initial = email.charAt(0).toUpperCase();
    const dotColor = stats.high > 0 ? "var(--red)" : "var(--green)";
    const encoded = encodeURIComponent(user);
    return `
      <div class="mini-row clickable" onclick="window.open('user.html?user=${encoded}', '_blank')">
        <div class="user-row-left">
          <div class="user-avatar">${initial}</div>
          <div class="user-row-meta">
            <div class="user-row-email" title="${email}">${email}</div>
            ${machine ? `<div class="user-row-machine">${machine}</div>` : ""}
          </div>
        </div>
        <div class="mini-row-right">
          <div class="user-risk-dot" style="background:${dotColor};" title="${stats.high} high risk"></div>
          <span class="mini-count">${stats.total}</span>
        </div>
      </div>`;
  }).join("");
}

function updateStats() {
  const high = allLogs.filter(l => l.risk === "HIGH").length;
  const medium = allLogs.filter(l => l.risk === "MEDIUM").length;
  const low = allLogs.filter(l => l.risk === "LOW").length;
  document.getElementById("count-high").textContent = high;
  document.getElementById("count-medium").textContent = medium;
  document.getElementById("count-low").textContent = low;
  document.getElementById("count-total").textContent = allLogs.length;
  document.getElementById("high-badge").textContent = high;
  document.getElementById("last-updated").textContent = "Updated " + new Date().toLocaleTimeString();
}

function loadLogs() {
  chrome.storage.local.get({ logs: [] }, ({ logs }) => {
    allLogs = logs;
    updateStats();
    renderEvents();
    renderBreakdowns();
    renderUserBreakdown();
  });
}

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderEvents();
  });
});

document.getElementById("search").addEventListener("input", (e) => {
  currentSearch = e.target.value;
  renderEvents();
});

document.getElementById("clear-btn").addEventListener("click", () => {
  if (confirm("Clear all logs? This cannot be undone.")) {
    chrome.storage.local.set({ logs: [] }, () => {
      allLogs = [];
      updateStats();
      renderEvents();
      renderBreakdowns();
    });
  }
});

document.getElementById("nav-users").addEventListener("click", () => {
  window.location.href = "users.html";
});

loadLogs();
setInterval(loadLogs, 5000);

const blockToggle = document.getElementById("block-mode-toggle");
const blockStatus = document.getElementById("block-mode-status");
const blockDesc = document.getElementById("block-mode-desc");

function applyBlockModeUI(enabled) {
  blockToggle.checked = enabled;
  if (enabled) {
    blockStatus.textContent = "On — blocking sensitive pastes";
    blockStatus.classList.add("active");
    blockDesc.innerHTML = "Sensitive content is <strong>stopped</strong> before it reaches the AI.";
  } else {
    blockStatus.textContent = "Off — logging only";
    blockStatus.classList.remove("active");
    blockDesc.innerHTML = "Sensitive content is <strong>logged</strong> but allowed through.";
  }
}

chrome.storage.local.get({ blockMode: false }, ({ blockMode }) => {
  applyBlockModeUI(blockMode);
});

blockToggle.addEventListener("change", () => {
  chrome.storage.local.set({ blockMode: blockToggle.checked });
  applyBlockModeUI(blockToggle.checked);
});