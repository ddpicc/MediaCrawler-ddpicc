const q = (id) => document.getElementById(id);

const els = {
  dateFilter: q("dateFilter"),
  sortBy: q("sortBy"),
  resetBtn: q("resetBtn"),
  summaryText: q("summaryText"),
  sourceFile: q("sourceFile"),
  cardGrid: q("cardGrid"),
  tpl: q("cardTpl"),
  commentTpl: q("commentTpl"),
  detailTitle: q("detailTitle"),
  detailLink: q("detailLink"),
  detailMeta: q("detailMeta"),
  detailDesc: q("detailDesc"),
  commentsMeta: q("commentsMeta"),
  commentsList: q("commentsList"),
};

let allItems = [];
let selectedNoteId = "";
let sourceContentsFile = "";

function parseQuery() {
  const p = new URLSearchParams(window.location.search);
  return {
    file: p.get("file") || "",
    limit: Number(p.get("limit") || 300),
  };
}

function fmtTime(ts) {
  if (!ts) return "-";
  return new Date(Number(ts)).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtNum(n) {
  const v = Number(n || 0);
  if (v >= 10000) return `${(v / 10000).toFixed(1)}w`;
  return String(v);
}

function dayDiff(ts) {
  if (!ts) return 9999;
  const now = Date.now();
  const t = Number(ts);
  return Math.floor((now - t) / (24 * 3600 * 1000));
}

function toHttpsUrl(url) {
  if (!url) return "";
  const s = String(url).trim();
  if (!s) return "";
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("http://")) return `https://${s.slice(7)}`;
  return s;
}

function toProxyImageUrl(url) {
  const raw = toHttpsUrl(url);
  if (!raw) return "";
  const endpoint = new URL("/api/data/proxy_image", window.location.origin);
  endpoint.searchParams.set("url", raw);
  return endpoint.toString();
}

function createMetric(k, v) {
  const node = document.createElement("div");
  node.className = "metric";
  node.innerHTML = `<span class="k">${k}</span><span class="v">${fmtNum(v)}</span>`;
  return node;
}

function getFilteredItems() {
  const dateKey = els.dateFilter.value;
  const sortBy = els.sortBy.value || "time_desc";

  const filtered = allItems.filter((item) => {
    const d = dayDiff(item.time);
    if (dateKey === "today" && d > 0) return false;
    if (dateKey === "7d" && d > 7) return false;
    if (dateKey === "30d" && d > 30) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === "liked_desc") return Number(b.liked_count || 0) - Number(a.liked_count || 0);
    if (sortBy === "comment_desc") return Number(b.comment_count || 0) - Number(a.comment_count || 0);
    if (sortBy === "share_desc") return Number(b.share_count || 0) - Number(a.share_count || 0);
    if (sortBy === "collect_desc") return Number(b.collected_count || 0) - Number(a.collected_count || 0);
    return Number(b.time || 0) - Number(a.time || 0);
  });

  return filtered;
}

function mountCard(item) {
  const frag = els.tpl.content.cloneNode(true);
  const root = frag.querySelector(".card");
  const title = frag.querySelector(".title");
  const desc = frag.querySelector(".desc");
  const time = frag.querySelector(".time");
  const cover = frag.querySelector(".cover");
  const prev = frag.querySelector(".prev");
  const next = frag.querySelector(".next");
  const counter = frag.querySelector(".counter");
  const metrics = frag.querySelector(".metrics");

  const images = Array.isArray(item.image_urls) && item.image_urls.length > 0 ? item.image_urls : [item.cover || ""];
  let idx = 0;

  if (String(item.note_id) === String(selectedNoteId)) root.classList.add("active");

  title.textContent = item.title || "（无标题）";
  desc.textContent = item.desc || "";
  time.textContent = fmtTime(item.time);

  function syncImage() {
    const src = toProxyImageUrl(images[idx] || "");
    cover.src = src;
    cover.style.opacity = src ? "1" : "0.35";
    counter.textContent = `${idx + 1}/${images.length}`;
    prev.style.display = images.length > 1 ? "block" : "none";
    next.style.display = images.length > 1 ? "block" : "none";
  }

  cover.addEventListener("error", () => {
    cover.style.opacity = "0.35";
  });

  prev.addEventListener("click", (ev) => {
    ev.stopPropagation();
    idx = (idx - 1 + images.length) % images.length;
    syncImage();
  });
  next.addEventListener("click", (ev) => {
    ev.stopPropagation();
    idx = (idx + 1) % images.length;
    syncImage();
  });

  root.addEventListener("click", () => selectNote(item));

  metrics.appendChild(createMetric("点赞", item.liked_count));
  metrics.appendChild(createMetric("收藏", item.collected_count));
  metrics.appendChild(createMetric("评论", item.comment_count));
  metrics.appendChild(createMetric("分享", item.share_count));

  syncImage();
  return root;
}

