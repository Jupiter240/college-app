/**
 * Ayan — Minimalist College & Internship Tracker
 * Inspired by Linear, Notion, and Simplify:
 * - High-signal, low-noise 4–5 column tables (zero horizontal scroll clutter)
 * - Progressive disclosure: click any row to inspect/edit all fields or delete in a slide-over drawer
 * - Hover-activated 3-line navigation panel on the right containing all 13 Google Sheet tabs
 */

const STORAGE_KEY = "ayan_college_internship_app_v1";

const state = {
  data: null,
  activeTab: "overview",
  globalSearch: "",
  showCriteria: false,
  showUcsdImage: false,
  // Filters
  internFilter: "all",
  internSort: "deadline",
  collegeBucketFilter: "all",
  collegeSort: "sheet",
  deadlineUrgencyFilter: "upcoming",
  deadlineCategoryFilter: "all",
  collegeDeadlinesFilter: "all",
};

const TABS = [
  { id: "overview", label: "Overview", group: "Workspace" },
  { id: "Internship", label: "Internship", group: "Sheets" },
  { id: "Colleges", label: "Colleges", group: "Sheets" },
  { id: "College Deadlines", label: "College Deadlines", group: "Sheets" },
  { id: "Majors", label: "Majors", group: "Sheets" },
  { id: "ToDos", label: "ToDos", group: "Sheets" },
  { id: "UCs", label: "UCs", group: "Sheets" },
  { id: "GPA", label: "GPA", group: "Sheets" },
  { id: "UCCSU GPA", label: "UCCSU GPA", group: "Sheets" },
  { id: "NoSupplemental Colleges", label: "NoSupplemental Colleges", group: "Sheets" },
  { id: "College counselors", label: "College counselors", group: "Sheets" },
  { id: "Questions for Colleen", label: "Questions for Colleen", group: "Sheets" },
  { id: "Notes", label: "Notes", group: "Sheets" },
  { id: "Diyas Notes", label: "Diyas Notes", group: "Sheets" },
];

// ============================================================================
// UTILITIES & SMART DATE PARSING
// ============================================================================

function esc(val) {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function uid(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getTodayMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseSmartDate(rawStr, fallbackYear = null) {
  if (!rawStr) return null;
  const s = String(rawStr).trim();
  if (!s || s.toUpperCase() === "ASAP" || s === "--" || s.toLowerCase() === "n/a") {
    return null;
  }

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const slashFull = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashFull) {
    let yr = Number(slashFull[3]);
    if (yr < 100) yr += 2000;
    return new Date(yr, Number(slashFull[1]) - 1, Number(slashFull[2]));
  }

  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };
  const natMatch = s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/i);
  if (natMatch && months[natMatch[1].toLowerCase()] !== undefined) {
    const m = months[natMatch[1].toLowerCase()];
    const d = Number(natMatch[2]);
    const today = getTodayMidnight();
    let y = natMatch[3] ? Number(natMatch[3]) : (fallbackYear || today.getFullYear());
    if (!natMatch[3] && !fallbackYear) {
      const candidate = new Date(y, m, d);
      if (candidate < new Date(today.getFullYear(), today.getMonth() - 2, 1)) {
        y += 1;
      }
    }
    return new Date(y, m, d);
  }

  const rangeMatch = s.match(/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/);
  if (rangeMatch) {
    const today = getTodayMidnight();
    const m = Number(rangeMatch[3]) - 1;
    const d = Number(rangeMatch[4]);
    let y = fallbackYear || today.getFullYear();
    return new Date(y, m, d);
  }

  return null;
}

function toIsoDateString(dt) {
  if (!dt || isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatReadableDate(isoOrRaw) {
  if (!isoOrRaw) return "—";
  const dt = parseSmartDate(isoOrRaw);
  if (!dt) return String(isoOrRaw);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function computeDeadlineMeta(dateOrRaw, completed = false) {
  if (completed) {
    return {
      badgeText: "Done",
      pillClass: "pill-success",
      daysLeft: 99999,
      sortKey: 9999999999999,
      isUrgent: false,
      isUpcoming: false,
      isPast: false,
      formattedDate: formatReadableDate(dateOrRaw),
    };
  }
  const raw = String(dateOrRaw || "").trim();
  if (!raw) {
    return {
      badgeText: "Rolling / TBD",
      pillClass: "pill-neutral",
      daysLeft: null,
      sortKey: 8888888888888,
      isUrgent: false,
      isUpcoming: true,
      isPast: false,
      formattedDate: "—",
    };
  }
  if (raw.toUpperCase() === "ASAP") {
    return {
      badgeText: "ASAP",
      pillClass: "pill-urgent",
      daysLeft: 0,
      sortKey: getTodayMidnight().getTime() - 1000,
      isUrgent: true,
      isUpcoming: true,
      isPast: false,
      formattedDate: "ASAP",
    };
  }

  const dt = parseSmartDate(raw);
  if (!dt) {
    return {
      badgeText: raw,
      pillClass: "pill-neutral",
      daysLeft: null,
      sortKey: 7777777777777,
      isUrgent: false,
      isUpcoming: true,
      isPast: false,
      formattedDate: raw,
    };
  }

  const today = getTodayMidnight();
  const diffDays = Math.round((dt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const formatted = dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (diffDays < 0) {
    const ago = Math.abs(diffDays);
    return {
      badgeText: ago <= 60 ? `${ago}d ago` : "Past",
      pillClass: ago <= 14 ? "pill-urgent" : "pill-neutral",
      daysLeft: diffDays,
      sortKey: dt.getTime(),
      isUrgent: ago <= 7,
      isUpcoming: false,
      isPast: true,
      formattedDate: formatted,
    };
  }
  if (diffDays === 0) {
    return {
      badgeText: "Due today",
      pillClass: "pill-urgent",
      daysLeft: 0,
      sortKey: dt.getTime(),
      isUrgent: true,
      isUpcoming: true,
      isPast: false,
      formattedDate: formatted,
    };
  }
  if (diffDays <= 14) {
    return {
      badgeText: `${diffDays}d left`,
      pillClass: "pill-urgent",
      daysLeft: diffDays,
      sortKey: dt.getTime(),
      isUrgent: true,
      isUpcoming: true,
      isPast: false,
      formattedDate: formatted,
    };
  }
  if (diffDays <= 45) {
    return {
      badgeText: `${diffDays}d left`,
      pillClass: "pill-soon",
      daysLeft: diffDays,
      sortKey: dt.getTime(),
      isUrgent: false,
      isUpcoming: true,
      isPast: false,
      formattedDate: formatted,
    };
  }
  return {
    badgeText: `${diffDays}d left`,
    pillClass: "pill-upcoming",
    daysLeft: diffDays,
    sortKey: dt.getTime(),
    isUrgent: false,
    isUpcoming: true,
    isPast: false,
    formattedDate: formatted,
  };
}

function getBucketPillClass(bucket) {
  const b = (bucket || "").toLowerCase();
  if (b.includes(",") || b.includes("uc")) return "pill-uc";
  if (b.includes("reach")) return "pill-reach";
  if (b.includes("target") || b.includes("taget")) return "pill-target";
  if (b.includes("safety")) return "pill-safety";
  return "pill-neutral";
}

function getDecisionPillClass(decision) {
  const d = (decision || "").toLowerCase();
  if (d.includes("accepted")) return "pill-success";
  if (d.includes("rejected")) return "pill-urgent";
  if (d.includes("waitlist")) return "pill-soon";
  if (d) return "pill-upcoming";
  return "pill-neutral";
}

// ============================================================================
// DATA LOADING & PERSISTENCE
// ============================================================================

async function initApp() {
  let loaded = null;
  try {
    const res = await fetch("/api/data", { cache: "no-store" });
    if (res.ok) loaded = await res.json();
  } catch (_) {}

  if (!loaded) {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try { loaded = JSON.parse(cached); } catch (_) {}
    }
  }
  if (!loaded && window.INITIAL_APP_DATA) {
    loaded = JSON.parse(JSON.stringify(window.INITIAL_APP_DATA));
  }

  state.data = loaded;
  bindGlobalEvents();
  renderAll();
}

async function persistData(toastMsg = null, undoItem = null) {
  const statusText = document.getElementById("save-status-text");
  if (statusText) statusText.textContent = "Saving...";

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  } catch (_) {}

  try {
    await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.data),
    });
  } catch (_) {}

  if (statusText) statusText.textContent = "Saved";
  if (toastMsg) showToast(toastMsg, undoItem);
}

function showToast(message, undoCallback = null) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (undoCallback) {
    const btn = document.createElement("button");
    btn.textContent = "Undo";
    btn.addEventListener("click", () => {
      undoCallback();
      el.remove();
    });
    el.appendChild(btn);
  }
  container.appendChild(el);
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 4000);
}

// ============================================================================
// RIGHT HOVER SIDE PANEL & ROUTER
// ============================================================================

function getTabBadgeCount(tabId) {
  const d = state.data;
  if (!d) return "";
  switch (tabId) {
    case "overview":
      return getAllDeadlines().filter((x) => !x.meta.isPast && !x.completed).length;
    case "Internship":
      return d.internships.length;
    case "ToDos":
      return d.todos.filter((t) => !t.completed).length;
    case "College counselors":
      return d.counselors.length;
    case "Majors":
      return d.majors.length;
    case "Colleges":
      return d.colleges.length;
    case "NoSupplemental Colleges":
      return d.noSupplementalColleges.length;
    case "Notes":
      return d.bucketNotes.length;
    case "Diyas Notes":
      return d.diyasNotes.interviews.length;
    case "GPA":
      return calculateGpaMetrics(d.gpa.regular.courses).academicWeighted;
    case "UCCSU GPA":
      return calculateGpaMetrics(d.gpa.uccsu.courses).academicWeighted;
    case "UCs":
      return d.ucs.campuses.length;
    case "Questions for Colleen":
      return d.questionsForColleen.length;
    case "College Deadlines":
      return d.collegeDeadlines.applications.length;
    default:
      return "";
  }
}

function renderSidebar() {
  const nav = document.getElementById("sidebar-nav");
  if (!nav) return;

  const groups = {};
  for (const t of TABS) {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  }

  let html = `<div class="nav-section">`;
  for (const [groupName, items] of Object.entries(groups)) {
    html += `
      <div>
        <div class="nav-group-label">${esc(groupName)}</div>
        <div class="nav-list">
          ${items
            .map((t) => {
              const active = state.activeTab === t.id ? "active" : "";
              const count = getTabBadgeCount(t.id);
              return `
                <button class="nav-btn ${active}" data-tab="${esc(t.id)}">
                  <span>${esc(t.label)}</span>
                  ${count !== "" ? `<span class="nav-count">${esc(count)}</span>` : ""}
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }
  html += `</div>`;

  // Subtle utility footer inside the side panel (keeps top bar clean)
  html += `
    <div class="nav-footer">
      <div class="nav-group-label">Data &amp; Sync</div>
      <button class="nav-btn" id="panel-sync-sheet"><span>Sync from Google Sheet</span></button>
      <button class="nav-btn" id="panel-export-json"><span>Export Backup JSON</span></button>
      <button class="nav-btn" id="panel-import-json"><span>Import Backup JSON</span></button>
      <a class="nav-btn" href="https://docs.google.com/spreadsheets/d/1TQQxO4H7hZueiuH2XLK0yEbJjraDqKQWUdeCaIuyg48/edit?gid=0#gid=0" target="_blank" rel="noopener" style="text-decoration:none;">
        <span>Open Google Sheet</span>
      </a>
    </div>
  `;

  nav.innerHTML = html;

  nav.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeTab = btn.getAttribute("data-tab");
      document.getElementById("right-nav-zone")?.classList.remove("open");
      renderAll();
    });
  });

  nav.querySelector("#panel-sync-sheet")?.addEventListener("click", triggerSheetSync);
  nav.querySelector("#panel-export-json")?.addEventListener("click", triggerExportJson);
  nav.querySelector("#panel-import-json")?.addEventListener("click", () => {
    document.getElementById("file-import-input")?.click();
  });
}

