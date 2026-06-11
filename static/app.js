// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  projects: [],
  currentProject: null,
  currentSuite: null,
  currentRun: null,
};

// ─── API helpers ─────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

const GET    = (p)    => api("GET",    p);
const POST   = (p, b) => api("POST",   p, b);
const PUT    = (p, b) => api("PUT",    p, b);
const DEL    = (p)    => api("DELETE", p);

// ─── Toast ───────────────────────────────────────────────────────────────────
let _toastTimer;
function toast(msg, type = "success") {
  const el = document.getElementById("toast");
  const inner = document.getElementById("toast-inner");
  const colors = {
    success: "bg-emerald-600 text-white",
    error:   "bg-red-600 text-white",
    info:    "bg-blue-600 text-white",
  };
  inner.className = `px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 max-w-xs ${colors[type] || colors.info}`;
  inner.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function showModal(type, data) {
  const overlay = document.getElementById("modal-overlay");
  const title   = document.getElementById("modal-title");
  const body    = document.getElementById("modal-body");
  overlay.classList.remove("hidden");

  const builders = {
    project:      buildProjectModal,
    suite:        buildSuiteModal,
    testcase:     buildTestCaseModal,
    editTestCase: buildEditTestCaseModal,
    run:          buildRunModal,
    result:       buildResultModal,
  };
  if (builders[type]) builders[type](title, body, data);
}

function hideModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

function closeModal(e) {
  if (e.target === document.getElementById("modal-overlay")) hideModal();
}

const inputCls    = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const textareaCls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none";

function field(label, html) {
  return `<div class="mb-4"><label class="block text-sm font-medium text-slate-700 mb-1">${label}</label>${html}</div>`;
}

// Project modal
function buildProjectModal(title, body) {
  title.textContent = "New Project";
  body.innerHTML = `
    ${field("Name *", `<input id="f-name" class="${inputCls}" placeholder="My Project" autofocus />`)}
    ${field("Description", `<textarea id="f-desc" class="${textareaCls}" rows="3" placeholder="Optional description"></textarea>`)}
    <div class="flex justify-end gap-2 mt-6">
      <button onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button onclick="submitProject()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Create Project</button>
    </div>`;
}

async function submitProject() {
  const name = document.getElementById("f-name").value.trim();
  const desc = document.getElementById("f-desc").value.trim();
  if (!name) { toast("Name is required", "error"); return; }
  try {
    await POST("/api/projects", { name, description: desc || null });
    hideModal();
    toast("Project created");
    await loadSidebar();
    navigate("projects");
  } catch (e) { toast(e.message, "error"); }
}

// Suite modal
function buildSuiteModal(title, body, { projectId }) {
  title.textContent = "New Test Suite";
  body.innerHTML = `
    ${field("Name *", `<input id="f-name" class="${inputCls}" placeholder="Login Tests" autofocus />`)}
    ${field("Description", `<textarea id="f-desc" class="${textareaCls}" rows="3" placeholder="Optional description"></textarea>`)}
    <div class="flex justify-end gap-2 mt-6">
      <button onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button onclick="submitSuite(${projectId})" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Create Suite</button>
    </div>`;
}

async function submitSuite(projectId) {
  const name = document.getElementById("f-name").value.trim();
  const desc = document.getElementById("f-desc").value.trim();
  if (!name) { toast("Name is required", "error"); return; }
  try {
    await POST(`/api/projects/${projectId}/suites`, { name, description: desc || null });
    hideModal();
    toast("Test suite created");
    navigate(`project/${projectId}`);
  } catch (e) { toast(e.message, "error"); }
}

// Test case modal
function buildTestCaseModal(title, body, { suiteId }) {
  title.textContent = "New Test Case";
  body.innerHTML = `
    ${field("Title *", `<input id="f-title" class="${inputCls}" placeholder="Verify user can log in" autofocus />`)}
    ${field("Description", `<textarea id="f-desc" class="${textareaCls}" rows="2" placeholder="Brief description"></textarea>`)}
    ${field("Steps", `<textarea id="f-steps" class="${textareaCls}" rows="4" placeholder="1. Navigate to login page&#10;2. Enter credentials&#10;3. Click Login"></textarea>`)}
    ${field("Expected Result", `<textarea id="f-expected" class="${textareaCls}" rows="2" placeholder="User is redirected to dashboard"></textarea>`)}
    <div class="grid grid-cols-2 gap-4">
      ${field("Status", `<select id="f-status" class="${inputCls}">
        <option value="draft">Draft</option>
        <option value="active" selected>Active</option>
        <option value="deprecated">Deprecated</option>
      </select>`)}
      ${field("Priority", `<select id="f-priority" class="${inputCls}">
        <option value="low">Low</option>
        <option value="medium" selected>Medium</option>
        <option value="high">High</option>
        <option value="critical">Critical</option>
      </select>`)}
    </div>
    <div class="flex justify-end gap-2 mt-2">
      <button onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button onclick="submitTestCase(${suiteId})" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Create Test Case</button>
    </div>`;
}

async function submitTestCase(suiteId) {
  const title    = document.getElementById("f-title").value.trim();
  const desc     = document.getElementById("f-desc").value.trim();
  const steps    = document.getElementById("f-steps").value.trim();
  const expected = document.getElementById("f-expected").value.trim();
  const status   = document.getElementById("f-status").value;
  const priority = document.getElementById("f-priority").value;
  if (!title) { toast("Title is required", "error"); return; }
  try {
    await POST(`/api/suites/${suiteId}/testcases`, {
      title, description: desc || null, steps: steps || null,
      expected_result: expected || null, status, priority,
    });
    hideModal();
    toast("Test case created");
    navigate(`suite/${suiteId}`);
  } catch (e) { toast(e.message, "error"); }
}

// Edit test case modal
function buildEditTestCaseModal(title, body, tc) {
  title.textContent = "Edit Test Case";
  body.innerHTML = `
    ${field("Title *", `<input id="f-title" class="${inputCls}" value="${escHtml(tc.title)}" />`)}
    ${field("Description", `<textarea id="f-desc" class="${textareaCls}" rows="2">${escHtml(tc.description || "")}</textarea>`)}
    ${field("Steps", `<textarea id="f-steps" class="${textareaCls}" rows="4">${escHtml(tc.steps || "")}</textarea>`)}
    ${field("Expected Result", `<textarea id="f-expected" class="${textareaCls}" rows="2">${escHtml(tc.expected_result || "")}</textarea>`)}
    <div class="grid grid-cols-2 gap-4">
      ${field("Status", `<select id="f-status" class="${inputCls}">
        <option value="draft" ${tc.status === "draft" ? "selected" : ""}>Draft</option>
        <option value="active" ${tc.status === "active" ? "selected" : ""}>Active</option>
        <option value="deprecated" ${tc.status === "deprecated" ? "selected" : ""}>Deprecated</option>
      </select>`)}
      ${field("Priority", `<select id="f-priority" class="${inputCls}">
        <option value="low" ${tc.priority === "low" ? "selected" : ""}>Low</option>
        <option value="medium" ${tc.priority === "medium" ? "selected" : ""}>Medium</option>
        <option value="high" ${tc.priority === "high" ? "selected" : ""}>High</option>
        <option value="critical" ${tc.priority === "critical" ? "selected" : ""}>Critical</option>
      </select>`)}
    </div>
    <div class="flex justify-end gap-2 mt-2">
      <button onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button onclick="submitEditTestCase(${tc.id}, ${tc.suite_id})" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Save Changes</button>
    </div>`;
}

async function submitEditTestCase(tcId, suiteId) {
  const title    = document.getElementById("f-title").value.trim();
  const desc     = document.getElementById("f-desc").value.trim();
  const steps    = document.getElementById("f-steps").value.trim();
  const expected = document.getElementById("f-expected").value.trim();
  const status   = document.getElementById("f-status").value;
  const priority = document.getElementById("f-priority").value;
  if (!title) { toast("Title is required", "error"); return; }
  try {
    await PUT(`/api/testcases/${tcId}`, {
      title, description: desc || null, steps: steps || null,
      expected_result: expected || null, status, priority,
    });
    hideModal();
    toast("Test case updated");
    navigate(`suite/${suiteId}`);
  } catch (e) { toast(e.message, "error"); }
}

// Run modal
function buildRunModal(title, body, { suiteId }) {
  title.textContent = "Start Test Run";
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  body.innerHTML = `
    ${field("Run Name *", `<input id="f-name" class="${inputCls}" value="Run ${dateStr} ${timeStr}" autofocus />`)}
    <p class="text-sm text-slate-500 mb-4">Creates a new test run for all <strong>active</strong> test cases in this suite.</p>
    <div class="flex justify-end gap-2">
      <button onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button onclick="submitRun(${suiteId})" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">Start Run</button>
    </div>`;
}

async function submitRun(suiteId) {
  const name = document.getElementById("f-name").value.trim();
  if (!name) { toast("Name is required", "error"); return; }
  try {
    const run = await POST(`/api/suites/${suiteId}/runs`, { name });
    hideModal();
    toast("Test run started");
    navigate(`run/${run.id}`);
  } catch (e) { toast(e.message, "error"); }
}

// Result modal
function buildResultModal(title, body, { runId, tcId, tcTitle, currentStatus, currentNotes }) {
  title.textContent = "Record Result";
  window._selectedResultStatus = currentStatus && currentStatus !== "pending" ? currentStatus : null;

  body.innerHTML = `
    <p class="text-sm font-medium text-slate-700 mb-4 bg-slate-50 rounded-lg px-3 py-2">${escHtml(tcTitle)}</p>
    <div class="mb-4">
      <label class="block text-sm font-medium text-slate-700 mb-2">Result *</label>
      <div class="flex gap-2">
        ${["pass","fail","skip"].map(s => `
          <button id="rs-${s}" onclick="selectResultStatus('${s}')"
            class="flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all
              ${window._selectedResultStatus === s ? resultBtnCls(s) : "border-slate-200 text-slate-500 bg-white hover:border-slate-300"}">
            ${s === "pass" ? "✓ Pass" : s === "fail" ? "✗ Fail" : "⟶ Skip"}
          </button>`).join("")}
      </div>
    </div>
    ${field("Notes (optional)", `<textarea id="f-notes" class="${textareaCls}" rows="3" placeholder="Add notes about this result...">${escHtml(currentNotes || "")}</textarea>`)}
    <div class="flex justify-end gap-2 mt-2">
      <button onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button onclick="submitResult(${runId}, ${tcId})" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Save Result</button>
    </div>`;
}

function resultBtnCls(s) {
  return s === "pass" ? "border-emerald-500 bg-emerald-50 text-emerald-700"
       : s === "fail" ? "border-red-500 bg-red-50 text-red-700"
       :                "border-amber-500 bg-amber-50 text-amber-700";
}

function selectResultStatus(s) {
  window._selectedResultStatus = s;
  ["pass", "fail", "skip"].forEach(x => {
    const btn = document.getElementById(`rs-${x}`);
    if (!btn) return;
    if (x === s) {
      btn.className = `flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${resultBtnCls(s)}`;
    } else {
      btn.className = "flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all border-slate-200 text-slate-500 bg-white hover:border-slate-300";
    }
  });
}

async function submitResult(runId, tcId) {
  const status = window._selectedResultStatus;
  if (!status) { toast("Please select a result", "error"); return; }
  const notes = document.getElementById("f-notes").value.trim();
  try {
    await PUT(`/api/runs/${runId}/results/${tcId}`, { status, notes: notes || null });
    hideModal();
    toast(`Marked as ${status}`);
    navigate(`run/${runId}`);
  } catch (e) { toast(e.message, "error"); }
}

// ─── Router ──────────────────────────────────────────────────────────────────
function navigate(hash) {
  if (window.location.hash === "#" + hash) {
    router();
  } else {
    window.location.hash = hash;
  }
}

async function router() {
  const hash  = window.location.hash.replace("#", "") || "projects";
  const parts = hash.split("/");

  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById("nav-new-btn").classList.add("hidden");

  if (!hash || hash === "projects") {
    await renderProjects();
  } else if (parts[0] === "project" && parts[1]) {
    await renderProject(parseInt(parts[1]));
  } else if (parts[0] === "suite" && parts[1] && parts[2] === "testcases") {
    await renderSuiteTestCases(parseInt(parts[1]));
  } else if (parts[0] === "suite" && parts[1] && parts[2] === "runs") {
    await renderSuiteRuns(parseInt(parts[1]));
  } else if (parts[0] === "suite" && parts[1]) {
    await renderSuite(parseInt(parts[1]));
  } else if (parts[0] === "run" && parts[1]) {
    await renderRun(parseInt(parts[1]));
  } else {
    await renderProjects();
  }
}

// ─── Breadcrumb ──────────────────────────────────────────────────────────────
function setBreadcrumb(items) {
  const el = document.getElementById("breadcrumb");
  el.innerHTML = items.map((item, i) => {
    const sep = i > 0
      ? `<svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>`
      : "";
    if (i === items.length - 1) {
      return `${sep}<span class="text-slate-600 font-medium truncate max-w-[160px]">${escHtml(item.label)}</span>`;
    }
    return `${sep}<button onclick="navigate('${item.href}')" class="text-blue-600 hover:text-blue-700 transition-colors truncate max-w-[120px]">${escHtml(item.label)}</button>`;
  }).join("");
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
async function loadSidebar() {
  const ul = document.getElementById("sidebar-projects");
  try {
    state.projects = await GET("/api/projects");
    if (!state.projects.length) {
      ul.innerHTML = `<li class="px-4 py-3 text-sm text-slate-400 italic">No projects yet</li>`;
      return;
    }

    // Build project list; for active project also load its suites
    const items = await Promise.all(state.projects.map(async p => {
      const active = state.currentProject && state.currentProject.id === p.id;
      let suitesHtml = "";
      if (active) {
        try {
          const suites = await GET(`/api/projects/${p.id}/suites`);
          if (suites.length) {
            suitesHtml = `<ul class="border-l border-slate-200 ml-5 mt-0.5">
              ${suites.map(s => {
                const suiteActive = state.currentSuite && state.currentSuite.id === s.id;
                const runsActive = state.currentView === `suite-runs-${s.id}`;
                const casesActive = state.currentView === `suite-cases-${s.id}`;
                return `<li>
                  <button onclick="navigate('suite/${s.id}')"
                    class="w-full text-left pl-3 pr-4 py-1.5 text-xs transition-colors truncate
                      ${suiteActive ? "text-blue-700 font-semibold" : "text-slate-500 hover:text-blue-700"}">
                    ${escHtml(s.name)}
                  </button>
                  <ul class="border-l border-slate-100 ml-3">
                    <li>
                      <button onclick="navigate('suite/${s.id}/testcases')"
                        class="w-full text-left pl-3 pr-4 py-1 text-xs transition-colors truncate flex items-center gap-1
                          ${casesActive ? "text-blue-700 font-semibold" : "text-slate-400 hover:text-blue-600"}">
                        <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                        Test Cases
                      </button>
                    </li>
                    <li>
                      <button onclick="navigate('suite/${s.id}/runs')"
                        class="w-full text-left pl-3 pr-4 py-1 text-xs transition-colors truncate flex items-center gap-1
                          ${runsActive ? "text-blue-700 font-semibold" : "text-slate-400 hover:text-blue-600"}">
                        <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Test Runs
                      </button>
                    </li>
                  </ul>
                </li>`;
              }).join("")}
            </ul>`;
          }
        } catch {}
      }
      return `<li>
        <button onclick="navigate('project/${p.id}')"
          class="w-full text-left px-4 py-2.5 text-sm transition-colors truncate
            ${active ? "bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600" : "text-slate-700 hover:bg-slate-50 hover:text-blue-700"}">
          ${escHtml(p.name)}
        </button>
        ${suitesHtml}
      </li>`;
    }));
    ul.innerHTML = items.join("");
  } catch {
    ul.innerHTML = `<li class="px-4 py-3 text-sm text-red-400">Failed to load</li>`;
  }
}

// ─── Projects View ───────────────────────────────────────────────────────────
async function renderProjects() {
  state.currentProject = null;
  state.currentSuite = null;
  setBreadcrumb([{ label: "Projects", href: "projects" }]);

  const navBtn = document.getElementById("nav-new-btn");
  document.getElementById("nav-new-label").textContent = "New Project";
  navBtn.classList.remove("hidden");
  navBtn.onclick = () => showModal("project");

  const el = document.getElementById("view-projects");
  el.classList.remove("hidden");
  el.innerHTML = `<div class="flex items-center justify-center py-16"><div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>`;

  await loadSidebar();

  if (!state.projects.length) {
    el.innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 text-center fade-in">
        <div class="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center mb-5">
          <svg class="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-slate-700 mb-2">Welcome to TestFlow</h2>
        <p class="text-slate-500 mb-8 max-w-sm">Organize your test suites and cases into projects. Create your first project to get started.</p>
        <button onclick="showModal('project')" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm">
          Create First Project
        </button>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="fade-in">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Projects</h1>
          <p class="text-slate-500 text-sm mt-0.5">${state.projects.length} project${state.projects.length !== 1 ? "s" : ""}</p>
        </div>
        <button onclick="showModal('project')" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          New Project
        </button>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        ${state.projects.map(p => projectCard(p)).join("")}
      </div>
    </div>`;
}

function projectCard(p) {
  return `
    <div onclick="navigate('project/${p.id}')"
      class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group p-5">
      <div class="flex items-start justify-between mb-4">
        <div class="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center">
          <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
          </svg>
        </div>
        <button onclick="event.stopPropagation(); deleteProject(${p.id})"
          class="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
      <h3 class="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors mb-1 truncate">${escHtml(p.name)}</h3>
      <p class="text-sm text-slate-500 line-clamp-2 mb-4 min-h-[40px]">${escHtml(p.description || "No description provided.")}</p>
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span>${formatDate(p.created_at)}</span>
        <svg class="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      </div>
    </div>`;
}

async function deleteProject(id) {
  if (!confirm("Delete this project and all its suites, test cases, and runs?")) return;
  try {
    await DEL(`/api/projects/${id}`);
    toast("Project deleted");
    state.currentProject = null;
    await loadSidebar();
    navigate("projects");
  } catch (e) { toast(e.message, "error"); }
}

// ─── Project View ─────────────────────────────────────────────────────────────
async function renderProject(projectId) {
  const el = document.getElementById("view-project");
  el.classList.remove("hidden");
  el.innerHTML = `<div class="flex items-center justify-center py-16"><div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>`;

  let project, suites, stats;
  try {
    const projects = await GET("/api/projects");
    project = projects.find(p => p.id === projectId);
    if (!project) throw new Error("Project not found");
    [suites, stats] = await Promise.all([
      GET(`/api/projects/${projectId}/suites`),
      GET(`/api/projects/${projectId}/stats`),
    ]);
  } catch (e) {
    el.innerHTML = `<div class="text-red-500 text-center py-16">${escHtml(e.message)}</div>`;
    return;
  }

  state.currentProject = project;
  await loadSidebar();

  setBreadcrumb([
    { label: "Projects", href: "projects" },
    { label: project.name, href: `project/${projectId}` },
  ]);

  const navBtn = document.getElementById("nav-new-btn");
  document.getElementById("nav-new-label").textContent = "New Suite";
  navBtn.classList.remove("hidden");
  navBtn.onclick = () => showModal("suite", { projectId });

  const total  = stats.last_run_pass + stats.last_run_fail + stats.last_run_skip + stats.last_run_pending;
  const passP  = total ? Math.round(stats.last_run_pass / total * 100) : 0;
  const failP  = total ? Math.round(stats.last_run_fail / total * 100) : 0;
  const skipP  = total ? Math.round(stats.last_run_skip / total * 100) : 0;

  el.innerHTML = `
    <div class="fade-in space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">${escHtml(project.name)}</h1>
          ${project.description ? `<p class="text-slate-500 text-sm mt-1">${escHtml(project.description)}</p>` : ""}
        </div>
        <button onclick="showModal('suite', {projectId: ${projectId}})"
          class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          New Suite
        </button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
          <p class="text-2xl font-bold text-blue-600">${stats.total_suites}</p>
          <p class="text-xs font-medium text-slate-500 mt-1">Suites</p>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
          <p class="text-2xl font-bold text-purple-600">${stats.total_cases}</p>
          <p class="text-xs font-medium text-slate-500 mt-1">Test Cases</p>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
          <p class="text-2xl font-bold text-slate-600">${stats.total_runs}</p>
          <p class="text-xs font-medium text-slate-500 mt-1">Total Runs</p>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
          <p class="text-2xl font-bold text-emerald-600">${passP}%</p>
          <p class="text-xs font-medium text-slate-500 mt-1">Pass Rate</p>
        </div>
      </div>

      <!-- Last run progress bar -->
      ${total ? `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="font-semibold text-slate-800 text-sm">Latest Run</h3>
            <p class="text-xs text-slate-400 mt-0.5">${escHtml(stats.last_run_name || "")}</p>
          </div>
          <div class="flex items-center gap-3 text-xs font-medium">
            <span class="flex items-center gap-1.5 text-emerald-600">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>${stats.last_run_pass} pass
            </span>
            <span class="flex items-center gap-1.5 text-red-600">
              <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>${stats.last_run_fail} fail
            </span>
            <span class="flex items-center gap-1.5 text-amber-600">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>${stats.last_run_skip} skip
            </span>
            ${stats.last_run_pending ? `<span class="flex items-center gap-1.5 text-slate-400">
              <span class="w-2.5 h-2.5 rounded-full bg-slate-300"></span>${stats.last_run_pending} pending
            </span>` : ""}
          </div>
        </div>
        <div class="h-3 bg-slate-100 rounded-full overflow-hidden flex">
          ${passP ? `<div class="bg-emerald-500 h-full transition-all" style="width:${passP}%"></div>` : ""}
          ${failP ? `<div class="bg-red-500 h-full transition-all" style="width:${failP}%"></div>` : ""}
          ${skipP ? `<div class="bg-amber-400 h-full transition-all" style="width:${skipP}%"></div>` : ""}
        </div>
        <p class="text-xs text-slate-400 mt-2">${total} test${total !== 1 ? "s" : ""} · ${passP}% passing</p>
      </div>` : ""}

      <!-- Suites list -->
      <div>
        <h2 class="text-lg font-semibold text-slate-700 mb-3">Test Suites</h2>
        ${!suites.length ? `
          <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
            <p class="text-slate-400 mb-3">No test suites yet.</p>
            <button onclick="showModal('suite', {projectId: ${projectId}})" class="text-blue-600 hover:underline text-sm font-semibold">
              Create your first suite
            </button>
          </div>` : `
          <div class="space-y-3">
            ${suites.map(s => suiteCard(s, projectId)).join("")}
          </div>`}
      </div>
    </div>`;
}

function suiteCard(s, projectId) {
  return `
    <div onclick="navigate('suite/${s.id}')"
      class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group">
      <div class="p-4 flex items-center gap-4">
        <div class="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors truncate">${escHtml(s.name)}</h3>
          ${s.description ? `<p class="text-sm text-slate-500 truncate mt-0.5">${escHtml(s.description)}</p>` : ""}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-xs text-slate-400">${formatDate(s.created_at)}</span>
          <button onclick="event.stopPropagation(); deleteSuite(${s.id}, ${projectId})"
            class="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
          <svg class="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </div>
      </div>
    </div>`;
}

function runCard(r, suiteName) {
  const total   = r.results ? r.results.length : 0;
  const pass    = r.results ? r.results.filter(x => x.status === "pass").length : 0;
  const fail    = r.results ? r.results.filter(x => x.status === "fail").length : 0;
  const pending = r.results ? r.results.filter(x => x.status === "pending").length : 0;
  const passP   = total ? Math.round(pass / total * 100) : 0;
  const status  = r.completed_at
    ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Completed</span>`
    : `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">In Progress</span>`;
  return `
    <div onclick="navigate('run/${r.id}')"
      class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group p-4">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-0.5">
            <span class="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors truncate">${escHtml(r.name)}</span>
            ${status}
          </div>
          <span class="inline-block text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">${escHtml(suiteName)}</span>
        </div>
        <span class="text-xs text-slate-400 flex-shrink-0">${formatDate(r.created_at)}</span>
      </div>
      ${total ? `
        <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden flex mb-2">
          ${passP ? `<div class="bg-emerald-500 h-full" style="width:${passP}%"></div>` : ""}
          ${fail ? `<div class="bg-red-500 h-full" style="width:${Math.round(fail/total*100)}%"></div>` : ""}
        </div>
        <div class="flex items-center justify-between">
          <div class="flex gap-3 text-xs text-slate-500">
            <span class="text-emerald-600 font-medium">${pass} pass</span>
            <span class="text-red-600 font-medium">${fail} fail</span>
            ${pending ? `<span class="text-slate-400">${pending} pending</span>` : ""}
          </div>
          <span class="text-xs font-bold ${passP >= 80 ? "text-emerald-600" : passP >= 50 ? "text-amber-500" : "text-red-500"}">${passP}%</span>
        </div>` : ""}
    </div>`;
}

async function deleteSuite(suiteId, projectId) {
  if (!confirm("Delete this suite and all its test cases?")) return;
  try {
    await DEL(`/api/suites/${suiteId}`);
    toast("Suite deleted");
    navigate(`project/${projectId}`);
  } catch (e) { toast(e.message, "error"); }
}

// ─── Suite View ───────────────────────────────────────────────────────────────
async function renderSuite(suiteId) {
  const el = document.getElementById("view-suite");
  el.classList.remove("hidden");
  el.innerHTML = `<div class="flex items-center justify-center py-16"><div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>`;

  let suite, testcases, project, runs;
  try {
    const projects = await GET("/api/projects");
    for (const p of projects) {
      const suites = await GET(`/api/projects/${p.id}/suites`);
      const found = suites.find(s => s.id === suiteId);
      if (found) { suite = found; project = p; break; }
    }
    if (!suite) throw new Error("Suite not found");
    [testcases, runs] = await Promise.all([
      GET(`/api/suites/${suiteId}/testcases`),
      GET(`/api/suites/${suiteId}/runs`),
    ]);
  } catch (e) {
    el.innerHTML = `<div class="text-red-500 text-center py-16">${escHtml(e.message)}</div>`;
    return;
  }

  state.currentSuite = suite;
  state.currentProject = project;
  state.currentView = null;
  await loadSidebar();

  setBreadcrumb([
    { label: "Projects", href: "projects" },
    { label: project.name, href: `project/${project.id}` },
    { label: suite.name, href: `suite/${suiteId}` },
  ]);

  const navBtn = document.getElementById("nav-new-btn");
  document.getElementById("nav-new-label").textContent = "New Test Case";
  navBtn.classList.remove("hidden");
  navBtn.onclick = () => showModal("testcase", { suiteId });

  const counts = { draft: 0, active: 0, deprecated: 0 };
  testcases.forEach(tc => { if (counts[tc.status] !== undefined) counts[tc.status]++; });

  el.innerHTML = `
    <div class="fade-in space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">${escHtml(suite.name)}</h1>
          ${suite.description ? `<p class="text-slate-500 text-sm mt-1">${escHtml(suite.description)}</p>` : ""}
        </div>
        <div class="flex items-center gap-2">
          <button onclick="showModal('run', {suiteId: ${suiteId}})"
            class="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Start Run
          </button>
          <button onclick="showModal('testcase', {suiteId: ${suiteId}})"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            New Test Case
          </button>
        </div>
      </div>

      <!-- Status counts -->
      <div class="flex flex-wrap gap-2">
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">${testcases.length} total</span>
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">${counts.active} active</span>
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">${counts.draft} draft</span>
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">${counts.deprecated} deprecated</span>
      </div>

      <!-- Test cases -->
      ${!testcases.length ? `
        <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <p class="text-slate-400 mb-3">No test cases yet.</p>
          <button onclick="showModal('testcase', {suiteId: ${suiteId}})" class="text-blue-600 hover:underline text-sm font-semibold">
            Add your first test case
          </button>
        </div>` : `
        <div class="space-y-3">
          ${testcases.map(tc => testCaseCard(tc)).join("")}
        </div>`}

      <!-- Runs history -->
      <div>
        <h2 class="text-lg font-semibold text-slate-700 mb-3">Test Runs</h2>
        ${!runs.length ? `
          <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-400 text-sm">
            No runs yet. Click <strong>Start Run</strong> to execute this suite.
          </div>` : `
          <div class="space-y-3">
            ${runs.map(r => runCard(r, suite.name)).join("")}
          </div>`}
      </div>
    </div>`;
}

function testCaseCard(tc) {
  const tcJson = JSON.stringify(tc).replace(/\\/g, "\\\\").replace(/"/g, "&quot;");
  return `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
      <div class="p-4">
        <div class="flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <h3 class="font-semibold text-slate-800">${escHtml(tc.title)}</h3>
              ${statusBadge(tc.status)}
              ${priorityBadge(tc.priority)}
            </div>
            ${tc.description ? `<p class="text-sm text-slate-500 mb-2">${escHtml(tc.description)}</p>` : ""}
            ${tc.steps ? `
              <details class="mt-2 group/details">
                <summary class="text-xs text-blue-600 cursor-pointer hover:text-blue-700 font-medium select-none">
                  View Steps
                </summary>
                <pre class="mt-2 text-xs text-slate-600 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap font-mono border border-slate-100">${escHtml(tc.steps)}</pre>
              </details>` : ""}
            ${tc.expected_result ? `
              <p class="text-xs text-slate-500 mt-2">
                <span class="font-semibold text-slate-600">Expected:</span> ${escHtml(tc.expected_result)}
              </p>` : ""}
          </div>
          <div class="flex items-center gap-1 flex-shrink-0 ml-2">
            <button onclick='showModal("editTestCase", JSON.parse(this.dataset.tc))'
              data-tc="${tcJson}"
              class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button onclick="deleteTestCase(${tc.id}, ${tc.suite_id})"
              class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Delete">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

async function deleteTestCase(tcId, suiteId) {
  if (!confirm("Delete this test case?")) return;
  try {
    await DEL(`/api/testcases/${tcId}`);
    toast("Test case deleted");
    navigate(`suite/${suiteId}`);
  } catch (e) { toast(e.message, "error"); }
}

// ─── Suite Test Cases View ────────────────────────────────────────────────────
async function renderSuiteTestCases(suiteId) {
  const el = document.getElementById("view-suite");
  el.classList.remove("hidden");
  el.innerHTML = `<div class="flex items-center justify-center py-16"><div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>`;

  let suite, project, testcases;
  try {
    const projects = await GET("/api/projects");
    for (const p of projects) {
      const suites = await GET(`/api/projects/${p.id}/suites`);
      const found = suites.find(s => s.id === suiteId);
      if (found) { suite = found; project = p; break; }
    }
    if (!suite) throw new Error("Suite not found");
    testcases = await GET(`/api/suites/${suiteId}/testcases`);
  } catch (e) {
    el.innerHTML = `<div class="text-red-500 text-center py-16">${escHtml(e.message)}</div>`;
    return;
  }

  state.currentSuite = suite;
  state.currentProject = project;
  state.currentView = `suite-cases-${suiteId}`;
  await loadSidebar();

  setBreadcrumb([
    { label: "Projects", href: "projects" },
    { label: project.name, href: `project/${project.id}` },
    { label: suite.name, href: `suite/${suiteId}` },
    { label: "Test Cases", href: `suite/${suiteId}/testcases` },
  ]);

  const navBtn = document.getElementById("nav-new-btn");
  document.getElementById("nav-new-label").textContent = "New Test Case";
  navBtn.classList.remove("hidden");
  navBtn.onclick = () => showModal("testcase", { suiteId });

  const counts = { draft: 0, active: 0, deprecated: 0 };
  testcases.forEach(tc => { if (counts[tc.status] !== undefined) counts[tc.status]++; });

  el.innerHTML = `
    <div class="fade-in space-y-6">
      <div class="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Test Cases</h1>
          <p class="text-slate-500 text-sm mt-1">${escHtml(suite.name)} · ${testcases.length} case${testcases.length !== 1 ? "s" : ""}</p>
        </div>
        <button onclick="showModal('testcase', {suiteId: ${suiteId}})"
          class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          New Test Case
        </button>
      </div>
      <div class="flex flex-wrap gap-2">
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">${testcases.length} total</span>
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">${counts.active} active</span>
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">${counts.draft} draft</span>
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">${counts.deprecated} deprecated</span>
      </div>
      ${!testcases.length ? `
        <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <p class="text-slate-400 mb-3">No test cases yet.</p>
          <button onclick="showModal('testcase', {suiteId: ${suiteId}})" class="text-blue-600 hover:underline text-sm font-semibold">
            Add your first test case
          </button>
        </div>` : `
        <div class="space-y-3">
          ${testcases.map(tc => testCaseCard(tc)).join("")}
        </div>`}
    </div>`;
}

// ─── Suite Runs View ──────────────────────────────────────────────────────────
async function renderSuiteRuns(suiteId) {
  const el = document.getElementById("view-suite");
  el.classList.remove("hidden");
  el.innerHTML = `<div class="flex items-center justify-center py-16"><div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>`;

  let suite, project, runs;
  try {
    const projects = await GET("/api/projects");
    for (const p of projects) {
      const suites = await GET(`/api/projects/${p.id}/suites`);
      const found = suites.find(s => s.id === suiteId);
      if (found) { suite = found; project = p; break; }
    }
    if (!suite) throw new Error("Suite not found");
    runs = await GET(`/api/suites/${suiteId}/runs`);
  } catch (e) {
    el.innerHTML = `<div class="text-red-500 text-center py-16">${escHtml(e.message)}</div>`;
    return;
  }

  state.currentSuite = suite;
  state.currentProject = project;
  state.currentView = `suite-runs-${suiteId}`;
  await loadSidebar();

  setBreadcrumb([
    { label: "Projects", href: "projects" },
    { label: project.name, href: `project/${project.id}` },
    { label: suite.name, href: `suite/${suiteId}` },
    { label: "Test Runs", href: `suite/${suiteId}/runs` },
  ]);
  document.getElementById("nav-new-btn").classList.add("hidden");

  el.innerHTML = `
    <div class="fade-in space-y-6">
      <div class="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Test Runs</h1>
          <p class="text-slate-500 text-sm mt-1">${escHtml(suite.name)} · ${runs.length} run${runs.length !== 1 ? "s" : ""}</p>
        </div>
        <button onclick="showModal('run', {suiteId: ${suiteId}})"
          class="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Start Run
        </button>
      </div>
      ${!runs.length ? `
        <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-400 text-sm">
          No runs yet. Click <strong>Start Run</strong> to execute this suite.
        </div>` : `
        <div class="space-y-3">
          ${runs.map(r => runCard(r, suite.name)).join("")}
        </div>`}
    </div>`;
}

// ─── Run View ─────────────────────────────────────────────────────────────────
async function renderRun(runId) {
  const el = document.getElementById("view-run");
  el.classList.remove("hidden");
  el.innerHTML = `<div class="flex items-center justify-center py-16"><div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>`;

  let run, suite = null, project = null;
  try {
    run = await GET(`/api/runs/${runId}`);
    const projects = await GET("/api/projects");
    for (const p of projects) {
      const suites = await GET(`/api/projects/${p.id}/suites`);
      const found = suites.find(s => s.id === run.suite_id);
      if (found) { suite = found; project = p; break; }
    }
  } catch (e) {
    el.innerHTML = `<div class="text-red-500 text-center py-16">${escHtml(e.message)}</div>`;
    return;
  }

  state.currentRun = run;
  if (project) state.currentProject = project;
  state.currentView = null;
  await loadSidebar();

  setBreadcrumb([
    { label: "Projects", href: "projects" },
    ...(project ? [{ label: project.name, href: `project/${project.id}` }] : []),
    ...(suite   ? [{ label: suite.name,   href: `suite/${suite.id}` }] : []),
    { label: run.name, href: `run/${runId}` },
  ]);
  document.getElementById("nav-new-btn").classList.add("hidden");

  const results = run.results || [];
  const pass    = results.filter(r => r.status === "pass").length;
  const fail    = results.filter(r => r.status === "fail").length;
  const skip    = results.filter(r => r.status === "skip").length;
  const pending = results.filter(r => r.status === "pending").length;
  const total   = results.length;
  const passP   = total ? Math.round(pass / total * 100) : 0;
  const failP   = total ? Math.round(fail / total * 100) : 0;
  const skipP   = total ? Math.round(skip / total * 100) : 0;
  const done    = total - pending;

  el.innerHTML = `
    <div class="fade-in space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <h1 class="text-2xl font-bold text-slate-800">${escHtml(run.name)}</h1>
            ${run.completed_at
              ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Completed</span>`
              : `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">In Progress</span>`}
          </div>
          <p class="text-sm text-slate-500">Started ${formatDate(run.created_at)}</p>
        </div>
        ${suite ? `
          <button onclick="navigate('suite/${suite.id}')"
            class="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Back to Suite
          </button>` : ""}
      </div>

      <!-- Progress card -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-slate-700">Run Progress</h3>
          <div class="flex items-center gap-3">
            <span class="text-sm text-slate-400 font-medium">${done} / ${total} executed</span>
            <span class="text-lg font-bold ${passP >= 80 ? "text-emerald-600" : passP >= 50 ? "text-amber-500" : "text-red-500"}">${passP}% pass rate</span>
          </div>
        </div>
        <div class="h-3 bg-slate-100 rounded-full overflow-hidden flex mb-4">
          ${passP ? `<div class="bg-emerald-500 h-full transition-all duration-500" style="width:${passP}%"></div>` : ""}
          ${failP ? `<div class="bg-red-500 h-full transition-all duration-500" style="width:${failP}%"></div>` : ""}
          ${skipP ? `<div class="bg-amber-400 h-full transition-all duration-500" style="width:${skipP}%"></div>` : ""}
        </div>
        <div class="grid grid-cols-4 gap-3 text-center">
          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p class="text-xl font-bold text-emerald-600">${pass}</p>
            <p class="text-xs text-slate-500 mt-0.5">Pass</p>
          </div>
          <div class="bg-red-50 border border-red-200 rounded-xl p-3">
            <p class="text-xl font-bold text-red-600">${fail}</p>
            <p class="text-xs text-slate-500 mt-0.5">Fail</p>
          </div>
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p class="text-xl font-bold text-amber-600">${skip}</p>
            <p class="text-xs text-slate-500 mt-0.5">Skip</p>
          </div>
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p class="text-xl font-bold text-slate-500">${pending}</p>
            <p class="text-xs text-slate-500 mt-0.5">Pending</p>
          </div>
        </div>
      </div>

      <!-- Results list -->
      <div>
        <h2 class="text-lg font-semibold text-slate-700 mb-3">Test Cases</h2>
        ${!results.length ? `
          <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400">
            No active test cases were found in this suite when the run was created.
          </div>` : `
          <div class="space-y-3">
            ${results.map(r => resultRow(r, runId)).join("")}
          </div>`}
      </div>
    </div>`;
}

function resultRow(r, runId) {
  const tc = r.test_case;
  const styles = {
    pending: { border: "border-slate-200", badge: "bg-slate-100 text-slate-500", label: "Pending" },
    pass:    { border: "border-emerald-200 bg-emerald-50/40", badge: "bg-emerald-100 text-emerald-700", label: "Pass" },
    fail:    { border: "border-red-200 bg-red-50/40",     badge: "bg-red-100 text-red-700",     label: "Fail" },
    skip:    { border: "border-amber-200 bg-amber-50/40",  badge: "bg-amber-100 text-amber-700",  label: "Skip" },
  };
  const s = styles[r.status] || styles.pending;

  return `
    <div class="bg-white rounded-2xl border ${s.border} shadow-sm transition-all">
      <div class="p-4 flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-0.5">
            <span class="font-semibold text-slate-800">${escHtml(tc.title)}</span>
            ${priorityBadge(tc.priority)}
          </div>
          ${tc.description ? `<p class="text-xs text-slate-500 truncate">${escHtml(tc.description)}</p>` : ""}
          ${r.notes ? `<p class="text-xs text-slate-600 mt-1.5 bg-slate-50 rounded-lg px-2 py-1 italic">"${escHtml(r.notes)}"</p>` : ""}
          ${r.executed_at ? `<p class="text-xs text-slate-400 mt-1">Executed ${formatDate(r.executed_at)}</p>` : ""}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.badge}">${s.label}</span>
          <button
            onclick="showModal('result', {runId: ${runId}, tcId: ${tc.id}, tcTitle: ${escHtml(JSON.stringify(tc.title))}, currentStatus: '${r.status}', currentNotes: ${escHtml(JSON.stringify(r.notes || ''))}})"
            class="px-3 py-1 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 rounded-lg text-xs font-semibold transition-all">
            ${r.status === "pending" ? "Record" : "Update"}
          </button>
        </div>
      </div>
    </div>`;
}

// ─── Badges ──────────────────────────────────────────────────────────────────
function statusBadge(s) {
  const m = {
    draft:      "bg-amber-100 text-amber-700",
    active:     "bg-emerald-100 text-emerald-700",
    deprecated: "bg-slate-100 text-slate-500",
  };
  return `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${m[s] || m.draft}">${s}</span>`;
}

function priorityBadge(p) {
  const m = {
    low:      "bg-slate-100 text-slate-500",
    medium:   "bg-blue-100 text-blue-700",
    high:     "bg-orange-100 text-orange-700",
    critical: "bg-red-100 text-red-700",
  };
  return `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${m[p] || m.medium}">${p}</span>`;
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function escHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
window.addEventListener("hashchange", router);
document.addEventListener("DOMContentLoaded", () => {
  loadSidebar();
  router();
});
