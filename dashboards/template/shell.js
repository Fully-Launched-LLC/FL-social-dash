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

// Month or week grid shared by every page's calendar, in the style of a
// planner app: each entry is a solid color block. byDay: { "YYYY-MM-DD":
// [item] }, chipHtml(item) renders one entry. state.view is "month" (the
// default) or "week"; state.offset is months from the current one and
// state.weekOffset weeks from this one. The ‹ › buttons, Today and the
// Month/Week switch change them and call rerender(). A busy day in the
// month shows its first few entries and "+N more", which opens its week.
const CAL_MONTH_MAX = 4;
function renderMonthCalendar(container, byDay, chipHtml, state, rerender) {
  const now = new Date(), today = todayISO(), week = state.view === "week";
  const thisSunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const weekStart = new Date(thisSunday.getFullYear(), thisSunday.getMonth(), thisSunday.getDate() + 7 * (state.weekOffset || 0));
  // In week view, offset follows the week's month (the client's day-by-day
  // list under the calendar reads it).
  if (week) state.offset = (weekStart.getFullYear() - now.getFullYear()) * 12 + weekStart.getMonth() - now.getMonth();
  const first = new Date(now.getFullYear(), now.getMonth() + (state.offset || 0), 1);
  const days = week
    ? Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i))
    : Array.from({ length: new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate() }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1));
  const atToday = week ? !state.weekOffset : !state.offset;
  const title = first.toLocaleString(undefined, { month: "long", year: "numeric" });
  const sub = week ? days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " – " + days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  let html = `<div class="cal-head">
      <div class="cal-title">${escapeHtml(title)}${sub ? `<span>${escapeHtml(sub)}</span>` : ""}</div>
      <div class="cal-nav"><button data-cal="-1" aria-label="Previous">‹</button>${atToday ? "" : `<button data-cal="0">Today</button>`}<button data-cal="1" aria-label="Next">›</button></div>
      <div class="cal-seg"><button data-calview="month" class="${week ? "" : "on"}">Month</button><button data-calview="week" class="${week ? "on" : ""}">Week</button></div>
    </div>`;
  if (week) {
    html += days.map(d => {
      const iso = localISODate(d), items = byDay[iso] || [];
      return `<div class="cal-wcol"><div class="cal-dayhead ${iso === today ? "today" : ""}">${d.toLocaleDateString(undefined, { weekday: "short" })} <b>${d.getDate()}</b></div>
        <div class="cal-wbody">${items.map(chipHtml).join("") || '<div class="cal-none">Nothing</div>'}</div></div>`;
    }).join("");
  } else {
    html += ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="cal-dow">${d}</div>`).join("");
    for (let i = 0; i < first.getDay(); i++) html += `<div></div>`;
    days.forEach(d => {
      const iso = localISODate(d), items = byDay[iso] || [];
      const more = items.length > CAL_MONTH_MAX ? items.length - (CAL_MONTH_MAX - 1) : 0;
      const shown = more ? items.slice(0, CAL_MONTH_MAX - 1) : items;
      html += `<div class="cal-cell ${iso === today ? "today" : ""}"><div class="daynum">${d.getDate()}</div>${shown.map(chipHtml).join("")}${more ? `<button class="cal-more" data-calweek="${iso}">+${more} more</button>` : ""}</div>`;
    });
  }
  container.innerHTML = html;
  container.classList.toggle("week", week);
  // Weeks from this one to the week holding iso.
  const weeksTo = iso => { const d = new Date(iso + "T00:00:00"); return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()) - thisSunday) / 604800000); };
  container.querySelectorAll("[data-cal]").forEach(b => b.onclick = () => {
    const step = Number(b.dataset.cal), key = week ? "weekOffset" : "offset";
    state[key] = step === 0 ? 0 : (state[key] || 0) + step;
    rerender();
  });
  container.querySelectorAll("[data-calview]").forEach(b => b.onclick = () => {
    if (b.dataset.calview === state.view || (b.dataset.calview === "month" && !week)) return;
    // Month → week opens on this week if it's this month, else the month's first week.
    if (b.dataset.calview === "week") state.weekOffset = state.offset ? weeksTo(localISODate(first)) : 0;
    state.view = b.dataset.calview;
    rerender();
  });
  container.querySelectorAll("[data-calweek]").forEach(b => b.onclick = () => {
    state.view = "week"; state.weekOffset = weeksTo(b.dataset.calweek);
    rerender();
  });
}

// ---------- Platform calendar ----------
// Each platform's short tag, name and color (YouTube red, Instagram purple,
// Facebook blue, LinkedIn green, TikTok cyan). The pill styles are the
// .p-<platform> classes in shell.css; keep the two in step. A video's platform
// list may say "instagram" or "ig"; normPlatform folds the spellings together.
const PLATFORMS = {
  instagram: { tag: "IG", name: "Instagram", color: "#a855f7" },
  tiktok:    { tag: "TT", name: "TikTok",    color: "#25f4ee" },
  facebook:  { tag: "FB", name: "Facebook",  color: "#1877f2" },
  linkedin:  { tag: "LI", name: "LinkedIn",  color: "#22c55e" },
  youtube:   { tag: "YT", name: "YouTube",   color: "#ff3b30" },
};
const PLATFORM_ALIASES = { ig: "instagram", insta: "instagram", tt: "tiktok", "tik tok": "tiktok", fb: "facebook", li: "linkedin", yt: "youtube" };
function normPlatform(p) { const k = String(p || "").trim().toLowerCase(); return PLATFORM_ALIASES[k] || k; }
// A video's platforms as colored pills: short tags ("IG") or full names.
// "Mon, Oct 5"
function niceDate(iso) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "";
}
// A filter tab's label with its count as a bubble: "Ready to post <2>".
function chipLabel(label, n) {
  return `${escapeHtml(label)} <span class="c">${n}</span>`;
}
// A status as a dot and a word; gold when it's time sensitive, dim when done.
function statusDot(status, labelMap, soon) {
  const done = ["posted", "rejected"].includes(status);
  return `<span class="dot${soon ? " soon" : done ? " done" : ""}">${escapeHtml((labelMap && labelMap[status]) || status)}</span>`;
}
// Colors come from the .p-<platform> classes in shell.css (gold or white,
// solid or outline), so a platform looks the same everywhere.
function platformPills(platforms, full) {
  return (platforms || []).map(normPlatform).filter(Boolean).map(k => {
    const P = PLATFORMS[k];
    return `<span class="plat-pill p-${escapeHtml(k)}" title="${escapeHtml(P ? P.name : k)}">${escapeHtml(P ? (full ? P.name : P.tag) : k)}</span>`;
  }).join("");
}

// A finished video must be approved (Tait's review, then the client's) this
// many days before it posts. Edit due is 7 days before (suggestedDates).
const APPROVE_DAYS_BEFORE_POST = 3;
function addDaysISO(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return localISODate(d); }

const CAL_KINDS = {
  post:    { label: "Post" },
  approve: { label: "Approve by" },
  edit:    { label: "Edit due" },
  film:    { label: "Film by" },
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

// One calendar entry as a color block: blue to post, red to approve, purple
// for the edit, green to film (the .k-<kind> classes in shell.css). A post
// lists every platform it goes out on. Overdue deadlines get a gold ring and
// say so; posted posts turn grey with a tick.
function calEntryChip(e, { showClient, onclick }) {
  const v = e.x.video, plats = e.platforms || (e.platform ? [e.platform] : []);
  const overdue = !e.done && e.date < todayISO();
  const where = plats.map(p => (PLATFORMS[p] || { name: p }).name).join(", ");
  const tip = `${CAL_KINDS[e.kind].label}${where ? " on " + where : ""}: ${v.title || "(untitled)"} (${STATUS_LABEL[v.status] || v.status})${overdue ? ". Overdue" : ""}`;
  const sub = [overdue ? "Overdue" : "", CAL_KINDS[e.kind].label, showClient ? e.x.client.name : ""].filter(Boolean).join(" · ");
  const cls = ["cal-block", "video-card", "k-" + e.kind, overdue ? "cal-overdue" : "", e.done ? "cal-done" : ""].join(" ");
  return `<div class="${cls}" title="${escapeHtml(tip)}" onclick="${onclick}('${v.id}')">
    <div class="t">${e.done ? "✓ " : ""}${escapeHtml(v.title || "(untitled)")}</div><div class="s">${escapeHtml(sub)}</div>${e.kind === "post" ? platformPills(plats) : ""}</div>`;
}

// Filter chips above the calendar: which platforms and which kinds to show.
// state = { platforms: Set (empty = all), kinds: Set }
function calFilterHtml(state) {
  const plat = [`<button class="chip ${state.platforms.size ? "" : "active"}" data-calplat="">All platforms</button>`]
    .concat(Object.entries(PLATFORMS).map(([k, P]) =>
      `<button class="chip cal-plat p-${k} ${state.platforms.has(k) ? "active" : ""}" data-calplat="${k}">${P.name}</button>`));
  const kinds = Object.entries(CAL_KINDS).map(([k, K]) =>
    `<button class="chip ${state.kinds.has(k) ? "active" : ""}" data-calkind="${k}"><span class="kdot k-${k}"></span>${K.label}</button>`);
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
// Entries grouped by day after the filters, posts first (one per video, its
// platforms in order), then approve, edit, film.
function calendarByDay(videos, state) {
  const order = Object.keys(PLATFORMS), kindOrder = Object.keys(CAL_KINDS), byDay = {};
  videos.flatMap(calendarEntries)
    .filter(e => state.kinds.has(e.kind))
    .filter(e => e.kind !== "post" || !state.platforms.size || state.platforms.has(e.platform))
    .filter(e => e.kind === "post" || !state.platforms.size ||
      (e.x.video.platform || []).map(normPlatform).some(p => state.platforms.has(p)))
    // Within a day: posts, then deadlines; each video's items together, in
    // title order (numbers in order, "2." before "10."); then by platform.
    .sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) ||
      (a.x.video.title || "").localeCompare(b.x.video.title || "", undefined, { numeric: true }) ||
      order.indexOf(a.platform) - order.indexOf(b.platform))
    .forEach(e => {
      const day = byDay[e.date] = byDay[e.date] || [];
      // One post block per video per day, listing its platforms.
      const same = e.kind === "post" && day.find(o => o.kind === "post" && o.x === e.x);
      if (same) same.platforms.push(e.platform);
      else day.push(e.kind === "post" ? { ...e, platforms: e.platform ? [e.platform] : [] } : e);
    });
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
    // The top bar's "where you are" label, from the tab's own words.
    const crumb = document.getElementById("crumbPage"), on = Array.from(items).find(i => i.dataset.view === view);
    if (crumb && on) crumb.textContent = (on.dataset.label || on.childNodes[0].textContent).trim();
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
  return `<span class="badge" style="border-color:var(--status-${status}); color:var(--status-${status})">${escapeHtml(label)}</span>`;
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
  clientRevisionRounds: "client_revision_rounds",
  createdAt: "created_at", updatedAt: "updated_at",
};
// Rounds of changes a client gets on each finished video (Tait,
// 2026-10-09). The database enforces the same number
// (social_client_revision_limit, migration 017).
const REVISION_ROUNDS = 2;
// After the client's last round, Tait approves the fix for posting
// himself: it doesn't go back to the client.
const clientRoundsUsed = v => (v.clientRevisionRounds || 0) >= REVISION_ROUNDS;
// Columns a page may write directly. Only operators have direct write
// access (RLS); clients and editors go through VIDEO_ACTIONS below.
// Gate-1 columns are deliberately absent — use the approve_concept action,
// so every approval is stamped and logged.
const VIDEO_WRITABLE = ["clientId","title","platform","hook","overview","outline","body","concept",
  "filmingDirection","caption","note","status","editorId","editorBrief","dueToFilm","dueToEdit","postDate","finalCutUrl","onScreenCaption","filmedBy","clientRevisionRounds"];

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

// A video's category (its industry), from the start of its title:
// "AI Systems · A2 · The 8 PM invoice problem" → "AI Systems". Only a
// title shaped "<Category> · <ID like A2> · <title>" has one, so other
// titles with a "·" in them don't get a made-up category.
const CATEGORY_ORDER = ["AI Systems", "Social Media", "Websites", "E-commerce"];
function videoCategory(video) {
  const m = (video.title || "").match(/^([^·]+?) · [A-Z]{1,3}\d+ · /);
  return m ? m[1].trim() : "";
}
// Categories in a fixed order (Fully Launched's four first), then any
// others A to Z; videos without one last.
function categoryRank(cat) {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i >= 0 ? String(i).padStart(3, "0") : cat ? "500" + cat.toLowerCase() : "999";
}

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
  if (own) return { url: own, label: "Raw footage", own: true };
  if (folders && folders.footageUploads) return { url: folders.footageUploads, label: "Raw footage folder", own: false };
  return null;
}
function finishedVideoLink(video, folders) {
  if (video.finalCutUrl) return { url: video.finalCutUrl, label: "Watch" };
  if (folders && folders.finalEdits) return { url: folders.finalEdits, label: "Finished videos" };
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

// ---------- Finished video review (Frame.io style) ----------
// The finished video stays in Google Drive (Tait, 2026-10-07). The page
// streams it from Drive into its own player (the Drive API, with the key in
// social_settings, migration 014), so it can read the exact time: pause
// anywhere, leave a note pinned to that moment, see every note as a mark on
// the timeline, click one to jump there. If it can't stream (no key yet, a
// folder that isn't shared by link, a format the browser can't play), it
// shows Drive's own player and the reviewer types the time. Notes
// (social_video_comments) stay open until the video moves on.
const RESUMABLE_OVER = 6 * 1024 * 1024;   // bytes; tus needs 6 MB pieces on Supabase

// Storage keys allow a limited set of characters; keep names readable.
const safeName = s => String(s || "file").replace(/[^A-Za-z0-9._\-()\/]+/g, "_").replace(/_+/g, "_").replace(/^\/+/, "");
// One file into a storage bucket, at full quality; anything over 6 MB goes
// in resumable pieces (tus, loaded by pages that upload), so a big file
// survives a shaky connection. onProgress gets 0 to 100.
async function uploadToBucket(bucket, path, file, onProgress) {
  const contentType = file.type || "application/octet-stream";
  if (window.tus && file.size > RESUMABLE_OVER) {
    const { data } = await sbClient.auth.getSession();
    const token = data && data.session && data.session.access_token;
    await new Promise((resolve, reject) => {
      const up = new tus.Upload(file, {
        endpoint: window.SUPABASE_CONFIG.url + "/storage/v1/upload/resumable",
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: { authorization: "Bearer " + token, "x-upsert": "false" },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: { bucketName: bucket, objectName: path, contentType, cacheControl: "3600" },
        chunkSize: RESUMABLE_OVER,
        onError: reject,
        onProgress: (sent, total) => onProgress && onProgress(Math.round(sent / total * 100)),
        onSuccess: resolve,
      });
      up.findPreviousUploads().then(prev => { if (prev.length) up.resumeFromPreviousUpload(prev[0]); up.start(); });
    });
    return path;
  }
  onProgress && onProgress(5);
  const { error } = await sbClient.storage.from(bucket).upload(path, file, { contentType, upsert: false });
  if (error) throw error;
  onProgress && onProgress(100);
  return path;
}

// 75.4 → "1:15"
function fmtTime(s) {
  s = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
// What a reviewer types → seconds: "1:15", "75", "1:02:03". null when
// blank; NaN when it isn't a time.
function parseTime(str) {
  const s = String(str || "").trim();
  if (!s) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(s)) return NaN;
  return s.split(":").reduce((t, part) => t * 60 + Number(part), 0);
}

// A Google Drive link → { id, kind: "file" | "folder" }, or null.
function driveRef(url) {
  const s = String(url || "");
  let m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (m) return { id: m[1], kind: "folder" };
  m = s.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) || (/drive\.google\.com/.test(s) && s.match(/[?&]id=([A-Za-z0-9_-]{10,})/));
  return m ? { id: m[1], kind: "file" } : null;
}

// The Drive API key (social_settings 'google_api_key'), read once.
let GOOGLE_KEY;
async function googleKey() {
  if (GOOGLE_KEY === undefined) {
    const { data } = await sbClient.from("social_settings").select("value").eq("key", "google_api_key").maybeSingle();
    GOOGLE_KEY = (data && data.value) || null;
  }
  return GOOGLE_KEY;
}
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
// What's in a Drive folder shared by link, newest first.
async function driveList(folderId, key) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const r = await fetch(`${DRIVE_API}?q=${q}&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=200&key=${encodeURIComponent(key)}`);
  if (!r.ok) throw new Error("Google Drive said " + r.status);
  return (await r.json()).files || [];
}
const looseName = s => String(s || "").toLowerCase().replace(/\.[a-z0-9]{2,4}$/, "").replace(/[^a-z0-9]+/g, " ").trim();
// The finished video's Drive file: the latest saved version (migration
// 016) with a file; else the exact file if the operator linked one; else
// the newest video in the video's own finished folder (if its link is a
// folder); else, in the client's finished video folder, the newest video
// named after it, or the newest video in a folder named after it (editors
// name both after the video). null when it can't tell.
async function findFinishedFile(video, folders, versions) {
  const latest = (versions || []).slice().reverse().find(v => v.file_id);
  if (latest) return { id: latest.file_id, name: latest.file_name, version: latest.version };
  const own = driveRef(video.finalCutUrl);
  if (own && own.kind === "file") return { id: own.id };
  const key = await googleKey();
  if (!key) return null;
  const newestVideo = files => files.find(f => (f.mimeType || "").startsWith("video/")) || null;
  try {
    if (own) return newestVideo(await driveList(own.id, key));
    const root = driveRef(folders && folders.finalEdits), title = looseName(video.title);
    if (!root || root.kind !== "folder" || !title) return null;
    const named = (await driveList(root.id, key)).filter(f => looseName(f.name).includes(title));
    const file = newestVideo(named);
    if (file) return file;
    for (const f of named.filter(f => f.mimeType === DRIVE_FOLDER)) {
      const inner = newestVideo(await driveList(f.id, key));
      if (inner) return inner;
    }
  } catch (e) { /* not shared by link, or Drive is down: Drive's own player instead */ }
  return null;
}
const DRIVE_FOLDER = "application/vnd.google-apps.folder";
async function driveFile(id, key) {
  const r = await fetch(`${DRIVE_API}/${encodeURIComponent(id)}?fields=id,name,mimeType,modifiedTime&key=${encodeURIComponent(key)}`);
  if (!r.ok) throw new Error("Google Drive said " + r.status);
  return r.json();
}
// The newest finished video uploaded for a video, for the check before
// Finished: { status: "found", file } | { status: "none" } | { status:
// "unknown" } (no key, or a folder Drive won't show us).
async function latestCut(video, folders) {
  const key = await googleKey();
  if (!key) return { status: "unknown" };
  const own = driveRef(video.finalCutUrl), isVideo = f => (f.mimeType || "").startsWith("video/");
  try {
    let files = [];
    if (own && own.kind === "file") files.push(await driveFile(own.id, key));
    else if (own) files = await driveList(own.id, key);
    const root = driveRef(folders && folders.finalEdits), title = looseName(video.title);
    if (!(own && own.kind === "folder") && root && root.kind === "folder" && title) {
      const named = (await driveList(root.id, key)).filter(f => looseName(f.name).includes(title));
      files = files.concat(named);
      for (const f of named.filter(f => f.mimeType === DRIVE_FOLDER)) files = files.concat(await driveList(f.id, key));
    }
    files = files.filter(isVideo).sort((x, y) => String(y.modifiedTime || "").localeCompare(String(x.modifiedTime || "")));
    return files.length ? { status: "found", file: files[0] } : { status: "none" };
  } catch (e) { return { status: "unknown", error: e.message }; }
}
// A video's saved versions (migration 016), oldest first. [] before 016.
// A Drive file id (a review copy's path in Supabase has slashes).
const isDriveId = id => !!id && !String(id).includes("/");
// Where a video's review copies go: review/<client id>/<video id>/<file>.
const reviewCopyPath = (video, file) => `${video.clientId}/${video.id}/${Date.now()}-${safeName(file.name).replace(/\//g, "_")}`;
// The operator's "Upload a review copy", under the player when the cut has
// none: the file from their computer (or their synced Drive folder) goes to
// Supabase and is attached to the latest version (or becomes v1).
function offerReviewCopy(box, video, latestVer, driveFile, reopen) {
  const el = document.createElement("div");
  el.className = "rv-copy";
  el.innerHTML = `<div class="meta">Playing from Google Drive, which can be slow or blocked on phones. Upload this video as a review copy so it plays smoothly for everyone.</div>
    <label class="btn rv-copy-pick">Upload a review copy<input type="file" accept="video/*" hidden></label>
    <span class="meta rv-copy-msg"></span>`;
  const stage = box.querySelector(".rv-stage");
  stage.parentNode.insertBefore(el, stage.nextSibling);
  el.querySelector("input").onchange = async e => {
    const f = e.target.files && e.target.files[0], msg = el.querySelector(".rv-copy-msg");
    if (!f) return;
    el.querySelector(".rv-copy-pick").hidden = true;
    try {
      const path = await uploadToBucket("review", reviewCopyPath(video, f), f, pct => { msg.textContent = `Uploading… ${pct}%`; });
      const { error } = latestVer && !latestVer.storage_path
        ? await sbClient.from("social_video_versions").update({ storage_path: path }).eq("id", latestVer.id)
        : await sbClient.rpc("social_add_video_version", { p_video_id: video.id, p_file_id: driveFile ? driveFile.id : null, p_file_name: f.name, p_storage_path: path });
      if (error) throw error;
      msg.textContent = "Uploaded.";
      reopen();
    } catch (err) {
      msg.textContent = "That didn't upload: " + (err.message || err);
      el.querySelector(".rv-copy-pick").hidden = false;
    }
  };
}
async function loadVersions(video) {
  const { data, error } = await sbClient.from("social_video_versions").select("*").eq("video_id", video.id).order("version");
  return error ? [] : (data || []);
}

const byTime = (a, b) => (a.at_seconds == null) - (b.at_seconds == null) || (Number(a.at_seconds) || 0) - (Number(b.at_seconds) || 0)
  || String(a.created_at).localeCompare(String(b.created_at));
// A video's comments, in time order (whole-video comments last), each
// with its replies (n.replies). which: "open" (this round's, still being
// written), "sent" (the last round, as the editor got it), or { cut } (every
// comment left on that Drive file: an earlier version). roles: only
// comments by these authors.
async function loadReviewNotes(video, which, roles) {
  let q = sbClient.from("social_video_comments").select("*").eq("video_id", video.id).is("parent_id", null);
  if (which && which.cut) q = q.eq("cut_ref", which.cut);
  else q = which === "sent" ? q.not("closed_at", "is", null) : q.is("closed_at", null);
  if (roles) q = q.in("author_role", roles);
  const { data, error } = await q.order("created_at");
  if (error) throw new Error(error.message);
  let notes = data || [];
  if (which === "sent") { const last = notes.reduce((m, n) => n.closed_at > m ? n.closed_at : m, ""); notes = notes.filter(n => n.closed_at === last); }
  notes = notes.slice().sort(byTime);
  notes.forEach(n => { n.replies = []; });
  if (notes.length) {
    const { data: reps } = await sbClient.from("social_video_comments").select("*").in("parent_id", notes.map(n => n.id)).order("created_at");
    (reps || []).forEach(r => { const n = notes.find(x => x.id === r.parent_id); if (n) n.replies.push(r); });
  }
  return notes;
}
// The notes as one block of text, for request_revisions' note and the
// editor's Revisions needed box: "0:12  Make the logo bigger".
function reviewNotesText(notes) {
  return notes.map(n => (n.at_seconds == null ? "Whole video" : fmtTime(n.at_seconds)) + "  " + n.body.trim()).join("\n");
}

// Initials for a comment's avatar: "Mark Ruiz" → "MR".
function initials(name) {
  const w = String(name || "?").replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
}
// How long ago, the short way: "now", "4m", "2h", "3d", then the date.
function ago(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (!(s >= 0)) return "";
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 7 * 86400) return Math.floor(s / 86400) + "d";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The open review window's keyboard shortcuts (one listener for the page).
let REVIEW_KEYS = null;
if (typeof document !== "undefined") document.addEventListener("keydown", e => { if (REVIEW_KEYS) REVIEW_KEYS(e); });

// The review window, laid out like Frame.io: the video with its own
// controls on the left, comment marks on its scrub bar; the comments on
// the right, numbered in time order, and the comment box at the bottom,
// pinned to the current moment ("At 0:12") or to the whole video. opts:
//   folders     the client's driveFolders (to find the finished file)
//   title       heading (default: the video's title)
//   intro       a line under it
//   which       "open" (default) or "sent" notes; notesBy: only these authors
//   canNote     true to leave notes; authorRole / authorName for new ones
//   canReply    true to reply under comments (as authorRole / authorName)
//   canResolve  true to tick comments off as fixed (the editor; operators)
//   buttons     [{ label (text or notes => text), cls, needsNotes, onClick(notes, btn) }]
//   viewVersion an earlier version's number (from the version picker):
//               plays that cut with the comments left on it, read only
//   file        { id }: play this exact Drive file (no version picker)
//   demo        { notes, seconds }: a practice window for the walkthrough
//               when no real video is waiting. A pretend player, these
//               sample comments, and nothing read from or saved anywhere.
async function openReviewPlayer(video, opts) {
  opts = opts || {};
  const demo = opts.demo || null;
  // The window opens at once (the walkthrough points into it straight
  // away); the version picker joins it once the versions have loaded. Only
  // a pick from that picker (viewVersion) waits for them first.
  let versions = opts.viewVersion ? await loadVersions(video) : [];
  let latestV = versions.length ? versions[versions.length - 1].version : 0;
  const viewing = opts.viewVersion && opts.viewVersion !== latestV ? versions.find(v => v.version === opts.viewVersion) : null;
  if (viewing) opts = Object.assign({}, opts, { canNote: false, buttons: [], which: viewing.file_id ? { cut: viewing.file_id } : "sent" });
  const box = openModal(`
    <h2>${escapeHtml(opts.title || video.title || "Review the video")}</h2>
    ${opts.intro ? `<div class="meta" style="margin:0 0 14px">${opts.intro}</div>` : ""}
    <div class="rv">
      <div class="rv-stage"><div class="rv-load meta">Finding the video in Google Drive…</div></div>
      <div class="rv-side">
        <div class="rv-head"><b>Comments</b> <span class="rv-count meta"></span>
          <span class="rv-version-slot"></span></div>
        ${viewing ? `<div class="rv-old meta">You're looking at <b>v${viewing.version}</b>, an earlier cut, with the comments left on it.</div>` : ""}
        <div class="rv-list"></div>
        ${opts.canNote ? `<div class="rv-compose">
          <div class="rv-when" role="radiogroup" aria-label="What the comment is about">
            <div class="rv-when-at on" role="radio" tabindex="0" aria-checked="true">At <b class="rv-at">0:00</b><input type="text" class="rv-time-in" placeholder="0:12" inputmode="numeric" aria-label="Time in the video"></div>
            <button type="button" class="rv-when-all" role="radio" aria-checked="false">Whole video</button>
          </div>
          <textarea rows="3" placeholder="Leave your comment…"></textarea>
          <div class="rv-compose-row">
            <span class="meta rv-hint"></span>
            <button class="primary rv-add">Add comment</button>
          </div>
          <div class="auth-error rv-err"></div>
        </div>` : ""}
      </div>
    </div>
    <div class="modal-actions rv-actions" style="border:none;padding:16px 0 0;display:flex;gap:8px;flex-wrap:wrap"></div>`);
  box.classList.add("modal-wide");
  const stage = box.querySelector(".rv-stage"), list = box.querySelector(".rv-list"), count = box.querySelector(".rv-count"),
    actions = box.querySelector(".rv-actions");
  let notes = [], duration = 0, vid = null, marks = null, fill = null, head = null, timeEl = null, playBtn = null, cutRef = null, activeId = null;

  // Typed times until the player can tell the time itself.
  const hint = box.querySelector(".rv-hint");
  const setTyped = typed => {
    box.classList.toggle("rv-typed-mode", typed);
    if (hint) hint.textContent = typed ? "Pause the video, then type the time you're on." : "Pause where something should change. The comment is pinned to that moment.";
  };
  setTyped(true);
  const atEl = box.querySelector(".rv-at");
  const setAt = t => { if (atEl) atEl.textContent = fmtTime(t); };
  // The bar, the clock and the comment lit up for the current moment.
  function tick() {
    if (!vid || !fill) return;
    const pct = duration ? vid.currentTime / duration * 100 : 0;
    fill.style.width = pct + "%"; head.style.left = pct + "%";
    timeEl.textContent = `${fmtTime(vid.currentTime)} / ${fmtTime(duration)}`;
    setAt(vid.currentTime);
    const near = notes.find(n => n.at_seconds != null && Math.abs(vid.currentTime - n.at_seconds) < 0.6);
    list.querySelectorAll(".rv-note").forEach(el => el.classList.toggle("on", (!!near && el.dataset.id === near.id) || el.dataset.id === activeId));
  }
  const playerHtml = screen => `<div class="rv-player">
        ${screen}
        <div class="rv-bar">
          <div class="rv-track" title="Click or drag to move through the video"><div class="rv-rail"></div><div class="rv-fill"></div><div class="rv-head-dot"></div><div class="rv-marks"></div></div>
          <div class="rv-ctrls">
            <button type="button" class="rv-play" aria-label="Play">▶</button>
            <span class="rv-clock">0:00 / 0:00</span>
            <button type="button" class="rv-speed" title="Playback speed">1x</button>
            <button type="button" class="rv-mute" aria-label="Mute">Mute</button>
            <span style="flex:1"></span>
            <button type="button" class="rv-full" aria-label="Full screen">Full screen</button>
          </div>
        </div>
      </div>`;
  // The practice player: no file, a clock that runs while "playing", and
  // the same bar, marks and comment box as the real one.
  function showDemoPlayer() {
    stage.innerHTML = playerHtml(`<div class="rv-video rv-demo-screen"><div><b>Practice video</b><div class="meta">Your finished videos play here</div></div></div>`);
    marks = stage.querySelector(".rv-marks"); fill = stage.querySelector(".rv-fill");
    head = stage.querySelector(".rv-head-dot"); timeEl = stage.querySelector(".rv-clock"); playBtn = stage.querySelector(".rv-play");
    const track = stage.querySelector(".rv-track");
    duration = demo.seconds || 45;
    let t = 0, timer = null;
    vid = {
      get currentTime() { return t; },
      set currentTime(v) { t = Math.max(0, Math.min(duration, Number(v) || 0)); tick(); },
      get paused() { return !timer; },
      get isConnected() { return stage.isConnected; },
      pause() { if (timer) { clearInterval(timer); timer = null; } playBtn.textContent = "▶"; },
      play() {
        if (!timer) {
          activeId = null; playBtn.textContent = "❚❚";
          timer = setInterval(() => {
            if (!stage.isConnected || document.getElementById("videoModalRoot").classList.contains("hidden")) return vid.pause();
            t = Math.min(duration, t + 0.25); if (t >= duration) vid.pause(); tick();
          }, 250);
        }
        return Promise.resolve();
      },
    };
    playBtn.onclick = () => vid.paused ? vid.play() : vid.pause();
    track.addEventListener("click", e => {
      if (e.target.closest(".rv-mark")) return;
      const r = track.getBoundingClientRect();
      vid.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration;
    });
    setTyped(false); drawMarks(); tick();
  }

  // ── the video ──
  function showDrivePlayer(file, why) {
    vid = null; setTyped(true);
    const link = file ? `https://drive.google.com/file/d/${file.id}/view` : (finishedVideoLink(video, opts.folders) || {}).url;
    stage.innerHTML = (file ? `<iframe class="rv-frame" src="https://drive.google.com/file/d/${encodeURIComponent(file.id)}/preview" allow="autoplay; fullscreen" allowfullscreen></iframe>` : "")
      + `<div class="meta" style="margin-top:8px">${why ? escapeHtml(why) + " " : ""}Pause it, then type the time you're on next to your comment.</div>`
      + (link ? `<a class="btn" style="margin-top:8px" href="${escapeHtml(link)}" target="_blank" rel="noopener">${file ? "Open it in Google Drive" : "Open the video in Google Drive"}</a>` : "");
  }
  function showOwnPlayer(file, key, src) {
    stage.innerHTML = playerHtml(`<video class="rv-video" playsinline preload="metadata"></video>`) + `
      <div class="meta rv-loading">Loading the video…</div>`;
    const player = stage.querySelector(".rv-player"), track = stage.querySelector(".rv-track");
    vid = stage.querySelector("video"); marks = stage.querySelector(".rv-marks"); fill = stage.querySelector(".rv-fill");
    head = stage.querySelector(".rv-head-dot"); timeEl = stage.querySelector(".rv-clock"); playBtn = stage.querySelector(".rv-play");
    const muteBtn = stage.querySelector(".rv-mute"), speedBtn = stage.querySelector(".rv-speed");
    // Still nothing after 8 seconds (Google slowing or refusing the
    // stream, or a file the phone can't read): Google's player instead of
    // a long "Loading the video…".
    const slow = setTimeout(() => { if (!duration && vid && stage.contains(vid) && isDriveId(file.id)) showDrivePlayer(file, "The video was slow to load here, so it's in Google's player."); }, src ? 20000 : 8000);
    vid.addEventListener("loadedmetadata", () => {
      clearTimeout(slow);
      if (vid.videoHeight > vid.videoWidth) box.classList.add("rv-tall");
      duration = vid.duration || 0; setTyped(false);
      const l = stage.querySelector(".rv-loading"); if (l) l.remove();
      drawMarks(); tick();
    });
    vid.addEventListener("error", () => showDrivePlayer(isDriveId(file.id) ? file : null, "This video can't play here, so it's in Google's player."));
    vid.addEventListener("timeupdate", tick);
    vid.addEventListener("seeked", tick);
    vid.addEventListener("play", () => { playBtn.textContent = "❚❚"; playBtn.setAttribute("aria-label", "Pause"); activeId = null; });
    vid.addEventListener("pause", () => { playBtn.textContent = "▶"; playBtn.setAttribute("aria-label", "Play"); });
    const toggle = () => { if (vid.paused) vid.play().catch(() => {}); else vid.pause(); };
    playBtn.onclick = toggle;
    vid.addEventListener("click", toggle);
    speedBtn.onclick = () => {
      const speeds = [1, 1.5, 2, 0.5], next = speeds[(speeds.indexOf(vid.playbackRate) + 1) % speeds.length];
      vid.playbackRate = next; speedBtn.textContent = next + "x";
    };
    muteBtn.onclick = () => { vid.muted = !vid.muted; muteBtn.textContent = vid.muted ? "Unmute" : "Mute"; muteBtn.setAttribute("aria-label", muteBtn.textContent); };
    // Full screen: the whole player (video, comment marks, controls) where
    // the browser allows it; on an iPhone, which only lets the video itself
    // go full screen, the phone's own player. Either way a vertical video
    // fills the height (Tait, 2026-10-09).
    stage.querySelector(".rv-full").onclick = () => {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      const go = player.requestFullscreen || player.webkitRequestFullscreen;
      if (go) { const p = go.call(player); if (p && p.catch) p.catch(() => vid.webkitEnterFullscreen && vid.webkitEnterFullscreen()); }
      else if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen();
    };
    // No sound: some exports (a .mov with uncompressed "LPCM" audio) play
    // silently in Chrome. A couple of seconds in, if the browser has
    // decoded no audio, offer Google's player, which plays the sound.
    let soundChecked = false;
    vid.addEventListener("timeupdate", () => {
      if (soundChecked || vid.muted || vid.currentTime < 2) return;
      soundChecked = true;
      // Safari (iPhone) lists the audio tracks; Chrome counts decoded audio.
      const silent = vid.audioTracks ? vid.audioTracks.length === 0
        : "webkitAudioDecodedByteCount" in vid ? vid.webkitAudioDecodedByteCount === 0
        : vid.mozHasAudio === false;
      if (!silent || stage.querySelector(".rv-nosound") || !isDriveId(file.id)) return;
      stage.insertAdjacentHTML("beforeend", `<div class="rv-nosound meta">No sound? This video's audio can't play in this browser. <button type="button">Play it in Google's player</button></div>`);
      stage.querySelector(".rv-nosound button").onclick = () => showDrivePlayer(file, "Playing it in Google's player so you get the sound.");
    });
    // Scrubbing: click or drag anywhere on the bar.
    const seekTo = e => {
      if (!duration) return;
      const r = track.getBoundingClientRect();
      vid.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration;
    };
    let dragging = false;
    track.addEventListener("pointerdown", e => { if (e.target.closest(".rv-mark")) return; dragging = true; if (track.setPointerCapture && e.pointerId != null) track.setPointerCapture(e.pointerId); seekTo(e); });
    track.addEventListener("pointermove", e => { if (dragging) seekTo(e); });
    track.addEventListener("pointerup", () => { dragging = false; });
    track.addEventListener("click", e => { if (!e.target.closest(".rv-mark")) seekTo(e); });
    // Space plays and pauses; arrows step 5 seconds (not while typing),
    // wherever the focus is while this window is open.
    REVIEW_KEYS = e => {
      if (!vid || !vid.isConnected || document.getElementById("videoModalRoot").classList.contains("hidden")) return;
      if (e.target.closest && e.target.closest("textarea, input, select, [contenteditable]")) return;
      if (e.key === " ") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); vid.currentTime = Math.max(0, vid.currentTime - 5); }
      else if (e.key === "ArrowRight") { e.preventDefault(); vid.currentTime = Math.min(duration || 0, vid.currentTime + 5); }
    };
    vid.src = src || `${DRIVE_API}/${encodeURIComponent(file.id)}?alt=media&key=${encodeURIComponent(key)}`;
  }
  // Jump to a comment's moment, paused there, and light it up.
  const jump = (t, id) => {
    activeId = id || null;
    if (vid) { vid.pause(); vid.currentTime = Number(t) || 0; }
    list.querySelectorAll(".rv-note").forEach(el => el.classList.toggle("on", el.dataset.id === activeId));
    const el = id && list.querySelector(`.rv-note[data-id="${id}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  };

  // ── the comments ──
  const num = n => notes.indexOf(n) + 1;
  function drawMarks() {
    if (!marks) return;
    marks.innerHTML = duration ? notes.filter(n => n.at_seconds != null).map(n =>
      `<button type="button" class="rv-mark ${n.author_role === "client" ? "by-client" : "by-team"}" data-t="${n.at_seconds}" data-id="${n.id}"
        style="left:${Math.min(100, n.at_seconds / duration * 100)}%" title="#${num(n)} ${escapeHtml(fmtTime(n.at_seconds) + " · " + (n.author_name || "") + ": " + n.body)}">${escapeHtml(initials(n.author_name))}</button>`).join("") : "";
    marks.querySelectorAll(".rv-mark").forEach(m => m.onclick = () => jump(m.dataset.t, m.dataset.id));
  }
  let ME_UID = null;
  function drawList() {
    count.textContent = notes.length ? `(${notes.length})` : "";
    list.innerHTML = notes.length ? notes.map(n => `<div class="rv-note${n.id === activeId ? " on" : ""}" data-id="${n.id}">
        <span class="rv-avatar ${n.author_role === "client" ? "by-client" : "by-team"}">${escapeHtml(initials(n.author_name))}</span>
        <div class="rv-note-main">
          <div class="rv-note-top"><b>${escapeHtml(n.author_name || "")}</b> <span class="meta">${escapeHtml(ago(n.created_at))}</span><span class="rv-num meta">#${num(n)}</span></div>
          <div class="rv-body">${n.at_seconds == null ? `<span class="rv-time whole">Whole video</span>` : `<button type="button" class="rv-time" data-t="${n.at_seconds}">${fmtTime(n.at_seconds)}</button>`} ${escapeHtml(n.body)}</div>
          ${opts.canResolve ? `<label class="rv-fix"><input type="checkbox" data-fix="${n.id}"${n.resolved_at ? " checked" : ""}> Fixed</label>`
            : n.resolved_at ? `<div class="rv-fixed">✓ Fixed</div>` : ""}
          ${(n.replies || []).map(r => `<div class="rv-reply"><span class="rv-avatar sm ${r.author_role === "client" ? "by-client" : "by-team"}">${escapeHtml(initials(r.author_name))}</span>
            <div><div class="rv-note-top"><b>${escapeHtml(r.author_name || "")}</b> <span class="meta">${escapeHtml(ago(r.created_at))}</span></div><div class="rv-body">${escapeHtml(r.body)}</div></div></div>`).join("")}
          ${opts.canReply ? `<button type="button" class="rv-reply-btn" data-reply="${n.id}">Reply</button>
            <div class="rv-reply-box" data-reply-box="${n.id}" hidden><textarea rows="2" placeholder="Write a reply…"></textarea><div class="rv-reply-row"><button type="button" class="primary" data-reply-send="${n.id}">Reply</button><button type="button" data-reply-cancel="${n.id}">Cancel</button></div></div>` : ""}
        </div>
        ${opts.canNote && n.author_id === ME_UID ? `<button type="button" class="rv-del" title="Delete this comment" aria-label="Delete this comment" data-del="${n.id}">✕</button>` : ""}
      </div>`).join("")
      : `<div class="empty" style="padding:14px 4px">${opts.canNote ? "No comments yet. Pause the video where something should change and leave a comment, or leave one about the whole video." : "No comments on this cut."}</div>`;
    list.querySelectorAll(".rv-time[data-t]").forEach(b => b.onclick = () => jump(b.dataset.t, b.closest(".rv-note").dataset.id));
    list.querySelectorAll("[data-fix]").forEach(c => c.onchange = async () => {
      c.disabled = true;
      const { data, error } = await sbClient.rpc("social_resolve_comment", { p_comment_id: c.dataset.fix, p_done: c.checked });
      c.disabled = false;
      if (error) { c.checked = !c.checked; alert("Couldn't save that: " + error.message); return; }
      const n = notes.find(x => x.id === c.dataset.fix); if (n && data) n.resolved_at = data.resolved_at;
      if (opts.onChange) opts.onChange(notes);
    });
    list.querySelectorAll("[data-reply]").forEach(b => b.onclick = () => {
      const bx = list.querySelector(`[data-reply-box="${b.dataset.reply}"]`); bx.hidden = false; b.hidden = true; bx.querySelector("textarea").focus();
    });
    list.querySelectorAll("[data-reply-cancel]").forEach(b => b.onclick = () => drawList());
    list.querySelectorAll("[data-reply-send]").forEach(b => b.onclick = async () => {
      const n = notes.find(x => x.id === b.dataset.replySend), ta = list.querySelector(`[data-reply-box="${n.id}"] textarea`);
      const body = ta.value.trim();
      if (!body) { ta.focus(); return; }
      b.disabled = true;
      const { data, error } = demo ? { data: [{ id: "demo-" + Date.now(), parent_id: n.id, body, author_role: opts.authorRole || "client", author_name: opts.authorName || null, author_id: ME_UID, created_at: new Date().toISOString() }] }
        : await sbClient.from("social_video_comments").insert({
        video_id: video.id, parent_id: n.id, cut_ref: n.cut_ref, body,
        author_role: opts.authorRole || "client", author_name: opts.authorName || null,
      }).select("*");
      b.disabled = false;
      if (error) { alert("Couldn't send that reply: " + error.message); return; }
      n.replies = (n.replies || []).concat(data || []);
      drawList();
      if (opts.onChange) opts.onChange(notes);
    });
    list.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      b.disabled = true;
      const { error } = demo ? {} : await sbClient.from("social_video_comments").delete().eq("id", b.dataset.del);
      if (error) { b.disabled = false; alert("Couldn't delete that comment: " + error.message); return; }
      notes = notes.filter(n => n.id !== b.dataset.del); redraw();
    });
  }
  function drawButtons() {
    actions.innerHTML = "";
    (opts.buttons || []).forEach(def => {
      const b = document.createElement("button");
      b.className = def.cls || "";
      b.textContent = typeof def.label === "function" ? def.label(notes) : def.label;
      b.disabled = !!def.needsNotes && !notes.length;
      b.onclick = () => def.onClick(notes, b);
      actions.appendChild(b);
    });
  }
  function redraw() { drawMarks(); drawList(); drawButtons(); }

  // ── the comment box ── At the current moment (typing pauses the video,
  // so the comment lands on the frame they were looking at; moving the
  // playhead moves the time with it), or about the whole video.
  const ta = box.querySelector(".rv-compose textarea"), typedIn = box.querySelector(".rv-time-in");
  const atBtn = box.querySelector(".rv-when-at"), allBtn = box.querySelector(".rv-when-all");
  let whole = false;
  const setWhole = w => {
    whole = w;
    atBtn.classList.toggle("on", !w); allBtn.classList.toggle("on", w);
    atBtn.setAttribute("aria-checked", String(!w)); allBtn.setAttribute("aria-checked", String(w));
  };
  if (ta) {
    atBtn.onclick = e => { setWhole(false); if (e.target !== typedIn) (box.classList.contains("rv-typed-mode") ? typedIn : ta).focus(); };
    atBtn.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target === atBtn) { e.preventDefault(); atBtn.onclick(e); } });
    allBtn.onclick = () => { setWhole(true); ta.focus(); };
    typedIn.addEventListener("focus", () => setWhole(false));
    const pauseForNote = () => { if (vid && duration && !vid.paused && !whole) vid.pause(); };
    ta.addEventListener("focus", pauseForNote);
    ta.addEventListener("input", pauseForNote);
    ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } });
    box.querySelector(".rv-add").onclick = add;
  }
  async function add() {
    const err = box.querySelector(".rv-err"), btn = box.querySelector(".rv-add");
    const body = ta.value.trim();
    err.textContent = "";
    if (!body) { ta.focus(); return; }
    let at = null;
    if (!whole) {
      if (box.classList.contains("rv-typed-mode")) {
        at = parseTime(typedIn.value);
        if (at == null || Number.isNaN(at)) { err.textContent = "Type the time like 0:12 (minutes:seconds), or choose Whole video."; typedIn.focus(); return; }
      } else at = Math.round((vid.currentTime || 0) * 10) / 10;
    }
    btn.disabled = true;
    const { data, error } = demo ? { data: [{ id: "demo-" + Date.now(), at_seconds: at, body, author_role: opts.authorRole || "client", author_name: opts.authorName || null, author_id: ME_UID, created_at: new Date().toISOString(), replies: [] }] }
      : await sbClient.from("social_video_comments").insert({
      video_id: video.id, cut_ref: cutRef, at_seconds: at, body,
      author_role: opts.authorRole || "client", author_name: opts.authorName || null,
    }).select("*");
    btn.disabled = false;
    if (error) { err.textContent = "Couldn't save that comment: " + error.message; return; }
    notes = notes.concat(data || []).sort(byTime);
    ta.value = ""; if (typedIn) typedIn.value = "";
    setWhole(false); // most comments are about a moment
    activeId = data && data[0] ? data[0].id : null;
    redraw();
  }

  if (demo) {
    ME_UID = "demo-me";
    notes = demo.notes.map(n => Object.assign({ replies: [] }, n)).sort(byTime);
    if (demo.versions) {
      box.querySelector(".rv-version-slot").outerHTML = `<select class="rv-version" aria-label="Version">${demo.versions.map((v, k) => `<option>${escapeHtml(v)}${k ? "" : " (latest)"}</option>`).join("")}</select>`;
    }
    showDemoPlayer(); redraw();
    return box;
  }
  try { const { data } = await sbClient.auth.getSession(); ME_UID = data && data.session && data.session.user.id; } catch (e) {}
  try { notes = await loadReviewNotes(video, opts.which || "open", opts.notesBy); redraw(); }
  catch (e) { drawButtons(); list.innerHTML = `<div class="auth-error">Couldn't load the comments: ${escapeHtml(e.message)}</div>`; }

  if (!opts.viewVersion && !opts.file) { versions = await loadVersions(video); latestV = versions.length ? versions[versions.length - 1].version : 0; }
  if (versions.length) {
    box.querySelector(".rv-version-slot").outerHTML = `<select class="rv-version" aria-label="Version">${versions.slice().reverse().map(v => `<option value="${v.version}"${v.version === (viewing ? viewing.version : latestV) ? " selected" : ""}>v${v.version} · ${escapeHtml(niceDate(String(v.created_at).slice(0, 10)))}${v.version === latestV ? " (latest)" : ""}</option>`).join("")}</select>`;
    const pickV = box.querySelector(".rv-version");
    pickV.onchange = () => openReviewPlayer(video, Object.assign({}, opts.base || opts, { base: opts.base || opts, viewVersion: Number(pickV.value) }));
  }
  // Which cut, and its review copy in Supabase (migration 018) if it has
  // one: that's what plays. Without one, the Drive file streams as before.
  const latestVer = versions.length ? versions[versions.length - 1] : null;
  let file = null, copy = null;
  if (opts.file) {
    file = opts.file;
    const m = (await loadVersions(video)).reverse().find(x => x.file_id === file.id || x.storage_path === file.id);
    copy = m && m.storage_path;
  } else if (viewing) {
    file = viewing.file_id || viewing.storage_path ? { id: viewing.file_id || viewing.storage_path } : null;
    copy = viewing.storage_path;
  } else if (latestVer && latestVer.storage_path) {
    file = { id: latestVer.file_id || latestVer.storage_path, name: latestVer.file_name, version: latestVer.version };
    copy = latestVer.storage_path;
  } else file = await findFinishedFile(video, opts.folders, versions);
  const key = await googleKey(), onDrive = !!(file && isDriveId(file.id));
  cutRef = file ? file.id : null;
  let src = null;
  if (copy) try {
    const { data } = await sbClient.storage.from("review").createSignedUrl(copy, 6 * 3600);
    src = data && data.signedUrl;
  } catch (e) { /* no copy to hand: Drive */ }
  // A vertical video gets a tall frame (ours and Google's), so a phone
  // shows it whole instead of squeezed into a wide box (Tait, 2026-10-09).
  // A review copy says its own shape once it loads.
  if (!src && onDrive && key) try {
    const m = await (await fetch(`${DRIVE_API}/${encodeURIComponent(file.id)}?fields=videoMediaMetadata&key=${encodeURIComponent(key)}`)).json();
    const vm = m && m.videoMediaMetadata;
    if (vm && vm.height > vm.width) box.classList.add("rv-tall");
  } catch (e) { /* shape unknown: the usual wide frame */ }
  if (src) showOwnPlayer(file, null, src);
  else if (onDrive && key) showOwnPlayer(file, key);
  else showDrivePlayer(onDrive ? file : null, onDrive ? "" : "We couldn't find the finished file here.");
  if (opts.canUploadCopy && !copy && !viewing) offerReviewCopy(box, video, latestVer, onDrive ? file : null, () => openReviewPlayer(video, opts));
  return box;
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
  if (root) root.querySelectorAll("video").forEach(v => { if (!v.paused) v.pause(); });
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
  box.classList.remove("modal-wide");
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

  document.getElementById("videoModalBox").classList.remove("modal-wide");
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
      ${video.finalCutUrl && !opts.hideFinalCut ? `<a class="btn primary" href="${escapeHtml(video.finalCutUrl)}" target="_blank" rel="noopener">Watch the finished video</a>` : ""}
      ${linkKeys.filter(k => f[k]).map(k => {
        const raw = k === "footageUploads" ? rawFootageLink(video, f) : null;
        return `<a class="btn" href="${escapeHtml(raw ? raw.url : f[k])}" target="_blank" rel="noopener">${escapeHtml(raw ? raw.label : linkLabels[k] || k)}</a>`;
      }).join("")}
    </div>

    ${opts.actionsHtml ? `<div class="modal-actions">${opts.actionsHtml}</div>` : ""}
  `;
  document.getElementById("videoModalRoot").classList.remove("hidden");
}

// ---------- Onboarding ----------
// The questions a new client answers in their voice memo, in the order
// Luke's own recordings answered them (clients/*/sources/*luke*), plus the
// perspective questions behind the 3-3-3. Shown on /welcome and in the
// operator's onboarding view.
// The standard voice memo questions (Tait, 2026-10-05): they draw out the
// client's voice (how they talk), their ideal customer in depth (pains,
// fears, dreams, practical goals, objections), their unique solutions,
// their stories, and their offer. A client with their own list (the
// `voice-memo-questions` skill, saved in social_clients.onboarding_questions,
// migration 011) sees that instead: see questionsFor().
// "story": a story prompt. The client only names the story on the memo;
// they tell it in full on camera when it's asked from behind the camera.
const ONBOARDING_QUESTIONS = [
  { section: "You and your business", note: "Answer the way you'd talk to a friend. How you talk is part of what we're listening for, so don't read anything out.", items: [
    { id: "what", q: "What does your business do, in plain words? Explain it the way you would to a friend at dinner." },
    { id: "why", q: "Why did you start it? What were you doing before, and what made you go for it?" },
    { id: "intro", q: "When someone asks \"so what do you do?\", what do you usually say?" },
    { id: "phrases", q: "What words or phrases do you catch yourself saying all the time, with customers or your team?" },
    { id: "cringe", q: "What kind of marketing makes you cringe? What would you never say?" },
  ] },
  { section: "Your ideal customer", note: "Picture one real customer while you answer.", items: [
    { id: "best", q: "Who is your best customer? Describe one real person: their age, their job or business, where they live, what their life looks like." },
    { id: "kinds", q: "If you have more than one kind of customer, which kind do you want more of, and why?" },
    { id: "tipped", q: "What just happened in their life or business right before they found you?" },
    { id: "problems", q: "What problems do they come to you with? Use their words if you remember them." },
    { id: "badday", q: "What does a bad day look like for them, because of this problem?" },
    { id: "afraid", q: "What are they afraid of? What's the worst case they worry about?" },
    { id: "unsaid", q: "What are they frustrated or embarrassed about, but won't say out loud?" },
    { id: "dream", q: "A year after working with you, what does their life look like? What's the dream?" },
    { id: "goals", q: "What practical goals do they have? The numbers, deadlines or results they're after." },
    { id: "tried", q: "What have they already tried that didn't work, and why didn't it?" },
    { id: "beliefs", q: "What do they believe about this that isn't true?" },
    { id: "hear", q: "What questions and doubts do you hear over and over before someone buys?" },
  ] },
  { section: "Your way of solving it", items: [
    { id: "solve", q: "In plain words, what do you do better than anyone? Why can't someone else just copy it?" },
    { id: "process", q: "Walk us through what you do for a new customer, step by step, the way it really happens." },
    { id: "wrong", q: "What does your industry get wrong? What do you do differently?" },
    { id: "believe", q: "What do you believe that most people in your space don't? Give two or three." },
  ] },
  { section: "Your stories", note: "Just name each story in a sentence or two. Don't tell it in full: we'll ask you on camera and you'll tell the whole story then.", items: [
    { id: "proud", story: true, q: "A customer you're proud of: what was going on when they came to you, and what changed?" },
    { id: "wentwrong", story: true, q: "A time something went wrong, with a customer or in your business, and what you learned." },
    { id: "moment", story: true, q: "The moment you knew you had to start this business." },
    { id: "almost", story: true, q: "A customer who almost didn't buy, or almost walked away. What happened?" },
    { id: "life", story: true, q: "Something from your life outside work that shaped how you do business." },
    { id: "funny", story: true, q: "A funny or surprising moment on the job." },
  ] },
  { section: "What you sell", items: [
    { id: "offer", q: "What do you sell? Each offer, what it includes, and roughly what it costs." },
    { id: "results", q: "What results have customers gotten? Real numbers if you have them." },
    { id: "start", q: "How do people usually start working with you? What's the first step you'd want someone watching your videos to take?" },
  ] },
];

// The questions a client sees: their own list if they have one, else the
// standard one.
function questionsFor(client) {
  const qs = client && client.onboarding_questions;
  return Array.isArray(qs) && qs.some(s => s && Array.isArray(s.items) && s.items.length) ? qs : ONBOARDING_QUESTIONS;
}
// The plain-text form Tait edits on the Onboarding panel:
//   ## Section heading
//   Note: an optional line under the heading
//   - A question
//   - [story] A story prompt
function questionsToText(qs) {
  return qs.map(s => [`## ${s.section}`].concat(s.note ? [`Note: ${s.note}`] : [], s.items.map(it => `- ${it.story ? "[story] " : ""}${it.q}`)).join("\n")).join("\n\n");
}
function questionsFromText(text) {
  const out = [];
  let n = 0;
  String(text || "").split("\n").forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    let m;
    if ((m = line.match(/^#+\s*(.+)$/))) { out.push({ section: m[1].trim(), items: [] }); return; }
    if (!out.length) out.push({ section: "Questions", items: [] });
    const sec = out[out.length - 1];
    if ((m = line.match(/^note:\s*(.+)$/i)) && !sec.items.length) { sec.note = m[1].trim(); return; }
    const q = line.replace(/^(?:[-*•]|\d+[.)])\s*/, "");
    const story = /^\[story\]\s*/i.test(q);
    const text = q.replace(/^\[story\]\s*/i, "").trim();
    if (text) sec.items.push(Object.assign({ id: "q" + (++n), q: text }, story ? { story: true } : {}));
  });
  return out.filter(s => s.items.length);
}

// Where a client is in onboarding, for the operator's Clients list.
function onboardingSummary(o, clientFilms) {
  if (!o) return { label: "Not invited yet", done: false };
  if (o.completed_at) return { label: "Onboarding done", done: true };
  const steps = [
    ["Invited", !!o.invited_at], ["Password", !!o.password_set_at],
    ["Brand", !!(o.brand && (o.brand.done || ["uploaded", "none", "create_for_me"].includes(o.brand.files)))],
    ["Voice memo", !!(o.voice_memo_path || o.voice_memo_sent_at || o.transcript)], ["Transcript added", !!o.transcript],
    ["Footage", !!o.footage_done_at],
  ];
  return { label: steps.map(([l, ok]) => (ok ? "✓ " : "") + l).join(" · "), done: false, failed: o.docs_status === "failed" };
}

// A generated document's body without its own "# Title" line (the card or
// popup already shows the title).
function docBodyHtml(d) { return mdToHtml(String(d.body_md || "").replace(/^\s*#\s+[^\n]*\n/, "")); }
// Tiny Markdown → HTML for the generated documents: headings, lists,
// bold, italics, quotes, rules. Escapes everything first.
function mdToHtml(md) {
  const inline = s => escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  String(md || "").split("\n").forEach(line => {
    const t = line.trimEnd();
    let m;
    if (!t.trim()) { close(); return; }
    if ((m = t.match(/^(#{1,4})\s+(.*)$/))) { close(); const n = Math.min(m[1].length + 1, 4); out.push(`<h${n}>${inline(m[2])}</h${n}>`); return; }
    if (/^---+$/.test(t.trim())) { close(); out.push("<hr>"); return; }
    if ((m = t.match(/^\s*[-*]\s+(.*)$/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); return; }
    if ((m = t.match(/^\s*\d+\.\s+(.*)$/))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); return; }
    if ((m = t.match(/^>\s?(.*)$/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); return; }
    if (list) { const last = out.pop(); out.push(last.replace(/<\/li>$/, "<br>" + inline(t.trim()) + "</li>")); return; }
    out.push(`<p>${inline(t.trim())}</p>`);
  });
  close();
  return out.join("");
}

// ---------- Password fields (welcome page, editor setup) ----------
const EYE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const pwField = (id, label) => `<label for="${id}">${label}</label>
  <div class="pw-wrap"><input type="password" id="${id}" autocomplete="new-password"><button type="button" class="pw-eye" data-eye="${id}" aria-label="Show password" title="Show password">${EYE}</button></div>`;

// ---------- Walkthroughs (client portal after onboarding, editor setup) ----------
// steps: [{ go(), el(), title, html() }]. Each step opens its page (go),
// dims everything but el() and rings it in gold, with the card beside it
// and an arrow pointing at it; then "Bookmark this page". Steps whose
// target isn't there are left out. onEnd runs when it closes.
function runTour(TOUR, { onEnd } = {}) {
  const blocker = document.createElement("div"); blocker.className = "tour-veil"; blocker.id = "tourVeil";
  const dims = [0, 1, 2, 3].map(() => { const d = document.createElement("div"); d.className = "tour-dim"; return d; });
  const spot = document.createElement("div"); spot.className = "tour-spot"; spot.id = "tourSpot";
  const card = document.createElement("div"); card.className = "tour-card"; card.id = "tourCard";
  document.body.append(blocker, ...dims, spot, card);
  const px = v => Math.max(v, 0) + "px";
  let i = 0, target = null;
  // There, and not inside something hidden (each step has already opened
  // its page and tab, so a hidden parent means it doesn't apply).
  const visible = el => { for (let n = el; n && n !== document.body; n = n.parentElement) if (n.style && n.style.display === "none") return false; return !!el; };
  // Ring the target, dim everything around it (four panels: a giant
  // box-shadow didn't paint reliably in Chrome), and put the card beside it
  // (right, else below, else above, else left when above would cover it) with the arrow pointing at it. A big
  // target (a whole video card) gets the card in the bottom-right corner
  // instead, over its empty side. Phones: the card sits at the bottom.
  const place = () => {
    if (!target) return;
    const r = target.getBoundingClientRect(), pad = 6, vw = innerWidth, vh = innerHeight;
    const top = Math.round(Math.max(r.top - pad, 4)), bottom = Math.round(Math.min(r.bottom + pad, vh - 4)), left = Math.round(r.left - pad), right = Math.round(r.right + pad);
    Object.assign(spot.style, { left: left + "px", top: top + "px", width: px(right - left), height: px(bottom - top) });
    [{ left: "0", top: "0", width: "100%", height: px(top) }, { left: "0", top: bottom + "px", width: "100%", height: px(vh - bottom) },
     { left: "0", top: top + "px", width: px(left), height: px(bottom - top) }, { left: right + "px", top: top + "px", width: px(vw - right), height: px(bottom - top) }]
      .forEach((st, k) => Object.assign(dims[k].style, st));
    card.style.left = card.style.top = card.style.bottom = card.style.right = "";
    card.removeAttribute("data-arrow");
    // Phones: the card sits at the bottom, or at the top when what it
    // points at is in the bottom half, so it never covers it.
    card.classList.toggle("tour-top", vw < 760 && (top + bottom) / 2 > vh / 2 && r.height <= vh * 0.45);
    if (vw < 760) return;
    if (r.height > vh * 0.45) { Object.assign(card.style, { left: "auto", top: "auto", right: "24px", bottom: "24px" }); return; }
    const w = card.offsetWidth, h = card.offsetHeight, gap = 18;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    let x, y, arrow;
    if (r.right + pad + gap + w < vw - 16) { x = r.right + pad + gap; y = clamp((top + bottom) / 2 - h / 2, 16, vh - h - 16); arrow = "left"; card.style.setProperty("--ay", clamp((top + bottom) / 2 - y, 22, h - 22) + "px"); }
    else if (bottom + gap + h < vh - 16) { y = bottom + gap; x = clamp(r.left, 16, vw - w - 16); arrow = "top"; card.style.setProperty("--ax", clamp(r.left + r.width / 2 - x, 22, w - 22) + "px"); }
    // No room above either (a tall target, like a review window's comment
    // list): beside it on the left, so it doesn't cover what it points at.
    else if (top - gap - h < 16 && left - gap - w > 16) { x = left - gap - w; y = clamp((top + bottom) / 2 - h / 2, 16, vh - h - 16); arrow = "right"; card.style.setProperty("--ay", clamp((top + bottom) / 2 - y, 22, h - 22) + "px"); }
    else { y = Math.max(top - gap - h, 16); x = clamp(r.left, 16, vw - w - 16); arrow = "bottom"; card.style.setProperty("--ax", clamp(r.left + r.width / 2 - x, 22, w - 22) + "px"); }
    card.style.left = x + "px"; card.style.top = y + "px"; card.dataset.arrow = arrow;
  };
  const end = () => { target = null; removeEventListener("resize", place); removeEventListener("scroll", place, true); [blocker, ...dims, spot, card].forEach(n => n.remove()); if (onEnd) onEnd(); };
  const bookmark = () => {
    target = null; spot.style.display = "none"; card.removeAttribute("data-arrow");
    dims.forEach((d, k) => Object.assign(d.style, k ? { width: "0", height: "0" } : { left: "0", top: "0", width: "100%", height: "100%" }));
    card.style.left = card.style.top = card.style.bottom = card.style.right = "";
    const host = location.host;
    card.className = "tour-card tour-bookmark";
    card.innerHTML = `<h2>Bookmark this page</h2>
      <p>Save <b>${escapeHtml(host)}</b> as a bookmark so you can come back any time. Sign in with your email and the password you just made.</p>
      <div class="tour-url">${escapeHtml(host)}</div>
      <p class="meta">On a computer, press ${/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘ + D" : "Ctrl + D"}. On a phone, use your browser's share or menu button, then "Add bookmark" or "Add to Home Screen".</p>
      <div class="tour-actions"><span></span><button type="button" class="accent" data-tour-done>Got it</button></div>`;
    card.querySelector("[data-tour-done]").onclick = end;
  };
  // Steps whose target isn't there (no Time sensitive tab, nothing to
  // film, a we-film client with no Upload footage button) are left out.
  const steps = TOUR.filter(t => { t.go(); return visible(t.el()); });
  // A step's go() may return a promise (one that opens a window first).
  const show = async () => {
    if (i >= steps.length) return bookmark();
    const t = steps[i];
    await t.go(); target = t.el();
    if (!target) { i++; return show(); }
    // A big target scrolls to its top, so its title and hook show.
    const big = target.getBoundingClientRect().height > innerHeight * 0.45;
    if (target.scrollIntoView) target.scrollIntoView({ block: big ? "start" : "center" });
    if (big) scrollBy(0, -16);
    spot.style.display = "";
    card.innerHTML = `<div class="tour-count">Step ${i + 1} of ${steps.length}</div><h2>${escapeHtml(t.title)}</h2><div class="tour-text">${t.html()}</div>
      <div class="tour-actions"><button type="button" class="reject" data-tour-skip>Skip tour</button><span style="display:flex;gap:8px">${i ? '<button type="button" data-tour-back>Back</button>' : ""}<button type="button" class="primary" data-tour-next>${i === steps.length - 1 ? "Finish" : "Next"}</button></span></div>`;
    card.querySelector("[data-tour-next]").onclick = () => { i++; show(); };
    const back = card.querySelector("[data-tour-back]");
    if (back) back.onclick = () => { i--; show(); };
    card.querySelector("[data-tour-skip]").onclick = bookmark;
    place();
    setTimeout(place, 400); // again once anything still loading has settled
  };
  addEventListener("resize", place); addEventListener("scroll", place, true);
  show();
}

