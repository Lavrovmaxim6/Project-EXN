let allUsers = [];
let allLogs = [];
let blockedUsers = [];
let searchTerm = "";
let sortBy = "events";
let expandedEmail = null;

const CHEVRON = `<svg class="row-chevron" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l4 4 4-4"/></svg>`;

function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000)    return "Just now";
  if (diff < 3600000)  return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  if (diff < 604800000) return Math.floor(diff / 86400000) + "d ago";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function buildUserProfiles(logs) {
  const map = {};
  logs.forEach(l => {
    const email = (l.user || "unknown").split("|")[0].trim();
    if (!map[email]) {
      map[email] = { email, devices: new Set(), total: 0, high: 0, medium: 0, low: 0, blocked: 0, sites: {}, lastActive: null, firstActive: null };
    }
    const u = map[email];
    const hostname = l.user && l.user.includes("|") ? l.user.split("|")[1].trim() : null;
    if (hostname) u.devices.add(hostname);
    u.total++;
    if (l.risk === "HIGH") u.high++;
    else if (l.risk === "MEDIUM") u.medium++;
    else u.low++;
    if (l.blocked) u.blocked++;
    if (l.site) u.sites[l.site] = (u.sites[l.site] || 0) + 1;
    const ts = l.timestamp ? new Date(l.timestamp) : null;
    if (ts) {
      if (!u.lastActive || ts > u.lastActive) u.lastActive = ts;
      if (!u.firstActive || ts < u.firstActive) u.firstActive = ts;
    }
  });

  return Object.values(map).map(u => ({
    ...u,
    devices: [...u.devices],
    riskPct: u.total > 0 ? Math.round((u.high / u.total) * 100) : 0,
    topSite: Object.entries(u.sites).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"
  }));
}

function sortUsers(users) {
  return [...users].sort((a, b) => {
    if (sortBy === "events")  return b.total - a.total;
    if (sortBy === "risk")    return b.riskPct - a.riskPct;
    if (sortBy === "blocked") return b.blocked - a.blocked;
    if (sortBy === "recent")  return (b.lastActive || 0) - (a.lastActive || 0);
    return 0;
  });
}

function renderDetailHTML(email) {
  const userLogs = allLogs
    .filter(l => (l.user || "").split("|")[0].trim() === email)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const total    = userLogs.length;
  const high     = userLogs.filter(l => l.risk === "HIGH").length;
  const medium   = userLogs.filter(l => l.risk === "MEDIUM").length;
  const blocked  = userLogs.filter(l => l.blocked).length;
  const riskPct  = total > 0 ? Math.round((high / total) * 100) : 0;

  const sites   = {};
  const devices = new Set();
  let firstSeen = null, lastSeen = null;
  userLogs.forEach(l => {
    if (l.site) sites[l.site] = (sites[l.site] || 0) + 1;
    const dev = l.user && l.user.includes("|") ? l.user.split("|")[1].trim() : null;
    if (dev) devices.add(dev);
    const ts = l.timestamp ? new Date(l.timestamp) : null;
    if (ts) {
      if (!firstSeen || ts < firstSeen) firstSeen = ts;
      if (!lastSeen  || ts > lastSeen)  lastSeen = ts;
    }
  });

  const topSite       = Object.entries(sites).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  const riskCardClass = riskPct >= 30 ? "red" : riskPct >= 10 ? "amber" : "";
  const shortDate     = d => d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  const eventRows = userLogs.slice(0, 100).map(l => {
    const detail = l.summary || (l.characters > 0 ? l.characters.toLocaleString() + " chars" : l.fileName || "—");
    return `
      <div class="detail-event-row">
        <span class="de-time">${formatTime(l.timestamp)}</span>
        <span class="de-site">${l.site || "—"}</span>
        <span><span class="action-pill">${l.action || "—"}</span></span>
        <span><span class="risk-pill risk-${l.risk}">${l.risk}</span></span>
        <span class="de-detail">${l.blocked ? '<span class="blocked-badge">BLOCKED</span>' : ""}${detail}</span>
      </div>`;
  }).join("");

  return `
    <div class="detail-cards">
      <div class="dcard">
        <div class="dcard-val">${total}</div>
        <div class="dcard-label">Total Events</div>
      </div>
      <div class="dcard red">
        <div class="dcard-val">${high}</div>
        <div class="dcard-label">High Risk</div>
      </div>
      <div class="dcard orange">
        <div class="dcard-val">${blocked}</div>
        <div class="dcard-label">Blocked Pastes</div>
      </div>
      <div class="dcard ${riskCardClass}">
        <div class="dcard-val">${riskPct}%</div>
        <div class="dcard-label">Risk Score</div>
      </div>
    </div>
    <div class="detail-meta">
      <div class="detail-meta-item">
        <span class="dmi-label">Top Site</span>
        <span class="dmi-val">${topSite}</span>
      </div>
      <div class="detail-meta-item">
        <span class="dmi-label">Medium Events</span>
        <span class="dmi-val">${medium}</span>
      </div>
      <div class="detail-meta-item">
        <span class="dmi-label">Devices</span>
        <span class="dmi-val">${devices.size || 1}</span>
      </div>
      <div class="detail-meta-item">
        <span class="dmi-label">First Seen</span>
        <span class="dmi-val">${shortDate(firstSeen)}</span>
      </div>
      <div class="detail-meta-item">
        <span class="dmi-label">Last Active</span>
        <span class="dmi-val">${lastSeen ? formatDate(lastSeen) : "—"}</span>
      </div>
    </div>
    <div class="detail-events-head">
      <span>Time</span><span>Site</span><span>Action</span><span>Risk</span><span>Details</span>
    </div>
    <div class="detail-events-body">
      ${eventRows || '<div class="de-empty">No events recorded</div>'}
    </div>`;
}

