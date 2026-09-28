// Shared helpers for all three dashboards (client portal, operator,
// editor). Inlined by build.py — keep this framework-free and
// dependency-free (no CDN, no bundler).

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function fmtNum(n) {
  if (n == null) return "—";
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

// YYYY-MM-DD in the viewer's own time zone. toISOString() is UTC, which
// puts "today" a day ahead in the evening (US) or a day behind in the
// morning (east of UTC) — every date in this system is a plain local date.
function localISODate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function todayISO() { return localISODate(new Date()); }
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return localISODate(new Date(y, m - 1, d + days));
}

// Month grid shared by every page's calendar. byDay: { "YYYY-MM-DD": [item] },
// chipHtml(item) renders one entry. state.offset is months from the current
// one; the ‹ › buttons change it and call rerender().
function renderMonthCalendar(container, byDay, chipHtml, state, rerender) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + (state.offset || 0), 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const title = first.toLocaleString(undefined, { month: "long", year: "numeric" });
  let html = `<div style="grid-column:1/-1;display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <button data-cal="-1">‹</button><b style="min-width:150px;text-align:center">${escapeHtml(title)}</b><button data-cal="1">›</button>
      ${state.offset ? `<button data-cal="0">Today</button>` : ""}
    </div>`;
  html += ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < first.getDay(); i++) html += `<div></div>`;
  const today = todayISO();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = localISODate(new Date(first.getFullYear(), first.getMonth(), day));
    const items = byDay[dateStr] || [];
    html += `<div class="cal-cell ${dateStr === today ? "today" : ""}"><div class="daynum">${day}</div>${items.map(chipHtml).join("")}</div>`;
  }
  container.innerHTML = html;
  container.querySelectorAll("[data-cal]").forEach(b => b.onclick = () => {
    const step = Number(b.dataset.cal);
    state.offset = step === 0 ? 0 : (state.offset || 0) + step;
    rerender();
  });
}

// ---------- Platform calendar ----------
// Each platform's short tag and color on the calendar. A video's platform
// list may say "instagram" or "ig"; normPlatform folds the spellings together.
const PLATFORMS = {
  instagram: { tag: "IG", name: "Instagram", color: "#e1306c" },
  tiktok:    { tag: "TT", name: "TikTok",    color: "#25f4ee" },
  facebook:  { tag: "FB", name: "Facebook",  color: "#1877f2" },
  linkedin:  { tag: "LI", name: "LinkedIn",  color: "#22c55e" },
  youtube:   { tag: "YT", name: "YouTube",   color: "#ff3b30" },
};
const PLATFORM_ALIASES = { ig: "instagram", insta: "instagram", tt: "tiktok", "tik tok": "tiktok", fb: "facebook", li: "linkedin", yt: "youtube" };
function normPlatform(p) { const k = String(p || "").trim().toLowerCase(); return PLATFORM_ALIASES[k] || k; }
// A video's platforms as colored pills: short tags ("IG") or full names.
function platformPills(platforms, full) {
  return (platforms || []).map(normPlatform).filter(Boolean).map(k => {
    const P = PLATFORMS[k];
    return `<span class="plat-pill" style="--pc:${P ? P.color : "var(--sub)"}" title="${escapeHtml(P ? P.name : k)}">${escapeHtml(P ? (full ? P.name : P.tag) : k)}</span>`;
  }).join("");
}

// A finished video must be approved (Tait's review, then the client's) this
// many days before it posts. Edit due is 7 days before (suggestedDates).
const APPROVE_DAYS_BEFORE_POST = 3;
function addDaysISO(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return localISODate(d); }

const CAL_KINDS = {
  post:    { icon: "📤", label: "Post" },
  approve: { icon: "✅", label: "Approve by" },
  edit:    { icon: "✂️", label: "Edit due" },
  film:    { icon: "🎬", label: "Film by" },
};

