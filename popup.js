chrome.storage.local.get({ logs: [] }, ({ logs }) => {
  const list = document.getElementById("log-list");
  const count = document.getElementById("count");
  count.textContent = logs.length + " events";
  if (logs.length === 0) return;
  list.innerHTML = logs.slice(0, 50).map(log => {
    const chars = log.characters > 0 ? log.characters + " chars · " : "";
    const file = log.fileName ? log.fileName + " · " : "";
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `
      <div class="log-item">
        <div class="log-top">
          <span class="site">${log.site} — ${log.action}</span>
          <span class="risk ${log.risk}">${log.risk}</span>
        </div>
        <div class="log-bottom">${chars}${file}${time}</div>
      </div>
    `;
  }).join("");
});