function renderUsers() {
  const list = document.getElementById("user-list");
  let filtered = allUsers.filter(u =>
    !searchTerm || u.email.toLowerCase().includes(searchTerm)
  );
  filtered = sortUsers(filtered);

  document.getElementById("user-count").textContent = filtered.length + " user" + (filtered.length !== 1 ? "s" : "");
  document.getElementById("topbar-sub").textContent = allUsers.length + " employees monitored";

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">No users found</div>';
    return;
  }

  list.innerHTML = filtered.map(u => {
    const initial     = u.email.charAt(0).toUpperCase();
    const isHighRisk  = u.riskPct >= 30;
    const barClass    = u.riskPct >= 30 ? "high" : u.riskPct >= 10 ? "med" : "";
    const riskRowClass = u.riskPct >= 30 ? " row-high" : u.riskPct >= 10 ? " row-med" : "";
    const deviceLabel = u.devices.length === 1 ? u.devices[0] : u.devices.length + " devices";
    const isBlocked   = blockedUsers.includes(u.email);
    const isExpanded  = expandedEmail === u.email;

    return `
      <div class="user-row col-template${isExpanded ? " expanded" : ""}${riskRowClass}" data-email="${u.email}">
        <div class="user-identity">
          <div class="avatar ${isHighRisk ? "high" : ""}">${initial}</div>
          <div class="identity-meta">
            <div class="identity-email">${u.email}</div>
            <div class="identity-devices">${deviceLabel}</div>
          </div>
          ${CHEVRON}
        </div>
        <div class="cell-num">${u.total}</div>
        <div class="cell-num ${u.high > 0 ? "danger" : ""}">${u.high}</div>
        <div class="cell-num ${u.blocked > 0 ? "warn" : ""}">${u.blocked}</div>
        <div class="risk-bar-wrap">
          <div class="risk-bar"><div class="risk-bar-fill ${barClass}" style="width:${u.riskPct}%"></div></div>
          <span class="risk-pct">${u.riskPct}%</span>
        </div>
        <div class="top-site">${u.topSite}</div>
        <div class="last-active">${formatDate(u.lastActive)}</div>
        <div class="restrict-cell">
          <label class="toggle-switch">
            <input type="checkbox" class="block-toggle" data-email="${u.email}" ${isBlocked ? "checked" : ""}>
            <div class="toggle-track"></div>
          </label>
        </div>
      </div>
      ${isExpanded ? `<div class="user-detail">${renderDetailHTML(u.email)}</div>` : ""}`;
  }).join("");
}

function load() {
  chrome.storage.local.get({ logs: [], blockedUsers: [] }, ({ logs, blockedUsers: bu }) => {
    allLogs = logs;
    blockedUsers = bu;
    allUsers = buildUserProfiles(logs);
    renderUsers();
  });
}

document.getElementById("search").addEventListener("input", e => {
  searchTerm = e.target.value.toLowerCase();
  renderUsers();
});

document.getElementById("sort").addEventListener("change", e => {
  sortBy = e.target.value;
  renderUsers();
});

document.getElementById("back-btn").addEventListener("click", () => {
  window.location.href = "dashboard.html";
});

document.getElementById("user-list").addEventListener("click", e => {
  if (e.target.closest(".restrict-cell")) return;
  const row = e.target.closest(".user-row");
  if (!row) return;
  const email = row.dataset.email;
  expandedEmail = expandedEmail === email ? null : email;
  renderUsers();
});

document.getElementById("user-list").addEventListener("change", e => {
  const toggle = e.target.closest(".block-toggle");
  if (!toggle) return;
  const email = toggle.dataset.email;
  chrome.storage.local.get({ blockedUsers: [] }, ({ blockedUsers: bu }) => {
    const updated = toggle.checked
      ? [...new Set([...bu, email])]
      : bu.filter(x => x !== email);
    blockedUsers = updated;
    chrome.storage.local.set({ blockedUsers: updated });
  });
});

load();
setInterval(load, 5000);
