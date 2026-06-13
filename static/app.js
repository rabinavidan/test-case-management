// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  projects: [],
  currentProject: null,
  currentSuite: null,
  currentRun: null,
  user: null,
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("tf_token"); }
function setToken(t) { localStorage.setItem("tf_token", t); }
function clearToken() { localStorage.removeItem("tf_token"); localStorage.removeItem("tf_user"); }
function getStoredUser() { try { return JSON.parse(localStorage.getItem("tf_user")); } catch { return null; } }
function setStoredUser(u) { localStorage.setItem("tf_user", JSON.stringify(u)); }

function logout() {
  clearToken();
  state.user = null;
  // Restore Sign In button and reload projects list (public)
  document.getElementById("user-badge").innerHTML = `
    <button onclick="showAuthModal('login')" data-testid="signin-btn"
      class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
      Sign in
    </button>`;
  loadSidebar();
  router();
}

// ─── API helpers ─────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  const token = getToken();
  if (token) opts.headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) { clearToken(); state.user = null; showAuthModal("login"); return null; }
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
    ${field("Name *", `<input id="f-name" data-testid="f-name" class="${inputCls}" placeholder="My Project" autofocus />`)}
    ${field("Description", `<textarea id="f-desc" data-testid="f-desc" class="${textareaCls}" rows="3" placeholder="Optional description"></textarea>`)}
    <div class="flex justify-end gap-2 mt-6">
      <button data-testid="modal-cancel-btn" onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button data-testid="modal-submit-btn" onclick="submitProject()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Create Project</button>
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
    ${field("Name *", `<input id="f-name" data-testid="f-name" class="${inputCls}" placeholder="Login Tests" autofocus />`)}
    ${field("Description", `<textarea id="f-desc" data-testid="f-desc" class="${textareaCls}" rows="3" placeholder="Optional description"></textarea>`)}
    <div class="flex justify-end gap-2 mt-6">
      <button data-testid="modal-cancel-btn" onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button data-testid="modal-submit-btn" onclick="submitSuite(${projectId})" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Create Suite</button>
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
    ${field("Title *", `<input id="f-title" data-testid="f-title" class="${inputCls}" placeholder="Verify user can log in" autofocus />`)}
    ${field("Description", `<textarea id="f-desc" data-testid="f-desc" class="${textareaCls}" rows="2" placeholder="Brief description"></textarea>`)}
    ${field("Steps", `<textarea id="f-steps" data-testid="f-steps" class="${textareaCls}" rows="4" placeholder="1. Navigate to login page&#10;2. Enter credentials&#10;3. Click Login"></textarea>`)}
    ${field("Expected Result", `<textarea id="f-expected" data-testid="f-expected" class="${textareaCls}" rows="2" placeholder="User is redirected to dashboard"></textarea>`)}
    <div class="grid grid-cols-2 gap-4">
      ${field("Status", `<select id="f-status" data-testid="f-status" class="${inputCls}">
        <option value="draft">Draft</option>
        <option value="active" selected>Active</option>
        <option value="deprecated">Deprecated</option>
      </select>`)}
      ${field("Priority", `<select id="f-priority" data-testid="f-priority" class="${inputCls}">
        <option value="low">Low</option>
        <option value="medium" selected>Medium</option>
        <option value="high">High</option>
        <option value="critical">Critical</option>
      </select>`)}
    </div>
    <div class="flex justify-end gap-2 mt-2">
      <button data-testid="modal-cancel-btn" onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button data-testid="modal-submit-btn" onclick="submitTestCase(${suiteId})" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Create Test Case</button>
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
        <button data-testid="sidebar-project-${p.id}" onclick="navigate('project/${p.id}')"
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
  if (isAdmin()) { navBtn.classList.remove("hidden"); navBtn.onclick = () => showModal("project"); }
  else { navBtn.classList.add("hidden"); }

  const el = document.getElementById("view-projects");
  el.classList.remove("hidden");
  el.innerHTML = `<div class="flex items-center justify-center py-16"><div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>`;

  if (!getToken()) {
    el.insertAdjacentHTML("afterbegin", `
      <div class="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z"/>
        </svg>
        <p class="text-sm text-blue-700 flex-1">You're browsing as a guest. <button onclick="showAuthModal('login')" class="font-semibold underline hover:text-blue-900">Sign in</button> or <button onclick="showAuthModal('register')" class="font-semibold underline hover:text-blue-900">create an account</button> to add and manage projects.</p>
      </div>`);
  }

  await loadSidebar();

  const archDiagram = `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6 overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <div>
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Live Architecture</p>
          <h2 class="text-base font-bold text-slate-800">TestFlow — System Overview</h2>
        </div>
        <span class="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 arch-live-dot"></span>Live
        </span>
      </div>
      <!-- Architecture rows -->
      <div class="space-y-3">
        <!-- Row 1: Client -->
        <div class="arch-row flex items-stretch gap-2 opacity-0" style="animation:archRowIn .35s ease forwards;animation-delay:0ms">
          <div class="w-24 flex-shrink-0 flex items-center">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Browser</span>
          </div>
          <div class="flex-1 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
            <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">🖥️</div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-blue-800">Vanilla JS SPA</p>
              <p class="text-[10px] text-blue-500 truncate">static/index.html · static/app.js · Hash routing · Tailwind CSS</p>
            </div>
            <div class="flex gap-1.5 flex-wrap justify-end">
              ${['index.html','app.js','TailwindCSS'].map(t=>`<span class="arch-tag bg-blue-100 text-blue-700">${t}</span>`).join('')}
            </div>
          </div>
        </div>
        <!-- Arrow -->
        <div class="arch-row flex items-center gap-2 opacity-0" style="animation:archRowIn .25s ease forwards;animation-delay:80ms">
          <div class="w-24"></div>
          <div class="flex-1 flex items-center gap-2 pl-4">
            <div class="h-px flex-1 bg-slate-200"></div>
            <span class="text-[10px] text-slate-400 font-medium arch-http-badge">HTTP / REST API</span>
            <div class="h-px flex-1 bg-slate-200"></div>
          </div>
        </div>
        <!-- Row 2: API -->
        <div class="arch-row flex items-stretch gap-2 opacity-0" style="animation:archRowIn .35s ease forwards;animation-delay:160ms">
          <div class="w-24 flex-shrink-0 flex items-center">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">API Layer</span>
          </div>
          <div class="flex-1 bg-violet-50 border border-violet-200 rounded-xl p-3 flex items-center gap-3">
            <div class="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">⚡</div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-violet-800">FastAPI + SQLAlchemy</p>
              <p class="text-[10px] text-violet-500 truncate">api/main.py · models · schemas · CORS middleware · Pydantic v2</p>
            </div>
            <div class="flex gap-1.5 flex-wrap justify-end">
              ${['FastAPI','SQLAlchemy','Pydantic'].map(t=>`<span class="arch-tag bg-violet-100 text-violet-700">${t}</span>`).join('')}
            </div>
          </div>
        </div>
        <!-- Arrow -->
        <div class="arch-row flex items-center gap-2 opacity-0" style="animation:archRowIn .25s ease forwards;animation-delay:240ms">
          <div class="w-24"></div>
          <div class="flex-1 flex items-center gap-2 pl-4">
            <div class="h-px flex-1 bg-slate-200"></div>
            <span class="text-[10px] text-slate-400 font-medium arch-http-badge">ORM / SQL</span>
            <div class="h-px flex-1 bg-slate-200"></div>
          </div>
        </div>
        <!-- Row 3: Database -->
        <div class="arch-row flex items-stretch gap-2 opacity-0" style="animation:archRowIn .35s ease forwards;animation-delay:320ms">
          <div class="w-24 flex-shrink-0 flex items-center">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Storage</span>
          </div>
          <div class="flex-1 flex gap-2">
            <div class="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
              <div class="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">🗄️</div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-emerald-800">PostgreSQL (Neon)</p>
                <p class="text-[10px] text-emerald-600">Production · Vercel env var</p>
              </div>
            </div>
            <div class="flex-1 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
              <div class="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">📦</div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-amber-800">SQLite</p>
                <p class="text-[10px] text-amber-600">Local dev · /tmp on Vercel</p>
              </div>
            </div>
          </div>
        </div>
        <!-- Row 4: CI/CD + Tests side by side -->
        <div class="arch-row flex items-stretch gap-2 opacity-0 mt-1" style="animation:archRowIn .35s ease forwards;animation-delay:440ms">
          <div class="w-24 flex-shrink-0 flex items-center">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CI / Deploy</span>
          </div>
          <div class="flex-1 flex gap-2">
            <div class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
              <div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">🔄</div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-slate-700">GitHub Actions</p>
                <p class="text-[10px] text-slate-500">pytest API · Playwright E2E · Job summary</p>
              </div>
            </div>
            <div class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
              <div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">▲</div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-slate-700">Vercel</p>
                <p class="text-[10px] text-slate-500">Serverless · Preview per PR · Production</p>
              </div>
            </div>
            <div class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
              <div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">🧪</div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-slate-700">Tests</p>
                <p class="text-[10px] text-slate-500">pytest + Playwright POM · 20 API · 16 E2E</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <style>
      @keyframes archRowIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
      .arch-tag { font-size:9px; font-weight:600; padding:1px 6px; border-radius:999px; }
      .arch-live-dot { animation: archLivePulse 2s ease-in-out infinite; }
      @keyframes archLivePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.3)} }
      .arch-http-badge { animation: archBadgePulse 3s ease-in-out infinite; }
      @keyframes archBadgePulse { 0%,100%{opacity:.6} 50%{opacity:1} }
    </style>
  `;

  const demoBanner = `
    <div class="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 mb-6 overflow-hidden relative">
      <div class="relative z-10">
        <p class="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-1">How TestFlow works</p>
        <h2 class="text-white text-lg font-bold mb-4">End-to-end test management pipeline</h2>
        <!-- Animated pipeline -->
        <div class="flex items-center gap-2 flex-wrap" id="tf-demo">
          ${[
            {icon:'📁', label:'Project',   color:'bg-blue-500',   delay:'0'},
            {icon:'🗂️', label:'Suite',     color:'bg-indigo-500', delay:'150'},
            {icon:'✅', label:'Test Case', color:'bg-violet-500', delay:'300'},
            {icon:'▶️', label:'Run',       color:'bg-purple-500', delay:'450'},
            {icon:'📊', label:'Results',   color:'bg-emerald-500',delay:'600'},
          ].map((n,i,arr) => `
            <div class="flex items-center gap-2">
              <div class="demo-node flex flex-col items-center gap-1 opacity-0" style="animation:demoNodeIn .4s ease forwards;animation-delay:${n.delay}ms">
                <div class="${n.color} w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-lg demo-pulse" style="animation-delay:${n.delay}ms">
                  ${n.icon}
                </div>
                <span class="text-white text-xs font-medium">${n.label}</span>
              </div>
              ${i < arr.length-1 ? `<div class="demo-arrow text-blue-300 text-lg font-bold opacity-0 mb-4" style="animation:demoNodeIn .3s ease forwards;animation-delay:${parseInt(n.delay)+100}ms">→</div>` : ''}
            </div>
          `).join('')}
        </div>
        <!-- Animated status bar -->
        <div class="mt-4 bg-blue-900/40 rounded-lg p-3 flex items-center gap-3">
          <div class="flex gap-1">
            <span class="w-2 h-2 rounded-full bg-emerald-400 demo-blink" style="animation-delay:0ms"></span>
            <span class="w-2 h-2 rounded-full bg-emerald-400 demo-blink" style="animation-delay:200ms"></span>
            <span class="w-2 h-2 rounded-full bg-yellow-400 demo-blink" style="animation-delay:400ms"></span>
            <span class="w-2 h-2 rounded-full bg-emerald-400 demo-blink" style="animation-delay:600ms"></span>
            <span class="w-2 h-2 rounded-full bg-red-400 demo-blink" style="animation-delay:800ms"></span>
          </div>
          <div class="flex-1 bg-blue-900/50 rounded-full h-1.5 overflow-hidden">
            <div class="h-full bg-emerald-400 rounded-full demo-bar"></div>
          </div>
          <span class="text-emerald-300 text-xs font-bold demo-counter">80% pass rate</span>
        </div>
        <!-- Demo buttons -->
        <div class="mt-4 flex items-center gap-3 flex-wrap">
          <button id="demo-seed-btn" onclick="seedAlertsDemo()"
            class="bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors flex items-center gap-2 border border-white/20">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span id="demo-seed-label">Run Alerts Microservice Demo</span>
          </button>
          <button id="demo-tf-btn" onclick="seedTestFlowDemo()"
            class="bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors flex items-center gap-2 border border-white/20">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
            <span id="demo-tf-label">Run TestFlow Demo</span>
          </button>
          <button id="demo-pw-btn" onclick="seedPlaywrightDemo()"
            class="bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors flex items-center gap-2 border border-white/20">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
            </svg>
            <span id="demo-pw-label">Run Playwright Architecture Demo</span>
          </button>
        </div>
      </div>
      <!-- Background decoration -->
      <div class="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4"></div>
      <div class="absolute bottom-0 right-12 w-24 h-24 bg-white/5 rounded-full translate-y-1/2"></div>
    </div>
    <style>
      @keyframes demoNodeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      .demo-pulse { animation: demoPulse 2.4s ease-in-out infinite; }
      @keyframes demoPulse { 0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,255,255,0.1)} 50%{transform:scale(1.08);box-shadow:0 0 0 6px rgba(255,255,255,0)} }
      .demo-blink { animation: demoBlink 1.8s ease-in-out infinite; }
      @keyframes demoBlink { 0%,100%{opacity:1} 50%{opacity:.3} }
      .demo-bar { animation: demoBar 3s ease-in-out infinite alternate; }
      @keyframes demoBar { from{width:60%} to{width:92%} }
      .demo-counter { animation: demoCounter 3s ease-in-out infinite alternate; }
    </style>
  `;

  if (!state.projects.length) {
    el.innerHTML = `
      <div class="fade-in">
        ${archDiagram}
        ${demoBanner}
        <div class="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div class="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <h2 class="text-xl font-bold text-slate-700 mb-2">No projects yet</h2>
          <p class="text-slate-500 mb-6 max-w-sm text-sm">Create your first project to start organizing test suites and cases.</p>
          <button onclick="showModal('project')" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors shadow-sm">
            Create First Project
          </button>
        </div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="fade-in">
      ${archDiagram}
      ${demoBanner}
      <!-- Projects table header -->
      <div class="flex items-center justify-between mb-3">
        <div>
          <h1 class="text-xl font-bold text-slate-800">Projects</h1>
          <p class="text-slate-500 text-xs mt-0.5" id="proj-count-label">${state.projects.length} project${state.projects.length !== 1 ? "s" : ""}</p>
        </div>
        <div class="flex items-center gap-2">
          <div id="bulk-toolbar" class="hidden items-center gap-2">
            <span id="bulk-count" class="text-sm text-slate-600 font-medium"></span>
            <button onclick="bulkDeleteProjects()" class="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              Remove Selected
            </button>
            <button onclick="clearProjectSelection()" class="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl transition-colors">Cancel</button>
          </div>
          <button onclick="showModal('project')" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            New Project
          </button>
        </div>
      </div>
      <!-- Filter / search bar -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm mb-3 px-3 py-2 flex items-center gap-3">
        <svg class="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"/></svg>
        <input id="proj-search" oninput="filterProjectTable()" type="text" placeholder="Filter by name or description…"
          class="flex-1 text-sm outline-none bg-transparent text-slate-700 placeholder-slate-400" />
        <select id="proj-sort" onchange="filterProjectTable()"
          class="text-xs text-slate-500 bg-transparent outline-none border-l border-slate-200 pl-3 cursor-pointer">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
        </select>
      </div>
      <!-- Table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 bg-slate-50">
              <th class="w-10 px-4 py-3">
                <input type="checkbox" id="proj-select-all" onchange="toggleSelectAllProjects(this.checked)"
                  class="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer accent-blue-600" />
              </th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Description</th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell w-32">Created</th>
              <th class="w-16 px-3 py-3"></th>
            </tr>
          </thead>
          <tbody id="proj-table-body">
            ${state.projects.map(p => projectRow(p)).join("")}
          </tbody>
        </table>
        <div id="proj-empty-filter" class="hidden py-10 text-center text-slate-400 text-sm">No projects match your filter.</div>
      </div>
    </div>`;
}