async function loadComments(noteId) {
  els.commentsMeta.textContent = "评论加载中...";
  els.commentsList.innerHTML = "";

  const url = new URL("/api/data/search_comments", window.location.origin);
  url.searchParams.set("contents_file_path", sourceContentsFile);
  url.searchParams.set("note_id", String(noteId));
  url.searchParams.set("limit", "500");

  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`加载失败: ${res.status}`);
    const data = await res.json();

    const comments = data.items || [];
    els.commentsMeta.textContent = `评论 ${comments.length} 条`;

    if (comments.length === 0) {
      els.commentsList.innerHTML = '<div class="empty">该笔记暂无评论或本次运行未抓取评论</div>';
      return;
    }

    comments.forEach((comment) => {
      const frag = els.commentTpl.content.cloneNode(true);
      frag.querySelector(".comment-user").textContent = comment.nickname || "匿名用户";
      frag.querySelector(".comment-time").textContent = fmtTime(comment.create_time);
      frag.querySelector(".comment-content").textContent = comment.content || "";
      frag.querySelector(".comment-like").textContent = `👍 ${fmtNum(comment.like_count)}`;
      frag.querySelector(".comment-sub").textContent = `回复 ${fmtNum(comment.sub_comment_count)}`;
      els.commentsList.appendChild(frag);
    });
  } catch (err) {
    els.commentsList.innerHTML = `<div class="empty">评论加载失败: ${String(err.message || err)}</div>`;
    els.commentsMeta.textContent = "评论加载失败";
  }
}

function fillDetail(item) {
  els.detailTitle.textContent = item.title || "（无标题）";
  els.detailLink.href = item.note_url || "#";
  els.detailLink.style.pointerEvents = item.note_url ? "auto" : "none";
  els.detailMeta.textContent = `${fmtTime(item.time)} · ${item.nickname || "未知作者"} · 关键词: ${item.source_keyword || "-"}`;

  els.detailDesc.textContent = item.desc || "";
}

function selectNote(item) {
  selectedNoteId = String(item.note_id || "");
  fillDetail(item);
  renderCards();
  loadComments(selectedNoteId);
}

function renderCards() {
  const items = getFilteredItems();
  els.cardGrid.innerHTML = "";

  if (items.length === 0) {
    els.cardGrid.innerHTML = '<div class="empty">当前筛选条件下没有数据</div>';
    els.summaryText.textContent = `已显示 0/${allItems.length} 篇`;
    return;
  }

  items.forEach((item) => els.cardGrid.appendChild(mountCard(item)));
  els.summaryText.textContent = `已显示 ${items.length}/${allItems.length} 篇`;

  const stillExists = items.some((it) => String(it.note_id) === String(selectedNoteId));
  if (!stillExists) {
    selectNote(items[0]);
  }
}

async function init() {
  const query = parseQuery();
  const url = new URL("/api/data/search_contents", window.location.origin);
  if (query.file) url.searchParams.set("file_path", query.file);
  if (query.limit) url.searchParams.set("limit", String(query.limit));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`加载失败: ${res.status}`);
  const data = await res.json();

  allItems = data.items || [];
  sourceContentsFile = data.source_file || query.file || "";
  els.sourceFile.textContent = `当前内容来源：${sourceContentsFile || "无"}`;

  els.dateFilter.addEventListener("change", renderCards);
  els.sortBy.addEventListener("change", renderCards);
  els.resetBtn.addEventListener("click", () => {
    els.dateFilter.value = "all";
    els.sortBy.value = "time_desc";
    renderCards();
  });

  renderCards();
}

init().catch((err) => {
  els.cardGrid.innerHTML = `<div class="empty">${String(err.message || err)}</div>`;
});