// Everything one video puts on the calendar:
//   post    one entry per platform on the post date (done once posted)
//   approve post date minus APPROVE_DAYS_BEFORE_POST, until ready to post
//   edit    the edit-due date, until the editor delivers (edit review)
//   film    the film-by date, until the footage is in
// Deadlines drop off once they're met; posts stay, marked done.
function calendarEntries(x) {
  const v = x.video;
  if (v.status === "rejected") return [];
  const reached = s => STATUS_ORDER.indexOf(v.status) >= STATUS_ORDER.indexOf(s);
  const out = [];
  if (v.postDate) {
    const plats = (v.platform || []).map(normPlatform);
    (plats.length ? plats : [""]).forEach(p => out.push({ kind: "post", date: v.postDate, platform: p, done: v.status === "posted", x }));
    // Never before the edit is due: a fast-tracked video (edit due 2 days
    // out) gets approved the day after its edit, not before it exists.
    let approve = addDaysISO(v.postDate, -APPROVE_DAYS_BEFORE_POST);
    if (v.dueToEdit && approve <= v.dueToEdit) approve = addDaysISO(v.dueToEdit, 1);
    if (!reached("ready_to_post")) out.push({ kind: "approve", date: approve, x });
  }
  if (v.dueToEdit && !reached("in_review")) out.push({ kind: "edit", date: v.dueToEdit, x });
  if (v.dueToFilm && !reached("filmed")) out.push({ kind: "film", date: v.dueToFilm, x });
  return out;
}

// One calendar entry as a chip. Posts wear their platform's color; deadlines
// are neutral with an icon. Overdue deadlines turn red; posted posts fade.
function calEntryChip(e, { showClient, onclick }) {
  const v = e.x.video, P = PLATFORMS[e.platform];
  const overdue = !e.done && e.date < todayISO();
  const tag = e.kind === "post" ? (P ? P.tag : (e.platform || "?").slice(0, 2).toUpperCase()) : CAL_KINDS[e.kind].label;
  const name = (showClient ? e.x.client.name + ": " : "") + (v.title || "(untitled)");
  const tip = `${CAL_KINDS[e.kind].label}${P ? " on " + P.name : ""}: ${v.title || "(untitled)"} (${STATUS_LABEL[v.status] || v.status})${overdue ? ". Overdue" : ""}`;
  const cls = ["cal-chip", "video-card", e.kind === "post" ? "cal-post" : "cal-deadline", overdue ? "cal-overdue" : "", e.done ? "cal-done" : ""].join(" ");
  const style = e.kind === "post" ? ` style="--pc:${P ? P.color : "var(--sub)"}"` : "";
  return `<div class="${cls}"${style} title="${escapeHtml(tip)}" onclick="${onclick}('${v.id}')">${e.done ? "✓ " : CAL_KINDS[e.kind].icon + " "}<b>${escapeHtml(tag)}</b> ${escapeHtml(name)}</div>`;
}

