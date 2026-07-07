let allLogs = [];
let currentFilter = "ALL";
let currentSearch = "";

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "long" });
}

function formatTimeFull(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
         d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
    <div class="event-row" data-ts="${log.timestamp}">
      <span class="cell ts">${formatTimeFull(log.timestamp)}</span>
      <span class="cell user-cell" title="${log.user || 'unknown'}">
        <span class="user-email">${(log.user || "unknown").split("|")[0].trim()}</span>
        <span class="user-machine">${log.user && log.user.includes("|") ? log.user.split("|")[1].trim() : ""}</span>
      </span>
      <span class="cell site">${log.site || "—"}</span>
      <span class="cell"><span class="action-pill">${log.action || "—"}</span></span>
      <span class="cell"><span class="risk-pill risk-${log.risk}">${log.risk}</span></span>
      <span class="cell detail">${log.blocked ? `<span class="blocked-badge">BLOCKED</span>` : ""}${log.category ? `<span style="color:var(--amber);font-family:var(--mono);font-size:10px;margin-right:6px;">[${log.category}]</span>` : ""}${log.intent && log.intent !== "other" ? `<span style="display:inline-block;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:600;color:#0071e3;background:rgba(0,113,227,0.1);border:1px solid rgba(0,113,227,0.2);font-family:var(--mono);margin-right:6px;">${log.intent}</span>` : ""}${log.output_risk === "HIGH" ? `<span style="display:inline-block;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700;color:#ff3b30;background:rgba(255,59,48,0.1);border:1px solid rgba(255,59,48,0.2);font-family:var(--mono);margin-right:6px;">out:HIGH</span>` : ""}${getDetails(log)}</span>
      <button class="delete-btn" title="Delete event">×</button>
    </div>
  `).join("");

  list.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const ts = btn.closest(".event-row").dataset.ts;
      deleteEvent(ts);
    });
  });

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
  const high    = allLogs.filter(l => l.risk === "HIGH").length;
  const medium  = allLogs.filter(l => l.risk === "MEDIUM").length;
  const low     = allLogs.filter(l => l.risk === "LOW").length;
  const blocked = allLogs.filter(l => l.blocked).length;
  document.getElementById("count-high").textContent    = high;
  document.getElementById("count-medium").textContent  = medium;
  document.getElementById("count-low").textContent     = low;
  document.getElementById("count-total").textContent   = allLogs.length;
  document.getElementById("count-blocked").textContent = blocked;
  document.getElementById("count-shadow").textContent  = 0;
  document.getElementById("high-badge").textContent    = high;
  document.getElementById("last-updated").textContent  = "Updated " + new Date().toLocaleTimeString();
}

function deleteEvent(ts) {
  allLogs = allLogs.filter(l => String(l.timestamp) !== String(ts));
  chrome.storage.local.set({ logs: allLogs }, () => {
    updateStats();
    renderEvents();
    renderBreakdowns();
    renderUserBreakdown();
  });
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

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll(".filter-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.filter === filter);
  });
  document.querySelectorAll(".stat-card").forEach(c => c.classList.remove("filtering"));
  if (filter === "HIGH")   document.getElementById("stat-high").classList.add("filtering");
  if (filter === "MEDIUM") document.getElementById("stat-medium").classList.add("filtering");
  if (filter === "LOW")    document.getElementById("stat-low").classList.add("filtering");
  renderEvents();
}

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => setFilter(btn.dataset.filter));
});

const statCardMap = [
  { id: "stat-high",   filter: "HIGH" },
  { id: "stat-medium", filter: "MEDIUM" },
  { id: "stat-low",    filter: "LOW" },
  { id: "stat-total",  filter: "ALL" },
];
statCardMap.forEach(({ id, filter }) => {
  document.getElementById(id).addEventListener("click", () => {
    setFilter(currentFilter === filter ? "ALL" : filter);
  });
});

document.getElementById("search").addEventListener("input", (e) => {
  currentSearch = e.target.value;
  renderEvents();
});

document.getElementById("export-btn").addEventListener("click", () => {
  const headers = ["Timestamp", "User", "Site", "Action", "Risk", "Category", "Severity", "Summary", "Intent", "Output Risk", "Characters", "Blocked", "Flags"];
  const rows = allLogs.map(l => [
    l.timestamp,
    (l.user || "").replace(/,/g, " "),
    l.site || "",
    l.action || "",
    l.risk || "",
    l.category || "",
    l.severity || "",
    (l.summary || "").replace(/,/g, ";"),
    l.intent || "",
    l.output_risk || "",
    l.characters || 0,
    l.blocked ? "Yes" : "No",
    (l.flags || []).join("; ")
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-ai-events-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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

document.getElementById("nav-users").addEventListener("click", () => { window.location.href = "users.html"; });
document.getElementById("nav-activity").addEventListener("click", () => { window.location.href = "activity-log.html"; });
document.getElementById("nav-policies").addEventListener("click", () => { window.location.href = "policies.html"; });
document.getElementById("nav-devices").addEventListener("click", () => { window.location.href = "devices.html"; });
document.getElementById("nav-reports").addEventListener("click", () => { window.location.href = "reports.html"; });

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