let allLogs = [];
let currentFilter = "ALL";
let currentSearch = "";

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString();
}

function getDetails(log) {
  const parts = [];
  if (log.characters > 0) parts.push(log.characters.toLocaleString() + " chars");
  if (log.fileName) parts.push(log.fileName);
  if (log.fileSize) parts.push((log.fileSize / 1024).toFixed(1) + " KB");
  if (log.source === "history") parts.push("from history");
  return parts.join(" · ") || "—";
}

function renderEvents() {
  const list = document.getElementById("event-list");
  const count = document.getElementById("event-count");

  let filtered = allLogs.filter(log => {
    const matchFilter = currentFilter === "ALL" || log.risk === currentFilter;
    const searchTerm = currentSearch.toLowerCase();
    const matchSearch = !searchTerm ||
      (log.site || "").toLowerCase().includes(searchTerm) ||
      (log.user || "").toLowerCase().includes(searchTerm) ||
      (log.action || "").toLowerCase().includes(searchTerm);
    return matchFilter && matchSearch;
  });

  count.textContent = filtered.length + " events shown";

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state">NO EVENTS MATCH CURRENT FILTER</div>';
    return;
  }

  list.innerHTML = filtered.map(log => `
    <div class="event-row">
      <span class="cell muted">${formatTime(log.timestamp)}</span>
      <span class="cell user" title="${log.user || 'unknown'}">${(log.user || "unknown").split("|")[0].trim()}</span>
      <span class="cell site">${log.site || "—"}</span>
      <span class="cell"><span class="action-badge">${log.action || "—"}</span></span>
      <span class="cell"><span class="risk-badge risk-${log.risk}">${log.risk}</span></span>
      <span class="cell muted">${getDetails(log)}</span>
    </div>
  `).join("");
}

function updateStats() {
  document.getElementById("count-high").textContent = allLogs.filter(l => l.risk === "HIGH").length;
  document.getElementById("count-medium").textContent = allLogs.filter(l => l.risk === "MEDIUM").length;
  document.getElementById("count-low").textContent = allLogs.filter(l => l.risk === "LOW").length;
  document.getElementById("count-total").textContent = allLogs.length;
  document.getElementById("last-updated").textContent = "UPDATED " + new Date().toLocaleTimeString();
}

function loadLogs() {
  chrome.storage.local.get({ logs: [] }, ({ logs }) => {
    allLogs = logs;
    updateStats();
    renderEvents();
  });
}

// Filter buttons
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderEvents();
  });
});

// Search
document.getElementById("search").addEventListener("input", (e) => {
  currentSearch = e.target.value;
  renderEvents();
});

// Clear logs
document.getElementById("clear-btn").addEventListener("click", () => {
  if (confirm("Clear all logs? This cannot be undone.")) {
    chrome.storage.local.set({ logs: [] }, () => {
      allLogs = [];
      updateStats();
      renderEvents();
    });
  }
});

// Auto refresh every 5 seconds
loadLogs();
setInterval(loadLogs, 5000);