// Filter chips above the calendar: which platforms and which kinds to show.
// state = { platforms: Set (empty = all), kinds: Set }
function calFilterHtml(state) {
  const plat = [`<button class="chip ${state.platforms.size ? "" : "active"}" data-calplat="">All platforms</button>`]
    .concat(Object.entries(PLATFORMS).map(([k, P]) =>
      `<button class="chip cal-plat ${state.platforms.has(k) ? "active" : ""}" style="--pc:${P.color}" data-calplat="${k}">${P.name}</button>`));
  const kinds = Object.entries(CAL_KINDS).map(([k, K]) =>
    `<button class="chip ${state.kinds.has(k) ? "active" : ""}" data-calkind="${k}">${K.icon} ${K.label}</button>`);
  return `<div class="chip-row" style="margin-bottom:8px">${plat.join("")}</div><div class="chip-row" style="margin-bottom:14px">${kinds.join("")}</div>`;
}
function wireCalFilters(container, state, rerender) {
  container.querySelectorAll("[data-calplat]").forEach(b => b.onclick = () => {
    const k = b.dataset.calplat;
    if (!k) state.platforms.clear();
    else state.platforms.has(k) ? state.platforms.delete(k) : state.platforms.add(k);
    rerender();
  });
  container.querySelectorAll("[data-calkind]").forEach(b => b.onclick = () => {
    const k = b.dataset.calkind;
    state.kinds.has(k) ? state.kinds.delete(k) : state.kinds.add(k);
    rerender();
  });
}
// Entries grouped by day after the filters, posts first (in platform order),
// then approve, edit, film.
function calendarByDay(videos, state) {
  const order = Object.keys(PLATFORMS), kindOrder = Object.keys(CAL_KINDS), byDay = {};
  videos.flatMap(calendarEntries)
    .filter(e => state.kinds.has(e.kind))
    .filter(e => e.kind !== "post" || !state.platforms.size || state.platforms.has(e.platform))
    .filter(e => e.kind === "post" || !state.platforms.size ||
      (e.x.video.platform || []).map(normPlatform).some(p => state.platforms.has(p)))
    .sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) ||
      order.indexOf(a.platform) - order.indexOf(b.platform))
    .forEach(e => (byDay[e.date] = byDay[e.date] || []).push(e));
  return byDay;
}

// Sidebar view routing uses the plain URL hash: "#<view>".
// Sidebar view router: nav items carry data-view="<id>"; sections carry
// class="view" id="view-<id>". Call initRouter() once per page after render.
function initRouter(defaultView) {
  const items = document.querySelectorAll(".nav-item[data-view]");
  function activate(view) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const el = document.getElementById("view-" + view);
    if (el) el.classList.add("active");
    items.forEach(i => i.classList.toggle("active", i.dataset.view === view));
    window.location.hash = view;
  }
  items.forEach(i => i.addEventListener("click", () => activate(i.dataset.view)));
  const fromHash = window.location.hash.replace(/^#/, "");
  activate(fromHash && document.getElementById("view-" + fromHash) ? fromHash : defaultView);
  return activate;
}

