const params = new URLSearchParams(location.search);
const targetEmail = params.get("email") || params.get("user") || "";

let userLogs = [];
let currentFilter = "ALL";
let currentSearch = "";

function getEmail(raw) { return (raw || "").split("|")[0].trim(); }

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "long" });
}

function formatTimeFull(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateShort(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

function top(obj) {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || "—";
}

function renderHeader() {
  const email = targetEmail.includes("|") ? getEmail(targetEmail) : targetEmail;
  document.getElementById("user-initial").textContent = email.charAt(0).toUpperCase();
  document.getElementById("user-email").textContent = email;
  document.title = email + " — Audit-AI";
}

function renderAll() {
  const total = userLogs.length;
  const high = userLogs.filter(l => l.risk === "HIGH").length;
  const blocked = userLogs.filter(l => l.blocked).length;
  const riskPct = total > 0 ? Math.round((high / total) * 100) : 0;

  // Unique days
  const days = new Set(userLogs.map(l => l.timestamp ? new Date(l.timestamp).toDateString() : null)).size;

  // Devices
  const devices = [...new Set(userLogs.map(l => l.user && l.user.includes("|") ? l.user.split("|")[1].trim() : null).filter(Boolean))];
  document.getElementById("user-devices").textContent = devices.length ? devices.join(", ") : "Device unknown";

  // Risk badge
  const badge = document.getElementById("risk-badge");
  if (riskPct >= 30) { badge.textContent = "High Risk User"; badge.className = "risk-badge high"; document.getElementById("user-initial").classList.add("high"); }
  else if (riskPct >= 10) { badge.textContent = "Medium Risk"; badge.className = "risk-badge med"; }
  else { badge.textContent = "Low Risk"; badge.className = "risk-badge low"; }

  // Stat cards
  document.getElementById("count-high").textContent = high;
  document.getElementById("count-blocked").textContent = blocked;
  document.getElementById("count-risk-pct").textContent = riskPct + "%";
  document.getElementById("count-total").textContent = total;
  document.getElementById("count-days").textContent = days;

  // Behavior profile
  const sites = {}, actions = {}, categories = {};
  let firstSeen = null, lastSeen = null;
  userLogs.forEach(l => {
    if (l.site) sites[l.site] = (sites[l.site] || 0) + 1;
    if (l.action) actions[l.action] = (actions[l.action] || 0) + 1;
    if (l.category) categories[l.category] = (categories[l.category] || 0) + 1;
    const ts = l.timestamp ? new Date(l.timestamp) : null;
    if (ts) {
      if (!firstSeen || ts < firstSeen) firstSeen = ts;
      if (!lastSeen  || ts > lastSeen)  lastSeen  = ts;
    }
  });

  document.getElementById("prof-top-site").textContent     = top(sites);
  document.getElementById("prof-top-action").textContent   = top(actions);
  document.getElementById("prof-top-category").textContent = top(categories) !== "—" ? top(categories) : "None classified yet";
  document.getElementById("prof-first-seen").textContent   = formatDateShort(firstSeen);
  document.getElementById("prof-last-seen").textContent    = formatDateShort(lastSeen);

  // Sites breakdown
  const siteBox = document.getElementById("site-breakdown");
  const sortedSites = Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 6);
  siteBox.innerHTML = sortedSites.length ? sortedSites.map(([site, count]) => `
    <div class="mini-row">
      <span class="mini-name">${site}</span>
      <span class="mini-count">${count}</span>
    </div>`).join("") : '<div class="mini-row"><span class="mini-count">No data</span></div>';

  // Categories breakdown
  const catBox = document.getElementById("category-breakdown");
  const sortedCats = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  catBox.innerHTML = sortedCats.length ? sortedCats.map(([cat, count]) => `
    <div class="mini-row">
      <span class="mini-name category">${cat}</span>
      <span class="mini-count">${count}</span>
    </div>`).join("") : '<div class="mini-row"><span class="mini-count">None detected yet</span></div>';

  renderEvents();
}

function renderEvents() {
  const list = document.getElementById("event-list");
  let filtered = userLogs.filter(log => {
    const matchFilter = currentFilter === "ALL" || log.risk === currentFilter;
    const term = currentSearch.toLowerCase();
    const matchSearch = !term ||
      (log.site || "").toLowerCase().includes(term) ||
      (log.action || "").toLowerCase().includes(term) ||
      (log.summary || "").toLowerCase().includes(term);
    return matchFilter && matchSearch;
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">No events match current filter</div>';
    return;
  }

  list.innerHTML = filtered.map(log => `
    <div class="event-row" data-ts="${log.timestamp}">
      <span class="cell ts">${formatTime(log.timestamp)} <span class="ts-dots" data-full="${formatTimeFull(log.timestamp)}">...</span><span class="ts-full" style="display:none;"></span></span>
      <span class="cell site">${log.site || "—"}</span>
      <span class="cell"><span class="action-pill">${log.action || "—"}</span></span>
      <span class="cell"><span class="risk-pill risk-${log.risk}">${log.risk}</span></span>
      <span class="cell detail">
        ${log.blocked ? '<span class="blocked-badge">BLOCKED</span>' : ""}
        ${log.category ? `<span style="color:var(--amber);font-family:var(--mono);font-size:10px;margin-right:6px;">[${log.category}]</span>` : ""}
        ${log.intent && log.intent !== "other" ? `<span style="display:inline-block;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:600;color:#0071e3;background:rgba(0,113,227,0.1);border:1px solid rgba(0,113,227,0.2);font-family:var(--mono);margin-right:6px;">${log.intent}</span>` : ""}
        ${log.output_risk === "HIGH" ? `<span style="display:inline-block;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700;color:#ff3b30;background:rgba(255,59,48,0.1);border:1px solid rgba(255,59,48,0.2);font-family:var(--mono);margin-right:6px;">out:HIGH</span>` : ""}
        ${getDetails(log)}
      </span>
    </div>`).join("");

  list.querySelectorAll(".ts-dots").forEach(dots => {
    dots.addEventListener("click", e => {
      e.stopPropagation();
      const full = dots.nextElementSibling;
      const isOpen = full.style.display !== "none";
      full.textContent = dots.dataset.full;
      full.style.display = isOpen ? "none" : "inline";
      dots.style.display = isOpen ? "inline" : "none";
    });
  });
}

function load() {
  chrome.storage.local.get({ logs: [] }, ({ logs }) => {
    // Match by email so we capture activity across all their devices
    const email = targetEmail.includes("|") ? getEmail(targetEmail) : targetEmail;
    userLogs = logs
      .filter(l => getEmail(l.user) === email)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    renderAll();
  });
}

document.querySelectorAll("[data-nav]").forEach(el => {
  el.addEventListener("click", () => { location.href = el.dataset.nav; });
});

renderHeader();

document.getElementById("back-btn").addEventListener("click", () => {
  window.location.href = "users.html";
});

const blockToggle = document.getElementById("block-user-toggle");
const blockStatus = document.getElementById("block-user-status");
const targetEmailClean = targetEmail.includes("|") ? targetEmail.split("|")[0].trim() : targetEmail;

function applyBlockUI(blocked) {
  blockToggle.checked = blocked;
  blockStatus.textContent = blocked ? "Blocked" : "Not blocked";
  blockStatus.classList.toggle("active", blocked);
}

chrome.storage.local.get({ blockedUsers: [] }, ({ blockedUsers }) => {
  applyBlockUI(blockedUsers.includes(targetEmailClean));
});

blockToggle.addEventListener("change", () => {
  chrome.storage.local.get({ blockedUsers: [] }, ({ blockedUsers }) => {
    const updated = blockToggle.checked
      ? [...new Set([...blockedUsers, targetEmailClean])]
      : blockedUsers.filter(e => e !== targetEmailClean);
    chrome.storage.local.set({ blockedUsers: updated });
    applyBlockUI(blockToggle.checked);
  });
});

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderEvents();
  });
});

document.getElementById("search").addEventListener("input", e => {
  currentSearch = e.target.value;
  renderEvents();
});

load();
setInterval(load, 5000);
