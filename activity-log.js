let allLogs = [];

const AI_TOOLS = [
  { label: "ChatGPT", patterns: ["chatgpt", "openai"],     color: "#10a37f" },
  { label: "Claude",  patterns: ["claude", "anthropic"],   color: "#E8825A" },
  { label: "Gemini",  patterns: ["gemini", "bard.google"], color: "#4285f4" },
  { label: "Copilot", patterns: ["copilot"],               color: "#7c3aed" },
];

function load() {
  chrome.storage.local.get({ logs: [] }, ({ logs }) => {
    allLogs = logs;
    document.getElementById("topbar-sub").textContent =
      allLogs.length.toLocaleString() + " total events";
    document.getElementById("last-updated").textContent =
      "Updated " + new Date().toLocaleTimeString();
    renderAll();
  });
}

function renderAll() {
  renderStats();
  renderBigDonut();
  renderSmallDonut("risk-canvas",    "risk-legend",    getRiskSegments());
  renderSmallDonut("blocked-canvas", "blocked-legend", getBlockedSegments());
  renderHorizBars("sites-bars",   getTopSites(),   "#0071e3");
  renderHorizBars("users-bars",   getTopUsers(),   "#7c3aed");
  renderHorizBars("actions-bars", getTopActions(), "#ff9f0a");
}

/* ── Summary stats ── */

function renderStats() {
  const users = new Set(allLogs.map(l => (l.user || "").split("|")[0].trim())).size;
  document.getElementById("s-total").textContent   = allLogs.length.toLocaleString();
  document.getElementById("s-high").textContent    = allLogs.filter(l => l.risk === "HIGH").length.toLocaleString();
  document.getElementById("s-blocked").textContent = allLogs.filter(l => l.blocked).length.toLocaleString();
  document.getElementById("s-users").textContent   = users.toLocaleString();
}

/* ── Data helpers ── */

function getToolSegments() {
  const counts = {};
  AI_TOOLS.forEach(t => { counts[t.label] = 0; });
  let other = 0;
  allLogs.forEach(l => {
    const site = (l.site || "").toLowerCase();
    if (!site) return;
    let matched = false;
    for (const t of AI_TOOLS) {
      if (t.patterns.some(p => site.includes(p))) { counts[t.label]++; matched = true; break; }
    }
    if (!matched) other++;
  });
  const segs = AI_TOOLS.map(t => ({ label: t.label, count: counts[t.label], color: t.color }));
  if (other > 0) segs.push({ label: "Other", count: other, color: "#aeaeb2" });
  return segs;
}

function getRiskSegments() {
  return [
    { label: "High",   count: allLogs.filter(l => l.risk === "HIGH").length,   color: "#ff3b30" },
    { label: "Medium", count: allLogs.filter(l => l.risk === "MEDIUM").length, color: "#ff9f0a" },
    { label: "Low",    count: allLogs.filter(l => l.risk === "LOW").length,    color: "#34c759" },
  ];
}

function getBlockedSegments() {
  const blocked = allLogs.filter(l => l.blocked).length;
  return [
    { label: "Blocked", count: blocked,                   color: "#ff3b30" },
    { label: "Allowed", count: allLogs.length - blocked,  color: "#34c759" },
  ];
}