// Minimal dependency-free multi-series line chart, rendered as inline SVG.
// series: [{ name, color, points: [{x: 'label', y: number}, ...] }]
function drawLineChart(container, series, opts) {
  opts = opts || {};
  const w = opts.width || 640, h = opts.height || 200, pad = { t: 10, r: 10, b: 22, l: 40 };
  const allY = series.flatMap(s => s.points.map(p => p.y));
  const maxY = Math.max(1, ...allY), minY = Math.min(0, ...allY);
  const xLabels = series[0] ? series[0].points.map(p => p.x) : [];
  const n = xLabels.length || 1;
  const xAt = i => pad.l + (i / Math.max(1, n - 1)) * (w - pad.l - pad.r);
  const yAt = v => (h - pad.b) - ((v - minY) / (maxY - minY || 1)) * (h - pad.t - pad.b);

  let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" style="overflow:visible">`;
  // gridlines
  for (let g = 0; g <= 3; g++) {
    const gy = pad.t + (g / 3) * (h - pad.t - pad.b);
    svg += `<line x1="${pad.l}" y1="${gy}" x2="${w - pad.r}" y2="${gy}" stroke="var(--border)" stroke-width="1"/>`;
  }
  series.forEach(s => {
    const pts = s.points.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(" ");
    svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  // x labels: first, middle, last only (keep it readable)
  [0, Math.floor((n - 1) / 2), n - 1].forEach(i => {
    if (xLabels[i] == null) return;
    svg += `<text x="${xAt(i)}" y="${h - 4}" font-size="9" fill="var(--sub2)" text-anchor="middle">${escapeHtml(xLabels[i])}</text>`;
  });
  svg += `</svg>`;
  container.innerHTML = svg;
}

function statusBadge(status, labelMap) {
  const label = (labelMap && labelMap[status]) || status;
  return `<span class="badge" style="background:color-mix(in srgb, var(--status-${status}) 18%, transparent); color:var(--status-${status})">${escapeHtml(label)}</span>`;
}

const STATUS_LABEL = {
  concept_pending: "Idea", to_film: "To film", filmed: "Filmed",
  ready_to_edit: "Footage uploaded", rejected: "Abandoned", with_editor: "Editing",
  in_review: "Edit review", client_review: "Client final review",
  ready_to_post: "Ready to post", posted: "Posted"
};

// Full lifecycle, in order. Self-serve clients ("client films") use all
// of it; concierge clients ("I film") start at to_film — Tait films them
// himself and the client only approves the finished video. Both share
// every stage from "filmed" onward.
const STATUS_ORDER = ["concept_pending","to_film","filmed","ready_to_edit","with_editor","in_review","client_review","ready_to_post","posted"];

// ---------- social_videos <-> page shape ----------
// social_videos is the single source of truth for every video. Pages work
// with the camelCase shape below; VIDEO_COLUMNS is the one mapping between
// the two, used in both directions so reads and writes can't drift apart.
const VIDEO_COLUMNS = {
  id: "id", clientId: "client_id", title: "title", platform: "platform",
  hook: "hook", overview: "overview", outline: "outline", body: "body", concept: "concept",
  filmingDirection: "filming_instructions", caption: "caption", note: "note",
  status: "status", editorId: "editor_id", editorBrief: "editor_brief",
  dueToFilm: "due_to_film", dueToEdit: "due_to_edit", postDate: "post_date",
  finalCutUrl: "final_cut_url", onScreenCaption: "on_screen_caption", filmedBy: "filmed_by",
  conceptApprovedBy: "concept_approved_by", conceptApprovedAt: "concept_approved_at",
  createdAt: "created_at", updatedAt: "updated_at",
};
// Columns a page may write directly. Only operators have direct write
// access (RLS); clients and editors go through VIDEO_ACTIONS below.
// Gate-1 columns are deliberately absent — use the approve_concept action,
// so every approval is stamped and logged.
const VIDEO_WRITABLE = ["clientId","title","platform","hook","overview","outline","body","concept",
  "filmingDirection","caption","note","status","editorId","editorBrief","dueToFilm","dueToEdit","postDate","finalCutUrl","onScreenCaption","filmedBy"];

function videoFromRow(row) {
  const v = {};
  Object.entries(VIDEO_COLUMNS).forEach(([key, col]) => { v[key] = row[col] === undefined ? null : row[col]; });
  v.platform = v.platform || [];
  v.editorBrief = v.editorBrief || {};
  v.assignedEditor = null; // display name — resolved from editorId by pages that load social_editors
  return v;
}
// Only keys present in `fields` are included, so a partial patch stays
// partial. Empty strings become null (blank form field = cleared).
function videoFieldsToRow(fields) {
  const row = {};
  VIDEO_WRITABLE.forEach(key => {
    if (!(key in fields)) return;
    const val = fields[key];
    row[VIDEO_COLUMNS[key]] = val === "" ? null : val;
  });
  return row;
}

// ---------- status changes ----------
// Mirrors the transition table in supabase/migrations/006_client_journey.sql
// — the database is what actually enforces these; this only decides which
// buttons to show. Keep the two in step. Operators move every other status
// by writing `status` directly (full RLS access), so only their gate-1
// action is here.
//
// filmedBy: the video's filmed_by this action needs ("client" = the client
// films it and submits footage; "us" = Tait films it / already has the
// footage, and the client approves the idea). Absent = either.
const VIDEO_ACTIONS = {
  approve_concept_owner:   { role: "operator", rpc: "social_operator_approve_concept", from: ["concept_pending"], to: "concept_pending", label: "Send to client", needsConceptUnapproved: true },
  submit_footage:          { role: "client", from: ["concept_pending", "to_film", "filmed"], to: "ready_to_edit", label: "Video has been filmed", filmedBy: "client" },
  approve_concept:         { role: "client", from: ["concept_pending"], to: "to_film",         label: "Approve idea", filmedBy: "us" },
  request_concept_changes: { role: "client", from: ["concept_pending"], to: "concept_pending", label: "Suggest changes", needsNote: true, notePrompt: "What would you change about this idea?" },
  approve_final:           { role: "client", from: ["client_review"], to: "ready_to_post", label: "Approve for posting" },
  request_revisions:       { role: "client", from: ["client_review"], to: "with_editor",   label: "Request changes to the video", needsNote: true, notePrompt: "What should change in the video?", destructive: true },
  mark_delivered:          { role: "editor", rpc: "social_editor_mark_delivered", from: ["with_editor"], to: "in_review", label: "Finished — send to operator" },
};

// Who films a video: its own filmed_by, else its client's default
// (self-serve → the client, concierge → us).
function filmedByOf(video, clientSystem) {
  return video.filmedBy || (clientSystem === "concierge" ? "us" : "client");
}

// Action keys `role` may take on `video` right now. clientSystem is the
// social_clients.client_system of the video's client (the fallback for
// videos made before filmed_by existed).
function videoActionsFor(video, role, clientSystem) {
  const filmedBy = filmedByOf(video, clientSystem);
  return Object.keys(VIDEO_ACTIONS).filter(key => {
    const a = VIDEO_ACTIONS[key];
    if (a.role !== role || !a.from.includes(video.status)) return false;
    if (a.filmedBy && a.filmedBy !== filmedBy) return false;
    if (a.needsConceptUnapproved && video.conceptApprovedAt) return false;
    return true;
  });
}

// The 7 + 7 rule, same as submit_footage in 006: once the footage is in,
// the edit is due in 7 days and it posts in 14 — or on the planned post
// date, if that's later. Used where an operator submits footage directly.
function footageDates(video) {
  const edit = addDaysISO(todayISO(), 7), post = addDaysISO(todayISO(), 14);
  return { dueToEdit: edit, postDate: video.postDate && video.postDate > post ? video.postDate : post };
}

// Runs one action against Supabase (sbClient comes from auth.js).
// extra: { caption, onScreenCaption } for approve_final (the client's
// caption edits). Resolves to { video } with the updated record, or
// { error } with the database's message — the database re-checks
// everything, so a refused move comes back here as an error rather than
// silently doing nothing.
async function runVideoAction(actionKey, videoId, note, extra) {
  const a = VIDEO_ACTIONS[actionKey];
  if (!a) return { error: "Unknown action: " + actionKey };
  extra = extra || {};
  const { data, error } = a.rpc
    ? await sbClient.rpc(a.rpc, { p_video_id: videoId })
    : await sbClient.rpc("social_client_video_action", { p_video_id: videoId, p_action: actionKey, p_note: note || null,
        p_caption: extra.caption || null, p_on_screen_caption: extra.onScreenCaption || null });
  if (error) return { error: error.message };
  return { video: videoFromRow(data) };
}

// Where to watch a finished video. Editors upload into the client's
// Final edits folder (named after the video's title) rather than pasting a
// link, so that folder is the default; a link on the video itself, if the
// operator added one, points at the exact file instead.
// Where a video's raw footage goes: its own folder (editor_brief.rawFootageUrl,
// set in the video form) if it has one, else the client's raw footage folder.
function rawFootageLink(video, folders) {
  const own = (video.editorBrief || {}).rawFootageUrl;
  if (own) return { url: own, label: "📁 Raw footage for this video", own: true };
  if (folders && folders.footageUploads) return { url: folders.footageUploads, label: "📁 Raw footage folder", own: false };
  return null;
}
function finishedVideoLink(video, folders) {
  if (video.finalCutUrl) return { url: video.finalCutUrl, label: "▶ Watch" };
  if (folders && folders.finalEdits) return { url: folders.finalEdits, label: "📁 Finished videos" };
  return null;
}

// The editor's instructions: one free-text field (editor_brief.instructions).
// Videos made before it had separate brief fields; those are folded in so
// nothing already written disappears.
const OLD_BRIEF_FIELDS = [["storyBeats", "Story beats"], ["mustKeep", "Must keep"], ["captionsStyle", "Captions"],
  ["musicVibe", "Music / pacing"], ["ctaOverlay", "CTA overlay"], ["platformSpecs", "Platform specs"]];
function editorInstructions(video) {
  const eb = video.editorBrief || {};
  return [eb.instructions, ...OLD_BRIEF_FIELDS.filter(([k]) => eb[k]).map(([k, l]) => l + ": " + eb[k])].filter(Boolean).join("\n");
}

// ---------- Video detail modal ----------
// The "Airtable, but every row is a video card" piece: one shared detail
// view for a video record, used by the client portal, operator dashboard,
// and editor dashboard alike. Only `actionsHtml` differs per audience —
// pass in whatever buttons make sense for who's looking.
function ensureModalRoot() {
  let root = document.getElementById("videoModalRoot");
  if (root) return root;
  root = document.createElement("div");
  root.id = "videoModalRoot";
  root.className = "modal-backdrop hidden";
  root.innerHTML = `<div class="modal-box" id="videoModalBox"></div>`;
  root.addEventListener("click", e => { if (e.target === root) closeVideoModal(); });
  document.body.appendChild(root);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeVideoModal(); });
  return root;
}
function closeVideoModal() {
  const root = document.getElementById("videoModalRoot");
  if (root) root.classList.add("hidden");
}
// ---------- Date picker: Month · Day · Year dropdowns ----------
// Quicker than typing a date. dateSelectHtml renders the three dropdowns
// plus a hidden <input data-f="key"> holding the YYYY-MM-DD value (blank
// until month and day are both picked), so forms read it like any other
// field. The year starts on this year. openModal wires them up; the
// hidden input fires "change" whenever the date changes, and has
// setDate(iso) for code that fills it in.
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function dateSelectHtml(key, value) {
  const [y, m, d] = (value || "").split("-");
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
  if (y && !years.includes(+y)) years.push(+y);
  const opt = (val, label, sel) => `<option value="${val}" ${sel ? "selected" : ""}>${label}</option>`;
  const pad = n => String(n).padStart(2, "0");
  return `<div class="date-select">
    <select data-part="m" aria-label="Month">${opt("", "Month", !m)}${MONTH_NAMES.map((name, i) => opt(pad(i + 1), name, m === pad(i + 1))).join("")}</select>
    <select data-part="d" aria-label="Day">${opt("", "Day", !d)}${Array.from({ length: 31 }, (_, i) => opt(pad(i + 1), i + 1, d === pad(i + 1))).join("")}</select>
    <select data-part="y" aria-label="Year">${years.sort().map(yr => opt(yr, yr, y ? +y === yr : yr === thisYear)).join("")}</select>
    <input type="hidden" data-f="${key}" value="${escapeHtml(value || "")}">
  </div>`;
}
function wireDateSelects(root) {
  root.querySelectorAll(".date-select").forEach(w => {
    const input = w.querySelector("input"), part = p => w.querySelector(`[data-part="${p}"]`);
    const sync = () => {
      const m = part("m").value, y = part("y").value;
      let d = part("d").value;
      if (m && d) {
        // Feb 30 → Feb 28/29, and so on.
        const last = new Date(Date.UTC(+y, +m, 0)).getUTCDate();
        if (+d > last) { d = String(last).padStart(2, "0"); part("d").value = d; }
        input.value = `${y}-${m}-${d}`;
      } else input.value = "";
      input.dispatchEvent(new Event("change"));
    };
    ["m", "d", "y"].forEach(p => part(p).addEventListener("change", sync));
    input.setDate = iso => {
      const [y, m, d] = (iso || "").split("-");
      if (y && !part("y").querySelector(`option[value="${y}"]`)) part("y").insertAdjacentHTML("beforeend", `<option value="${y}">${y}</option>`);
      if (y) part("y").value = y;
      part("m").value = m || ""; part("d").value = d || "";
      input.value = iso || "";
    };
  });
}