function renderAll() {
  renderSidebar();
  const labelEl = document.getElementById("current-tab-label");
  const activeObj = TABS.find((t) => t.id === state.activeTab);
  if (labelEl) labelEl.textContent = activeObj ? activeObj.label : "Overview";

  const main = document.getElementById("main-content");
  if (!main || !state.data) return;

  if (state.globalSearch.trim().length > 0) {
    renderGlobalSearchResults(main, state.globalSearch.trim());
    return;
  }

  switch (state.activeTab) {
    case "overview":
      renderOverviewTab(main);
      break;
    case "Internship":
      renderInternshipTab(main);
      break;
    case "ToDos":
      renderTodosTab(main);
      break;
    case "College counselors":
      renderCounselorsTab(main);
      break;
    case "Majors":
      renderMajorsTab(main);
      break;
    case "Colleges":
      renderCollegesTab(main);
      break;
    case "NoSupplemental Colleges":
      renderNoSupplementalTab(main);
      break;
    case "Notes":
      renderNotesTab(main);
      break;
    case "Diyas Notes":
      renderDiyasNotesTab(main);
      break;
    case "GPA":
      renderGpaTab(main, "regular");
      break;
    case "UCCSU GPA":
      renderGpaTab(main, "uccsu");
      break;
    case "UCs":
      renderUcsTab(main);
      break;
    case "Questions for Colleen":
      renderQuestionsForColleenTab(main);
      break;
    case "College Deadlines":
      renderCollegeDeadlinesTab(main);
      break;
    default:
      renderOverviewTab(main);
  }
}

// ============================================================================
// UNIFIED DEADLINES AGGREGATOR
// ============================================================================

function getAllDeadlines() {
  const items = [];
  const d = state.data;

  for (const intern of d.internships) {
    const raw = intern.deadlineDate || intern.deadlineDisplay;
    const isCompleted = /submitted|complete|accepted|closed/i.test(intern.status || "");
    const meta = computeDeadlineMeta(raw, isCompleted);
    items.push({
      id: intern.id,
      category: "Internship",
      sourceTab: "Internship",
      title: intern.organization,
      subtitle: intern.projectArea || intern.status || "Summer Program",
      statusText: intern.status || "Exploring",
      rawDate: raw,
      meta,
      completed: isCompleted,
      openDrawer: () => openInternshipModal(intern.id),
    });
  }

  for (const todo of d.todos) {
    const meta = computeDeadlineMeta(todo.byWhen, todo.completed);
    items.push({
      id: todo.id,
      category: "To-Do",
      sourceTab: "ToDos",
      title: todo.what,
      subtitle: todo.who || "Action Item",
      statusText: todo.update || (todo.completed ? "Completed" : "Pending"),
      rawDate: todo.byWhen,
      meta,
      completed: Boolean(todo.completed),
      openDrawer: () => openTodoModal(todo.id),
    });
  }

  for (const cdl of d.collegeDeadlines.applications) {
    const meta = computeDeadlineMeta(cdl.deadline, cdl.submitted);
    items.push({
      id: cdl.id,
      category: "College",
      sourceTab: "College Deadlines",
      title: cdl.college,
      subtitle: `${cdl.appType || "RD"}${cdl.supplementalEssays ? ` · ${cdl.supplementalEssays} essays` : ""}`,
      statusText: cdl.decision || (cdl.submitted ? "Submitted" : "Pending"),
      rawDate: cdl.deadline,
      meta,
      completed: Boolean(cdl.submitted),
      openDrawer: () => openCollegeDeadlineModal(cdl.id),
    });
  }

  items.sort((a, b) => a.meta.sortKey - b.meta.sortKey);
  return items;
}

// ============================================================================
// TAB 0: OVERVIEW (CLEAN LINEAR-STYLE SINGLE-VIEW COMMAND CENTER)
// ============================================================================