function getTopSites() {
  const counts = {};
  allLogs.forEach(l => { if (l.site) counts[l.site] = (counts[l.site] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
}

function getTopUsers() {
  const counts = {};
  allLogs.forEach(l => {
    const u = (l.user || "unknown").split("|")[0].trim();
    counts[u] = (counts[u] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
}

function getTopActions() {
  const counts = {};
  allLogs.forEach(l => { if (l.action) counts[l.action] = (counts[l.action] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

/* ── Canvas helper: HiDPI-aware context ── */

function hiDPI(canvas, cssSize) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = cssSize * dpr;
  canvas.height = cssSize * dpr;
  canvas.style.width  = cssSize + "px";
  canvas.style.height = cssSize + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return { ctx, half: cssSize / 2 };
}

/* ── Donut drawing ── */

function drawDonut(ctx, cx, cy, outerR, innerR, segments) {
  const total = segments.reduce((a, s) => a + s.count, 0);

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.fillStyle = "#e8e8ed";
    ctx.fill("evenodd");
    ctx.fillStyle = "#aeaeb2";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No data", cx, cy);
    return total;
  }

  const active = segments.filter(s => s.count > 0).length;
  const gap = active > 1 ? 0.04 : 0;
  let angle = -Math.PI / 2;

  segments.forEach(seg => {
    if (seg.count === 0) return;
    const slice = (seg.count / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, angle + gap, angle + slice - gap);
    ctx.arc(cx, cy, innerR, angle + slice - gap, angle + gap, true);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    angle += slice;
  });

  // White center
  ctx.beginPath();
  ctx.arc(cx, cy, innerR - 1, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  return total;
}

/* ── Big AI Tool donut ── */

function renderBigDonut() {
  const canvas = document.getElementById("tools-canvas");
  if (!canvas) return;
  const CSS = 160;
  const { ctx, half: cx } = hiDPI(canvas, CSS);
  const cy = cx;
  const segments = getToolSegments();
  const total = drawDonut(ctx, cx, cy, cx - 10, (cx - 10) * 0.58, segments);

  // Center label
  if (total > 0) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1d1d1f";
    ctx.font = "bold 26px -apple-system, sans-serif";
    ctx.fillText(total.toLocaleString(), cx, cy - 10);
    ctx.font = "11px -apple-system, sans-serif";
    ctx.fillStyle = "#aeaeb2";
    ctx.fillText("events", cx, cy + 11);
  }

  // Legend
  const legend = document.getElementById("tools-legend");
  if (!legend) return;
  const max = Math.max(...segments.map(s => s.count), 1);
  legend.innerHTML = segments.map(seg => {
    const pct = total ? Math.round((seg.count / total) * 100) : 0;
    const barW = total ? Math.round((seg.count / max) * 100) : 0;
    return `
      <div class="big-leg-row">
        <div class="big-leg-swatch" style="background:${seg.color}"></div>
        <div class="big-leg-name">${seg.label}</div>
        <div class="big-leg-track">
          <div class="big-leg-fill" style="width:${barW}%;background:${seg.color}"></div>
        </div>
        <div class="big-leg-pct">${pct}%</div>
        <div class="big-leg-count">${seg.count.toLocaleString()}</div>
      </div>`;
  }).join("");
}

/* ── Small donut (Risk / Blocked) ── */

function renderSmallDonut(canvasId, legendId, segments) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const CSS = 130;
  const { ctx, half: cx } = hiDPI(canvas, CSS);
  const cy = cx;
  const outerR = cx - 8;
  const innerR = outerR * 0.58;
  const total = drawDonut(ctx, cx, cy, outerR, innerR, segments);

  if (total > 0) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1d1d1f";
    ctx.font = "bold 18px -apple-system, sans-serif";
    ctx.fillText(total.toLocaleString(), cx, cy - 7);
    ctx.font = "10px -apple-system, sans-serif";
    ctx.fillStyle = "#aeaeb2";
    ctx.fillText("total", cx, cy + 8);
  }

  const legend = document.getElementById(legendId);
  if (!legend) return;
  legend.innerHTML = segments.map(seg => {
    const pct = total ? Math.round((seg.count / total) * 100) : 0;
    return `
      <div class="small-leg-row">
        <div class="small-leg-left">
          <div class="small-leg-dot" style="background:${seg.color}"></div>
          <div class="small-leg-name">${seg.label}</div>
        </div>
        <div class="small-leg-right">
          <div class="small-leg-pct">${pct}%</div>
          <div class="small-leg-count">${seg.count.toLocaleString()}</div>
        </div>
      </div>`;
  }).join("");
}

/* ── Horizontal bar lists ── */

function renderHorizBars(containerId, entries, color) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (entries.length === 0) {
    el.innerHTML = '<div class="empty-msg">No data yet</div>';
    return;
  }
  const max = entries[0][1];
  el.innerHTML = entries.map(([name, count]) => {
    const pct = max ? Math.round((count / max) * 100) : 0;
    return `
      <div class="hbar-item">
        <div class="hbar-top">
          <span class="hbar-name" title="${name}">${name}</span>
          <span class="hbar-count">${count.toLocaleString()}</span>
        </div>
        <div class="hbar-track">
          <div class="hbar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join("");
}

document.getElementById("back-btn").addEventListener("click", () => {
  window.location.href = "dashboard.html";
});

load();
setInterval(load, 5000);