// Any content in the same modal (the operator's video form uses this).
// Returns the box so the caller can wire up what it rendered.
function openModal(html) {
  ensureModalRoot();
  const box = document.getElementById("videoModalBox");
  box.innerHTML = `<div class="modal-close" onclick="closeVideoModal()">✕</div>` + html;
  wireDateSelects(box);
  document.getElementById("videoModalRoot").classList.remove("hidden");
  return box;
}
function modalField(label, value) {
  if (!value) return "";
  return `<div class="modal-field"><b>${escapeHtml(label)}</b><div>${escapeHtml(value)}</div></div>`;
}
// client: { displayName, driveFolders }. video: a videoFromRow() record.
// opts.actionsHtml: buttons rendered at the bottom, audience-specific.
// opts.linkKeys: which driveFolders entries to show as quick links (default: all present).
// opts.hideEditorBrief: true for the client portal — editing instructions
// (story beats, must-keep, music, CTA, specs) are for the editor and the
// owner, never for the person who filmed the footage.
function openVideoModal(client, video, opts) {
  opts = opts || {};
  ensureModalRoot();
  const f = client.driveFolders || {};
  const linkKeys = opts.linkKeys || Object.keys(f);
  const linkLabels = { root: "Client folder", footageUploads: "Raw footage", finalEdits: "Finished video folder", brandVoice: "Brand guidelines", hooks: "Hooks", assets: "Assets", customerData: "Customer data", contentIdeas: "Content ideas" };
  const instructions = opts.hideEditorBrief ? "" : editorInstructions(video);

  document.getElementById("videoModalBox").innerHTML = `
    <div class="modal-close" onclick="closeVideoModal()">✕</div>
    <h2>${escapeHtml(video.title || video.id)}</h2>
    <div class="modal-meta">${escapeHtml(client.displayName || "")} · ${(video.platform||[]).join(" · ")} ${statusBadge(video.status, STATUS_LABEL)}</div>

    <div class="modal-dates">
      <div><div class="lbl">Due to film</div>${escapeHtml(video.dueToFilm || "—")}</div>
      <div><div class="lbl">Due to edit</div>${escapeHtml(video.dueToEdit || "—")}</div>
      <div><div class="lbl">Post date</div>${escapeHtml(video.postDate || "—")}</div>
    </div>

    ${modalField("Overview", video.overview)}
    ${modalField("Outline", video.outline)}
    ${modalField("Hook", video.hook)}
    ${modalField("What to say", video.body)}
    ${modalField("How to film it", video.filmingDirection)}
    ${modalField("On-screen caption", video.onScreenCaption)}
    ${modalField("Caption", video.caption)}
    ${video.note ? modalField("Note", video.note) : ""}

    ${modalField("Editing instructions", instructions)}
    ${opts.hideEditorBrief ? "" : modalField("Revisions needed", (video.editorBrief || {}).revisions)}
    ${instructions && video.assignedEditor ? modalField("Editor", video.assignedEditor) : ""}

    <div class="modal-links">
      ${video.finalCutUrl && !opts.hideFinalCut ? `<a class="btn primary" href="${escapeHtml(video.finalCutUrl)}" target="_blank" rel="noopener">▶ Watch the finished video</a>` : ""}
      ${linkKeys.filter(k => f[k]).map(k => {
        const raw = k === "footageUploads" ? rawFootageLink(video, f) : null;
        return `<a class="btn" href="${escapeHtml(raw ? raw.url : f[k])}" target="_blank" rel="noopener">${escapeHtml(raw ? raw.label : linkLabels[k] || k)}</a>`;
      }).join("")}
    </div>

    ${opts.actionsHtml ? `<div class="modal-actions">${opts.actionsHtml}</div>` : ""}
  `;
  document.getElementById("videoModalRoot").classList.remove("hidden");
}
