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
      <span class="cell detail">${log.category ? `<span style="color:var(--amber);font-family:var(--mono);font-size:10px;margin-right:6px;">[${log.category}]</span>` : ""}${getDetails(log)}</span>
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

loadLogs();
setInterval(loadLogs, 5000);