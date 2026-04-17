const qs = (id) => document.getElementById(id);

const els = {
  form: qs("crawlerForm"),
  statusText: qs("statusText"),
  statusMeta: qs("statusMeta"),
  logList: qs("logList"),
  filesBody: qs("filesBody"),
  stats: qs("stats"),
  toast: qs("toast"),
  crawlerType: qs("crawlerType"),
  loginType: qs("loginType"),
  keywordsGroup: qs("keywordsGroup"),
  detailGroup: qs("detailGroup"),
  creatorGroup: qs("creatorGroup"),
  cookiesGroup: qs("cookiesGroup"),
  startBtn: qs("startBtn"),
  stopBtn: qs("stopBtn"),
  syncStatusBtn: qs("syncStatusBtn"),
  checkEnvBtn: qs("checkEnvBtn"),
  reconnectLogsBtn: qs("reconnectLogsBtn"),
  clearLogsBtn: qs("clearLogsBtn"),
  refreshFilesBtn: qs("refreshFilesBtn"),
  refreshStatsBtn: qs("refreshStatsBtn"),
};

let logSocket;
let statusSocket;
const MAX_LOG_ROWS = 300;

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isSearchContentsPath(path) {
  return String(path || "").toLowerCase().includes("search_contents");
}

function isSearchCommentsPath(path) {
  return String(path || "").toLowerCase().includes("search_comments");
}

function getRunToken(path) {
  const normalized = String(path || "").split("/").pop() || "";
  const match = normalized.match(/^search_(?:contents|comments)_(.+)\.(json|jsonl|csv|xlsx|xls)$/i);
  return match ? match[1] : null;
}

function buildDisplayRows(files) {
  const boardGroups = new Map();
  const normalRows = [];

  for (const f of files || []) {
    const path = f.path || "";
    const token = getRunToken(path);
    if (token && (isSearchContentsPath(path) || isSearchCommentsPath(path))) {
      if (!boardGroups.has(token)) {
        boardGroups.set(token, { token, contents: null, comments: null, modified_at: 0, size: 0 });
      }
      const group = boardGroups.get(token);
      if (isSearchContentsPath(path)) group.contents = f;
      if (isSearchCommentsPath(path)) group.comments = f;
      group.modified_at = Math.max(group.modified_at, Number(f.modified_at || 0));
      group.size += Number(f.size || 0);
      continue;
    }
    normalRows.push({ kind: "file", file: f, modified_at: Number(f.modified_at || 0) });
  }

  const boardRows = [];
  for (const group of boardGroups.values()) {
    if (!group.contents) continue;
    boardRows.push({
      kind: "board",
      token: group.token,
      contents: group.contents,
      comments: group.comments,
      modified_at: group.modified_at,
      size: group.size,
    });
  }

  boardRows.sort((a, b) => b.modified_at - a.modified_at);
  normalRows.sort((a, b) => b.modified_at - a.modified_at);
  return [...boardRows, ...normalRows];
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function formatBytes(size) {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let n = size;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[u]}`;
}

function formatDate(ts) {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString("zh-CN", { hour12: false });
}

function setStatus(status, meta = "") {
  const normalized = status || "idle";
  els.statusText.textContent = normalized;
  els.statusText.className = `status ${normalized}`;
  els.statusMeta.textContent = meta || "";
}

function appendLog(line) {
  const div = document.createElement("div");
  const level = line.level || "info";
  div.className = `log-item ${level}`;
  div.innerHTML = `[${escapeHtml(line.timestamp || "--:--:--")}] ${escapeHtml(line.message || "")}`;
  els.logList.appendChild(div);

  while (els.logList.childElementCount > MAX_LOG_ROWS) {
    els.logList.removeChild(els.logList.firstChild);
  }
  els.logList.scrollTop = els.logList.scrollHeight;
}

function connectLogWs() {
  if (logSocket) logSocket.close();
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  logSocket = new WebSocket(`${protocol}://${window.location.host}/api/ws/logs`);

  logSocket.onopen = () => toast("日志连接已建立");
  logSocket.onmessage = (ev) => {
    if (ev.data === "ping") {
      try { logSocket.send("pong"); } catch {}
      return;
    }

    try {
      const payload = JSON.parse(ev.data);
      if (payload && payload.message) appendLog(payload);
    } catch {
      appendLog({ timestamp: "--:--:--", level: "info", message: ev.data });
    }
  };

  logSocket.onclose = () => {
    toast("日志连接断开，3秒后重连");
    window.setTimeout(connectLogWs, 3000);
  };

  logSocket.onerror = () => {
    toast("日志连接异常");
  };
}