function renderOverviewTab(container) {
  const d = state.data;
  const allDeadlines = getAllDeadlines();
  const datedInternships = d.internships.filter((i) => {
    const m = computeDeadlineMeta(i.deadlineDate || i.deadlineDisplay);
    return m.daysLeft !== null && m.daysLeft >= 0;
  }).length;
  const reachCount = d.colleges.filter((c) => c.bucket.toLowerCase().includes("reach") && !c.strikethrough).length;
  const targetCount = d.colleges.filter((c) => c.bucket.toLowerCase().includes("target") && !c.strikethrough).length;
  const safetyCount = d.colleges.filter((c) => c.bucket.toLowerCase().includes("safety") && !c.strikethrough).length;
  const regGpa = calculateGpaMetrics(d.gpa.regular.courses);
  const ucGpa = calculateGpaMetrics(d.gpa.uccsu.courses);

  const filteredDeadlines = allDeadlines.filter((item) => {
    if (state.deadlineCategoryFilter !== "all" && item.category !== state.deadlineCategoryFilter) {
      return false;
    }
    if (state.deadlineUrgencyFilter === "upcoming") {
      return !item.meta.isPast;
    }
    if (state.deadlineUrgencyFilter === "past") {
      return item.meta.isPast;
    }
    return true;
  });

  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>Overview</h2>
        <p>Upcoming deadlines across internships, tasks, and college applications.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="ov-add-college">+ College</button>
        <button class="btn btn-primary" id="ov-add-intern">+ Internship</button>
      </div>
    </div>

    <!-- MINIMAL 4-CELL METRICS BAR -->
    <div class="metrics-strip">
      <div class="metric-cell" data-goto="Internship">
        <div class="metric-label">Internships</div>
        <div class="metric-value">${d.internships.length}</div>
        <div class="metric-sub">${datedInternships} upcoming deadlines</div>
      </div>
      <div class="metric-cell" data-goto="Colleges">
        <div class="metric-label">Colleges</div>
        <div class="metric-value">${d.colleges.length}</div>
        <div class="metric-sub">${reachCount}R · ${targetCount}T · ${safetyCount}S</div>
      </div>
      <div class="metric-cell" data-goto="Majors">
        <div class="metric-label">Majors</div>
        <div class="metric-value">${d.majors.length}</div>
        <div class="metric-sub">${esc(d.majors[0]?.name.split("/")[0] || "Engineering")}</div>
      </div>
      <div class="metric-cell" data-goto="GPA">
        <div class="metric-label">Academic GPA</div>
        <div class="metric-value">${regGpa.academicWeighted}</div>
        <div class="metric-sub">UC: ${ucGpa.academicWeighted} · UW: ${regGpa.academicUnweighted}</div>
      </div>
    </div>

    <!-- VIEW FILTER BAR -->
    <div class="view-bar">
      <div class="view-tabs">
        <button class="view-tab ${state.deadlineUrgencyFilter === "upcoming" ? "active" : ""}" data-dl-urg="upcoming">Upcoming</button>
        <button class="view-tab ${state.deadlineUrgencyFilter === "past" ? "active" : ""}" data-dl-urg="past">Past</button>
        <button class="view-tab ${state.deadlineUrgencyFilter === "all" ? "active" : ""}" data-dl-urg="all">All</button>
      </div>
      <div class="view-tabs">
        <button class="view-tab ${state.deadlineCategoryFilter === "all" ? "active" : ""}" data-dl-cat="all">All Types</button>
        <button class="view-tab ${state.deadlineCategoryFilter === "Internship" ? "active" : ""}" data-dl-cat="Internship">Internships</button>
        <button class="view-tab ${state.deadlineCategoryFilter === "To-Do" ? "active" : ""}" data-dl-cat="To-Do">To-Dos</button>
        <button class="view-tab ${state.deadlineCategoryFilter === "College" ? "active" : ""}" data-dl-cat="College">Colleges</button>
      </div>
    </div>

    <!-- CLEAN 5-COLUMN PIPELINE TABLE -->
    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Category</th>
            <th>Status</th>
            <th>Due Date</th>
            <th style="text-align:right;">Timeline</th>
          </tr>
        </thead>
        <tbody>
          ${
            filteredDeadlines.length === 0
              ? `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">No items in this view.</td></tr>`
              : filteredDeadlines
                  .map(
                    (item, idx) => `
            <tr class="clickable-row" data-ov-row="${idx}">
              <td>
                <div class="primary-cell">${esc(item.title)}</div>
                <div class="secondary-text">${esc(item.subtitle)}</div>
              </td>
              <td><span class="pill pill-neutral">${esc(item.category)}</span></td>
              <td style="color:var(--text-secondary);">${esc(item.statusText)}</td>
              <td style="color:var(--text-secondary);white-space:nowrap;">${esc(item.meta.formattedDate)}</td>
              <td style="text-align:right;"><span class="pill ${item.meta.pillClass}">${esc(item.meta.badgeText)}</span></td>
            </tr>
          `
                  )
                  .join("")
          }
        </tbody>
      </table>
    </div>

    <!-- SUBTLE MASTER DOCUMENTS FOOTER -->
    <div class="section-label">
      <span>Master Documents</span>
      <button class="btn-text" id="ov-add-doc">+ Add Link</button>
    </div>
    <div class="docs-strip">
      ${d.quickDocs
        .map(
          (doc) => `
        <a class="doc-chip" href="${esc(doc.url)}" target="_blank" rel="noopener">${esc(doc.title)}</a>
      `
        )
        .join("")}
    </div>
  `;

  container.querySelector("#ov-add-intern")?.addEventListener("click", () => openInternshipModal());
  container.querySelector("#ov-add-college")?.addEventListener("click", () => openCollegeModal());
  container.querySelector("#ov-add-doc")?.addEventListener("click", () => openQuickDocModal());

  container.querySelectorAll("[data-goto]").forEach((cell) => {
    cell.addEventListener("click", () => {
      state.activeTab = cell.getAttribute("data-goto");
      renderAll();
    });
  });

  container.querySelectorAll("[data-dl-urg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.deadlineUrgencyFilter = btn.getAttribute("data-dl-urg");
      renderOverviewTab(container);
    });
  });

  container.querySelectorAll("[data-dl-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.deadlineCategoryFilter = btn.getAttribute("data-dl-cat");
      renderOverviewTab(container);
    });
  });

  container.querySelectorAll("[data-ov-row]").forEach((row) => {
    row.addEventListener("click", () => {
      const idx = Number(row.getAttribute("data-ov-row"));
      filteredDeadlines[idx]?.openDrawer();
    });
  });
}

// ============================================================================
// TAB 1: INTERNSHIP (CLEAN 5-COLUMN TABLE + CLICK ROW FOR FULL DRAWER)
// ============================================================================

function renderInternshipTab(container) {
  const d = state.data;
  let list = d.internships.map((item) => {
    const rawDl = item.deadlineDate || item.deadlineDisplay;
    const isCompleted = /submitted|complete|accepted|closed/i.test(item.status || "");
    return {
      ...item,
      _dlMeta: computeDeadlineMeta(rawDl, isCompleted),
    };
  });

  if (state.internFilter === "dated") {
    list = list.filter((i) => i._dlMeta.daysLeft !== null || (i.deadlineDisplay || "").toUpperCase() === "ASAP");
  } else if (state.internFilter === "preparing") {
    list = list.filter((i) => /preparing|accepting|review|portal/i.test(i.status || ""));
  } else if (state.internFilter === "exploring") {
    list = list.filter((i) => /exploring/i.test(i.status || "") || !i.status);
  }

  if (state.internSort === "deadline") {
    list.sort((a, b) => a._dlMeta.sortKey - b._dlMeta.sortKey);
  } else if (state.internSort === "name") {
    list.sort((a, b) => (a.organization || "").localeCompare(b.organization || ""));
  }

  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>Internships</h2>
        <p>Click any program to view or edit requirements, links, notes, and due dates.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-add-internship">+ New Internship</button>
      </div>
    </div>

    <div class="view-bar">
      <div class="view-tabs">
        <button class="view-tab ${state.internFilter === "all" ? "active" : ""}" data-ifilt="all">All (${d.internships.length})</button>
        <button class="view-tab ${state.internFilter === "dated" ? "active" : ""}" data-ifilt="dated">With Deadline</button>
        <button class="view-tab ${state.internFilter === "preparing" ? "active" : ""}" data-ifilt="preparing">Active</button>
        <button class="view-tab ${state.internFilter === "exploring" ? "active" : ""}" data-ifilt="exploring">Exploring</button>
      </div>
      <div class="view-controls">
        <select class="select-minimal" id="intern-sort-select">
          <option value="deadline" ${state.internSort === "deadline" ? "selected" : ""}>Sort: Due Date</option>
          <option value="sheet" ${state.internSort === "sheet" ? "selected" : ""}>Sort: Sheet Order</option>
          <option value="name" ${state.internSort === "name" ? "selected" : ""}>Sort: Name</option>
        </select>
      </div>
    </div>

    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th>Organization</th>
            <th>Focus Area</th>
            <th>Status</th>
            <th>Deadline</th>
            <th style="text-align:right;">Timeline</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              (item) => `
            <tr class="clickable-row" data-intern-row="${esc(item.id)}">
              <td>
                <div class="primary-cell">
                  ${esc(item.organization)}
                  ${
                    item.linkUrl
                      ? `<a href="${esc(item.linkUrl)}" target="_blank" rel="noopener" class="RowLink" style="font-size:12px;color:var(--text-muted);margin-left:6px;font-weight:400;">Link</a>`
                      : ""
                  }
                </div>
                <div class="secondary-text">${esc(item.programDates || item.otherDetails || "")}</div>
              </td>
              <td style="color:var(--text-secondary);">${esc(item.projectArea || "—")}</td>
              <td style="color:var(--text-secondary);">${esc(item.status || "Exploring")}</td>
              <td style="color:var(--text-secondary);white-space:nowrap;">${esc(item._dlMeta.formattedDate)}</td>
              <td style="text-align:right;"><span class="pill ${item._dlMeta.pillClass}">${esc(item._dlMeta.badgeText)}</span></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="section-label">
      <span>Master Documents (Internship Sheet Rows 21–26)</span>
      <button class="btn-text" id="btn-add-quickdoc">+ Add Document</button>
    </div>
    <div class="clean-table-wrap">
      <table class="clean-table">
        <tbody>
          ${d.quickDocs
            .map(
              (doc) => `
            <tr class="clickable-row" data-doc-row="${esc(doc.id)}">
              <td class="primary-cell">${esc(doc.title)}</td>
              <td style="text-align:right;">
                <a href="${esc(doc.url)}" target="_blank" rel="noopener" class="RowLink">Open Document</a>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector("#btn-add-internship")?.addEventListener("click", () => openInternshipModal());
  container.querySelector("#btn-add-quickdoc")?.addEventListener("click", () => openQuickDocModal());

  container.querySelectorAll("[data-ifilt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.internFilter = btn.getAttribute("data-ifilt");
      renderInternshipTab(container);
    });
  });

  container.querySelector("#intern-sort-select")?.addEventListener("change", (e) => {
    state.internSort = e.target.value;
    renderInternshipTab(container);
  });

  container.querySelectorAll(".RowLink").forEach((a) => {
    a.addEventListener("click", (e) => e.stopPropagation());
  });

  container.querySelectorAll("[data-intern-row]").forEach((row) => {
    row.addEventListener("click", () => openInternshipModal(row.getAttribute("data-intern-row")));
  });

  container.querySelectorAll("[data-doc-row]").forEach((row) => {
    row.addEventListener("click", () => openQuickDocModal(row.getAttribute("data-doc-row")));
  });
}

function openInternshipModal(editId = null) {
  const existing = editId ? state.data.internships.find((x) => x.id === editId) : null;
  openDrawer(
    existing ? existing.organization : "New Internship",
    [
      { name: "organization", label: "Organization / Program *", value: existing?.organization || "", required: true, fullWidth: true },
      { name: "deadlineDate", label: "Application Deadline", type: "date", value: existing?.deadlineDate || "" },
      { name: "deadlineDisplay", label: "Custom Deadline Text (e.g. ASAP)", value: existing?.deadlineDisplay || "" },
      { name: "projectArea", label: "Project Area", value: existing?.projectArea || "" },
      { name: "programDates", label: "Program Dates / Duration", value: existing?.programDates || "" },
      { name: "status", label: "Status", value: existing?.status || "", fullWidth: true },
      { name: "resumeReq", label: "Resume / Transcript Requirement", value: existing?.resumeReq || "" },
      { name: "coverLetterReq", label: "Cover Letter / Essay Requirement", value: existing?.coverLetterReq || "" },
      { name: "linkUrl", label: "Program URL", value: existing?.linkUrl || "", fullWidth: true },
      { name: "linkText", label: "Strategy / Link Notes", type: "textarea", value: existing?.linkText || "", fullWidth: true },
      { name: "otherDetails", label: "Other Details", type: "textarea", value: existing?.otherDetails || "", fullWidth: true },
    ],
    (vals) => {
      const parsedDt = parseSmartDate(vals.deadlineDate || vals.deadlineDisplay);
      const isoDate = vals.deadlineDate || (parsedDt ? toIsoDateString(parsedDt) : "");
      const dispDate = vals.deadlineDisplay || vals.deadlineDate || "";
      if (existing) {
        Object.assign(existing, {
          organization: vals.organization,
          deadlineDate: isoDate,
          deadlineDisplay: dispDate,
          projectArea: vals.projectArea,
          programDates: vals.programDates,
          status: vals.status,
          resumeReq: vals.resumeReq,
          coverLetterReq: vals.coverLetterReq,
          linkUrl: vals.linkUrl,
          linkText: vals.linkText || vals.linkUrl,
          otherDetails: vals.otherDetails,
        });
        persistData(`Saved ${vals.organization}`);
      } else {
        state.data.internships.unshift({
          id: uid("intern"),
          organization: vals.organization,
          deadlineDate: isoDate,
          deadlineDisplay: dispDate,
          projectArea: vals.projectArea,
          programDates: vals.programDates,
          status: vals.status || "Preparing application",
          resumeReq: vals.resumeReq,
          coverLetterReq: vals.coverLetterReq,
          linkUrl: vals.linkUrl,
          linkText: vals.linkText || vals.linkUrl,
          otherDetails: vals.otherDetails,
          pinned: false,
        });
        persistData(`Added ${vals.organization}`);
      }
      renderAll();
    },
    existing
      ? () => {
          const idx = state.data.internships.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            const [removed] = state.data.internships.splice(idx, 1);
            persistData(`Deleted ${removed.organization}`, () => {
              state.data.internships.splice(idx, 0, removed);
              persistData("Restored internship");
              renderAll();
            });
            renderAll();
          }
        }
      : null
  );
}

function openQuickDocModal(editId = null) {
  const existing = editId ? state.data.quickDocs.find((x) => x.id === editId) : null;
  openDrawer(
    existing ? existing.title : "New Master Document",
    [
      { name: "title", label: "Title *", value: existing?.title || "", required: true, fullWidth: true },
      { name: "url", label: "URL *", value: existing?.url || "", required: true, fullWidth: true },
    ],
    (vals) => {
      if (existing) {
        existing.title = vals.title;
        existing.url = vals.url;
        persistData("Updated document link");
      } else {
        state.data.quickDocs.push({ id: uid("doc"), title: vals.title, url: vals.url, category: "Master Document" });
        persistData("Added document link");
      }
      renderAll();
    },
    existing
      ? () => {
          const idx = state.data.quickDocs.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            state.data.quickDocs.splice(idx, 1);
            persistData("Removed document link");
            renderAll();
          }
        }
      : null
  );
}

// ============================================================================
// TAB 2: TODOS
// ============================================================================

function renderTodosTab(container) {
  const todos = state.data.todos;
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>ToDos</h2>
        <p>Action items and follow-ups.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-add-todo">+ New To-Do</button>
      </div>
    </div>

    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th style="width:40px;"></th>
            <th>Task</th>
            <th>Owner</th>
            <th>Update</th>
            <th style="text-align:right;">Due</th>
          </tr>
        </thead>
        <tbody>
          ${todos
            .map((t) => {
              const meta = computeDeadlineMeta(t.byWhen, t.completed);
              return `
                <tr class="clickable-row ${t.completed ? "row-muted" : ""}" data-todo-row="${esc(t.id)}">
                  <td class="CheckboxCell">
                    <input type="checkbox" ${t.completed ? "checked" : ""} data-todo-check="${esc(t.id)}" />
                  </td>
                  <td class="primary-cell">${esc(t.what)}</td>
                  <td style="color:var(--text-secondary);">${esc(t.who || "—")}</td>
                  <td style="color:var(--text-secondary);">${esc(t.update || "—")}</td>
                  <td style="text-align:right;white-space:nowrap;">
                    <span class="pill ${meta.pillClass}">${esc(meta.formattedDate !== "—" ? meta.formattedDate : meta.badgeText)}</span>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector("#btn-add-todo")?.addEventListener("click", () => openTodoModal());
  container.querySelectorAll(".CheckboxCell").forEach((cell) => {
    cell.addEventListener("click", (e) => e.stopPropagation());
  });
  container.querySelectorAll("[data-todo-check]").forEach((chk) => {
    chk.addEventListener("change", () => {
      const target = state.data.todos.find((x) => x.id === chk.getAttribute("data-todo-check"));
      if (target) {
        target.completed = chk.checked;
        persistData("Updated To-Do");
        renderAll();
      }
    });
  });
  container.querySelectorAll("[data-todo-row]").forEach((row) => {
    row.addEventListener("click", () => openTodoModal(row.getAttribute("data-todo-row")));
  });
}

function openTodoModal(editId = null) {
  const existing = editId ? state.data.todos.find((x) => x.id === editId) : null;
  openDrawer(
    existing ? "Edit To-Do" : "New To-Do",
    [
      { name: "what", label: "Task *", value: existing?.what || "", required: true, fullWidth: true },
      { name: "who", label: "Owner", value: existing?.who || "Ayan" },
      { name: "byWhen", label: "By-When", type: "date", value: existing?.byWhen || "" },
      { name: "update", label: "Update / Notes", type: "textarea", value: existing?.update || "", fullWidth: true },
    ],
    (vals) => {
      if (existing) {
        Object.assign(existing, vals);
        persistData("Updated To-Do");
      } else {
        state.data.todos.push({ id: uid("todo"), ...vals, completed: false });
        persistData("Added To-Do");
      }
      renderAll();
    },
    existing
      ? () => {
          const idx = state.data.todos.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            state.data.todos.splice(idx, 1);
            persistData("Deleted To-Do");
            renderAll();
          }
        }
      : null
  );
}

// ============================================================================
// TAB 3: COLLEGE COUNSELORS
// ============================================================================

function renderCounselorsTab(container) {
  const counselors = state.data.counselors;
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>College counselors</h2>
        <p>Counselor contacts and evaluation notes.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-add-counselor">+ Add Entry</button>
      </div>
    </div>

    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role / Notes</th>
            <th>Status</th>
            <th style="text-align:right;">Link</th>
          </tr>
        </thead>
        <tbody>
          ${counselors
            .map(
              (c) => `
            <tr class="clickable-row" data-counselor-row="${esc(c.id)}">
              <td class="primary-cell">${esc(c.name)}</td>
              <td style="color:var(--text-secondary);">${esc(c.notes || c.role || "—")}</td>
              <td><span class="pill pill-neutral">${esc(c.status || "Reference")}</span></td>
              <td style="text-align:right;">
                ${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener" class="RowLink">Open</a>` : "—"}
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector("#btn-add-counselor")?.addEventListener("click", () => openCounselorModal());
  container.querySelectorAll(".RowLink").forEach((a) => a.addEventListener("click", (e) => e.stopPropagation()));
  container.querySelectorAll("[data-counselor-row]").forEach((row) => {
    row.addEventListener("click", () => openCounselorModal(row.getAttribute("data-counselor-row")));
  });
}

function openCounselorModal(editId = null) {
  const existing = editId ? state.data.counselors.find((x) => x.id === editId) : null;
  openDrawer(
    existing ? existing.name : "Add Counselor Entry",
    [
      { name: "name", label: "Name *", value: existing?.name || "", required: true, fullWidth: true },
      { name: "role", label: "Role", value: existing?.role || "" },
      { name: "status", label: "Status", value: existing?.status || "Active" },
      { name: "url", label: "URL", value: existing?.url || "", fullWidth: true },
      { name: "notes", label: "Notes", type: "textarea", value: existing?.notes || "", fullWidth: true },
    ],
    (vals) => {
      if (existing) {
        Object.assign(existing, vals);
        persistData("Updated counselor");
      } else {
        state.data.counselors.push({ id: uid("counselor"), ...vals });
        persistData("Added counselor");
      }
      renderAll();
    },
    existing
      ? () => {
          const idx = state.data.counselors.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            state.data.counselors.splice(idx, 1);
            persistData("Removed counselor");
            renderAll();
          }
        }
      : null
  );
}

// ============================================================================
// TAB 4: MAJORS
// ============================================================================

function renderMajorsTab(container) {
  const majors = state.data.majors;
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>Majors</h2>
        <p>Target majors and related engineering departments. Click any row to edit.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-add-major">+ New Major</button>
      </div>
    </div>

    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th style="width:50px;">#</th>
            <th>Major</th>
            <th>Related Departments &amp; Notes</th>
          </tr>
        </thead>
        <tbody>
          ${majors
            .map(
              (m, idx) => `
            <tr class="clickable-row" data-major-row="${esc(m.id)}">
              <td style="color:var(--text-muted);">${idx + 1}</td>
              <td class="primary-cell">
                ${esc(m.name)}
                ${m.highlightColor ? `<span class="pill pill-uc" style="margin-left:6px;">Highlighted</span>` : ""}
              </td>
              <td style="color:var(--text-secondary);">${esc(m.details || "—")}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector("#btn-add-major")?.addEventListener("click", () => openMajorModal());
  container.querySelectorAll("[data-major-row]").forEach((row) => {
    row.addEventListener("click", () => openMajorModal(row.getAttribute("data-major-row")));
  });
}

function openMajorModal(editId = null) {
  const existing = editId ? state.data.majors.find((x) => x.id === editId) : null;
  openDrawer(
    existing ? existing.name : "New Major",
    [
      { name: "name", label: "Major Name *", value: existing?.name || "", required: true, fullWidth: true },
      { name: "details", label: "Related Departments / Notes", type: "textarea", value: existing?.details || "", fullWidth: true },
      {
        name: "highlightColor",
        label: "Highlight",
        type: "select",
        options: [
          { value: "", label: "None" },
          { value: "#FFFF00", label: "Highlighted" },
        ],
        value: existing?.highlightColor ? "#FFFF00" : "",
      },
    ],
    (vals) => {
      if (existing) {
        Object.assign(existing, vals);
        persistData(`Saved ${vals.name}`);
      } else {
        state.data.majors.push({ id: uid("major"), ...vals, priority: state.data.majors.length + 1 });
        persistData(`Added ${vals.name}`);
      }
      renderAll();
    },
    existing
      ? () => {
          const idx = state.data.majors.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            state.data.majors.splice(idx, 1);
            persistData("Deleted major");
            renderAll();
          }
        }
      : null
  );
}

// ============================================================================
// TAB 5: COLLEGES (CLEAN 5-COL TABLE + SLIDE-OVER INSPECTOR FOR ALL 18 FIELDS)
// ============================================================================

function parseRankNumber(str) {
  if (!str) return 9999;
  const m = String(str).match(/(\d+)/);
  return m ? Number(m[1]) : 9999;
}

function renderCollegesTab(container) {
  const d = state.data;
  const crit = d.collegeCriteria;
  let list = [...d.colleges];

  if (state.collegeBucketFilter !== "all") {
    list = list.filter((c) => {
      const b = (c.bucket || "").toLowerCase();
      if (state.collegeBucketFilter === "uc") return b.includes(",") || c.name.toLowerCase().includes("uc");
      return b === state.collegeBucketFilter;
    });
  }

  if (state.collegeSort === "overallRank") {
    list.sort((a, b) => parseRankNumber(a.overallRanking) - parseRankNumber(b.overallRanking));
  } else if (state.collegeSort === "majorRank") {
    list.sort((a, b) => parseRankNumber(a.majorRanking) - parseRankNumber(b.majorRanking));
  } else if (state.collegeSort === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>Colleges</h2>
        <p>Click any school to inspect or edit all 18 spreadsheet attributes.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btn-toggle-criteria">${state.showCriteria ? "Hide Criteria" : "Selection Criteria"}</button>
        <button class="btn btn-primary" id="btn-add-college">+ New College</button>
      </div>
    </div>

    ${
      state.showCriteria
        ? `
      <div class="collapsible-box">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <strong style="font-size:13px;">Row 2 Baseline Criteria (${esc(crit.label || "CRITERION =>")})</strong>
          <button class="btn-text" id="btn-edit-criteria">Edit Criteria</button>
        </div>
        <div class="collapsible-grid">
          <div><div class="kv-label">Location</div><div class="kv-val">${esc(crit.location)}</div></div>
          <div><div class="kv-label">Engineering Majors</div><div class="kv-val">${esc(crit.engineeringMajors)}</div></div>
          <div><div class="kv-label">Rankings</div><div class="kv-val">Overall ${esc(crit.overallRanking)} · Major ${esc(crit.majorRanking)}</div></div>
          <div><div class="kv-label">Extra-Curricular</div><div class="kv-val">${esc(crit.extracurricular)}</div></div>
          <div><div class="kv-label">Metrics</div><div class="kv-val">${esc(crit.acceptanceStats)}</div></div>
          <div><div class="kv-label">Cost</div><div class="kv-val">${esc(crit.costOfAttendance)}</div></div>
        </div>
      </div>
    `
        : ""
    }

    <div class="view-bar">
      <div class="view-tabs">
        <button class="view-tab ${state.collegeBucketFilter === "all" ? "active" : ""}" data-cfilt="all">All (${d.colleges.length})</button>
        <button class="view-tab ${state.collegeBucketFilter === "reach" ? "active" : ""}" data-cfilt="reach">Reach</button>
        <button class="view-tab ${state.collegeBucketFilter === "target" ? "active" : ""}" data-cfilt="target">Target</button>
        <button class="view-tab ${state.collegeBucketFilter === "safety" ? "active" : ""}" data-cfilt="safety">Safety</button>
        <button class="view-tab ${state.collegeBucketFilter === "uc" ? "active" : ""}" data-cfilt="uc">UCs</button>
      </div>
      <div class="view-controls">
        <select class="select-minimal" id="college-sort-select">
          <option value="sheet" ${state.collegeSort === "sheet" ? "selected" : ""}>Sort: Sheet Order</option>
          <option value="overallRank" ${state.collegeSort === "overallRank" ? "selected" : ""}>Sort: Overall Rank</option>
          <option value="majorRank" ${state.collegeSort === "majorRank" ? "selected" : ""}>Sort: Major Rank</option>
          <option value="name" ${state.collegeSort === "name" ? "selected" : ""}>Sort: Name</option>
        </select>
      </div>
    </div>

    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th>College</th>
            <th>Bucket</th>
            <th>Overall</th>
            <th>Eng Rank</th>
            <th>Acceptance / Notes</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              (c) => `
            <tr class="clickable-row ${c.strikethrough ? "row-muted" : ""}" data-college-row="${esc(c.id)}">
              <td>
                <div class="primary-cell">${esc(c.name)}</div>
                <div class="secondary-text">${esc([c.location, c.why].filter(Boolean).join(" · "))}</div>
              </td>
              <td><span class="pill ${getBucketPillClass(c.bucket)}">${esc(c.bucket)}</span></td>
              <td style="color:var(--text-secondary);font-variant-numeric:tabular-nums;">${esc(c.overallRanking || "—")}</td>
              <td style="color:var(--text-secondary);font-variant-numeric:tabular-nums;">${c.majorRanking ? `#${esc(c.majorRanking)}` : "—"}</td>
              <td style="color:var(--text-secondary);font-size:12.5px;max-width:260px;">${esc((c.acceptanceStats || c.thoughts || "—").replace(/\n/g, " · "))}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector("#btn-toggle-criteria")?.addEventListener("click", () => {
    state.showCriteria = !state.showCriteria;
    renderCollegesTab(container);
  });
  container.querySelector("#btn-edit-criteria")?.addEventListener("click", () => openCriteriaModal());
  container.querySelector("#btn-add-college")?.addEventListener("click", () => openCollegeModal());

  container.querySelectorAll("[data-cfilt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.collegeBucketFilter = btn.getAttribute("data-cfilt");
      renderCollegesTab(container);
    });
  });

  container.querySelector("#college-sort-select")?.addEventListener("change", (e) => {
    state.collegeSort = e.target.value;
    renderCollegesTab(container);
  });

  container.querySelectorAll("[data-college-row]").forEach((row) => {
    row.addEventListener("click", () => openCollegeModal(row.getAttribute("data-college-row")));
  });
}