function projectRow(p) {
  return `
    <tr id="pcard-${p.id}" data-testid="project-row-${p.id}" onclick="handleProjectCardClick(event, ${p.id})"
      class="border-b border-slate-100 last:border-0 hover:bg-blue-50/40 transition-colors cursor-pointer group select-none">
      <td class="px-4 py-3" onclick="event.stopPropagation()">
        <input type="checkbox" id="pcheck-${p.id}" onchange="toggleProjectSelectByCheckbox(${p.id}, this.checked)"
          class="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer accent-blue-600" />
      </td>
      <td class="px-3 py-3">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
            </svg>
          </div>
          <span data-testid="project-name-${p.id}" class="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors truncate max-w-[180px]">${escHtml(p.name)}</span>
        </div>
      </td>
      <td class="px-3 py-3 hidden md:table-cell text-slate-500 text-xs max-w-[260px]">
        <span class="line-clamp-1">${escHtml(p.description || "—")}</span>
      </td>
      <td class="px-3 py-3 hidden sm:table-cell text-slate-400 text-xs whitespace-nowrap">${formatDate(p.created_at)}</td>
      <td class="px-3 py-3 text-right" onclick="event.stopPropagation()">
        ${isAdmin() ? `<button data-testid="delete-project-${p.id}" onclick="deleteProject(${p.id})"
          class="opacity-0 group-hover:opacity-100 w-7 h-7 inline-flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>` : ""}
      </td>
    </tr>`;
}

function filterProjectTable() {
  const q = (document.getElementById("proj-search")?.value || "").toLowerCase();
  const sort = document.getElementById("proj-sort")?.value || "newest";
  let rows = [...state.projects];

  if (q) rows = rows.filter(p =>
    p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)
  );

  if (sort === "oldest") rows.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  else if (sort === "az") rows.sort((a,b) => a.name.localeCompare(b.name));
  else if (sort === "za") rows.sort((a,b) => b.name.localeCompare(a.name));
  else rows.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

  const tbody = document.getElementById("proj-table-body");
  const empty = document.getElementById("proj-empty-filter");
  const countLabel = document.getElementById("proj-count-label");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    tbody.innerHTML = rows.map(p => projectRow(p)).join("");
    // Re-apply selection state
    _selectedProjects.forEach(id => {
      const cb = document.getElementById(`pcheck-${id}`);
      const row = document.getElementById(`pcard-${id}`);
      if (cb) cb.checked = true;
      if (row) row.classList.add("bg-blue-50", "ring-1", "ring-inset", "ring-blue-200");
    });
  }
  countLabel.textContent = `${rows.length} of ${state.projects.length} project${state.projects.length !== 1 ? "s" : ""}`;
}

function toggleSelectAllProjects(checked) {
  state.projects.forEach(p => {
    const cb = document.getElementById(`pcheck-${p.id}`);
    if (!cb) return;
    const visible = !!document.getElementById(`pcard-${p.id}`);
    if (!visible) return;
    toggleProjectSelectByCheckbox(p.id, checked);
  });
}

const _selectedProjects = new Set();

function handleProjectCardClick(event, id) {
  if (_selectedProjects.size > 0) {
    const cb = document.getElementById(`pcheck-${id}`);
    toggleProjectSelectByCheckbox(id, !_selectedProjects.has(id));
  } else {
    navigate(`project/${id}`);
  }
}

function clearProjectSelection() {
  [..._selectedProjects].forEach(id => {
    const row = document.getElementById(`pcard-${id}`);
    const cb = document.getElementById(`pcheck-${id}`);
    if (row) row.classList.remove("bg-blue-50", "ring-1", "ring-inset", "ring-blue-200");
    if (cb) cb.checked = false;
  });
  _selectedProjects.clear();
  const all = document.getElementById("proj-select-all");
  if (all) all.checked = false;
  const toolbar = document.getElementById("bulk-toolbar");
  if (toolbar) { toolbar.classList.add("hidden"); toolbar.classList.remove("flex"); }
}

function toggleProjectSelectByCheckbox(id, checked) {
  const row = document.getElementById(`pcard-${id}`);
  const cb = document.getElementById(`pcheck-${id}`);
  if (checked) {
    _selectedProjects.add(id);
    if (row) row.classList.add("bg-blue-50", "ring-1", "ring-inset", "ring-blue-200");
    if (cb) cb.checked = true;
  } else {
    _selectedProjects.delete(id);
    if (row) row.classList.remove("bg-blue-50", "ring-1", "ring-inset", "ring-blue-200");
    if (cb) cb.checked = false;
  }
  const toolbar = document.getElementById("bulk-toolbar");
  const countEl = document.getElementById("bulk-count");
  if (_selectedProjects.size > 0) {
    toolbar.classList.remove("hidden"); toolbar.classList.add("flex");
    countEl.textContent = `${_selectedProjects.size} selected`;
  } else {
    toolbar.classList.add("hidden"); toolbar.classList.remove("flex");
  }
}
async function bulkDeleteProjects() {
  const ids = [..._selectedProjects];
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} project${ids.length > 1 ? "s" : ""} and all their suites, test cases, and runs?`)) return;
  try {
    await Promise.all(ids.map(id => DEL(`/api/projects/${id}`)));
    toast(`${ids.length} project${ids.length > 1 ? "s" : ""} deleted`);
    _selectedProjects.clear();
    state.currentProject = null;
    await loadSidebar();
    navigate("projects");
  } catch (e) { toast(e.message, "error"); }
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
  if (isAdmin()) { navBtn.classList.remove("hidden"); navBtn.onclick = () => showModal("suite", { projectId }); }
  else { navBtn.classList.add("hidden"); }

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

      <!-- Architecture diagram (Alerts Microservice projects only) -->
      ${project.name.startsWith("Alerts Microservice") ? alertsArchDiagram() : project.name.startsWith("TestFlow") ? testflowArchDiagram() : ""}

      <!-- Last run progress bar (non-demo projects only) -->
      ${total && !project.name.startsWith("Alerts Microservice") && !project.name.startsWith("TestFlow") ? `
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

      <!-- Test Report (demo projects with runs) -->
      ${(project.name.startsWith("Alerts Microservice") || project.name.startsWith("TestFlow")) && stats.total_runs > 0 ? `
      <div id="test-report-section">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold text-slate-700">Test Report</h2>
          <span class="text-xs text-slate-400">Last run per suite</span>
        </div>
        <div id="test-report-body" class="space-y-4">
          <div class="flex items-center justify-center py-10 bg-white rounded-2xl border border-slate-200">
            <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
            <span class="text-sm text-slate-500">Loading test report…</span>
          </div>
        </div>
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

  // Load test report async (demo projects only)
  if ((project.name.startsWith("Alerts Microservice") || project.name.startsWith("TestFlow")) && stats.total_runs > 0) {
    loadTestReport(suites);
  }
}