function connectStatusWs() {
  if (statusSocket) statusSocket.close();
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  statusSocket = new WebSocket(`${protocol}://${window.location.host}/api/ws/status`);

  statusSocket.onmessage = (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      const meta = payload.started_at
        ? `平台: ${payload.platform || "xhs"} | 模式: ${payload.crawler_type || "-"} | 开始: ${new Date(payload.started_at).toLocaleString("zh-CN", { hour12: false })}`
        : "等待任务启动";
      setStatus(payload.status, meta);
    } catch {
      // ignore invalid message
    }
  };

  statusSocket.onclose = () => window.setTimeout(connectStatusWs, 3000);
}

function updateModeFields() {
  const mode = els.crawlerType.value;
  els.keywordsGroup.classList.toggle("hidden", mode !== "search");
  els.detailGroup.classList.toggle("hidden", mode !== "detail");
  els.creatorGroup.classList.toggle("hidden", mode !== "creator");
}

function updateLoginFields() {
  const login = els.loginType.value;
  els.cookiesGroup.classList.toggle("hidden", login !== "cookie");
}

function getFormData() {
  const raw = new FormData(els.form);
  return {
    platform: "xhs",
    login_type: String(raw.get("login_type") || "cookie"),
    crawler_type: String(raw.get("crawler_type") || "search"),
    keywords: String(raw.get("keywords") || "").trim(),
    specified_ids: String(raw.get("specified_ids") || "").trim(),
    creator_ids: String(raw.get("creator_ids") || "").trim(),
    start_page: Math.max(1, Number(raw.get("start_page") || 1)),
    crawler_max_notes_count: Math.max(1, Number(raw.get("crawler_max_notes_count") || 15)),
    enable_comments: raw.get("enable_comments") === "on",
    enable_sub_comments: raw.get("enable_sub_comments") === "on",
    save_option: "json",
    cookies: String(raw.get("cookies") || "").trim(),
    headless: true,
  };
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  let body = {};
  try {
    body = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = body?.detail || body?.message || `请求失败: ${res.status}`;
    throw new Error(msg);
  }

  return body;
}

async function deleteDataFile(path) {
  if (!path) return;
  await api(`/api/data/files/${encodeURI(path)}`, { method: "DELETE", headers: {} });
}