function openCollegeModal(editId = null) {
  const existing = editId ? state.data.colleges.find((x) => x.id === editId) : null;
  openDrawer(
    existing ? existing.name : "New College",
    [
      {
        name: "bucket",
        label: "Bucket",
        type: "select",
        options: [
          { value: "Reach", label: "Reach" },
          { value: "Target", label: "Target" },
          { value: "Safety", label: "Safety" },
          { value: "Reach, Target, Safety", label: "Reach, Target, Safety" },
        ],
        value: existing?.bucket || "Reach",
      },
      {
        name: "strikethrough",
        label: "Status",
        type: "select",
        options: [
          { value: "false", label: "Active" },
          { value: "true", label: "Crossed Out (Strikethrough)" },
        ],
        value: existing?.strikethrough ? "true" : "false",
      },
      { name: "name", label: "Name of College *", value: existing?.name || "", required: true, fullWidth: true },
      { name: "location", label: "Location", value: existing?.location || "" },
      { name: "distanceFromSfo", label: "Distance from SFO", value: existing?.distanceFromSfo || "" },
      { name: "overallRanking", label: "Overall Ranking (US News)", value: existing?.overallRanking || "" },
      { name: "majorRanking", label: "Major Ranking (US News)", value: existing?.majorRanking || "" },
      { name: "preference", label: "Preference within Bucket", value: existing?.preference || "" },
      { name: "satTest", label: "SAT Test?", value: existing?.satTest || "" },
      { name: "applicationDeadlines", label: "Application Deadlines", value: existing?.applicationDeadlines || "" },
      { name: "costOfAttendance", label: "Cost of Attendance", value: existing?.costOfAttendance || "" },
      { name: "engineeringMajors", label: "Engineering Department Majors", value: existing?.engineeringMajors || "" },
      { name: "financialAid", label: "Financial Aid?", value: existing?.financialAid || "" },
      { name: "goodMastersPhd", label: "Good Masters/PhD?", value: existing?.goodMastersPhd || "" },
      { name: "jobProspects", label: "Job Prospects in Vicinity?", value: existing?.jobProspects || "" },
      { name: "extracurricular", label: "Extra-curricular", value: existing?.extracurricular || "", fullWidth: true },
      { name: "url", label: "US News / College Website URL", value: existing?.url || "", fullWidth: true },
      { name: "why", label: "Why its there?", type: "textarea", value: existing?.why || "", fullWidth: true },
      { name: "acceptanceStats", label: "Acceptance Probability / Stats", type: "textarea", value: existing?.acceptanceStats || "", fullWidth: true },
      { name: "thoughts", label: "Thoughts", type: "textarea", value: existing?.thoughts || "", fullWidth: true },
    ],
    (vals) => {
      const payload = { ...vals, strikethrough: vals.strikethrough === "true" };
      if (existing) {
        Object.assign(existing, payload);
        persistData(`Saved ${vals.name}`);
      } else {
        state.data.colleges.push({ id: uid("college"), rowNumber: state.data.colleges.length + 3, ...payload });
        persistData(`Added ${vals.name}`);
      }
      renderAll();
    },
    existing
      ? () => {
          const idx = state.data.colleges.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            const [removed] = state.data.colleges.splice(idx, 1);
            persistData(`Deleted ${removed.name}`, () => {
              state.data.colleges.splice(idx, 0, removed);
              persistData("Restored college");
              renderAll();
            });
            renderAll();
          }
        }
      : null
  );
}