async function loadTestReport(suites) {
  const container = document.getElementById("test-report-body");
  if (!container) return;

  const STATUS_BADGE = {
    pass:    'bg-emerald-100 text-emerald-700',
    fail:    'bg-red-100 text-red-700',
    skip:    'bg-amber-100 text-amber-700',
    pending: 'bg-slate-100 text-slate-500',
  };
  const STATUS_DOT = {
    pass: 'bg-emerald-500', fail: 'bg-red-500', skip: 'bg-amber-400', pending: 'bg-slate-300',
  };

  try {
    // Fetch the latest run for each suite in parallel
    const suiteRuns = await Promise.all(
      suites.map(s => GET(`/api/suites/${s.id}/runs`).then(runs => ({ suite: s, run: runs[0] || null })))
    );

    // Summary counts across all suites
    let totPass = 0, totFail = 0, totSkip = 0, totPending = 0;
    suiteRuns.forEach(({ run }) => {
      if (!run) return;
      run.results.forEach(r => {
        if (r.status === 'pass') totPass++;
        else if (r.status === 'fail') totFail++;
        else if (r.status === 'skip') totSkip++;
        else totPending++;
      });
    });
    const totAll = totPass + totFail + totSkip + totPending;
    const overallPct = totAll ? Math.round(totPass / totAll * 100) : 0;

    const summaryBar = `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-2">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="font-semibold text-slate-800 text-sm">Overall Results</h3>
            <p class="text-xs text-slate-400 mt-0.5">${totAll} test cases across ${suites.length} suites</p>
          </div>
          <div class="flex items-center gap-4 text-xs font-semibold">
            <span class="flex items-center gap-1.5 text-emerald-700"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>${totPass} pass</span>
            <span class="flex items-center gap-1.5 text-red-700"><span class="w-2 h-2 rounded-full bg-red-500"></span>${totFail} fail</span>
            <span class="flex items-center gap-1.5 text-amber-700"><span class="w-2 h-2 rounded-full bg-amber-400"></span>${totSkip} skip</span>
            <span class="text-lg font-bold ${overallPct >= 80 ? 'text-emerald-600' : overallPct >= 50 ? 'text-amber-600' : 'text-red-600'}">${overallPct}%</span>
          </div>
        </div>
        <div class="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
          ${totAll ? `
            <div class="bg-emerald-500 h-full" style="width:${Math.round(totPass/totAll*100)}%"></div>
            <div class="bg-red-500 h-full" style="width:${Math.round(totFail/totAll*100)}%"></div>
            <div class="bg-amber-400 h-full" style="width:${Math.round(totSkip/totAll*100)}%"></div>` : ''}
        </div>
      </div>`;

    const suiteSections = suiteRuns.map(({ suite, run }) => {
      if (!run || !run.results.length) return `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span class="font-semibold text-slate-700 text-sm">${escHtml(suite.name)}</span>
            <span class="text-xs text-slate-400">No runs yet</span>
          </div>
        </div>`;

      const pass = run.results.filter(r => r.status === 'pass').length;
      const fail = run.results.filter(r => r.status === 'fail').length;
      const skip = run.results.filter(r => r.status === 'skip').length;
      const total = run.results.length;
      const pct = total ? Math.round(pass / total * 100) : 0;

      const rows = run.results.map((r, i) => `
        <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/30 transition-colors">
          <td class="px-4 py-2.5 text-sm text-slate-700 font-medium">${escHtml(r.test_case.title)}</td>
          <td class="px-3 py-2.5">
            <span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] || STATUS_BADGE.pending}">
              <span class="w-1.5 h-1.5 rounded-full ${STATUS_DOT[r.status] || STATUS_DOT.pending}"></span>
              ${r.status}
            </span>
          </td>
          <td class="px-3 py-2.5 text-xs text-slate-400 hidden sm:table-cell">
            <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${r.test_case.priority === 'high' ? 'bg-red-50 text-red-600' : r.test_case.priority === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}">${r.test_case.priority}</span>
          </td>
          <td class="px-3 py-2.5 text-xs text-slate-400 hidden md:table-cell whitespace-nowrap">${r.executed_at ? new Date(r.executed_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</td>
        </tr>`).join('');

      return `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-3">
              <span class="font-semibold text-slate-700 text-sm">${escHtml(suite.name)}</span>
              <span class="text-xs text-slate-400">${escHtml(run.name)}</span>
            </div>
            <div class="flex items-center gap-3 text-xs font-medium">
              <span class="text-emerald-700">${pass}✓</span>
              <span class="text-red-700">${fail}✗</span>
              <span class="text-amber-700">${skip}↷</span>
              <span class="font-bold ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}">${pct}%</span>
            </div>
          </div>
          <div class="h-1 bg-slate-100 flex">
            <div class="bg-emerald-500 h-full" style="width:${Math.round(pass/total*100)}%"></div>
            <div class="bg-red-500 h-full" style="width:${Math.round(fail/total*100)}%"></div>
            <div class="bg-amber-400 h-full" style="width:${Math.round(skip/total*100)}%"></div>
          </div>
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100">
                <th class="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Test Case</th>
                <th class="text-left px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider w-20">Status</th>
                <th class="text-left px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider w-20 hidden sm:table-cell">Priority</th>
                <th class="text-left px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider w-20 hidden md:table-cell">Executed</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');

    container.innerHTML = summaryBar + suiteSections;
  } catch (e) {
    if (container) container.innerHTML = `<div class="text-red-500 text-sm p-4">Failed to load report: ${escHtml(e.message)}</div>`;
  }
}

function suiteCard(s, projectId) {
  return `
    <div data-testid="suite-card-${s.id}" onclick="navigate('suite/${s.id}')"
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
          ${isAdmin() ? `<button data-testid="delete-suite-${s.id}" onclick="event.stopPropagation(); deleteSuite(${s.id}, ${projectId})"
            class="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>` : ""}
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
    <div data-testid="run-card-${r.id}" onclick="navigate('run/${r.id}')"
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
  if (isAdmin()) { navBtn.classList.remove("hidden"); navBtn.onclick = () => showModal("testcase", { suiteId }); }
  else { navBtn.classList.add("hidden"); }

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
    <div data-testid="testcase-card-${tc.id}" class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
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
            ${isAdmin() ? `
            <button data-testid="edit-testcase-${tc.id}" onclick='showModal("editTestCase", JSON.parse(this.dataset.tc))'
              data-tc="${tcJson}"
              class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button data-testid="delete-testcase-${tc.id}" onclick="deleteTestCase(${tc.id}, ${tc.suite_id})"
              class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Delete">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>` : ""}
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
  if (isAdmin()) { navBtn.classList.remove("hidden"); navBtn.onclick = () => showModal("testcase", { suiteId }); }
  else { navBtn.classList.add("hidden"); }

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

// ─── Alerts Microservice architecture diagram ────────────────────────────────
function alertsArchDiagram() {
  // Coloured component box
  const box = (bg, border, tc, label, sub, d = 0) =>
    `<div class="aad-box opacity-0 rounded-lg px-3 py-2 border ${border} ${bg} flex-shrink-0"
        style="animation:aadIn .35s ease forwards;animation-delay:${d}ms">
      <p class="text-xs font-bold ${tc} leading-tight whitespace-nowrap">${label}</p>
      ${sub ? `<p class="text-[10px] ${tc} opacity-70 leading-tight mt-0.5 whitespace-nowrap">${sub}</p>` : ''}
    </div>`;

  // Animated flowing arrow (dashes travel in data-flow direction)
  const FLOW_COLORS = {
    blue:    ['#93c5fd','#3b82f6'],
    amber:   ['#fcd34d','#f59e0b'],
    red:     ['#fca5a5','#ef4444'],
    emerald: ['#6ee7b7','#10b981'],
    slate:   ['#cbd5e1','#94a3b8'],
    violet:  ['#c4b5fd','#8b5cf6'],
  };
  const arrow = (lbl, d, dir = 'right', clr = 'blue', len = 36) => {
    const [dash, head] = FLOW_COLORS[clr] || FLOW_COLORS.blue;
    const anim = {right:'aadFlowR',left:'aadFlowL',down:'aadFlowD',up:'aadFlowU'}[dir]||'aadFlowR';
    const isV = dir==='down'||dir==='up';
    const line = isV
      ? `<div style="width:2px;height:${len}px;background:repeating-linear-gradient(to bottom,${dash} 0,${dash} 5px,transparent 5px,transparent 10px);background-size:100% 14px;animation:${anim} .4s linear infinite"></div>`
      : `<div style="height:2px;width:${len}px;background:repeating-linear-gradient(to right,${dash} 0,${dash} 5px,transparent 5px,transparent 10px);background-size:14px 100%;animation:${anim} .4s linear infinite"></div>`;
    const tip = isV
      ? (dir==='down'
          ? `<svg width="8" height="5" viewBox="0 0 8 5" fill="${head}"><path d="M4 5L0 0h8z"/></svg>`
          : `<svg width="8" height="5" viewBox="0 0 8 5" fill="${head}"><path d="M4 0L8 5H0z"/></svg>`)
      : (dir==='right'
          ? `<svg width="5" height="8" viewBox="0 0 5 8" fill="${head}"><path d="M5 4L0 0v8z"/></svg>`
          : `<svg width="5" height="8" viewBox="0 0 5 8" fill="${head}"><path d="M0 4L5 0v8z"/></svg>`);
    const lbl$ = lbl ? `<span class="text-[9px] font-medium whitespace-nowrap" style="color:${head}">${lbl}</span>` : '';
    return isV
      ? `<div class="flex flex-col items-center gap-0 opacity-0 flex-shrink-0" style="animation:aadIn .25s ease forwards;animation-delay:${d}ms">
          ${lbl$}${line}${tip}
        </div>`
      : `<div class="flex flex-col items-center gap-0.5 opacity-0 flex-shrink-0" style="animation:aadIn .25s ease forwards;animation-delay:${d}ms">
          ${lbl$}<div class="flex items-center">${line}${tip}</div>
        </div>`;
  };

  const lane = (label, clr) =>
    `<p class="text-[9px] font-bold uppercase tracking-widest ${clr} mb-2">${label}</p>`;

  return `
  <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 overflow-x-auto min-w-0">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-slate-800 text-sm">System Architecture</h3>
      <span class="text-[10px] bg-blue-50 text-blue-700 font-semibold px-2.5 py-1 rounded-full border border-blue-200 flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-blue-500 aad-live"></span>GCP · Angular MFE
      </span>
    </div>

    <!-- ① Client Layer ─────────────────────────────── -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('① Client Layer — Angular Micro Frontends', 'text-blue-500')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-blue-600','border-blue-700','text-white','Shell Application','Host (Angular)',0)}
        ${arrow('','70','right','blue',28)}
        ${box('bg-amber-400','border-amber-500','text-slate-900','Alerts Management MFE','Create / Manage Configs',140)}
        <div class="flex-1 min-w-4"></div>
        ${box('bg-amber-400','border-amber-500','text-slate-900','Notification Display MFE','Realtime Updates',210)}
        ${arrow('Listen Updates','280','left','emerald',28)}
        ${box('bg-emerald-500','border-emerald-600','text-white','WebSocket Server','Firebase / Socket.io',350)}
      </div>
    </div>

    <!-- ② Cron / Scanner Flow ─────────────────────── -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('② Cron Job — Data Scanner (new alert detection)', 'text-violet-500')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-blue-500','border-blue-600','text-white','Cloud Scheduler','Cron',420)}
        ${arrow('Trigger Scan (Interval)','490','right','blue',40)}
        ${box('bg-blue-500','border-blue-600','text-white','Data Scanner Function','Cloud Functions',560)}
        ${arrow('Query New Data','630','right','slate',36)}
        ${box('bg-emerald-600','border-emerald-700','text-white','Google BigQuery','Analytics',700)}
        ${arrow('Check Match Criteria','770','right','slate',36)}
        ${box('bg-teal-700','border-teal-800','text-white','Elasticsearch','Log / Search',840)}
        ${arrow('Alert Found →','910','right','red',32)}
        ${box('bg-red-500','border-red-600','text-white','GCP Pub/Sub','Event Streaming',980)}
      </div>
    </div>

    <!-- ③ API / Alert Config Flow ─────────────────── -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('③ API Layer — Alert Config & Manual Trigger', 'text-amber-500')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-amber-400','border-amber-500','text-slate-900','Alerts Management MFE','Create Config',1050)}
        ${arrow('POST /alerts','1120','right','amber',36)}
        ${box('bg-blue-500','border-blue-600','text-white','Cloud Endpoints','API Gateway',1190)}
        ${arrow('','1260','right','blue',28)}
        ${box('bg-blue-600','border-blue-700','text-white','Alert Microservice','Cloud Run',1330)}
        ${arrow('Cache Config','1400','right','slate',32)}
        ${box('bg-red-500','border-red-600','text-white','Cloud Memorystore','Redis',1470)}
        ${arrow('Store Alert Def','1540','right','slate',32)}
        ${box('bg-white','border-slate-300','text-slate-700','Cloud SQL / Firestore','Structured Data',1610)}
        ${arrow('Manual Trigger →','1680','right','red',36)}
        ${box('bg-red-500','border-red-600','text-white','GCP Pub/Sub','Event Streaming',1750)}
      </div>
    </div>

    <!-- ④ Notification Delivery Flow ──────────────── -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('④ Notification Delivery — Async → Realtime Push', 'text-emerald-500')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-red-500','border-red-600','text-white','GCP Pub/Sub','Event Streaming',1820)}
        ${arrow('Async Notification','1890','right','red',40)}
        ${box('bg-slate-100','border-slate-300','text-slate-700','Notification Microservice','GKE',1960)}
        ${arrow('Index for Search','2030','right','slate',36)}
        ${box('bg-teal-700','border-teal-800','text-white','Elasticsearch','Log / Search',2100)}
        ${arrow('Check User Cache','2170','right','slate',36)}
        ${box('bg-red-500','border-red-600','text-white','Cloud Memorystore','Redis',2240)}
        ${arrow('Push to UI','2310','right','emerald',36)}
        ${box('bg-emerald-500','border-emerald-600','text-white','WebSocket Server','Firebase / Socket.io',2380)}
        ${arrow('Real-time Update','2450','right','emerald',40)}
        ${box('bg-amber-400','border-amber-500','text-slate-900','Notification Display MFE','Updates UI',2520)}
      </div>
    </div>

    <!-- Legend + live indicator ───────────────────── -->
    <div class="flex items-center gap-4 flex-wrap">
      ${[['#3b82f6','Platform / Config'],['#f59e0b','Alert Creation'],['#ef4444','Event / Pub-Sub'],['#10b981','Realtime Notify'],['#94a3b8','Data Storage']].map(([c,l])=>`
        <div class="flex items-center gap-1.5">
          <div style="height:2px;width:18px;background:repeating-linear-gradient(to right,${c} 0,${c} 4px,transparent 4px,transparent 8px);background-size:10px 100%;animation:aadFlowR .4s linear infinite"></div>
          <span class="text-[9px] text-slate-500">${l}</span>
        </div>`).join('')}
      <div class="ml-auto flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 aad-live"></span>
        <span class="text-[9px] text-slate-400 font-medium">Live data flow</span>
      </div>
    </div>
  </div>

  <style>
    @keyframes aadIn    { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
    @keyframes aadFlowR { from{background-position:0 0} to{background-position:14px 0} }
    @keyframes aadFlowL { from{background-position:0 0} to{background-position:-14px 0} }
    @keyframes aadFlowD { from{background-position:0 0} to{background-position:0 14px} }
    @keyframes aadFlowU { from{background-position:0 0} to{background-position:0 -14px} }
    .aad-box  { min-width:88px; }
    .aad-live { animation: aadLivePulse 1.6s ease-in-out infinite; }
    @keyframes aadLivePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(1.4)} }
  </style>`;
}

// ─── Demo seed ───────────────────────────────────────────────────────────────
async function seedAlertsDemo() {
  const btn = document.getElementById("demo-seed-btn");
  const label = document.getElementById("demo-seed-label");
  if (!btn) return;
  btn.disabled = true;
  label.textContent = "Creating demo project…";
  btn.classList.add("opacity-60");
  try {
    const res = await fetch("/api/demo/alerts-microservice", { method: "POST", headers: { "Authorization": `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error(await res.text());
    const project = await res.json();
    toast(`Demo project "${project.name}" created!`, "success");
    await loadSidebar();
    navigate(`project/${project.id}`);
  } catch (e) {
    toast("Failed to create demo: " + e.message, "error");
    btn.disabled = false;
    label.textContent = "Run Alerts Microservice Demo";
    btn.classList.remove("opacity-60");
  }
}

async function seedTestFlowDemo() {
  const btn = document.getElementById("demo-tf-btn");
  const label = document.getElementById("demo-tf-label");
  if (!btn) return;
  btn.disabled = true;
  label.textContent = "Creating demo project…";
  btn.classList.add("opacity-60");
  try {
    const res = await fetch("/api/demo/testflow", { method: "POST", headers: { "Authorization": `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error(await res.text());
    const project = await res.json();
    toast(`Demo project "${project.name}" created!`, "success");
    await loadSidebar();
    navigate(`project/${project.id}`);
  } catch (e) {
    toast("Failed to create demo: " + e.message, "error");
    btn.disabled = false;
    label.textContent = "Run TestFlow Demo";
    btn.classList.remove("opacity-60");
  }
}

async function seedPlaywrightDemo() {
  const btn = document.getElementById("demo-pw-btn");
  const label = document.getElementById("demo-pw-label");
  if (!btn) return;
  btn.disabled = true;
  label.textContent = "Creating demo project…";
  btn.classList.add("opacity-60");
  try {
    const res = await fetch("/api/demo/playwright", { method: "POST", headers: { "Authorization": `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error(await res.text());
    const project = await res.json();
    toast(`Demo project "${project.name}" created!`, "success");
    await loadSidebar();
    navigate(`project/${project.id}`);
  } catch (e) {
    toast("Failed to create demo: " + e.message, "error");
    btn.disabled = false;
    label.textContent = "Run Playwright Architecture Demo";
    btn.classList.remove("opacity-60");
  }
}

function testflowArchDiagram() {
  const FLOW = {
    blue:    ['#93c5fd','#3b82f6'],
    violet:  ['#c4b5fd','#8b5cf6'],
    emerald: ['#6ee7b7','#10b981'],
    amber:   ['#fcd34d','#f59e0b'],
    slate:   ['#cbd5e1','#94a3b8'],
    red:     ['#fca5a5','#ef4444'],
    orange:  ['#fdba74','#f97316'],
    pink:    ['#f9a8d4','#ec4899'],
  };
  const box = (bg, border, tc, label, sub, d = 0) =>
    `<div class="tf-box opacity-0 rounded-lg px-3 py-2 border ${border} ${bg} flex-shrink-0"
        style="animation:tfIn .35s ease forwards;animation-delay:${d}ms">
      <p class="text-xs font-bold ${tc} leading-tight whitespace-nowrap">${label}</p>
      ${sub ? `<p class="text-[10px] ${tc} opacity-70 leading-tight mt-0.5 whitespace-nowrap">${sub}</p>` : ''}
    </div>`;
  const tag = (lbl, bg, tc, d = 0) =>
    `<span class="opacity-0 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold border flex-shrink-0 ${bg} ${tc}"
        style="animation:tfIn .3s ease forwards;animation-delay:${d}ms">${lbl}</span>`;
  const arrow = (lbl, d, dir = 'right', clr = 'blue', len = 36) => {
    const [dash, head] = FLOW[clr] || FLOW.blue;
    const anim = {right:'tfFlowR',left:'tfFlowL',down:'tfFlowD'}[dir]||'tfFlowR';
    const isV = dir==='down';
    const line = isV
      ? `<div style="width:2px;height:${len}px;background:repeating-linear-gradient(to bottom,${dash} 0,${dash} 5px,transparent 5px,transparent 10px);background-size:100% 14px;animation:${anim} .4s linear infinite"></div>`
      : `<div style="height:2px;width:${len}px;background:repeating-linear-gradient(to right,${dash} 0,${dash} 5px,transparent 5px,transparent 10px);background-size:14px 100%;animation:${anim} .4s linear infinite"></div>`;
    const tip = isV
      ? `<svg width="8" height="5" viewBox="0 0 8 5" fill="${head}"><path d="M4 5L0 0h8z"/></svg>`
      : `<svg width="5" height="8" viewBox="0 0 5 8" fill="${head}"><path d="M5 4L0 0v8z"/></svg>`;
    const lbl$ = lbl ? `<span class="text-[9px] font-medium whitespace-nowrap" style="color:${head}">${lbl}</span>` : '';
    return isV
      ? `<div class="flex flex-col items-center gap-0 opacity-0 flex-shrink-0" style="animation:tfIn .25s ease forwards;animation-delay:${d}ms">${lbl$}${line}${tip}</div>`
      : `<div class="flex flex-col items-center gap-0.5 opacity-0 flex-shrink-0" style="animation:tfIn .25s ease forwards;animation-delay:${d}ms">${lbl$}<div class="flex items-center">${line}${tip}</div></div>`;
  };
  const lane = (lbl, clr) => `<p class="text-[9px] font-bold uppercase tracking-widest ${clr} mb-2">${lbl}</p>`;

  return `
  <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 overflow-x-auto min-w-0">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-slate-800 text-sm">Playwright Tests — Architecture</h3>
      <span class="text-[10px] bg-red-50 text-red-700 font-semibold px-2.5 py-1 rounded-full border border-red-200 flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-red-500 aad-live"></span>UI E2E · API · POM
      </span>
    </div>

    <!-- ① Spec Layer -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('① Spec Layer — *.spec.ts  ·  *-be.spec.ts  (pure orchestration)', 'text-blue-500')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-blue-600','border-blue-700','text-white','test.describe()','Feature scope',0)}
        ${arrow('contains','70','right','blue',28)}
        ${box('bg-blue-500','border-blue-600','text-white','test()','CI-XXXX: title',140)}
        ${arrow('uses','210','right','blue',28)}
        ${box('bg-white','border-blue-300','text-blue-700','test.step()','UI specs only',280)}
        ${arrow('or','350','right','slate',20)}
        ${box('bg-white','border-blue-300','text-blue-700','@step decorator','API specs only',420)}
        <div class="flex-1 min-w-2"></div>
        <div class="flex items-center gap-1.5 flex-wrap">
          ${tag('@Team-*','bg-blue-50 border-blue-200','text-blue-700',490)}
          ${tag('@Product-*','bg-violet-50 border-violet-200','text-violet-700',520)}
          ${tag('@TestingLayer-systemTest','bg-emerald-50 border-emerald-200','text-emerald-700',550)}
          ${tag('@Component-*','bg-amber-50 border-amber-200','text-amber-700',580)}
        </div>
      </div>
    </div>

    <!-- ② Fixtures -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('② Fixtures — src/fixtures/fixtures.ts  (inject, never instantiate)', 'text-violet-500')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-violet-600','border-violet-700','text-white','fixtures.ts','Extends PW test',630)}
        ${arrow('provides','700','right','violet',36)}
        ${box('bg-white','border-violet-300','text-violet-700','loginPage','appLoginUnified()',770)}
        ${arrow('','820','right','slate',18)}
        ${box('bg-white','border-violet-300','text-violet-700','homePage','',860)}
        ${arrow('','910','right','slate',18)}
        ${box('bg-white','border-violet-300','text-violet-700','advancedSearch','',950)}
        ${arrow('','1000','right','slate',18)}
        ${box('bg-white','border-violet-300','text-violet-700','alertsPage','',1040)}
        ${arrow('…','1090','right','slate',18)}
        ${box('bg-slate-100','border-slate-300','text-slate-500','+12 more','page objects',1130)}
      </div>
    </div>

    <!-- ③ UI Path — Page Objects -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('③ UI Path — Page Object Model  ·  src/pages/*.ts', 'text-emerald-500')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-emerald-600','border-emerald-700','text-white','Page Class','constructor(page)',1200)}
        ${arrow('declares','1270','right','emerald',32)}
        ${box('bg-white','border-emerald-300','text-emerald-700','Locators','class properties',1340)}
        ${arrow('priority','1410','right','emerald',28)}
        ${box('bg-emerald-50','border-emerald-200','text-emerald-800','data-automation-id','1st choice',1480)}
        ${arrow('','1550','right','slate',18)}
        ${box('bg-white','border-slate-200','text-slate-600','getByRole()','2nd',1590)}
        ${arrow('','1640','right','slate',18)}
        ${box('bg-white','border-slate-200','text-slate-600','CSS class','3rd',1680)}
        <div class="flex-1 min-w-2"></div>
        ${box('bg-emerald-500','border-emerald-600','text-white','public async','waitFor() → click()',1720)}
      </div>
    </div>

    <!-- ④ API Path — Endpoint + Helper -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('④ API Path — *-endpoint.ts  →  *-helper.ts  →  BaseApiClient', 'text-orange-500')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-orange-500','border-orange-600','text-white','*-endpoint.ts','@step · Logger CRUD',1790)}
        ${arrow('calls','1860','right','orange',28)}
        ${box('bg-white','border-orange-300','text-orange-700','BaseApiClient','HTTP + auto-log',1930)}
        ${arrow('asserts','2000','right','orange',28)}
        ${box('bg-white','border-orange-300','text-orange-700','expect() in endpoint','never in spec',2070)}
        <div class="flex-1 min-w-2"></div>
        ${box('bg-orange-400','border-orange-500','text-white','*-helper.ts','@step · polling ⏳',2140)}
        ${arrow('waitForStatus()','2210','right','orange',44)}
        ${box('bg-white','border-orange-300','text-orange-700','endpoint.getById()','max 60 attempts',2280)}
      </div>
    </div>

    <!-- ⑤ Shared Infrastructure -->
    <div>
      ${lane('⑤ Shared Infrastructure — Logger · Utilities · Test Data · Reporting', 'text-pink-500')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-pink-500','border-pink-600','text-white','Logger','info/success/warn/error',2350)}
        ${arrow('no console.log','2420','right','pink',48)}
        ${box('bg-white','border-pink-300','text-pink-700','Emoji prefixes','📝 ✅ ⏳ 🔍 ❌',2490)}
        ${arrow('','2560','right','slate',20)}
        ${box('bg-pink-400','border-pink-500','text-white','Utilities','TEN/THIRTY/SIXTY_SEC',2600)}
        ${arrow('','2670','right','slate',20)}
        ${box('bg-white','border-pink-300','text-pink-700','generateTimestamp()','unique test data',2710)}
        <div class="flex-1 min-w-2"></div>
        ${box('bg-slate-700','border-slate-800','text-white','Allure / @step','test reporting',2780)}
      </div>
    </div>

    <!-- Legend -->
    <div class="mt-4 pt-3 border-t border-slate-100 flex items-center gap-4 flex-wrap">
      ${[['#3b82f6','Spec / describe'],['#8b5cf6','Fixtures'],['#10b981','UI / POM'],['#f97316','API / Endpoint'],['#ec4899','Infra / Logger']].map(([c,l])=>`
        <div class="flex items-center gap-1.5">
          <div style="height:2px;width:18px;background:repeating-linear-gradient(to right,${c} 0,${c} 4px,transparent 4px,transparent 8px);background-size:10px 100%;animation:tfFlowR .4s linear infinite"></div>
          <span class="text-[9px] text-slate-500">${l}</span>
        </div>`).join('')}
      <div class="ml-auto flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-red-400 aad-live"></span>
        <span class="text-[9px] text-slate-400 font-medium">Live data flow</span>
      </div>
    </div>
  </div>
  <style>
    @keyframes tfIn    { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
    @keyframes tfFlowR { from{background-position:0 0} to{background-position:14px 0} }
    @keyframes tfFlowL { from{background-position:0 0} to{background-position:-14px 0} }
    @keyframes tfFlowD { from{background-position:0 0} to{background-position:0 14px} }
    .tf-box { min-width:88px; }
  </style>`;
}

// ─── Auth UI ─────────────────────────────────────────────────────────────────
function showAuthModal(mode) {
  renderAuthForm(mode);
  document.getElementById("auth-modal").classList.remove("hidden");
}

function hideAuthModal() {
  document.getElementById("auth-modal").classList.add("hidden");
}

function showAppShell(user) {
  state.user = user;
  hideAuthModal();
  renderUserBadge(user);
  loadSidebar();
  router();
}

function isAdmin() { return state.user?.role === "admin"; }

function renderUserBadge(user) {
  const el = document.getElementById("user-badge");
  if (!el) return;
  const roleCls = user.role === "admin"
    ? "bg-violet-100 text-violet-700 border-violet-200"
    : "bg-amber-100 text-amber-700 border-amber-200";
  el.innerHTML = `
    <div class="flex items-center gap-2">
      <div class="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        ${escHtml(user.username[0].toUpperCase())}
      </div>
      <div class="hidden sm:flex flex-col leading-none">
        <span class="text-sm font-medium text-slate-700">${escHtml(user.username)}</span>
        <span class="text-[10px] font-semibold border rounded px-1 mt-0.5 uppercase tracking-wide ${roleCls}">${escHtml(user.role)}</span>
      </div>
      <button onclick="logout()" title="Log out"
        class="ml-1 text-slate-400 hover:text-red-500 transition-colors" data-testid="logout-btn">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
        </svg>
      </button>
    </div>`;
}

function renderAuthForm(mode) {
  const isLogin = mode === "login";
  document.getElementById("auth-form-container").innerHTML = `
    <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full p-8 fade-in relative">
      <button onclick="hideAuthModal()" aria-label="Close"
        class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>

      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
        </div>
        <div>
          <h1 class="text-xl font-bold text-slate-800">TestFlow</h1>
          <p class="text-xs text-slate-400">Test Case Management</p>
        </div>
      </div>

      <h2 class="text-lg font-semibold text-slate-800 mb-5">${isLogin ? "Sign in" : "Create account"}</h2>

      <form onsubmit="submitAuth(event, '${mode}')" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Username</label>
          <input id="auth-username" data-testid="auth-username" type="text" autocomplete="username"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            placeholder="your_username" required autofocus />
        </div>
        ${!isLogin ? `
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Email</label>
          <input id="auth-email" data-testid="auth-email" type="email" autocomplete="email"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            placeholder="you@example.com" required />
        </div>` : ""}
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Password</label>
          <input id="auth-password" data-testid="auth-password" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            placeholder="${isLogin ? "••••••••" : "Min. 6 characters"}" required />
        </div>
        <div id="auth-error" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"></div>
        <button type="submit" data-testid="auth-submit-btn"
          class="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
          ${isLogin ? "Sign in" : "Create account"}
        </button>
      </form>

      <p class="mt-5 text-center text-sm text-slate-500">
        ${isLogin
          ? `Don't have an account? <button onclick="showAuthModal('register')" class="text-brand-600 hover:underline font-medium">Sign up</button>`
          : `Already have an account? <button onclick="showAuthModal('login')" class="text-brand-600 hover:underline font-medium">Sign in</button>`
        }
      </p>
    </div>`;
}

async function submitAuth(e, mode) {
  e.preventDefault();
  const errEl = document.getElementById("auth-error");
  errEl.classList.add("hidden");
  const username = document.getElementById("auth-username").value.trim();
  const password = document.getElementById("auth-password").value;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = mode === "login" ? "Signing in…" : "Creating account…";

  try {
    let res, data;
    if (mode === "login") {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    } else {
      const email = document.getElementById("auth-email").value.trim();
      res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
    }
    data = await res.json();
    if (!res.ok) { throw new Error(data.detail || "Authentication failed"); }
    setToken(data.access_token);
    setStoredUser(data.user);
    showAppShell(data.user);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = mode === "login" ? "Sign in" : "Create account";
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
window.addEventListener("hashchange", () => router());
document.addEventListener("DOMContentLoaded", async () => {
  const token = getToken();
  if (token) {
    // Verify token is still valid
    const res = await fetch("/api/auth/me", {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (res.ok) {
      const user = await res.json();
      setStoredUser(user);
      state.user = user;
      renderUserBadge(user);
    } else {
      clearToken();
    }
  }
  loadSidebar();
  router();
});