async function bindFileDeleteActions() {
  els.filesBody.querySelectorAll(".js-del-file").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const path = decodeURIComponent(btn.dataset.path || "");
      if (!path) return;
      if (!window.confirm(`确认删除文件？\n${path}`)) return;

      btn.disabled = true;
      try {
        await deleteDataFile(path);
        toast("文件已删除");
        await refreshFiles();
        await refreshStats();
      } catch (err) {
        toast(`删除失败: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  });

  els.filesBody.querySelectorAll(".js-del-board").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const contentsPath = decodeURIComponent(btn.dataset.contents || "");
      const commentsPath = decodeURIComponent(btn.dataset.comments || "");
      if (!contentsPath) return;
      if (!window.confirm(`确认删除该批次文件？\n${contentsPath}${commentsPath ? `\n${commentsPath}` : ""}`)) return;

      btn.disabled = true;
      try {
        await deleteDataFile(contentsPath);
        if (commentsPath) {
          try {
            await deleteDataFile(commentsPath);
          } catch {
            // ignore comment deletion failure to keep contents deletion effective
          }
        }
        toast("批次文件已删除");
        await refreshFiles();
        await refreshStats();
      } catch (err) {
        toast(`删除失败: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function startCrawler() {
  const payload = getFormData();

  if (payload.crawler_type === "search" && !payload.keywords) {
    toast("search 模式必须填写关键词");
    return;
  }
  if (payload.crawler_type === "detail" && !payload.specified_ids) {
    toast("detail 模式必须填写指定笔记 ID/URL");
    return;
  }
  if (payload.crawler_type === "creator" && !payload.creator_ids) {
    toast("creator 模式必须填写指定博主 ID/URL");
    return;
  }

  els.startBtn.disabled = true;
  try {
    const res = await api("/api/crawler/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast(res.message || "任务已启动");
    await refreshStatus();
  } catch (err) {
    toast(err.message);
  } finally {
    els.startBtn.disabled = false;
  }
}

async function stopCrawler() {
  els.stopBtn.disabled = true;
  try {
    const res = await api("/api/crawler/stop", { method: "POST", body: "{}" });
    toast(res.message || "任务已停止");
    await refreshStatus();
  } catch (err) {
    toast(err.message);
  } finally {
    els.stopBtn.disabled = false;
  }
}

async function refreshStatus() {
  try {
    const status = await api("/api/crawler/status", { method: "GET", headers: {} });
    const meta = status.started_at
      ? `平台: ${status.platform || "xhs"} | 模式: ${status.crawler_type || "-"} | 开始: ${new Date(status.started_at).toLocaleString("zh-CN", { hour12: false })}`
      : "等待任务启动";
    setStatus(status.status, meta);
  } catch (err) {
    toast(`状态刷新失败: ${err.message}`);
  }
}

async function checkEnv() {
  try {
    const result = await api("/api/env/check", { method: "GET", headers: {} });
    toast(result.success ? "环境检查通过" : `环境检查失败: ${result.message}`);
  } catch (err) {
    toast(`环境检查失败: ${err.message}`);
  }
}

async function refreshFiles() {
  try {
    const data = await api("/api/data/files?platform=xhs", { method: "GET", headers: {} });
    els.filesBody.innerHTML = "";
    const rows = buildDisplayRows(data.files || []);

    for (const row of rows) {
      const tr = document.createElement("tr");
      if (row.kind === "board") {
        const f = row.contents;
        const fileLabel = `看板批次 ${row.token}`;
        const commentsPath = row.comments?.path || "";
        tr.innerHTML = `
          <td>${escapeHtml(fileLabel)}</td>
          <td>board</td>
          <td>${f.record_count ?? "-"}</td>
          <td>${formatBytes(row.size)}</td>
          <td>${formatDate(row.modified_at)}</td>
          <td>
            <a class="ghost" href="/board?file=${encodeURIComponent(f.path)}">进入看板</a>
            <a class="ghost" href="/api/data/download/${encodeURI(f.path)}" target="_blank" rel="noreferrer">下载内容</a>
            <button type="button" class="ghost js-del-board" data-contents="${encodeURIComponent(f.path)}" data-comments="${encodeURIComponent(commentsPath)}">删除批次</button>
          </td>
        `;
        els.filesBody.appendChild(tr);
        continue;
      }

      const f = row.file;
      tr.innerHTML = `
        <td>${escapeHtml(f.path)}</td>
        <td>${escapeHtml(f.type || "-")}</td>
        <td>${f.record_count ?? "-"}</td>
        <td>${formatBytes(f.size)}</td>
        <td>${formatDate(f.modified_at)}</td>
        <td>
          <a class="ghost" href="/api/data/download/${encodeURI(f.path)}" target="_blank" rel="noreferrer">下载</a>
          <button type="button" class="ghost js-del-file" data-path="${encodeURIComponent(f.path)}">删除</button>
        </td>
      `;
      els.filesBody.appendChild(tr);
    }

    await bindFileDeleteActions();

    if (!rows || rows.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="6">暂无 xhs 数据文件</td>';
      els.filesBody.appendChild(tr);
    }
  } catch (err) {
    toast(`文件列表加载失败: ${err.message}`);
  }
}

async function refreshStats() {
  try {
    const stats = await api("/api/data/stats", { method: "GET", headers: {} });
    const xhsCount = (stats.by_platform && stats.by_platform.xhs) || 0;
    els.stats.innerHTML = `
      <span>总文件: <b>${stats.total_files ?? 0}</b></span>
      <span>总大小: <b>${formatBytes(stats.total_size || 0)}</b></span>
      <span>XHS 文件: <b>${xhsCount}</b></span>
    `;
  } catch (err) {
    toast(`统计加载失败: ${err.message}`);
  }
}

function bindEvents() {
  els.crawlerType.addEventListener("change", updateModeFields);
  els.loginType.addEventListener("change", updateLoginFields);
  els.startBtn.addEventListener("click", startCrawler);
  els.stopBtn.addEventListener("click", stopCrawler);
  els.syncStatusBtn.addEventListener("click", refreshStatus);
  els.checkEnvBtn.addEventListener("click", checkEnv);
  els.reconnectLogsBtn.addEventListener("click", connectLogWs);
  els.clearLogsBtn.addEventListener("click", () => { els.logList.innerHTML = ""; });
  els.refreshFilesBtn.addEventListener("click", refreshFiles);
  els.refreshStatsBtn.addEventListener("click", refreshStats);
}

async function init() {
  updateModeFields();
  updateLoginFields();
  bindEvents();
  connectLogWs();
  connectStatusWs();
  await Promise.all([refreshStatus(), refreshStats(), refreshFiles()]);
}

init();