function openCriteriaModal() {
  const c = state.data.collegeCriteria;
  openDrawer(
    "Row 2 Selection Criteria",
    [
      { name: "bucket", label: "Buckets", value: c.bucket || "" },
      { name: "location", label: "Location", value: c.location || "" },
      { name: "engineeringMajors", label: "Engineering Majors", value: c.engineeringMajors || "", fullWidth: true },
      { name: "overallRanking", label: "Overall Ranking", value: c.overallRanking || "" },
      { name: "majorRanking", label: "Major Ranking", value: c.majorRanking || "" },
      { name: "extracurricular", label: "Extra-curricular", value: c.extracurricular || "", fullWidth: true },
      { name: "acceptanceStats", label: "Acceptance Stats", value: c.acceptanceStats || "" },
      { name: "costOfAttendance", label: "Cost of Attendance", value: c.costOfAttendance || "" },
    ],
    (vals) => {
      Object.assign(state.data.collegeCriteria, vals);
      persistData("Updated criteria");
      renderAll();
    }
  );
}

// ============================================================================
// TAB 6: NO SUPPLEMENTAL COLLEGES
// ============================================================================

function renderNoSupplementalTab(container) {
  const list = state.data.noSupplementalColleges;
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>NoSupplemental Colleges</h2>
        <p>Colleges without supplemental essays. Click any row to view full pros/cons and notes.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-add-nosupp">+ Add College</button>
      </div>
    </div>

    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th>College</th>
            <th>Location</th>
            <th>Type</th>
            <th>Nov 1?</th>
            <th style="text-align:right;">Worth It?</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              (item) => `
            <tr class="clickable-row" data-nosupp-row="${esc(item.id)}">
              <td>
                <div class="primary-cell">${esc(item.name)}</div>
                <div class="secondary-text">${esc((item.statsAndNotes || "").split("\n")[0])}</div>
              </td>
              <td style="color:var(--text-secondary);">${esc(item.location || "—")}</td>
              <td style="color:var(--text-secondary);">${esc(item.publicPrivate || "—")}</td>
              <td style="color:var(--text-secondary);">${esc(item.eligibleNov1 || "—")}</td>
              <td style="text-align:right;">
                <span class="pill ${(item.worthIt || "").toLowerCase().startsWith("yes") ? "pill-target" : "pill-neutral"}">${esc(
                item.worthIt || "—"
              )}</span>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector("#btn-add-nosupp")?.addEventListener("click", () => openNoSuppModal());
  container.querySelectorAll("[data-nosupp-row]").forEach((row) => {
    row.addEventListener("click", () => openNoSuppModal(row.getAttribute("data-nosupp-row")));
  });
}

function openNoSuppModal(editId = null) {
  const existing = editId ? state.data.noSupplementalColleges.find((x) => x.id === editId) : null;
  openDrawer(
    existing ? existing.name : "Add No-Supplemental College",
    [
      { name: "name", label: "College Name *", value: existing?.name || "", required: true, fullWidth: true },
      { name: "location", label: "Location", value: existing?.location || "" },
      { name: "publicPrivate", label: "Private/Public", value: existing?.publicPrivate || "" },
      { name: "eligibleNov1", label: "Eligible for Nov 1?", value: existing?.eligibleNov1 || "" },
      { name: "worthIt", label: "Worth it?", value: existing?.worthIt || "Yes" },
      { name: "why", label: "Why? (Pros / Cons)", type: "textarea", value: existing?.why || "", fullWidth: true },
      { name: "statsAndNotes", label: "Acceptance & Ranking Notes", type: "textarea", value: existing?.statsAndNotes || "", fullWidth: true },
    ],
    (vals) => {
      if (existing) {
        Object.assign(existing, vals);
        persistData(`Saved ${vals.name}`);
      } else {
        state.data.noSupplementalColleges.push({ id: uid("nosupp"), highlighted: true, ...vals });
        persistData(`Added ${vals.name}`);
      }
      renderAll();
    },
    existing
      ? () => {
          const idx = state.data.noSupplementalColleges.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            state.data.noSupplementalColleges.splice(idx, 1);
            persistData("Deleted college");
            renderAll();
          }
        }
      : null
  );
}

// ============================================================================
// TAB 7: NOTES
// ============================================================================

function renderNotesTab(container) {
  const notes = state.data.bucketNotes;
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>Notes</h2>
        <p>Safety, Target, and Reach bucket definitions. Click any section to edit.</p>
      </div>
    </div>

    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th style="width:180px;">Bucket</th>
            <th style="width:160px;">Acceptance Range</th>
            <th>Criteria</th>
          </tr>
        </thead>
        <tbody>
          ${notes
            .map(
              (n) => `
            <tr class="clickable-row" data-bnote-row="${esc(n.id)}">
              <td class="primary-cell">${esc(n.title.replace(":", ""))}</td>
              <td><span class="pill ${getBucketPillClass(n.title)}">${esc(n.chanceRange)}</span></td>
              <td style="color:var(--text-secondary);">
                ${n.bullets.map((b) => `<div style="margin-bottom:4px;">${esc(b)}</div>`).join("")}
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll("[data-bnote-row]").forEach((row) => {
    row.addEventListener("click", () => {
      const n = state.data.bucketNotes.find((x) => x.id === row.getAttribute("data-bnote-row"));
      if (!n) return;
      openDrawer(
        n.title,
        [
          { name: "title", label: "Title", value: n.title, fullWidth: true },
          { name: "chanceRange", label: "Acceptance Range", value: n.chanceRange, fullWidth: true },
          { name: "bullets", label: "Notes (one per line)", type: "textarea", value: n.bullets.join("\n"), fullWidth: true },
        ],
        (vals) => {
          n.title = vals.title;
          n.chanceRange = vals.chanceRange;
          n.bullets = vals.bullets.split("\n").map((s) => s.trim()).filter(Boolean);
          persistData("Updated note");
          renderAll();
        }
      );
    });
  });
}

// ============================================================================
// TAB 8: DIYAS NOTES
// ============================================================================

function renderDiyasNotesTab(container) {
  const dn = state.data.diyasNotes;
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>Diyas Notes</h2>
        <p>Student interviews, campus visit notes, and liberal arts vs. research university insights.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btn-edit-diyas-notes">Edit Notes</button>
        <button class="btn btn-primary" id="btn-add-interview">+ Add Interview</button>
      </div>
    </div>

    <div class="collapsible-box">
      <div class="collapsible-grid" style="margin-top:0;">
        <div>
          <div class="kv-label">Strategy &amp; Preferences</div>
          <div class="kv-val" style="margin-top:6px;font-weight:400;color:var(--text-secondary);">
            ${dn.preferencesAndStrategy.map((l) => `<div style="margin-bottom:4px;">${esc(l)}</div>`).join("")}
          </div>
        </div>
        <div>
          <div class="kv-label">Purdue Visit Notes</div>
          <div class="kv-val" style="margin-top:6px;font-weight:400;color:var(--text-secondary);">
            ${dn.purdueVisitNotes.map((l) => `<div style="margin-bottom:4px;">${esc(l)}</div>`).join("")}
          </div>
        </div>
      </div>
    </div>

    <div class="section-label"><span>Student Q&amp;A</span></div>
    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th style="width:140px;">Person</th>
            <th>Topic / Question</th>
            <th>Response Notes</th>
          </tr>
        </thead>
        <tbody>
          ${dn.interviews
            .map(
              (item) => `
            <tr class="clickable-row" data-interview-row="${esc(item.id)}">
              <td class="primary-cell">${esc(item.who)}</td>
              <td style="color:var(--text-secondary);">${esc(item.questions)}</td>
              <td style="color:var(--text-secondary);">${esc(item.responses || "—")}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="section-label"><span>Notes from Swathi</span></div>
    <div class="collapsible-box">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:8px 24px;color:var(--text-secondary);">
        ${dn.swathiNotes.map((note) => `<div>• ${esc(note)}</div>`).join("")}
      </div>
    </div>
  `;

  container.querySelector("#btn-add-interview")?.addEventListener("click", () => openInterviewModal());
  container.querySelectorAll("[data-interview-row]").forEach((row) => {
    row.addEventListener("click", () => openInterviewModal(row.getAttribute("data-interview-row")));
  });

  container.querySelector("#btn-edit-diyas-notes")?.addEventListener("click", () => {
    openDrawer(
      "Edit Diyas Notes",
      [
        { name: "preferencesAndStrategy", label: "Strategy & Preferences (one per line)", type: "textarea", value: dn.preferencesAndStrategy.join("\n"), fullWidth: true },
        { name: "purdueVisitNotes", label: "Purdue Visit Notes (one per line)", type: "textarea", value: dn.purdueVisitNotes.join("\n"), fullWidth: true },
        { name: "swathiNotes", label: "Notes from Swathi (one per line)", type: "textarea", value: dn.swathiNotes.join("\n"), fullWidth: true },
      ],
      (vals) => {
        dn.preferencesAndStrategy = vals.preferencesAndStrategy.split("\n").map((s) => s.trim()).filter(Boolean);
        dn.purdueVisitNotes = vals.purdueVisitNotes.split("\n").map((s) => s.trim()).filter(Boolean);
        dn.swathiNotes = vals.swathiNotes.split("\n").map((s) => s.trim()).filter(Boolean);
        persistData("Updated notes");
        renderAll();
      }
    );
  });
}

function openInterviewModal(editId = null) {
  const dn = state.data.diyasNotes;
  const existing = editId ? dn.interviews.find((x) => x.id === editId) : null;
  openDrawer(
    existing ? `Interview: ${existing.who}` : "Add Student Interview",
    [
      { name: "who", label: "Person *", value: existing?.who || "", required: true, fullWidth: true },
      { name: "questions", label: "Question / Topic", value: existing?.questions || "", fullWidth: true },
      { name: "responses", label: "Response Notes", type: "textarea", value: existing?.responses || "", fullWidth: true },
    ],
    (vals) => {
      if (existing) {
        Object.assign(existing, vals);
        persistData("Updated interview");
      } else {
        dn.interviews.push({ id: uid("interview"), ...vals });
        persistData("Added interview");
      }
      renderAll();
    },
    existing
      ? () => {
          const idx = dn.interviews.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            dn.interviews.splice(idx, 1);
            persistData("Deleted interview");
            renderAll();
          }
        }
      : null
  );
}

// ============================================================================
// TAB 9 & 10: GPA & UCCSU GPA
// ============================================================================

function calculateGpaMetrics(courses) {
  const num = (v) => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const parsed = parseFloat(v);
    return isNaN(parsed) ? null : parsed;
  };

  let totalW = [], totalU = [], acadW = [], acadU = [], ten12W = [], ten12U = [];

  for (const c of courses) {
    const w = num(c.weighted);
    const u = num(c.unweighted);
    if (w !== null) {
      totalW.push(w);
      if (c.isAcademic) acadW.push(w);
      if (c.is10to12) ten12W.push(w);
    }
    if (u !== null) {
      totalU.push(u);
      if (c.isAcademic) acadU.push(u);
      if (c.is10to12) ten12U.push(u);
    }
  }

  const avg = (arr) => (arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : "0.00");

  return {
    totalWeighted: avg(totalW),
    totalUnweighted: avg(totalU),
    academicWeighted: avg(acadW),
    academicUnweighted: avg(acadU),
    tenToTwelveWeighted: avg(ten12W),
    tenToTwelveUnweighted: avg(ten12U),
  };
}

function renderGpaTab(container, mode = "regular") {
  const gpaObj = state.data.gpa[mode];
  const metrics = calculateGpaMetrics(gpaObj.courses);
  const proj = state.data.gpa.regular.projections;

  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>${esc(gpaObj.title)}</h2>
        <p>${esc(gpaObj.subtitle)}. Click any course row to edit grades.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-add-course">+ Add Course</button>
      </div>
    </div>

    <div class="metrics-strip">
      <div class="metric-cell">
        <div class="metric-label">Academic GPA</div>
        <div class="metric-value">${metrics.academicWeighted}</div>
        <div class="metric-sub">Unweighted: ${metrics.academicUnweighted}</div>
      </div>
      <div class="metric-cell">
        <div class="metric-label">10–12 GPA</div>
        <div class="metric-value">${metrics.tenToTwelveWeighted}</div>
        <div class="metric-sub">Unweighted: ${metrics.tenToTwelveUnweighted}</div>
      </div>
      <div class="metric-cell">
        <div class="metric-label">Total GPA</div>
        <div class="metric-value">${metrics.totalWeighted}</div>
        <div class="metric-sub">Unweighted: ${metrics.totalUnweighted}</div>
      </div>
      <div class="metric-cell">
        <div class="metric-label">Best Case Projection</div>
        <div class="metric-value">${esc(proj?.bestCase?.academicWeighted || "4.65")}</div>
        <div class="metric-sub">10–12 Best: ${esc(proj?.bestCase?.tenToTwelveWeighted || "4.71")}</div>
      </div>
    </div>

    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th>Term</th>
            <th>Course</th>
            <th>Weighted</th>
            <th>Unweighted</th>
            <th style="text-align:right;">Category</th>
          </tr>
        </thead>
        <tbody>
          ${gpaObj.courses
            .map(
              (c) => `
            <tr class="clickable-row" data-gpa-row="${esc(c.id)}">
              <td style="color:var(--text-muted);width:140px;">${esc(c.term)}</td>
              <td class="primary-cell">
                ${esc(c.course)}
                ${c.letterNote ? `<span class="pill pill-soon" style="margin-left:6px;">${esc(c.letterNote)}</span>` : ""}
              </td>
              <td style="font-variant-numeric:tabular-nums;">${esc(c.weighted || "—")}</td>
              <td style="color:var(--text-secondary);font-variant-numeric:tabular-nums;">${esc(c.unweighted || "—")}</td>
              <td style="text-align:right;">
                <span class="pill pill-neutral">${c.isAcademic ? (c.is10to12 ? "Academic · 10–12" : "Academic · 9th") : "Non-Academic"}</span>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector("#btn-add-course")?.addEventListener("click", () => openGpaCourseModal(mode));
  container.querySelectorAll("[data-gpa-row]").forEach((row) => {
    row.addEventListener("click", () => openGpaCourseModal(mode, row.getAttribute("data-gpa-row")));
  });
}

function openGpaCourseModal(mode, editId = null) {
  const gpaObj = state.data.gpa[mode];
  const existing = editId ? gpaObj.courses.find((x) => x.id === editId) : null;
  openDrawer(
    existing ? `${existing.term}: ${existing.course}` : "Add Course",
    [
      { name: "term", label: "Term (e.g. 12 - S1) *", value: existing?.term || "12 - S1", required: true },
      { name: "course", label: "Course Name *", value: existing?.course || "", required: true },
      { name: "weighted", label: "Weighted Points", value: existing?.weighted || "" },
      { name: "unweighted", label: "Unweighted Points", value: existing?.unweighted || "" },
      { name: "letterNote", label: "Grade Note (optional)", value: existing?.letterNote || "" },
      {
        name: "isAcademic",
        label: "Counts in Academic GPA?",
        type: "select",
        options: [
          { value: "true", label: "Yes" },
          { value: "false", label: "No (PE / Sports)" },
        ],
        value: existing ? String(Boolean(existing.isAcademic)) : "true",
      },
      {
        name: "is10to12",
        label: "Counts in 10–12 GPA?",
        type: "select",
        options: [
          { value: "true", label: "Yes" },
          { value: "false", label: "No (9th Grade)" },
        ],
        value: existing ? String(Boolean(existing.is10to12)) : "true",
      },
    ],
    (vals) => {
      const payload = {
        term: vals.term,
        course: vals.course,
        weighted: vals.weighted,
        unweighted: vals.unweighted,
        letterNote: vals.letterNote,
        isAcademic: vals.isAcademic === "true",
        is10to12: vals.is10to12 === "true",
      };
      if (existing) {
        Object.assign(existing, payload);
        persistData(`Updated ${vals.course}`);
      } else {
        gpaObj.courses.push({ id: uid(mode), rowNumber: gpaObj.courses.length + 3, ...payload });
        persistData(`Added ${vals.course}`);
      }
      renderAll();
    },
    existing
      ? () => {
          const idx = gpaObj.courses.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            gpaObj.courses.splice(idx, 1);
            persistData("Deleted course");
            renderAll();
          }
        }
      : null
  );
}

// ============================================================================
// TAB 11: UCs
// ============================================================================

function renderUcsTab(container) {
  const ucs = state.data.ucs;
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>UCs</h2>
        <p>University of California campuses and UCSD residential college rankings.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btn-add-ucsd">+ UCSD College</button>
        <button class="btn btn-primary" id="btn-add-uc">+ UC Campus</button>
      </div>
    </div>

    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th>Campus</th>
            <th>Location</th>
            <th>Rank</th>
            <th>Admission Stats</th>
            <th style="text-align:right;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${ucs.campuses
            .map(
              (c) => `
            <tr class="clickable-row" data-uc-row="${esc(c.id)}">
              <td class="primary-cell">${esc(c.name)}</td>
              <td style="color:var(--text-secondary);">${esc(c.location)}</td>
              <td style="color:var(--text-secondary);">${esc(c.nationalRanking || "—")}</td>
              <td style="color:var(--text-secondary);">${esc(c.acceptanceStats || "—")}</td>
              <td style="text-align:right;">
                <span class="pill ${c.selected ? "pill-target" : "pill-neutral"}">${c.selected ? "Selected" : "Listed"}</span>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="section-label">
      <span>UCSD Residential College Rankings</span>
      ${
        ucs.ucsdGuideUrl
          ? `<a href="${esc(ucs.ucsdGuideUrl)}" target="_blank" rel="noopener" style="font-size:12px;text-transform:none;font-weight:500;">ThinquePrep Guide</a>`
          : ""
      }
    </div>
    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th style="width:140px;">College</th>
            <th style="width:110px;">Rank Code</th>
            <th>Dorm Life &amp; GE Summary</th>
          </tr>
        </thead>
        <tbody>
          ${ucs.ucsdColleges
            .map(
              (col) => `
            <tr class="clickable-row" data-ucsd-row="${esc(col.id)}">
              <td class="primary-cell">${esc(col.college)}</td>
              <td><span class="pill pill-reach">${esc(col.proposedRanking || "—")}</span></td>
              <td style="color:var(--text-secondary);">${esc((col.dormLife || col.educationReqs || "—").split("\n")[0])}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="section-label">
      <span>UCSD Recommended Ranking Summary</span>
      <button class="btn-text" id="btn-toggle-ucsd-img">${state.showUcsdImage ? "Hide Original Image" : "View Original Sheet Image"}</button>
    </div>
    ${
      state.showUcsdImage
        ? `<div class="collapsible-box"><img src="${esc(ucs.ucsdSummaryImage || "assets/ucsd_ranking_summary.png")}" alt="UCSD Summary" style="max-width:100%;border-radius:6px;" /></div>`
        : ""
    }
    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th style="width:60px;">Rank</th>
            <th style="width:180px;">College</th>
            <th>Rationale</th>
          </tr>
        </thead>
        <tbody>
          ${(ucs.ucsdRecommendedSummary || [])
            .map(
              (r) => `
            <tr>
              <td style="color:var(--text-muted);">#${esc(r.rank)}</td>
              <td class="primary-cell">${esc(r.college)}</td>
              <td style="color:var(--text-secondary);">${esc(r.rationale)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector("#btn-toggle-ucsd-img")?.addEventListener("click", () => {
    state.showUcsdImage = !state.showUcsdImage;
    renderUcsTab(container);
  });
  container.querySelector("#btn-add-uc")?.addEventListener("click", () => openUcCampusModal());
  container.querySelector("#btn-add-ucsd")?.addEventListener("click", () => openUcsdModal());
  container.querySelectorAll("[data-uc-row]").forEach((row) => {
    row.addEventListener("click", () => openUcCampusModal(row.getAttribute("data-uc-row")));
  });
  container.querySelectorAll("[data-ucsd-row]").forEach((row) => {
    row.addEventListener("click", () => openUcsdModal(row.getAttribute("data-ucsd-row")));
  });
}

function openUcCampusModal(editId = null) {
  const existing = editId ? state.data.ucs.campuses.find((x) => x.id === editId) : null;
  openDrawer(
    existing ? existing.name : "Add UC Campus",
    [
      { name: "name", label: "Campus Name *", value: existing?.name || "", required: true },
      { name: "location", label: "Location", value: existing?.location || "" },
      { name: "nationalRanking", label: "National Ranking", value: existing?.nationalRanking || "" },
      {
        name: "selected",
        label: "Status",
        type: "select",
        options: [
          { value: "true", label: "Selected (Highlighted)" },
          { value: "false", label: "Listed" },
        ],
        value: existing?.selected ? "true" : "false",
      },
      { name: "majorsApplied", label: "Major(s) Applied For", value: existing?.majorsApplied || "", fullWidth: true },
      { name: "acceptanceStats", label: "Acceptance Stats", value: existing?.acceptanceStats || "", fullWidth: true },
      { name: "notes", label: "Notes", type: "textarea", value: existing?.notes || "", fullWidth: true },
    ],
    (vals) => {
      const payload = { ...vals, selected: vals.selected === "true" };
      if (existing) {
        Object.assign(existing, payload);
        persistData(`Saved ${vals.name}`);
      } else {
        state.data.ucs.campuses.push({ id: uid("uc"), ...payload });
        persistData(`Added ${vals.name}`);
      }
      renderAll();
    }
  );
}

function openUcsdModal(editId = null) {
  const existing = editId ? state.data.ucs.ucsdColleges.find((x) => x.id === editId) : null;
  openDrawer(
    existing ? `UCSD: ${existing.college}` : "Add UCSD College",
    [
      { name: "college", label: "College Name *", value: existing?.college || "", required: true },
      { name: "proposedRanking", label: "Proposed Ranking", value: existing?.proposedRanking || "" },
      { name: "educationReqs", label: "Education Requirements (GEs)", type: "textarea", value: existing?.educationReqs || "", fullWidth: true },
      { name: "dormLife", label: "Dorm Life — Food, Location", type: "textarea", value: existing?.dormLife || "", fullWidth: true },
      { name: "notes", label: "Notes", type: "textarea", value: existing?.notes || "", fullWidth: true },
    ],
    (vals) => {
      if (existing) {
        Object.assign(existing, vals);
        persistData(`Saved ${vals.college}`);
      } else {
        state.data.ucs.ucsdColleges.push({ id: uid("ucsd"), ...vals });
        persistData(`Added ${vals.college}`);
      }
      renderAll();
    }
  );
}

// ============================================================================
// TAB 12: QUESTIONS FOR COLLEEN
// ============================================================================

function renderQuestionsForColleenTab(container) {
  const questions = state.data.questionsForColleen;
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>Questions for Colleen</h2>
        <p>Questions and notes for college counselor sessions.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-add-colleen-q">+ New Question</button>
      </div>
    </div>

    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Answer / Notes</th>
            <th style="text-align:right;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${
            questions.length === 0
              ? `<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-muted);">No questions added yet. Click "+ New Question" to add one.</td></tr>`
              : questions
                  .map(
                    (q) => `
            <tr class="clickable-row ${q.asked ? "row-muted" : ""}" data-colleen-row="${esc(q.id)}">
              <td class="primary-cell">${esc(q.question)}</td>
              <td style="color:var(--text-secondary);">${esc(q.answer || "—")}</td>
              <td style="text-align:right;"><span class="pill ${q.asked ? "pill-success" : "pill-neutral"}">${q.asked ? "Asked" : "Open"}</span></td>
            </tr>
          `
                  )
                  .join("")
          }
        </tbody>
      </table>
    </div>
  `;

  const openQModal = (editId = null) => {
    const existing = editId ? questions.find((x) => x.id === editId) : null;
    openDrawer(
      existing ? "Edit Question" : "New Question",
      [
        { name: "question", label: "Question *", type: "textarea", value: existing?.question || "", required: true, fullWidth: true },
        { name: "answer", label: "Response / Notes", type: "textarea", value: existing?.answer || "", fullWidth: true },
        {
          name: "asked",
          label: "Status",
          type: "select",
          options: [
            { value: "false", label: "Open" },
            { value: "true", label: "Asked / Resolved" },
          ],
          value: existing?.asked ? "true" : "false",
        },
      ],
      (vals) => {
        if (existing) {
          existing.question = vals.question;
          existing.answer = vals.answer;
          existing.asked = vals.asked === "true";
          persistData("Updated question");
        } else {
          questions.push({ id: uid("colleen-q"), question: vals.question, answer: vals.answer, asked: vals.asked === "true" });
          persistData("Added question");
        }
        renderAll();
      },
      existing
        ? () => {
            const idx = questions.findIndex((x) => x.id === existing.id);
            if (idx !== -1) {
              questions.splice(idx, 1);
              persistData("Deleted question");
              renderAll();
            }
          }
        : null
    );
  };

  container.querySelector("#btn-add-colleen-q")?.addEventListener("click", () => openQModal());
  container.querySelectorAll("[data-colleen-row]").forEach((row) => {
    row.addEventListener("click", () => openQModal(row.getAttribute("data-colleen-row")));
  });
}

// ============================================================================
// TAB 13: COLLEGE DEADLINES (CLEAN 5-COL TABLE + SUBTABLES)
// ============================================================================

function renderCollegeDeadlinesTab(container) {
  const cdl = state.data.collegeDeadlines;
  let apps = [...cdl.applications];

  if (state.collegeDeadlinesFilter === "accepted") {
    apps = apps.filter((a) => (a.decision || "").toLowerCase().includes("accepted"));
  } else if (state.collegeDeadlinesFilter === "waitlist") {
    apps = apps.filter((a) => (a.decision || "").toLowerCase().includes("waitlist"));
  } else if (state.collegeDeadlinesFilter === "ea_rea") {
    apps = apps.filter((a) => /ea|rea|ed/i.test(a.appType || ""));
  } else if (state.collegeDeadlinesFilter === "rd") {
    apps = apps.filter((a) => /rd/i.test(a.appType || ""));
  }

  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>College Deadlines</h2>
        <p>Click any application to access essay docs, student portals, FAFSA codes, and deadlines.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btn-import-from-colleges">Import from Colleges</button>
        <button class="btn btn-primary" id="btn-add-cdl">+ New Deadline</button>
      </div>
    </div>

    <div class="view-bar">
      <div class="view-tabs">
        <button class="view-tab ${state.collegeDeadlinesFilter === "all" ? "active" : ""}" data-cdlf="all">All (${cdl.applications.length})</button>
        <button class="view-tab ${state.collegeDeadlinesFilter === "ea_rea" ? "active" : ""}" data-cdlf="ea_rea">REA / EA</button>
        <button class="view-tab ${state.collegeDeadlinesFilter === "rd" ? "active" : ""}" data-cdlf="rd">RD</button>
        <button class="view-tab ${state.collegeDeadlinesFilter === "accepted" ? "active" : ""}" data-cdlf="accepted">Accepted</button>
        <button class="view-tab ${state.collegeDeadlinesFilter === "waitlist" ? "active" : ""}" data-cdlf="waitlist">Waitlisted</button>
      </div>
    </div>

    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th>College</th>
            <th>Type &amp; Essays</th>
            <th>Deadline</th>
            <th>Links</th>
            <th style="text-align:right;">Decision</th>
          </tr>
        </thead>
        <tbody>
          ${apps
            .map(
              (a) => `
            <tr class="clickable-row" data-cdl-row="${esc(a.id)}">
              <td>
                <div class="primary-cell">${esc(a.college)}</div>
                <div class="secondary-text">${esc([a.additionalPrograms, a.notes].filter(Boolean).join(" · "))}</div>
              </td>
              <td style="color:var(--text-secondary);">
                <span class="pill pill-neutral">${esc(a.appType || "RD")}</span>
                <span style="margin-left:6px;font-size:12.5px;">${esc(a.supplementalEssays ?? "0")} essays</span>
              </td>
              <td style="color:var(--text-secondary);white-space:nowrap;">${esc(formatReadableDate(a.deadline))}</td>
              <td>
                <div style="display:flex;gap:10px;font-size:12.5px;">
                  ${a.essayDocUrl ? `<a href="${esc(a.essayDocUrl)}" target="_blank" rel="noopener" class="RowLink">Essays</a>` : ""}
                  ${a.portalUrl ? `<a href="${esc(a.portalUrl)}" target="_blank" rel="noopener" class="RowLink">Portal</a>` : ""}
                  ${!a.essayDocUrl && !a.portalUrl ? `<span style="color:var(--text-muted);">—</span>` : ""}
                </div>
              </td>
              <td style="text-align:right;">
                <span class="pill ${getDecisionPillClass(a.decision)}">${esc(a.decision || "Pending")}</span>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="section-label"><span>UC Campus Decisions &amp; Portals</span></div>
    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th>UC Campus</th>
            <th>Portal</th>
            <th style="text-align:right;">Decision</th>
          </tr>
        </thead>
        <tbody>
          ${cdl.ucDecisions
            .map((u) => {
              const portalObj = cdl.ucPortals.find((p) => p.campus.toLowerCase() === u.campus.toLowerCase());
              return `
                <tr>
                  <td class="primary-cell">UC ${esc(u.campus)}</td>
                  <td>
                    ${
                      portalObj?.portalUrl
                        ? `<a href="${esc(portalObj.portalUrl)}" target="_blank" rel="noopener">Applicant Portal</a>`
                        : "—"
                    }
                  </td>
                  <td style="text-align:right;">
                    <span class="pill ${getDecisionPillClass(u.decision)}">${esc(u.decision)}</span>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector("#btn-add-cdl")?.addEventListener("click", () => openCollegeDeadlineModal());
  container.querySelectorAll(".RowLink").forEach((a) => a.addEventListener("click", (e) => e.stopPropagation()));
  container.querySelectorAll("[data-cdlf]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.collegeDeadlinesFilter = btn.getAttribute("data-cdlf");
      renderCollegeDeadlinesTab(container);
    });
  });
  container.querySelectorAll("[data-cdl-row]").forEach((row) => {
    row.addEventListener("click", () => openCollegeDeadlineModal(row.getAttribute("data-cdl-row")));
  });

  container.querySelector("#btn-import-from-colleges")?.addEventListener("click", () => {
    const existingNames = new Set(cdl.applications.map((a) => a.college.toLowerCase()));
    const available = state.data.colleges.filter((c) => !existingNames.has(c.name.toLowerCase()) && !c.strikethrough);
    if (available.length === 0) {
      showToast("All active colleges are already in College Deadlines.");
      return;
    }
    openDrawer(
      "Import from Colleges List",
      [
        {
          name: "collegeId",
          label: "College *",
          type: "select",
          options: available.map((c) => ({ value: c.id, label: `${c.name} (${c.bucket})` })),
          value: available[0].id,
          fullWidth: true,
        },
        { name: "appType", label: "Application Type", value: "EA" },
        { name: "deadline", label: "Application Deadline", type: "date", value: "2026-11-01" },
        { name: "supplementalEssays", label: "Supplemental Essays", value: "2" },
      ],
      (vals) => {
        const chosen = state.data.colleges.find((c) => c.id === vals.collegeId);
        if (!chosen) return;
        cdl.applications.unshift({
          id: uid("cdl"),
          decision: "Pending",
          acceptDecline: false,
          fafsa: true,
          submitted: false,
          college: chosen.name,
          essayDocUrl: chosen.url || "",
          appType: vals.appType || "RD",
          supplementalEssays: vals.supplementalEssays || "0",
          deadline: vals.deadline || "",
          additionalPrograms: "",
          rdTimeline: "",
          notes: chosen.why || "",
          notesStrike: false,
          portalUrl: "",
          portalText: "",
          fafsaCode: "",
          section: "On-Track Group",
        });
        persistData(`Added ${chosen.name}`);
        renderAll();
      }
    );
  });
}

function openCollegeDeadlineModal(editId = null, prefill = null) {
  const cdl = state.data.collegeDeadlines;
  const existing = editId ? cdl.applications.find((x) => x.id === editId) : null;
  const src = existing || prefill || {};
  openDrawer(
    existing ? existing.college : "New Application Deadline",
    [
      { name: "college", label: "College Name *", value: src.college || "", required: true, fullWidth: true },
      { name: "appType", label: "Type (REA, EA, ED, RD)", value: src.appType || "RD" },
      { name: "decision", label: "Decision", value: src.decision || "Pending" },
      { name: "deadline", label: "Deadline", type: "date", value: src.deadline || "" },
      { name: "rdTimeline", label: "RD Timeline Date", type: "date", value: src.rdTimeline || "" },
      { name: "supplementalEssays", label: "Supplemental Essays", value: src.supplementalEssays ?? "0" },
      { name: "fafsaCode", label: "FAFSA Code", value: src.fafsaCode || "" },
      { name: "essayDocUrl", label: "Essay Google Doc URL", value: src.essayDocUrl || "", fullWidth: true },
      { name: "portalUrl", label: "Student Portal URL", value: src.portalUrl || "", fullWidth: true },
      { name: "additionalPrograms", label: "Additional Programs", value: src.additionalPrograms || "", fullWidth: true },
      { name: "notes", label: "Notes", type: "textarea", value: src.notes || "", fullWidth: true },
    ],
    (vals) => {
      if (existing) {
        Object.assign(existing, vals);
        persistData(`Saved ${vals.college}`);
      } else {
        cdl.applications.unshift({
          id: uid("cdl"),
          acceptDecline: false,
          fafsa: true,
          submitted: false,
          notesStrike: false,
          section: "On-Track Group",
          ...vals,
        });
        persistData(`Added ${vals.college}`);
      }
      renderAll();
    },
    existing
      ? () => {
          const idx = cdl.applications.findIndex((x) => x.id === existing.id);
          if (idx !== -1) {
            const [removed] = cdl.applications.splice(idx, 1);
            persistData(`Deleted ${removed.college}`, () => {
              cdl.applications.splice(idx, 0, removed);
              persistData("Restored deadline");
              renderAll();
            });
            renderAll();
          }
        }
      : null
  );
}

// ============================================================================
// GLOBAL SEARCH
// ============================================================================

function renderGlobalSearchResults(container, query) {
  const q = query.toLowerCase();
  const d = state.data;

  const results = [];
  for (const i of d.internships) {
    if ([i.organization, i.projectArea, i.status, i.otherDetails].join(" ").toLowerCase().includes(q)) {
      results.push({ title: i.organization, sub: i.projectArea || i.status, type: "Internship", click: () => openInternshipModal(i.id) });
    }
  }
  for (const c of d.colleges) {
    if ([c.name, c.bucket, c.location, c.why, c.acceptanceStats].join(" ").toLowerCase().includes(q)) {
      results.push({ title: c.name, sub: `${c.bucket} · ${c.location}`, type: "College", click: () => openCollegeModal(c.id) });
    }
  }
  for (const m of d.majors) {
    if ([m.name, m.details].join(" ").toLowerCase().includes(q)) {
      results.push({ title: m.name, sub: m.details, type: "Major", click: () => openMajorModal(m.id) });
    }
  }

  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <h2>Search: "${esc(query)}"</h2>
        <p>${results.length} matching items across your sheets.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btn-clear-search">Clear</button>
      </div>
    </div>

    <div class="clean-table-wrap">
      <table class="clean-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Details</th>
            <th style="text-align:right;">Type</th>
          </tr>
        </thead>
        <tbody>
          ${
            results.length === 0
              ? `<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-muted);">No matches found.</td></tr>`
              : results
                  .map(
                    (r, idx) => `
            <tr class="clickable-row" data-sres="${idx}">
              <td class="primary-cell">${esc(r.title)}</td>
              <td style="color:var(--text-secondary);">${esc(r.sub || "—")}</td>
              <td style="text-align:right;"><span class="pill pill-neutral">${esc(r.type)}</span></td>
            </tr>
          `
                  )
                  .join("")
          }
        </tbody>
      </table>
    </div>
  `;

  container.querySelector("#btn-clear-search")?.addEventListener("click", () => {
    state.globalSearch = "";
    const inp = document.getElementById("global-search-input");
    if (inp) inp.value = "";
    renderAll();
  });

  container.querySelectorAll("[data-sres]").forEach((row) => {
    row.addEventListener("click", () => {
      const idx = Number(row.getAttribute("data-sres"));
      results[idx]?.click();
    });
  });
}

// ============================================================================
// SLIDE-OVER DRAWER SYSTEM
// ============================================================================

let currentDrawerSubmitHandler = null;
let currentDrawerDeleteHandler = null;

function openDrawer(title, fields, onSubmit, onDelete = null) {
  const backdrop = document.getElementById("modal-backdrop");
  const titleEl = document.getElementById("modal-title");
  const bodyEl = document.getElementById("modal-body");
  const delBtn = document.getElementById("modal-delete-btn");
  if (!backdrop || !titleEl || !bodyEl) return;

  titleEl.textContent = title;
  bodyEl.innerHTML = fields
    .map((f) => {
      const fw = f.fullWidth ? "full-width" : "";
      const req = f.required ? "required" : "";
      if (f.type === "textarea") {
        return `
          <div class="form-field ${fw}">
            <label>${esc(f.label)}</label>
            <textarea name="${esc(f.name)}" ${req}>${esc(f.value || "")}</textarea>
          </div>
        `;
      }
      if (f.type === "select") {
        return `
          <div class="form-field ${fw}">
            <label>${esc(f.label)}</label>
            <select name="${esc(f.name)}">
              ${(f.options || [])
                .map(
                  (opt) =>
                    `<option value="${esc(opt.value)}" ${String(opt.value) === String(f.value) ? "selected" : ""}>${esc(
                      opt.label
                    )}</option>`
                )
                .join("")}
            </select>
          </div>
        `;
      }
      return `
        <div class="form-field ${fw}">
          <label>${esc(f.label)}</label>
          <input type="${esc(f.type || "text")}" name="${esc(f.name)}" value="${esc(f.value ?? "")}" ${req} />
        </div>
      `;
    })
    .join("");

  if (delBtn) {
    if (onDelete) {
      delBtn.style.display = "inline-flex";
      currentDrawerDeleteHandler = () => {
        closeDrawer();
        onDelete();
      };
    } else {
      delBtn.style.display = "none";
      currentDrawerDeleteHandler = null;
    }
  }

  currentDrawerSubmitHandler = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const out = {};
    for (const f of fields) {
      out[f.name] = formData.get(f.name) ?? "";
    }
    closeDrawer();
    onSubmit(out);
  };

  backdrop.classList.add("open");
}

function closeDrawer() {
  const backdrop = document.getElementById("modal-backdrop");
  if (backdrop) backdrop.classList.remove("open");
  currentDrawerSubmitHandler = null;
  currentDrawerDeleteHandler = null;
}

// ============================================================================
// SYNC / EXPORT / IMPORT & GLOBAL EVENTS
// ============================================================================

function triggerExportJson() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ayan_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Exported backup JSON");
}

async function triggerSheetSync() {
  if (!confirm("Pull latest data from the Google Sheet?")) return;
  showToast("Syncing from Google Sheet...");
  try {
    const res = await fetch("/api/sync-google-sheet", { method: "POST" });
    if (res.ok) {
      const payload = await res.json();
      if (payload.ok && payload.data) {
        state.data = payload.data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
        renderAll();
        showToast("Synced with Google Sheet");
        return;
      }
    }
    showToast("Could not reach local sync server");
  } catch (_) {
    showToast("Could not reach local sync server");
  }
}

function bindGlobalEvents() {
  document.getElementById("brand-home")?.addEventListener("click", () => {
    state.activeTab = "overview";
    renderAll();
  });

  const searchInput = document.getElementById("global-search-input");
  searchInput?.addEventListener("input", (e) => {
    state.globalSearch = e.target.value;
    renderAll();
  });

  const navZone = document.getElementById("right-nav-zone");
  const triggerBtn = document.getElementById("hamburger-trigger");
  let hoverTimeout = null;

  if (navZone) {
    navZone.addEventListener("mouseenter", () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      navZone.classList.add("open");
    });
    navZone.addEventListener("mouseleave", () => {
      hoverTimeout = setTimeout(() => {
        navZone.classList.remove("open");
      }, 150);
    });
  }
  triggerBtn?.addEventListener("click", () => {
    navZone?.classList.toggle("open");
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
      e.preventDefault();
      searchInput?.focus();
    }
    if (e.key === "Escape") {
      closeDrawer();
      navZone?.classList.remove("open");
    }
  });

  document.getElementById("modal-close-btn")?.addEventListener("click", closeDrawer);
  document.getElementById("modal-cancel-btn")?.addEventListener("click", closeDrawer);
  document.getElementById("modal-delete-btn")?.addEventListener("click", () => {
    if (currentDrawerDeleteHandler) currentDrawerDeleteHandler();
  });
  document.getElementById("modal-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeDrawer();
  });
  document.getElementById("modal-form")?.addEventListener("submit", (e) => {
    if (currentDrawerSubmitHandler) currentDrawerSubmitHandler(e);
  });

  const fileInp = document.getElementById("file-import-input");
  fileInp?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result));
        if (imported && imported.internships && imported.colleges) {
          state.data = imported;
          persistData("Imported JSON backup");
          renderAll();
        }
      } catch (_) {
        showToast("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  });
}

document.addEventListener("DOMContentLoaded", initApp);
