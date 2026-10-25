// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  projects: [],
  currentProject: null,
  currentSuite: null,
  currentRun: null,
  user: null,
  tourStep: null,
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("tf_token"); }
function setToken(t) { localStorage.setItem("tf_token", t); }
function clearToken() { localStorage.removeItem("tf_token"); localStorage.removeItem("tf_user"); }
function getStoredUser() { try { return JSON.parse(localStorage.getItem("tf_user")); } catch { return null; } }
function setStoredUser(u) { localStorage.setItem("tf_user", JSON.stringify(u)); }

function logout() {
  if (!confirm("Are you sure you want to log out?")) return;
  clearToken();
  state.user = null;
  document.getElementById("user-badge").innerHTML = `
    <button onclick="showAuthModal('login')" data-testid="signin-btn"
      class="text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
      Sign in
    </button>`;
  loadSidebar();
  router();
}

// ─── API helpers ─────────────────────────────────────────────────────────────
// Every render path that awaits a fetch (e.g. renderProject's initial spinner)
// has no fallback if the request never settles - a hung backend call leaves
// the spinner up forever with nothing on screen. A hard timeout guarantees
// every call always eventually resolves or rejects, so callers' existing
// error states/catch blocks can actually run.
const API_TIMEOUT_MS = 15000;

async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  const token = getToken();
  if (token) opts.headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const controller = new AbortController();
  opts.signal = controller.signal;
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    if (e.name === "AbortError") throw new Error("The server took too long to respond. Please try again.");
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
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
    success: "bg-emerald-700 text-white",
    error:   "bg-red-600 text-white",
    info:    "bg-blue-600 text-white",
  };
  const icons = {
    success: "M5 13l4 4L19 7",
    error:   "M6 18L18 6M6 6l12 12",
    info:    "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  };
  inner.className = `px-4 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2.5 max-w-xs ${colors[type] || colors.info}`;
  inner.innerHTML = `<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="${icons[type] || icons.info}"/></svg><span>${escHtml(msg)}</span><span class="toast-timer" aria-hidden="true"></span>`;
  // Restart the entrance and timer animations for back-to-back toasts.
  inner.style.animation = "none"; void inner.offsetWidth; inner.style.animation = "";
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
    contact:      buildContactModal,
    aiPipelineDemo: buildAiPipelineDemoModal,
  };
  if (builders[type]) builders[type](title, body, data);
}

function hideModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

function closeModal(e) {
  if (e.target === document.getElementById("modal-overlay")) hideModal();
}

// Escape closes the open dialog, as keyboard users expect of any dialog. The
// Recruiter Tour handles its own Escape (and marks the event handled).
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const overlay = document.getElementById("modal-overlay");
  if (overlay && !overlay.classList.contains("hidden")) { hideModal(); return; }
  const auth = document.getElementById("auth-modal");
  if (auth && !auth.classList.contains("hidden") && auth.querySelector('button[aria-label="Close"]')) hideAuthModal();
});

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
    ${field("Title *", `<input id="f-title" data-testid="f-title" class="${inputCls}" value="${escHtml(tc.title)}" />`)}
    ${field("Description", `<textarea id="f-desc" data-testid="f-desc" class="${textareaCls}" rows="2">${escHtml(tc.description || "")}</textarea>`)}
    ${field("Steps", `<textarea id="f-steps" data-testid="f-steps" class="${textareaCls}" rows="4">${escHtml(tc.steps || "")}</textarea>`)}
    ${field("Expected Result", `<textarea id="f-expected" data-testid="f-expected" class="${textareaCls}" rows="2">${escHtml(tc.expected_result || "")}</textarea>`)}
    <div class="grid grid-cols-2 gap-4">
      ${field("Status", `<select id="f-status" data-testid="f-status" class="${inputCls}">
        <option value="draft" ${tc.status === "draft" ? "selected" : ""}>Draft</option>
        <option value="active" ${tc.status === "active" ? "selected" : ""}>Active</option>
        <option value="deprecated" ${tc.status === "deprecated" ? "selected" : ""}>Deprecated</option>
      </select>`)}
      ${field("Priority", `<select id="f-priority" data-testid="f-priority" class="${inputCls}">
        <option value="low" ${tc.priority === "low" ? "selected" : ""}>Low</option>
        <option value="medium" ${tc.priority === "medium" ? "selected" : ""}>Medium</option>
        <option value="high" ${tc.priority === "high" ? "selected" : ""}>High</option>
        <option value="critical" ${tc.priority === "critical" ? "selected" : ""}>Critical</option>
      </select>`)}
    </div>
    <div class="flex justify-end gap-2 mt-2">
      <button data-testid="modal-cancel-btn" onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button data-testid="modal-submit-btn" onclick="submitEditTestCase(${tc.id}, ${tc.suite_id})" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Save Changes</button>
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
    ${field("Environment", `<select id="f-environment" class="${inputCls}">
      <option value="staging" selected>Staging</option>
      <option value="regression">Regression</option>
      <option value="preprod">Preprod</option>
      <option value="prod">Prod</option>
    </select>`)}
    <p class="text-sm text-slate-500 mb-4">Creates a new test run for all <strong>active</strong> test cases in this suite.</p>
    <div class="flex justify-end gap-2">
      <button onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button onclick="submitRun(${suiteId})" class="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors">Start Run</button>
    </div>`;
}

async function submitRun(suiteId) {
  const name = document.getElementById("f-name").value.trim();
  const environment_key = document.getElementById("f-environment").value;
  if (!name) { toast("Name is required", "error"); return; }
  try {
    const run = await POST(`/api/suites/${suiteId}/runs`, { name, environment_key });
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

// Contact Us modal
function buildContactModal(title, body) {
  title.textContent = "Contact Us";
  body.innerHTML = `
    ${field("Topic *", `<input id="f-topic" data-testid="f-topic" class="${inputCls}" placeholder="What's this about?" autofocus />`)}
    ${field("Email *", `<input id="f-email" data-testid="f-email" type="email" class="${inputCls}" placeholder="you@example.com" />`)}
    ${field("Phone *", `<input id="f-phone" data-testid="f-phone" type="tel" class="${inputCls}" placeholder="+1 555 123 4567" />`)}
    <div class="mb-1">
      <label class="block text-sm font-medium text-slate-700 mb-1">Message *</label>
      <textarea id="f-description" data-testid="f-description" class="${textareaCls}" rows="4" maxlength="500"
        placeholder="How can we help?" oninput="document.getElementById('f-desc-count').textContent = 500 - this.value.length"></textarea>
      <p class="text-xs text-slate-500 mt-1 text-right"><span id="f-desc-count">500</span> characters left</p>
    </div>
    <div class="flex justify-end gap-2 mt-2">
      <button data-testid="modal-cancel-btn" onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button data-testid="modal-submit-btn" onclick="submitContact()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Send</button>
    </div>`;
}

async function submitContact() {
  const topic = document.getElementById("f-topic").value.trim();
  const email = document.getElementById("f-email").value.trim();
  const phone = document.getElementById("f-phone").value.trim();
  const description = document.getElementById("f-description").value.trim();
  if (!topic || !email || !phone || !description) { toast("Please fill in all fields", "error"); return; }
  try {
    await POST("/api/contact", { topic, email, phone, description });
    hideModal();
    toast("Message sent — we'll get back to you soon");
  } catch (e) { toast(e.message, "error"); }
}

// Animated, static (no live AI calls — cheap and safe for an anonymous
// guest to open as many times as they like) walkthrough of where AI models
// actually sit in this repo's own CI/CD pipeline. Every node names a real
// file/workflow already covered in aiFirstEngineeringSection above; this is
// just the same facts told as a sequence instead of a card grid.
const AI_PIPELINE_DEMO_NODES = [
  { icon: '📤', title: 'PR opened / pushed', model: null,
    desc: 'A developer (or an AI agent) pushes a commit — the trigger for every step below.' },
  { icon: '🛡️', title: 'AI PR Steward', model: 'Claude Sonnet',
    desc: 'Reads the failing CI logs and review comments, diagnoses root cause, pushes a fix (.github/workflows/claude-pr-steward.yml).' },
  { icon: '🧪', title: 'AI Test Authoring', model: 'Claude Haiku · LangChain',
    desc: 'Coverage-Gap Agent flags untested changes; AI Test Generation and the Test-Plan Reviewer draft cases to fill them.' },
  { icon: '🩹', title: 'Playwright Healer', model: 'Claude Sonnet',
    desc: 'Classifies a failing spec as stale-locator (auto-fixes it) or real defect (escalates — never silently skipped).' },
  { icon: '🔎', title: 'Agentic Failure Triage', model: 'Claude Haiku · tool use',
    desc: 'Calls read-only tools (case history, similar cases, suite flakiness) in a bounded loop before diagnosing a failed run (api/triage_agent.py).' },
  { icon: '📊', title: 'Eval Harness & Flaky Detector', model: 'Ollama · deterministic',
    desc: 'Scores AI output quality run-to-run before it ships; tracks which tests flip-flop across runs.' },
  { icon: '✅', title: 'CI green → merged', model: null,
    desc: 'Every check passes, the Steward resolves review threads, and the PR merges — the same loop that built this repo.' },
];

// Shared between the "See the pipeline" modal and the always-visible
// aiLiveDemoSection on the homepage — same node data and animation, two
// homes (a click-to-open detail view vs. a persistent hero-adjacent demo).
// Deliberately matches demoBanner's "How TestFlow works" pipeline-step
// style above (small fixed-width blocks, a pulsing colored icon badge,
// arrow connectors) rather than inventing a new visual language for the
// same "compact animated blocks" idea.
const AI_PIPELINE_NODE_COLORS = [
  'bg-indigo-500/80', 'bg-violet-500/80', 'bg-purple-500/80',
  'bg-fuchsia-500/80', 'bg-pink-500/80', 'bg-sky-500/80', 'bg-emerald-500/80',
];

function renderAiPipelineTimelineInner() {
  const n = AI_PIPELINE_DEMO_NODES.length;
  return `
    <div data-pipe-root data-testid="pipe-root">
      <div class="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div class="flex items-center gap-1.5">
          <span class="relative flex h-2 w-2 flex-shrink-0"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span></span>
          <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-300/80">Static walkthrough — not a live AI call</span>
        </div>
        <div class="flex items-center gap-3">
          <button type="button" data-pipe-toggle data-testid="pipe-toggle" aria-pressed="false"
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white/90 border border-white/20 hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
            <svg data-icon="pause" class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
            <svg data-icon="play" class="hidden w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
            <span data-pipe-toggle-label>Pause</span>
          </button>
          <p class="text-[11px] font-mono" style="color:rgba(255,255,255,.55)">
            <span data-pipe-run data-testid="pipe-run">Run #1</span> · <span data-pipe-step data-testid="pipe-step">Step 1/${n}</span>
          </p>
        </div>
      </div>
      <div class="h-1 rounded-full overflow-hidden mb-3" style="background:rgba(255,255,255,.08)">
        <div data-pipe-progress data-testid="pipe-progress" class="h-full rounded-full transition-[width] duration-700 ease-out" style="width:0%;background:linear-gradient(90deg,#38bdf8,#34d399)"></div>
      </div>
      <div data-pipe-row tabindex="0" role="region" aria-label="AI pipeline stages" class="flex items-stretch gap-1.5 sm:gap-2 overflow-x-auto pt-1 pb-1 carousel-track focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-xl">
        ${AI_PIPELINE_DEMO_NODES.map((node, i, arr) => `
          <div class="flex items-stretch gap-1.5 sm:gap-2 flex-shrink-0">
            <div data-pipe-node="${i}" data-state="queued" data-testid="pipe-node" class="pipe-node ai-demo-node flex flex-col gap-2 rounded-xl p-3 w-32 sm:w-36" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15)">
              <div class="flex items-center justify-between gap-1">
                <div class="pipe-icon ${AI_PIPELINE_NODE_COLORS[i % AI_PIPELINE_NODE_COLORS.length]} w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-lg flex-shrink-0">${node.icon}</div>
                <span data-pipe-status class="pipe-status text-[8px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5">Queued</span>
              </div>
              <div>
                <p class="text-white text-xs font-bold leading-tight">${node.title}</p>
                ${node.model ? `<p class="text-[8px] font-bold uppercase tracking-wider mt-0.5" style="color:rgba(199,210,254,.85)">${node.model}</p>` : ''}
                <p class="text-[11px] leading-relaxed mt-0.5" style="color:rgba(255,255,255,.5)">${node.desc}</p>
              </div>
            </div>
            ${i < arr.length - 1 ? `<div data-pipe-link data-state="idle" data-testid="pipe-link" class="pipe-link self-center relative w-5 sm:w-7 h-0.5 rounded-full flex-shrink-0" aria-hidden="true"><span class="pipe-packet"></span></div>` : ''}
          </div>
        `).join('')}
      </div>
      <p class="text-[11px] mt-3 pt-3" style="color:rgba(255,255,255,.3);border-top:1px solid rgba(255,255,255,.08)">
        Every node above is a real file in this repo — see the cards above for the exact path, or
        <code class="text-[11px]" style="color:rgba(165,180,252,.7)">docs/agent-governance.md</code> for why nothing here runs unattended without a human checkpoint.
      </p>
    </div>
  `;
}

const AI_PIPELINE_DEMO_KEYFRAMES = `
  <style>
    @keyframes aiDemoIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    @keyframes aiDemoPulse { 0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,255,255,.25)} 50%{transform:scale(1.1);box-shadow:0 0 0 8px rgba(255,255,255,0)} }
    @keyframes pipePacket { from{left:-40%} to{left:100%} }
    @keyframes pipeSpin { to{transform:rotate(360deg)} }
    .pipe-node { transition: opacity .45s ease, transform .45s ease, box-shadow .45s ease, border-color .45s ease, background-color .45s ease; }
    .pipe-node[data-state="queued"] { opacity: .5; }
    .pipe-node[data-state="active"] { opacity: 1; transform: translateY(-3px); background: rgba(56,189,248,.14) !important; border-color: rgba(125,211,252,.75) !important; box-shadow: 0 0 0 1px rgba(125,211,252,.35), 0 10px 28px -8px rgba(56,189,248,.6); }
    .pipe-node[data-state="done"] { opacity: 1; border-color: rgba(52,211,153,.45) !important; }
    .pipe-node[data-state="active"] .pipe-icon { animation: aiDemoPulse 1.6s ease-in-out infinite; }
    .pipe-status { color: rgba(255,255,255,.45); background: rgba(255,255,255,.06); }
    .pipe-node[data-state="active"] .pipe-status { color: #bae6fd; background: rgba(56,189,248,.2); }
    .pipe-node[data-state="active"] .pipe-status::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 3px; vertical-align: -1px; border: 1.5px solid currentColor; border-right-color: transparent; border-radius: 9999px; animation: pipeSpin .8s linear infinite; }
    .pipe-node[data-state="done"] .pipe-status { color: #a7f3d0; background: rgba(52,211,153,.18); }
    .pipe-link { background: rgba(255,255,255,.15); overflow: hidden; transition: background-color .45s ease; }
    .pipe-link .pipe-packet { position: absolute; top: -2px; left: -40%; width: 40%; height: 6px; border-radius: 9999px; background: linear-gradient(90deg, transparent, #7dd3fc, transparent); opacity: 0; }
    .pipe-link[data-state="flowing"] .pipe-packet { opacity: 1; animation: pipePacket .8s linear infinite; }
    .pipe-link[data-state="done"] { background: rgba(52,211,153,.55); }
  </style>`;

// The Live Demo replays one pipeline run on a loop: each stage goes queued ->
// running -> done while a pulse flows along the link into it, then the run
// finishes green and starts over. It pauses off-screen, in a hidden tab and
// when its Pause button is pressed. One instance per
// rendered timeline (the home section and the "See the pipeline" modal).
const PIPE_STEP_MS = 1600;
const PIPE_RESULT_MS = 2600;
const PIPE_STATUS = { queued: "Queued", active: "Running", done: "✓ Done" };

function initAiPipelineDemo(container) {
  const root = container?.querySelector("[data-pipe-root]");
  if (!root) return;
  root._pipeAbort?.abort();
  const abort = new AbortController();
  root._pipeAbort = abort;
  const { signal } = abort;

  const nodes = [...root.querySelectorAll("[data-pipe-node]")];
  const links = [...root.querySelectorAll("[data-pipe-link]")];
  const row = root.querySelector("[data-pipe-row]");
  const runEl = root.querySelector("[data-pipe-run]");
  const stepEl = root.querySelector("[data-pipe-step]");
  const progress = root.querySelector("[data-pipe-progress]");
  const n = nodes.length;
  let step = 0; // 0..n-1 running that stage; n = finished
  let run = 1;
  let timer = null;
  let inView = true;

  const paint = () => {
    nodes.forEach((el, i) => {
      const state = i < step ? "done" : i === step ? "active" : "queued";
      el.dataset.state = state;
      el.querySelector("[data-pipe-status]").textContent = PIPE_STATUS[state];
    });
    // Link i joins node i to node i+1: it flows while node i+1 runs.
    links.forEach((el, i) => { el.dataset.state = i < step - 1 ? "done" : i === step - 1 ? "flowing" : "idle"; });
    const finished = step >= n;
    progress.style.width = `${Math.round((Math.min(step + 1, n) / n) * 100)}%`;
    runEl.textContent = `Run #${run}`;
    stepEl.textContent = finished ? "✓ Pipeline green — merged" : `Step ${step + 1}/${n} · ${AI_PIPELINE_DEMO_NODES[step].title}`;
    root.dataset.pipeStep = String(step);
    root.dataset.pipeRun = String(run);
    // Keep the running stage in view inside the row, without scrolling the page.
    const active = nodes[Math.min(step, n - 1)];
    if (row.scrollWidth > row.clientWidth) {
      // An absolute target from layout (scrollLeft + on-screen offset is the
      // node's position in the row's content), so ticks arriving mid-scroll
      // still land on the right stage; a relative scrollBy would compound.
      const r = row.getBoundingClientRect(), a = active.getBoundingClientRect();
      row.scrollTo({ left: row.scrollLeft + a.left - r.left - (row.clientWidth - a.width) / 2, behavior: "smooth" });
    }
  };

  const tick = () => {
    timer = null;
    if (!document.body.contains(root)) { abort.abort(); return; } // section re-rendered or modal closed
    if (step < n) step += 1;
    else { step = 0; run += 1; }
    paint();
    schedule();
  };
  let userPaused = false;
  const schedule = () => {
    const running = inView && !document.hidden && !userPaused;
    root.dataset.pipeLive = running ? "running" : "paused";
    if (running && !timer) timer = setTimeout(tick, step >= n ? PIPE_RESULT_MS : PIPE_STEP_MS);
    if (!running && timer) { clearTimeout(timer); timer = null; }
  };

  // The replay always plays - the site owner wants the home page to move for
  // every visitor - and Pause stops it, as moving content must allow.
  const toggle = root.querySelector("[data-pipe-toggle]");
  toggle.addEventListener("click", () => {
    userPaused = !userPaused;
    toggle.setAttribute("aria-pressed", String(userPaused));
    toggle.querySelector("[data-pipe-toggle-label]").textContent = userPaused ? "Play" : "Pause";
    toggle.querySelector('[data-icon="pause"]').classList.toggle("hidden", userPaused);
    toggle.querySelector('[data-icon="play"]').classList.toggle("hidden", !userPaused);
    schedule();
  }, { signal });

  root.dataset.pipeMode = "live";
  document.addEventListener("visibilitychange", schedule, { signal });
  const io = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; schedule(); });
  io.observe(root);
  signal.addEventListener("abort", () => { io.disconnect(); if (timer) clearTimeout(timer); });
  paint();
  schedule();
}

function buildAiPipelineDemoModal(title, body) {
  title.textContent = 'AI Agents in This Repo’s CI/CD';
  body.innerHTML = `
    <div class="relative rounded-2xl overflow-hidden -mx-6 -my-5 px-5 py-6" style="background:linear-gradient(135deg,#020c1b,#071428,#030d1c)" data-testid="ai-pipeline-demo">
      <div class="absolute inset-0 pointer-events-none" style="background-image:linear-gradient(rgba(99,102,241,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.05) 1px,transparent 1px);background-size:28px 28px"></div>
      <div class="relative z-10">
        ${renderAiPipelineTimelineInner()}
      </div>
    </div>
    ${AI_PIPELINE_DEMO_KEYFRAMES}`;
  initAiPipelineDemo(body);
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
    const saved = await PUT(`/api/runs/${runId}/results/${tcId}`, { status, notes: notes || null });
    hideModal();
    toast(`Marked as ${status}`);
    // Update the open run page in place, keeping its filter and order.
    const r = _runView?.runId === runId ? runResult(tcId) : null;
    if (r) {
      Object.assign(r, { status: saved.status, notes: saved.notes, executed_at: new Date().toISOString() });
      onRunResultChanged(tcId);
    } else {
      navigate(`run/${runId}`);
    }
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
  // A guest has no projects of their own to navigate, so the sidebar would
  // only take a quarter of the width from the showcase.
  document.getElementById("app-sidebar").classList.toggle("md:block", !!state.user);

  // Navigating away from the projects list (e.g. clicking into a project)
  // while the Recruiter Tour is active must not leave its floating card
  // stranded on an unrelated page.
  if (state.tourStep !== null && hash !== "projects") exitRecruiterTour();

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
  } else if (parts[0] === "users" && isAdmin()) {
    await renderUsers();
  } else if (parts[0] === "environments") {
    await renderEnvironments();
  } else if (parts[0] === "logs" && isAdmin()) {
    await renderLogs();
  } else {
    await renderProjects();
  }

  // Tear down WebSocket if we navigated away from a run
  if (parts[0] !== "run" && _activeRunWs) {
    closeRunWebSocket(_activeRunWs);
    _activeRunWs = null;
  }
}

// ─── Breadcrumb ──────────────────────────────────────────────────────────────
let _breadcrumbObserver = null;
function setBreadcrumb(items) {
  const el = document.getElementById("breadcrumb");
  // On phones only the parent and the current page show, after an ellipsis
  // that stands for the rest; wider screens show the whole trail.
  const sepSvg = `<svg class="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>`;
  const collapse = items.length > 2;
  // A lone crumb fits on the header's first row; a trail gets its own row on phones.
  el.classList.toggle("order-last", items.length > 1);
  el.classList.toggle("basis-full", items.length > 1);
  el.innerHTML = (collapse ? `<span class="sm:hidden text-slate-500 flex-shrink-0" aria-hidden="true">…</span>` : "") + items.map((item, i) => {
    const phoneHidden = collapse && i < items.length - 2;
    const wrap = (html) => `<span class="${phoneHidden ? "hidden sm:inline-flex" : "inline-flex"} items-center gap-1 min-w-0 flex-shrink-0">${html}</span>`;
    const sep = i > 0 ? sepSvg : "";
    if (i === items.length - 1) {
      return wrap(`${sep}<span class="text-slate-700 font-semibold truncate max-w-[160px] sm:max-w-[220px]" aria-current="page">${escHtml(item.label)}</span>`);
    }
    return wrap(`${sep}<button onclick="navigate('${item.href}')" class="text-blue-600 hover:text-blue-700 hover:underline underline-offset-2 transition-colors truncate max-w-[120px] sm:max-w-[160px]">${escHtml(item.label)}</button>`);
  }).join("");
  // On narrow screens the breadcrumb scrolls sideways; show its end, the current
  // page. Watched, not set once: the Tailwind CDN's CSS can land after this
  // markup and widen the items after the first measurement.
  _breadcrumbObserver?.disconnect();
  _breadcrumbObserver = new ResizeObserver(() => { el.scrollLeft = el.scrollWidth; });
  _breadcrumbObserver.observe(el);
  [...el.children].forEach((child) => _breadcrumbObserver.observe(child));
  el.scrollLeft = el.scrollWidth;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
// Bootstrap and the routed view both call loadSidebar() on first paint;
// share one in-flight load instead of fetching /api/projects twice. Only
// coalesced while the active project is unchanged, since that decides
// which suites get expanded.
let _sidebarInflight = null;
function loadSidebar() {
  const key = state.currentProject ? state.currentProject.id : null;
  if (_sidebarInflight && _sidebarInflight.key === key) return _sidebarInflight.promise;
  const promise = _loadSidebar().finally(() => {
    if (_sidebarInflight && _sidebarInflight.promise === promise) _sidebarInflight = null;
  });
  _sidebarInflight = { key, promise };
  return promise;
}

async function _loadSidebar() {
  const ul = document.getElementById("sidebar-projects");
  const newProjBtn = document.getElementById("sidebar-new-project-btn");
  if (newProjBtn) newProjBtn.style.display = isAdmin() ? "" : "none";
  try {
    const _pr = await GET("/api/projects?page_size=100");
    state.projects = _pr?.items ?? _pr ?? [];
    if (!state.projects.length) {
      ul.innerHTML = `<li class="px-4 py-3 text-sm text-slate-500 italic">No projects yet</li>`;
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
                  <button onclick="navigate('suite/${s.id}')" title="${escHtml(s.name)}"
                    class="w-full text-left pl-3 pr-4 py-1.5 text-xs transition-colors truncate
                      ${suiteActive ? "text-blue-700 font-semibold" : "text-slate-500 hover:text-blue-700"}">
                    ${escHtml(s.name)}
                  </button>
                  <ul class="border-l border-slate-100 ml-3">
                    <li>
                      <button onclick="navigate('suite/${s.id}/testcases')"
                        class="w-full text-left pl-3 pr-4 py-1 text-xs transition-colors truncate flex items-center gap-1
                          ${casesActive ? "text-blue-700 font-semibold" : "text-slate-500 hover:text-blue-600"}">
                        <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                        Test Cases
                      </button>
                    </li>
                    <li>
                      <button onclick="navigate('suite/${s.id}/runs')"
                        class="w-full text-left pl-3 pr-4 py-1 text-xs transition-colors truncate flex items-center gap-1
                          ${runsActive ? "text-blue-700 font-semibold" : "text-slate-500 hover:text-blue-600"}">
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
      return `<li class="group relative">
        <div class="flex items-center ${active ? "bg-blue-50 border-r-2 border-blue-600" : "hover:bg-slate-50"}">
          <button data-testid="sidebar-project-${p.id}" onclick="navigate('project/${p.id}')" title="${escHtml(p.name)}"
            class="flex-1 text-left px-4 py-2.5 text-sm transition-colors truncate
              ${active ? "text-blue-700 font-medium" : "text-slate-700 hover:text-blue-700"}">
            ${escHtml(p.name)}
          </button>
          ${isAdmin() ? `<button data-testid="sidebar-delete-project-${p.id}" onclick="event.stopPropagation(); deleteProject(${p.id})"
            title="Delete project" aria-label="Delete project ${escHtml(p.name)}"
            class="flex-shrink-0 mr-2 p-1 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity text-slate-500 hover:text-red-600 hover:bg-red-50">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>` : ""}
        </div>
        <div id="sidebar-pbar-${p.id}" class="px-4 pb-1.5 -mt-0.5"></div>
        ${suitesHtml}
      </li>`;
    }));
    ul.innerHTML = items.join("");
    loadSidebarProjectStats(state.projects);

    // Admin-only: Users link at bottom of sidebar
    if (isAdmin()) {
      const usersActive = window.location.hash === "#users";
      document.getElementById("sidebar-admin-section")?.remove();
      ul.insertAdjacentHTML("afterend", `
        <div id="sidebar-admin-section" class="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</span>
          </div>
          <ul>
            <li>
              <button onclick="navigate('users')"
                class="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors
                  ${usersActive ? "bg-violet-50 text-violet-700 font-medium border-r-2 border-violet-600" : "text-slate-700 hover:bg-slate-50 hover:text-violet-700"}">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                Users
              </button>
            </li>
          </ul>
        </div>`);
    }
  } catch {
    ul.innerHTML = `<li class="px-4 py-3 text-sm text-red-400">Failed to load</li>`;
  }
}

// Each sidebar row's last-run bar is fetched when the row first scrolls into
// view, not all at once: the list holds up to 100 projects but shows about
// five, and firing one stats request per project queued the page's own
// requests behind them in the browser's per-host connection limit (a project
// page took 7 s to load with ~80 projects). On phones the sidebar is hidden,
// so nothing is fetched at all.
let _sidebarStatsObserver = null;

function loadSidebarProjectStats(projects) {
  _sidebarStatsObserver?.disconnect();
  const list = document.getElementById("sidebar-projects");
  if (!list) return;
  const byBar = new Map();
  _sidebarStatsObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      loadSidebarBar(entry.target, byBar.get(entry.target));
    }
  }, { root: list, rootMargin: "120px 0px" });
  for (const p of projects) {
    const bar = document.getElementById(`sidebar-pbar-${p.id}`);
    if (!bar) continue;
    byBar.set(bar, p);
    _sidebarStatsObserver.observe(bar);
  }
}

async function loadSidebarBar(bar, p) {
  try {
    const s = await GET(`/api/projects/${p.id}/stats`);
    const total = s.last_run_pass + s.last_run_fail + s.last_run_skip + s.last_run_pending;
    if (!total) { bar.innerHTML = ""; return; }
    const pct = v => Math.round((v / total) * 100);
    const passW = pct(s.last_run_pass), failW = pct(s.last_run_fail), skipW = pct(s.last_run_skip), pendW = pct(s.last_run_pending);
    const overall = s.last_run_fail > 0 ? "fail" : s.last_run_pending > 0 ? "pending" : "pass";
    const labelCls = overall === "fail" ? "text-red-600" : overall === "pending" ? "text-amber-700" : "text-emerald-700";
    bar.innerHTML = `
      <div class="flex items-center gap-1.5 mb-0.5">
        <div class="flex h-1 rounded-full overflow-hidden flex-1 bg-slate-100 gap-px">
          ${passW ? `<div class="bg-emerald-500 h-full" style="width:${passW}%"></div>` : ""}
          ${failW ? `<div class="bg-red-500 h-full" style="width:${failW}%"></div>` : ""}
          ${skipW ? `<div class="bg-amber-400 h-full" style="width:${skipW}%"></div>` : ""}
          ${pendW ? `<div class="bg-slate-300 h-full" style="width:${pendW}%"></div>` : ""}
        </div>
        <span class="text-[11px] font-bold ${labelCls} flex-shrink-0">${passW}%</span>
      </div>`;
  } catch { bar.innerHTML = ""; }
}

// ─── Collapsible showcase section (architecture / tech-stack / demo banners) ──
// The Projects view has several large, animated "showcase" banners aimed at
// portfolio reviewers (live architecture diagram, demo pipeline, test-stack
// overview). They're valuable context but push the actual project list below
// the fold on every load, so they're collapsed by default behind a single
// toggle — still one click away, but the task list is what a returning user
// sees first. State is remembered per-browser via localStorage.
function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

function isShowcaseExpanded() {
  try { return localStorage.getItem("tf_showcase_expanded") === "1"; } catch { return false; }
}

function toggleShowcase() {
  const content = document.getElementById("showcase-content");
  const icon = document.getElementById("showcase-toggle-icon");
  const btn = document.getElementById("showcase-toggle-btn");
  if (!content || !icon || !btn) return;
  const expanding = content.classList.contains("hidden");
  content.classList.toggle("hidden");
  icon.classList.toggle("rotate-180", expanding);
  btn.setAttribute("aria-expanded", String(expanding));
  try { localStorage.setItem("tf_showcase_expanded", expanding ? "1" : "0"); } catch {}
}

// The hero's "View Architecture" CTA - a direct, stable action that works
// without signing in (the live architecture panel it reveals is guest-visible
// as of renderProjects()'s archDiagram - see its own comment). Navigates to
// the projects list first if needed, then expands the (possibly-collapsed)
// showcase panel and scrolls it into view.
function viewArchitecture() {
  const reveal = () => {
    const content = document.getElementById("showcase-content");
    revealHomeSection(content);
    if (content && content.classList.contains("hidden")) toggleShowcase();
    document.getElementById("showcase-toggle-btn")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  };
  if (window.location.hash.replace("#", "") !== "projects") {
    window.location.hash = "projects";
    setTimeout(reveal, 150);
  } else {
    reveal();
  }
}

// ─── Recruiter Tour ──────────────────────────────────────────────────────────
// A 5-step, read-only, no-auth guided path through sections already on the
// projects list page. Never creates or modifies data - purely scrolling and
// (for step 2) expanding the already-guest-visible architecture panel.
// Skippable/exitable at any step.
const RECRUITER_TOUR_STEPS = [
  { title: "Leadership Profile", desc: "Automation Tech Lead positioning and how I lead engineering delivery.", targetId: "leadership-impact-section" },
  { title: "System Architecture", desc: "Live microservice architecture, plus the real trade-offs behind it.", targetId: "showcase-toggle-btn", onEnter: () => { const c = document.getElementById("showcase-content"); revealHomeSection(c); if (c && c.classList.contains("hidden")) toggleShowcase(); } },
  { title: "Test Strategy", desc: "A real Test Pyramid with measured counts, and the Shift-Left strategy behind it.", targetId: "test-pyramid-section" },
  { title: "CI/CD Quality Gates & KPIs", desc: "The quality gates that block a merge, and the KPI dashboard tracking them.", targetId: "kpi-dashboard-section" },
  { title: "AI Engineering & Source", desc: "Eight real AI-assisted workflows, the roadmap, and the GitHub source behind all of it.", targetId: "ai-first-engineering-section" },
];

// The element focus should return to once the tour closes - the "Start
// Tour" button (or whatever else had focus) a keyboard/screen-reader user
// was on before the dialog opened.
let tourTriggerEl = null;

function renderTourOverlay() {
  let el = document.getElementById("recruiter-tour-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "recruiter-tour-overlay";
    document.body.appendChild(el);
    // Keyboard behavior expected of a dialog: Escape closes it, and Tab/Shift+Tab
    // cycle within its own focusable controls rather than escaping to the page
    // behind it. Attached once to the persistent wrapper (innerHTML re-renders
    // below only replace its children, not this listener).
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); exitRecruiterTour(); return; }
      if (e.key !== "Tab") return;
      const focusables = el.querySelectorAll("button, a[href]");
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  const i = state.tourStep;
  const step = RECRUITER_TOUR_STEPS[i];
  const isLast = i === RECRUITER_TOUR_STEPS.length - 1;
  el.innerHTML = `
    <div data-testid="recruiter-tour-card" role="dialog" aria-modal="true" aria-label="Recruiter Tour"
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 w-[calc(100%-2rem)] max-w-sm">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[11px] font-bold text-blue-600 uppercase tracking-wide" data-testid="tour-step-label">Recruiter Tour — Step ${i + 1} of ${RECRUITER_TOUR_STEPS.length}</span>
        <button type="button" onclick="exitRecruiterTour()" data-testid="tour-exit-btn" aria-label="Exit tour" class="text-slate-500 hover:text-slate-600 flex-shrink-0">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <h3 class="text-sm font-bold text-slate-800 mb-1">${step.title}</h3>
      <p class="text-xs text-slate-500 mb-3">${step.desc}</p>
      <div class="flex items-center justify-between">
        <div class="flex gap-1" aria-hidden="true">
          ${RECRUITER_TOUR_STEPS.map((_, si) => `<span class="w-1.5 h-1.5 rounded-full ${si === i ? "bg-blue-600" : "bg-slate-200"}"></span>`).join("")}
        </div>
        <div class="flex gap-2">
          ${i > 0 ? `<button type="button" onclick="tourPrev()" data-testid="tour-prev-btn" class="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1.5">Back</button>` : ""}
          <button type="button" onclick="${isLast ? "exitRecruiterTour()" : "tourNext()"}" data-testid="tour-next-btn" class="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5">${isLast ? "Finish" : "Next"}</button>
        </div>
      </div>
    </div>`;
  // Re-rendering innerHTML on every step destroys whatever control the
  // keyboard user's focus was on, silently dropping focus to <body>. Move it
  // back onto the dialog's primary action so Tab/Enter keeps working.
  const primary = el.querySelector('[data-testid="tour-next-btn"]') || el.querySelector('[data-testid="tour-exit-btn"]');
  primary?.focus();
}

function goToTourStep(i) {
  state.tourStep = i;
  const step = RECRUITER_TOUR_STEPS[i];
  if (step.onEnter) step.onEnter();
  renderTourOverlay();
  setTimeout(() => {
    const target = document.querySelector(`[data-testid="${step.targetId}"]`);
    if (!target) return;
    revealHomeSection(target);
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    const prevOutline = target.style.outline, prevOffset = target.style.outlineOffset;
    target.style.outline = "3px solid #3b82f6";
    target.style.outlineOffset = "4px";
    setTimeout(() => { target.style.outline = prevOutline; target.style.outlineOffset = prevOffset; }, 1600);
  }, 100);
}

// `trigger` is the element focus returns to on exit. Passed in rather than
// read from document.activeElement: Safari doesn't focus a button on click,
// so activeElement is <body> and focus would be lost when the tour closes.
function startRecruiterTour(trigger) {
  tourTriggerEl = trigger || document.activeElement;
  const go = () => goToTourStep(0);
  if (window.location.hash.replace("#", "") !== "projects") {
    window.location.hash = "projects";
    setTimeout(go, 200);
  } else {
    go();
  }
}

function tourNext() { if (state.tourStep < RECRUITER_TOUR_STEPS.length - 1) goToTourStep(state.tourStep + 1); }
function tourPrev() { if (state.tourStep > 0) goToTourStep(state.tourStep - 1); }

function exitRecruiterTour() {
  document.getElementById("recruiter-tour-overlay")?.remove();
  state.tourStep = null;
  if (tourTriggerEl && document.body.contains(tourTriggerEl)) tourTriggerEl.focus();
  tourTriggerEl = null;
}

function renderShowcaseSection(sections) {
  const content = sections.filter(Boolean).join("");
  if (!content) return "";
  const expanded = isShowcaseExpanded();
  return `
    <div class="mb-6">
      <button type="button" onclick="toggleShowcase()" id="showcase-toggle-btn"
        aria-expanded="${expanded}" aria-controls="showcase-content"
        class="w-full flex items-center justify-between gap-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-left transition-colors shadow-sm">
        <span class="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span class="text-base" aria-hidden="true">🏗️</span>
          Live architecture, tech stack &amp; demo pipeline
          <span class="text-xs font-normal text-slate-500">— see how this project is built</span>
        </span>
        <svg id="showcase-toggle-icon" class="w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}"
          fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      <div id="showcase-content" class="${expanded ? "" : "hidden"} mt-3 space-y-6">
        ${content}
      </div>
    </div>`;
}

// ─── Success Stories ─────────────────────────────────────────────────────────
// The owner's LinkedIn posts, newest first. Images are self-hosted copies
// (static/img/success-stories/) so the section never depends on LinkedIn's CDN.
const SUCCESS_STORIES = [
  { slug: "ai-agents-in-automation", activity: "7511122582864203777", date: "2026-09-30",
    title: "AI Agents in Automation",
    summary: "Lessons from ZoomInfo: five challenges in evaluating agentic workflows.",
    alt: "Infographic: AI Agents in Automation. Five challenges in evaluating agentic workflows: failure investigation, test generation, self-healing, agent orchestration and workflow evaluation." },
  { slug: "pytest-fixture-factory", activity: "7480988116976254977", date: "2026-07-09",
    title: "Pytest Fixtures: the Factory Pattern",
    summary: "Replacing hardcoded test data with dynamic, reusable factory fixtures.",
    alt: "Infographic: Pytest fixtures with the factory pattern. The problem with hardcoded test data, how factory fixtures work, a code example and best practices." },
  { slug: "bug-aware-playwright", activity: "7479141849790701568", date: "2026-07-04",
    title: "Bug-Aware Playwright Test Management",
    summary: "A CI agent checks Jira so a test failing on a known product bug carries that context.",
    alt: "Infographic: Bug-aware Playwright test management. A CI agent checks the linked Jira bug's status during the pipeline and enriches the Allure report with it." },
  { slug: "shared-logger-infrastructure", activity: "7475895553185308672", date: "2026-06-25",
    title: "Shared Logger Infrastructure",
    summary: "One logging layer for UI E2E and API flows, used across ZoomInfo's automation teams.",
    alt: "Infographic: Shared logger infrastructure, built once and used across automation teams, logging UI E2E steps and API calls for faster root-cause analysis." },
  { slug: "common-backend-library", activity: "7474467230747877376", date: "2026-06-21",
    title: "Common Backend Automation Library",
    summary: "A shared backend testing layer for stable, fast automation across microservices.",
    alt: "Infographic: Common Backend Automation Library, a shared backend testing layer of API clients, test steps and data builders that improves coverage, stability and speed." },
  { slug: "cucumber-to-playwright-mocks", activity: "7474123893595877376", date: "2026-06-20",
    title: "From Cucumber Java to Playwright Mocks",
    summary: "A three-year automation transformation for Angular micro frontends at ZoomInfo.",
    alt: "Infographic: From Cucumber Java to Playwright mocks. Before and after of a three-year automation transformation for Angular micro frontends, with its impact on stability and release speed." },
];

// ─── Carousel ────────────────────────────────────────────────────────────────
// One scroll-snap carousel, shared by Success Stories and the repositories
// section. Swipe, Previous/Next, dots and arrow keys all drive the same
// track; auto-advance runs every 5 s with a Pause/Play control, pausing on
// hover, on focus inside, off-screen or in a hidden tab.
// `prefix` names its test ids (`${prefix}-track` ...).
const CAROUSEL_INTERVAL_MS = 5000;
const _carousels = new Map(); // id -> { index, autoplay, abort }

function renderCarousel({ id, prefix, noun, heading, subtitle, slides, slideTestId, headerLink = "", beforeTrack = "" }) {
  const n = slides.length;
  const btn = "w-9 h-9 rounded-full border border-white/15 text-white/80 hover:bg-white/10 transition-colors items-center justify-center";
  return `
    <section class="relative rounded-2xl overflow-hidden mb-6 px-4 sm:px-5 py-5" style="background:linear-gradient(135deg,#020c1b,#071428,#030d1c)"
      data-carousel="${id}" data-testid="${id}-section" aria-roledescription="carousel" aria-labelledby="${id}-heading">
      <div class="flex items-start justify-between gap-3 mb-4">
        <div class="min-w-0">
          <h2 id="${id}-heading" class="text-sm font-bold text-white uppercase tracking-wide">${escHtml(heading)}</h2>
          <p class="text-[11px] mt-1" style="color:rgba(255,255,255,.5)">${escHtml(subtitle)}${headerLink}</p>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button type="button" data-carousel-autoplay data-testid="${prefix}-autoplay" onclick="toggleCarouselAutoplay('${id}')" aria-label="Pause auto-advance" class="hidden ${btn}">
            <svg data-icon="pause" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>
            <svg data-icon="play" class="w-4 h-4 hidden" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button type="button" data-carousel-prev data-testid="${prefix}-prev" onclick="stepCarousel('${id}', -1)" aria-label="Previous ${noun}" class="flex ${btn} disabled:opacity-30 disabled:cursor-not-allowed">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <button type="button" data-carousel-next data-testid="${prefix}-next" onclick="stepCarousel('${id}', 1)" aria-label="Next ${noun}" class="flex ${btn} disabled:opacity-30 disabled:cursor-not-allowed">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
      ${beforeTrack}
      <div data-carousel-track data-testid="${prefix}-track" tabindex="0" aria-label="${escHtml(heading)}. Use the arrow keys to browse."
        class="carousel-track flex gap-4 overflow-x-auto snap-x snap-mandatory pb-1">
        ${slides.map((s, i) => `
          <article role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}: ${escHtml(s.label)}" data-testid="${slideTestId}" ${s.attrs || ""}
            class="group snap-start shrink-0 w-[85%] sm:w-[calc(50%-0.5rem)] lg:w-[calc((100%-2rem)/3)] rounded-xl overflow-hidden border border-white/10 bg-white/[.03] flex flex-col transition-all duration-300 hover:-translate-y-1 hover:border-sky-400/40 hover:shadow-lg hover:shadow-sky-500/10">
            ${s.html}
          </article>`).join("")}
      </div>
      <div class="flex justify-center gap-1 mt-3" data-testid="${prefix}-dots">
        ${slides.map((s, i) => `
          <button type="button" data-carousel-dot onclick="goToCarousel('${id}', ${i})" aria-label="Go to ${noun} ${i + 1}: ${escHtml(s.label)}"
            class="p-1.5"><span class="block w-2 h-2 rounded-full bg-white/25 transition-colors"></span></button>`).join("")}
      </div>
    </section>`;
}

function _carouselEl(id) { return document.querySelector(`[data-carousel="${id}"]`); }
function _carouselTrack(id) { return _carouselEl(id)?.querySelector("[data-carousel-track]"); }
function _carouselScrollBehavior() { return "smooth"; }
function _slideOffset(track, i) { return track.children[i].offsetLeft - track.firstElementChild.offsetLeft; }
function _carouselAtEnd(track) { return track.scrollLeft + track.clientWidth >= track.scrollWidth - 2; }

function _nearestSlide(track) {
  let best = 0;
  [...track.children].forEach((_, i) => {
    if (Math.abs(_slideOffset(track, i) - track.scrollLeft) < Math.abs(_slideOffset(track, best) - track.scrollLeft)) best = i;
  });
  return best;
}

// The last slide the track can scroll to the start of: when several fit on
// screen, the final few share one end position. Navigation clamps to it, so
// the index never runs past what the track can show.
function _lastReachableSlide(track) {
  const max = track.scrollWidth - track.clientWidth;
  let last = 0;
  [...track.children].forEach((_, i) => { if (_slideOffset(track, i) <= max + 2) last = i; });
  return last;
}

function goToCarousel(id, i, behavior = _carouselScrollBehavior()) {
  const track = _carouselTrack(id);
  const c = _carousels.get(id);
  if (!track?.children[i] || !c) return;
  const last = _lastReachableSlide(track);
  c.index = Math.min(i, last);
  const left = c.index === last ? track.scrollWidth - track.clientWidth : _slideOffset(track, c.index);
  track.scrollTo({ left, behavior });
}

function stepCarousel(id, dir) {
  const track = _carouselTrack(id);
  const c = _carousels.get(id);
  if (!track?.firstElementChild || !c) return;
  const last = _lastReachableSlide(track);
  goToCarousel(id, Math.min(Math.max(Math.min(c.index, last) + dir, 0), last));
}

function toggleCarouselAutoplay(id) {
  const ap = _carousels.get(id)?.autoplay;
  if (!ap) return;
  ap.userPaused = !ap.userPaused;
  ap.sync();
}

function _startCarouselAutoplay(id, section, track, signal) {
  const btn = section.querySelector("[data-carousel-autoplay]");
  btn.classList.remove("hidden");
  btn.classList.add("flex");

  // Auto-advance runs for every visitor (the site owner wants the home page
  // to move); the Pause button stops it.
  const ap = { userPaused: false, hovered: false, focused: false, inView: true, timer: null };
  // Index-based, not scroll-position-based: a tick can land while the
  // previous smooth scroll is still moving.
  const advance = () => {
    if (_carousels.get(id).index >= _lastReachableSlide(track)) goToCarousel(id, 0); else stepCarousel(id, 1);
  };
  ap.sync = () => {
    const running = !ap.userPaused && !ap.hovered && !ap.focused && ap.inView && !document.hidden;
    if (running && !ap.timer) ap.timer = setInterval(advance, CAROUSEL_INTERVAL_MS);
    if (!running && ap.timer) { clearInterval(ap.timer); ap.timer = null; }
    btn.setAttribute("aria-label", ap.userPaused ? "Play auto-advance" : "Pause auto-advance");
    btn.querySelector('[data-icon="pause"]').classList.toggle("hidden", ap.userPaused);
    btn.querySelector('[data-icon="play"]').classList.toggle("hidden", !ap.userPaused);
    section.dataset.autoplay = running ? "running" : "paused";
  };

  section.addEventListener("pointerenter", () => { ap.hovered = true; ap.sync(); }, { signal });
  section.addEventListener("pointerleave", () => { ap.hovered = false; ap.sync(); }, { signal });
  // The Pause/Play button itself doesn't count as "focus inside": a keyboard
  // user who just pressed Play would otherwise keep it paused.
  section.addEventListener("focusin", (e) => { ap.focused = e.target !== btn; ap.sync(); }, { signal });
  section.addEventListener("focusout", (e) => { if (!section.contains(e.relatedTarget)) { ap.focused = false; ap.sync(); } }, { signal });
  document.addEventListener("visibilitychange", ap.sync, { signal });
  const io = new IntersectionObserver(([entry]) => { ap.inView = entry.isIntersecting; ap.sync(); });
  io.observe(section);
  signal.addEventListener("abort", () => { io.disconnect(); if (ap.timer) clearInterval(ap.timer); });

  _carousels.get(id).autoplay = ap;
  ap.sync();
}

function initCarousel(id) {
  // The home page re-renders on every visit; drop the previous render's
  // timer and document-level listeners first.
  _carousels.get(id)?.abort.abort();
  _carousels.delete(id);
  const section = _carouselEl(id);
  const track = section?.querySelector("[data-carousel-track]");
  if (!track?.firstElementChild) return;
  const abort = new AbortController();
  const { signal } = abort;
  // `index` is the slide the carousel means to show. Only navigation changes
  // it - never layout: when slide widths change (the Tailwind CDN's CSS lands
  // after this markup), WebKit re-snaps a scroll-snap track to its last slide.
  const c = { index: 0, autoplay: null, abort };
  _carousels.set(id, c);

  const prev = section.querySelector("[data-carousel-prev]");
  const next = section.querySelector("[data-carousel-next]");
  const dots = section.querySelectorAll("[data-carousel-dot]");
  let userScrolling = false;

  const update = () => {
    if (!document.body.contains(track)) return;
    const atEnd = _carouselAtEnd(track);
    if (userScrolling) c.index = atEnd ? _lastReachableSlide(track) : _nearestSlide(track);
    const current = atEnd ? track.children.length - 1 : _nearestSlide(track);
    dots.forEach((d, i) => {
      d.firstElementChild.classList.toggle("bg-white", i === current);
      d.firstElementChild.classList.toggle("bg-white/25", i !== current);
      if (i === current) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current");
    });
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = atEnd;
  };
  const resnap = () => {
    if (!userScrolling) {
      const last = _lastReachableSlide(track);
      const i = Math.min(c.index, last);
      const want = i === last ? track.scrollWidth - track.clientWidth : _slideOffset(track, i);
      if (Math.abs(track.scrollLeft - want) > 2) goToCarousel(id, i, "auto");
    }
    update();
  };

  track.addEventListener("scroll", update, { passive: true, signal });
  // A swipe, drag or wheel is the user choosing a slide; anything else that
  // scrolls the track (a layout re-snap) must not change the index.
  for (const ev of ["pointerdown", "touchstart", "wheel"]) {
    track.addEventListener(ev, () => { userScrolling = true; }, { passive: true, signal });
  }
  for (const ev of ["pointerup", "touchend"]) {
    track.addEventListener(ev, () => setTimeout(() => { userScrolling = false; }, 600), { passive: true, signal });
  }
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); stepCarousel(id, 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); stepCarousel(id, -1); }
  }, { signal });
  // Not just window resize: the Tailwind CDN generates the slide-width CSS
  // after this markup is inserted, so the first measurement can predate it.
  const ro = new ResizeObserver(resnap);
  ro.observe(track);
  [...track.children].forEach((slide) => ro.observe(slide));
  signal.addEventListener("abort", () => ro.disconnect());
  update();
  _startCarouselAutoplay(id, section, track, signal);
}

function initHomeCarousels() {
  initCarousel("success-stories");
  initCarousel("top-repos");
}

const _extLinkIcon = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 17L17 7M9 7h8v8"/></svg>`;

function renderSuccessStoriesSection() {
  const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const postUrl = (s) => `https://www.linkedin.com/feed/update/urn:li:activity:${s.activity}/`;
  return renderCarousel({
    id: "success-stories", prefix: "stories", noun: "story", slideTestId: "story-slide",
    heading: "Success Stories", subtitle: "Automation work I've shipped, as I shared it on LinkedIn.",
    slides: SUCCESS_STORIES.map((s, i) => ({
      label: s.title,
      html: `
        <a href="${postUrl(s)}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true" class="block bg-slate-950 overflow-hidden">
          <img src="/static/img/success-stories/${s.slug}.webp" alt="${escHtml(s.alt)}" width="800" height="1000"
            ${i < 3 ? "" : 'loading="lazy"'} decoding="async" class="w-full aspect-[4/5] object-contain transition-transform duration-500 group-hover:scale-[1.03]" />
        </a>
        <div class="p-3 flex flex-col gap-1 flex-1">
          <time datetime="${s.date}" class="text-[11px] uppercase tracking-wider" style="color:rgba(255,255,255,.45)">${fmt(s.date)}</time>
          <h3 class="text-sm font-semibold text-white leading-snug">${escHtml(s.title)}</h3>
          <p class="text-xs leading-relaxed" style="color:rgba(255,255,255,.6)">${escHtml(s.summary)}</p>
          <a href="${postUrl(s)}" target="_blank" rel="noopener noreferrer" data-testid="story-link"
            aria-label="View on LinkedIn: ${escHtml(s.title)} (opens in a new tab)"
            class="mt-auto pt-2 text-xs font-semibold text-sky-300 hover:text-sky-200 inline-flex items-center gap-1">View on LinkedIn${_extLinkIcon}</a>
        </div>`,
    })),
  });
}

// ─── Open-Source Repositories ────────────────────────────────────────────────
// The owner's top public GitHub repos. Summaries, headline facts and stacks
// come from each repo's README (GitHub's own language/topic metadata is too
// sparse to describe them).
const TOP_REPOS = [
  { name: "test-case-management", title: "TestFlow",
    summary: "This site: AI-assisted test case management with real-time runs, five services and four test stacks.",
    fact: "706 tests across 4 layers",
    live: "https://test-case-management-omega.vercel.app",
    tech: ["Python", "FastAPI", "PostgreSQL", "Redis", "Playwright", "TypeScript", "Java", "Docker", "Kubernetes", "Terraform"] },
  { name: "automation-failure-orchestrator", title: "Agentic SOC Automation Orchestrator",
    summary: "SIEM alerts deduplicated, enriched, triaged and investigated, with human-approved responses. Deterministic code decides; AI agents only advise.",
    fact: "320 automated tests",
    tech: ["TypeScript", "Python", "AI Agents", "AWS SQS", "Terraform", "Docker", "Splunk", "Shuffle SOAR"] },
  { name: "playwright-kafka-microservices", title: "Playwright · Kafka · Microservices",
    summary: "E2E framework for an event-driven stack: REST APIs, Kafka flows, PostgreSQL and a React UI, with a Kubernetes deploy.",
    fact: "239 tests across 7 layers",
    live: "https://rabinavidan.github.io/playwright-kafka-microservices/reports/", liveLabel: "Live report",
    tech: ["Playwright", "TypeScript", "Kafka", "PostgreSQL", "React", "Docker", "Kubernetes"] },
  { name: "storguard-distributed-storage-testing", title: "StorGuard",
    summary: "Reliability, chaos and performance testing for a 4-node MinIO cluster: node loss, network faults and disk pressure.",
    fact: "190 tests across 11 layers",
    tech: ["Python", "pytest", "MinIO / S3", "Chaos Testing", "Jenkins", "Docker", "Prometheus", "Grafana", "Allure", "Local LLMs"] },
  { name: "appium-iOS-task-manager", title: "iOS Task Manager + Appium",
    summary: "A SwiftUI task manager built together with its Appium Java framework, run on a real iPhone in CI.",
    fact: "Real-device CI via WebDriverAgent",
    tech: ["Swift", "SwiftUI", "Java", "Appium", "XCUITest", "JUnit 5", "Allure", "GitHub Actions"] },
  { name: "TradeFlow", title: "TradeFlow Lite",
    summary: "Full-stack trade-finance workflow with a role-based review pipeline driven by a single state machine.",
    fact: "73 tests across the pyramid",
    tech: ["TypeScript", "React", "Express", "MongoDB", "Zod", "Vitest", "Playwright", "Docker", "Allure"] },
];

function renderTopReposSection() {
  // Every technology shared by two or more repos, ranked by how many use it
  // (ties keep first-seen order) - computed from the cards so they can't disagree.
  const counts = new Map();
  TOP_REPOS.forEach((r) => r.tech.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  const ranked = [...counts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
  const ghIcon = `<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 007.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 015.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0023.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>`;

  const techSummary = `
    <div class="mb-4" data-testid="repos-tech-summary">
      <p class="text-[11px] font-semibold uppercase tracking-wider mb-2" style="color:rgba(255,255,255,.45)">Technologies across these repos</p>
      <ul class="flex flex-wrap gap-1.5">
        ${ranked.map(([t, c]) => `
          <li data-testid="repos-tech" data-tech="${escHtml(t)}" data-count="${c}"
            class="text-[11px] font-medium text-white/85 bg-white/10 rounded-full pl-2.5 pr-1 py-0.5 inline-flex items-center gap-1">
            ${escHtml(t)}<span class="text-[11px] font-bold text-sky-200 bg-white/10 rounded-full px-1.5" aria-label="in ${c} repos">${c}</span>
          </li>`).join("")}
      </ul>
    </div>`;

  return renderCarousel({
    id: "top-repos", prefix: "repos", noun: "repository", slideTestId: "repo-card",
    heading: "Open-Source Repositories",
    subtitle: "Public projects on GitHub, and the stack behind each one. ",
    headerLink: `<a href="https://github.com/rabinavidan?tab=repositories" target="_blank" rel="noopener noreferrer"
      class="font-semibold text-sky-300 hover:text-sky-200 inline-flex items-center gap-1 whitespace-nowrap">All repositories${_extLinkIcon}</a>`,
    beforeTrack: techSummary,
    slides: TOP_REPOS.map((r) => {
      const url = `https://github.com/rabinavidan/${r.name}`;
      return {
        label: r.title,
        attrs: `data-repo="${escHtml(r.name)}"`,
        html: `
          <div class="p-4 flex flex-col gap-2 flex-1">
            <div class="flex items-start gap-2 text-white min-w-0">
              ${ghIcon}
              <h3 class="text-sm font-bold leading-snug">${escHtml(r.title)}</h3>
            </div>
            <p class="text-[11px] font-mono truncate -mt-1" style="color:rgba(255,255,255,.4)">rabinavidan/${escHtml(r.name)}</p>
            <p class="text-xs leading-relaxed" style="color:rgba(255,255,255,.65)">${escHtml(r.summary)}</p>
            <p class="text-xs font-semibold text-emerald-300" data-testid="repo-fact">${escHtml(r.fact)}</p>
            <ul class="flex flex-wrap gap-1" aria-label="Technologies">
              ${r.tech.map((t) => `<li class="text-[11px] font-medium text-sky-200 bg-sky-400/10 border border-sky-300/20 rounded-md px-1.5 py-0.5">${escHtml(t)}</li>`).join("")}
            </ul>
            <div class="mt-auto pt-2 flex items-center gap-3 text-xs font-semibold">
              <a href="${url}" target="_blank" rel="noopener noreferrer" data-testid="repo-code-link"
                aria-label="${escHtml(r.title)} source code on GitHub (opens in a new tab)"
                class="text-white/85 hover:text-white inline-flex items-center gap-1">Code${_extLinkIcon}</a>
              ${r.live ? `<a href="${r.live}" target="_blank" rel="noopener noreferrer" data-testid="repo-live-link"
                aria-label="${escHtml(r.title)} ${escHtml(r.liveLabel || "live demo")} (opens in a new tab)"
                class="text-sky-300 hover:text-sky-200 inline-flex items-center gap-1">${escHtml(r.liveLabel || "Live")}${_extLinkIcon}</a>` : ""}
            </div>
          </div>`,
      };
    }),
  });
}

// ─── Projects View ───────────────────────────────────────────────────────────
async function renderProjects() {
  state.currentProject = null;
  state.currentSuite = null;
  setBreadcrumb([{ label: "Projects", href: "projects" }]);

  const el = document.getElementById("view-projects");
  el.classList.remove("hidden");
  el.innerHTML = pageSkeleton();

  await loadSidebar();

  // Real architecture content, not admin-only tooling - visible to every
  // visitor (guest included) so "View Architecture" works without signing
  // in, per the portfolio plan's requirement.
  const archDiagram = `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6 overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <div>
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Live Architecture</p>
          <h2 class="text-base font-bold text-slate-800">TestFlow — Microservice Overview</h2>
        </div>
        <span class="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 arch-live-dot"></span>Live
        </span>
      </div>
      <div class="space-y-3">
        <!-- Row 1: Browser -->
        <div class="arch-row flex items-stretch gap-2 opacity-0" style="animation:archRowIn .35s ease forwards;animation-delay:0ms">
          <div class="w-24 flex-shrink-0 flex items-center">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Browser</span>
          </div>
          <div class="flex-1 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
            <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">🖥️</div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-blue-800">Vanilla JS SPA</p>
              <p class="text-[11px] text-blue-600 truncate">static/index.html · static/app.js · Hash routing · Tailwind CSS · Chart.js</p>
            </div>
            <div class="flex gap-1.5 flex-wrap justify-end">
              ${['index.html','app.js','TailwindCSS','Chart.js'].map(t=>`<span class="arch-tag bg-blue-100 text-blue-700">${t}</span>`).join('')}
            </div>
          </div>
        </div>
        <!-- Arrow -->
        <div class="arch-row flex items-center gap-2 opacity-0" style="animation:archRowIn .25s ease forwards;animation-delay:70ms">
          <div class="w-24"></div>
          <div class="flex-1 flex items-center gap-2 pl-4">
            <div class="h-px flex-1 bg-slate-200"></div>
            <span class="text-[11px] text-slate-500 font-medium arch-http-badge">HTTP / REST · WebSocket</span>
            <div class="h-px flex-1 bg-slate-200"></div>
          </div>
        </div>
        <!-- Row 2: Gateway -->
        <div class="arch-row flex items-stretch gap-2 opacity-0" style="animation:archRowIn .35s ease forwards;animation-delay:140ms">
          <div class="w-24 flex-shrink-0 flex items-center">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gateway</span>
          </div>
          <div class="flex-1 bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center gap-3">
            <div class="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">🔀</div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-indigo-800">API Gateway — services/gateway :8000</p>
              <p class="text-[11px] text-indigo-500 truncate">httpx proxy · WebSocket bridge · serves SPA · routes /api/* to downstream services</p>
            </div>
            <div class="flex gap-1.5 flex-wrap justify-end">
              ${['FastAPI','httpx','WebSocket bridge','Static SPA'].map(t=>`<span class="arch-tag bg-indigo-100 text-indigo-700">${t}</span>`).join('')}
            </div>
          </div>
        </div>
        <!-- Arrow fan-out -->
        <div class="arch-row flex items-center gap-2 opacity-0" style="animation:archRowIn .25s ease forwards;animation-delay:200ms">
          <div class="w-24"></div>
          <div class="flex-1 flex items-center gap-2 pl-4">
            <div class="h-px flex-1 bg-slate-200"></div>
            <span class="text-[11px] text-slate-500 font-medium arch-http-badge">HTTP route fan-out</span>
            <div class="h-px flex-1 bg-slate-200"></div>
          </div>
        </div>
        <!-- Row 3: Services -->
        <div class="arch-row flex items-stretch gap-2 opacity-0" style="animation:archRowIn .35s ease forwards;animation-delay:270ms">
          <div class="w-24 flex-shrink-0 flex items-center">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Services</span>
          </div>
          <div class="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
            ${[
              {icon:'🔑', name:'Auth',     port:':8001', desc:'JWT · login · users',               bg:'bg-amber-50',   border:'border-amber-200',   tag:'bg-amber-100 text-amber-700'},
              {icon:'📁', name:'Projects', port:':8002', desc:'Projects · suites · test cases',    bg:'bg-violet-50',  border:'border-violet-200',  tag:'bg-violet-100 text-violet-700'},
              {icon:'▶️', name:'Runs',     port:':8003', desc:'Runs · results · WebSocket · Redis',bg:'bg-emerald-50', border:'border-emerald-200', tag:'bg-emerald-100 text-emerald-700'},
              {icon:'🤖', name:'AI',       port:':8004', desc:'Claude Haiku generation',           bg:'bg-fuchsia-50', border:'border-fuchsia-200', tag:'bg-fuchsia-100 text-fuchsia-700'},
            ].map(s => `
              <div class="${s.bg} border ${s.border} rounded-xl p-3 flex flex-col gap-1.5">
                <div class="flex items-center gap-1.5">
                  <span class="text-base">${s.icon}</span>
                  <div class="min-w-0">
                    <p class="text-[11px] font-bold text-slate-800 truncate">${s.name} <span class="font-normal text-slate-500">${s.port}</span></p>
                  </div>
                </div>
                <p class="text-[11px] text-slate-500 leading-relaxed">${s.desc}</p>
              </div>`).join('')}
          </div>
        </div>
        <!-- Arrow -->
        <div class="arch-row flex items-center gap-2 opacity-0" style="animation:archRowIn .25s ease forwards;animation-delay:340ms">
          <div class="w-24"></div>
          <div class="flex-1 flex items-center gap-2 pl-4">
            <div class="h-px flex-1 bg-slate-200"></div>
            <span class="text-[11px] text-slate-500 font-medium arch-http-badge">ORM / SQL · Redis Pub/Sub</span>
            <div class="h-px flex-1 bg-slate-200"></div>
          </div>
        </div>
        <!-- Row 4: Storage -->
        <div class="arch-row flex items-stretch gap-2 opacity-0" style="animation:archRowIn .35s ease forwards;animation-delay:410ms">
          <div class="w-24 flex-shrink-0 flex items-center">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Storage</span>
          </div>
          <div class="flex-1 flex gap-2">
            <div class="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
              <div class="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">🗄️</div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-emerald-800">PostgreSQL 16</p>
                <p class="text-[11px] text-emerald-700">Schemas: auth · projects · runs</p>
              </div>
            </div>
            <div class="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
              <div class="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">⚡</div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-red-800">Redis 7</p>
                <p class="text-[11px] text-red-600">Pub/Sub · runs.completed events</p>
              </div>
            </div>
            <div class="flex-1 bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-3 flex items-center gap-2">
              <div class="w-8 h-8 bg-fuchsia-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">🤖</div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-fuchsia-800">Anthropic Claude Haiku</p>
                <p class="text-[11px] text-fuchsia-600">External AI API · test generation</p>
              </div>
            </div>
          </div>
        </div>
        <!-- Row 5: CI/CD -->
        <div class="arch-row flex items-stretch gap-2 opacity-0 mt-1" style="animation:archRowIn .35s ease forwards;animation-delay:500ms">
          <div class="w-24 flex-shrink-0 flex items-center">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">CI / Deploy</span>
          </div>
          <div class="flex-1 flex gap-2">
            <div class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
              <div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">🔄</div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-slate-700">GitHub Actions</p>
                <p class="text-[11px] text-slate-500">pytest API · Playwright E2E · Job summary</p>
              </div>
            </div>
            <div class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
              <div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">▲</div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-slate-700">Vercel</p>
                <p class="text-[11px] text-slate-500">Monolith serverless · Preview per PR</p>
              </div>
            </div>
            <div class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
              <div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">🐳</div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-slate-700">Docker Compose</p>
                <p class="text-[11px] text-slate-500">Microservice mode · 5 containers + Redis</p>
              </div>
            </div>
            <div class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
              <div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">🧪</div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-slate-700">Tests</p>
                <p class="text-[11px] text-slate-500">pytest · Playwright POM · MCP tools</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <style>
      @keyframes archRowIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
      .arch-tag { font-size:11px; font-weight:600; padding:1px 6px; border-radius:999px; }
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
        <h2 class="text-white text-lg font-bold mb-5">End-to-end test management pipeline</h2>

        <!-- Pipeline steps with descriptions -->
        <div class="flex items-stretch gap-1.5 sm:gap-2 mb-5 overflow-x-auto pb-1" id="tf-demo">
          ${[
            {icon:'📁', label:'Project',   desc:'Organise work into projects — one per app, service or team', color:'bg-blue-500/80',   delay:0},
            {icon:'🗂️', label:'Suite',     desc:'Group related test cases by feature or user flow',           color:'bg-indigo-500/80', delay:150},
            {icon:'✅', label:'Test Case', desc:'Define steps, expected result, priority and status',          color:'bg-violet-500/80', delay:300},
            {icon:'▶️', label:'Run',       desc:'Kick off a run and mark each case pass, fail or skip',        color:'bg-purple-500/80', delay:450},
            {icon:'📊', label:'Results',   desc:'See pass/fail/skip stats and track quality over time',        color:'bg-emerald-500/80',delay:600},
          ].map((n,i,arr) => `
            <div class="flex items-stretch gap-1.5 sm:gap-2 flex-shrink-0">
              <div class="demo-node opacity-0 flex flex-col gap-2 rounded-xl p-3 w-28 sm:w-32" style="animation:demoNodeIn .4s ease forwards;animation-delay:${n.delay}ms;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15)">
                <div class="${n.color} w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-lg demo-pulse flex-shrink-0" style="animation-delay:${n.delay}ms">${n.icon}</div>
                <div>
                  <p class="text-white text-xs font-bold mb-0.5">${n.label}</p>
                  <p class="text-[11px] leading-relaxed" style="color:rgba(191,219,254,.75)">${n.desc}</p>
                </div>
              </div>
              ${i < arr.length-1 ? `<div class="demo-arrow self-center text-blue-300/60 text-lg font-bold opacity-0 flex-shrink-0" style="animation:demoNodeIn .3s ease forwards;animation-delay:${n.delay+100}ms">→</div>` : ''}
            </div>
          `).join('')}
        </div>

        <!-- Key feature highlights -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          ${[
            {icon:'🤖', label:'AI Generation',    desc:'Claude Haiku generates test cases from feature descriptions'},
            {icon:'⚡', label:'Live Collab',      desc:'WebSocket real-time run updates across all tabs'},
            {icon:'📈', label:'Analytics',        desc:'Chart.js pass-rate trends & suite coverage'},
            {icon:'🐳', label:'Docker Ready',     desc:'Docker Compose + Postgres 16 one-command setup'},
            {icon:'🔍', label:'Filter & Search',  desc:'Find projects and cases instantly'},
            {icon:'🏷️', label:'Priority Levels',  desc:'Critical · High · Medium · Low'},
            {icon:'📝', label:'Run Notes',        desc:'Add comments per test result'},
            {icon:'🔄', label:'CI / CD Ready',    desc:'GitHub Actions + Playwright E2E'},
          ].map(f => `
            <div class="flex items-center gap-2 rounded-xl p-2.5" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)">
              <span class="text-base flex-shrink-0">${f.icon}</span>
              <div class="min-w-0">
                <p class="text-white text-[11px] font-bold truncate">${f.label}</p>
                <p class="text-[11px] truncate" style="color:rgba(191,219,254,.6)">${f.desc}</p>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Animated run status bar -->
        <div class="bg-blue-900/40 rounded-lg p-3 flex items-center gap-3">
          <div class="flex gap-1 flex-shrink-0">
            <span class="w-2 h-2 rounded-full bg-emerald-400 demo-blink" style="animation-delay:0ms"></span>
            <span class="w-2 h-2 rounded-full bg-emerald-400 demo-blink" style="animation-delay:200ms"></span>
            <span class="w-2 h-2 rounded-full bg-yellow-400 demo-blink" style="animation-delay:400ms"></span>
            <span class="w-2 h-2 rounded-full bg-emerald-400 demo-blink" style="animation-delay:600ms"></span>
            <span class="w-2 h-2 rounded-full bg-red-400 demo-blink" style="animation-delay:800ms"></span>
          </div>
          <div class="flex-1 bg-blue-900/50 rounded-full h-1.5 overflow-hidden">
            <div class="h-full bg-emerald-400 rounded-full demo-bar"></div>
          </div>
          <span class="text-emerald-300 text-xs font-bold demo-counter flex-shrink-0">80% pass rate</span>
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
          <button id="demo-journey-btn" onclick="openUserJourneyDemo()"
            class="journey-btn-pulse bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-sm font-bold px-5 py-2 rounded-xl transition-colors flex items-center gap-2 border border-white/20 shadow-lg">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span>▶ Watch User Journey Demo</span>
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
      .journey-btn-pulse { animation: journeyBtnPulse 2.2s ease-in-out infinite; }
      @keyframes journeyBtnPulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.5)} 50%{box-shadow:0 0 0 8px rgba(16,185,129,0)} }
    </style>
  `;

  const techStackBanner = !getToken() ? `
    <div class="relative rounded-2xl mb-6 overflow-hidden" style="background:linear-gradient(135deg,#050d1a,#0a1830,#07122a)">
      <!-- Grid background -->
      <div class="absolute inset-0 pointer-events-none" style="background-image:linear-gradient(rgba(56,189,248,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.04) 1px,transparent 1px);background-size:32px 32px"></div>
      <!-- Glow orbs -->
      <div class="absolute pointer-events-none" style="top:-60px;left:-40px;width:320px;height:320px;background:radial-gradient(circle,rgba(56,189,248,.1) 0%,transparent 65%)"></div>
      <div class="absolute pointer-events-none" style="bottom:-60px;right:-40px;width:280px;height:280px;background:radial-gradient(circle,rgba(139,92,246,.1) 0%,transparent 65%)"></div>

      <div class="relative z-10 p-5 sm:p-6">
        <!-- Header row -->
        <div class="flex items-start justify-between mb-5 flex-wrap gap-3">
          <div>
            <p class="text-[11px] font-bold uppercase tracking-[.22em] mb-1" style="color:rgba(56,189,248,.65)">E2E · API · Integration</p>
            <h2 class="text-lg sm:text-xl font-extrabold text-white">Playwright Test Architecture</h2>
          </div>
          <!-- Stat chips -->
          <div class="flex gap-2 flex-wrap">
            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style="background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.25)">
              <span class="text-sm font-black text-sky-300">16</span>
              <span class="text-[11px] font-bold uppercase tracking-wider" style="color:rgba(56,189,248,.6)">E2E</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style="background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.25)">
              <span class="text-sm font-black text-violet-300">20</span>
              <span class="text-[11px] font-bold uppercase tracking-wider" style="color:rgba(139,92,246,.6)">API</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style="background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.25)">
              <span class="relative flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span></span>
              <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-300/80">Live CI</span>
            </div>
          </div>
        </div>

        <!-- Layer 1: Test Specs -->
        <div class="mb-1">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-[11px] font-bold uppercase tracking-[.2em]" style="color:rgba(56,189,248,.5)">Test Specs</span>
            <div class="flex-1 h-px" style="background:rgba(56,189,248,.12)"></div>
            <span class="text-[11px] font-mono" style="color:rgba(255,255,255,.2)">e2e/tests/</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            ${[
              {icon:'📁', name:'projects',  count:'4 tests',  delay:0},
              {icon:'🗂️', name:'suites',    count:'4 tests',  delay:70},
              {icon:'✅', name:'testcases', count:'4 tests',  delay:140},
              {icon:'▶️', name:'runs',      count:'4 tests',  delay:210},
            ].map(s => `
              <div class="rounded-xl p-2.5 flex items-center gap-2.5 opacity-0" style="animation:pwArchIn .4s cubic-bezier(.22,1,.36,1) forwards;animation-delay:${s.delay}ms;background:rgba(56,189,248,.07);border:1px solid rgba(56,189,248,.18)">
                <span class="text-base">${s.icon}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-[11px] font-semibold text-sky-200 truncate">${s.name}.spec.ts</p>
                  <p class="text-[11px]" style="color:rgba(56,189,248,.45)">${s.count}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Connector A -->
        <div class="flex justify-around items-center py-1 opacity-0" style="animation:pwArchIn .3s ease forwards;animation-delay:300ms">
          ${[0, 250, 500].map(d => `
            <div class="flex flex-col items-center gap-0.5">
              <div class="w-px h-3" style="background:rgba(139,92,246,.3)"></div>
              <div class="w-1.5 h-1.5 rounded-full pw-arch-dot" style="background:rgba(139,92,246,.8);animation-delay:${d}ms"></div>
              <div class="w-px h-3" style="background:rgba(139,92,246,.3)"></div>
            </div>
          `).join('')}
        </div>

        <!-- Layer 2: POM / Auth Fixture / API Client -->
        <div class="grid grid-cols-3 gap-2 mb-1 opacity-0" style="animation:pwArchIn .4s cubic-bezier(.22,1,.36,1) forwards;animation-delay:350ms">
          <div class="rounded-xl p-3 flex flex-col gap-1.5" style="background:rgba(139,92,246,.09);border:1px solid rgba(139,92,246,.22)">
            <div class="flex items-center gap-1.5 mb-0.5">
              <div class="w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0" style="background:rgba(139,92,246,.25)">📄</div>
              <p class="text-[11px] font-bold text-violet-300">Page Objects</p>
            </div>
            <p class="text-[11px] leading-relaxed" style="color:rgba(139,92,246,.6)">BasePage · ProjectsPage · SuitePage · RunPage</p>
            <p class="text-[11px]" style="color:rgba(139,92,246,.4)">locators · waitFor · POM pattern</p>
          </div>
          <div class="rounded-xl p-3 flex flex-col gap-1.5" style="background:rgba(99,102,241,.09);border:1px solid rgba(99,102,241,.22)">
            <div class="flex items-center gap-1.5 mb-0.5">
              <div class="w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0" style="background:rgba(99,102,241,.25)">🔑</div>
              <p class="text-[11px] font-bold text-indigo-300">Auth Fixture</p>
            </div>
            <p class="text-[11px] leading-relaxed" style="color:rgba(99,102,241,.6)">authToken · authedRequest · JWT</p>
            <p class="text-[11px]" style="color:rgba(99,102,241,.4)">beforeEach · afterEach cleanup</p>
          </div>
          <div class="rounded-xl p-3 flex flex-col gap-1.5" style="background:rgba(20,184,166,.08);border:1px solid rgba(20,184,166,.2)">
            <div class="flex items-center gap-1.5 mb-0.5">
              <div class="w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0" style="background:rgba(20,184,166,.2)">🌐</div>
              <p class="text-[11px] font-bold text-teal-300">API Client</p>
            </div>
            <p class="text-[11px] leading-relaxed" style="color:rgba(20,184,166,.55)">request fixture · REST calls</p>
            <p class="text-[11px]" style="color:rgba(20,184,166,.35)">/api/projects · /api/runs</p>
          </div>
        </div>

        <!-- Connector B -->
        <div class="flex justify-around items-center py-1 opacity-0" style="animation:pwArchIn .3s ease forwards;animation-delay:500ms">
          ${[100, 400].map(d => `
            <div class="flex flex-col items-center gap-0.5">
              <div class="w-px h-3" style="background:rgba(16,185,129,.3)"></div>
              <div class="w-1.5 h-1.5 rounded-full pw-arch-dot" style="background:rgba(16,185,129,.8);animation-delay:${d}ms"></div>
              <div class="w-px h-3" style="background:rgba(16,185,129,.3)"></div>
            </div>
          `).join('')}
        </div>

        <!-- Layer 3: Playwright Browser + MCP -->
        <div class="grid grid-cols-2 gap-2 mb-1 opacity-0" style="animation:pwArchIn .4s cubic-bezier(.22,1,.36,1) forwards;animation-delay:550ms">
          <div class="rounded-xl p-3 flex items-center gap-3" style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2)">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style="background:rgba(16,185,129,.2)">🎭</div>
            <div class="min-w-0">
              <p class="text-[11px] font-bold text-emerald-300">Playwright Browser</p>
              <p class="text-[11px] truncate" style="color:rgba(16,185,129,.5)">Chromium · headless · locators · assertions</p>
            </div>
          </div>
          <div class="rounded-xl p-3 flex items-center gap-3" style="background:rgba(124,58,237,.09);border:1px solid rgba(124,58,237,.22)">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style="background:rgba(124,58,237,.2)">🤖</div>
            <div class="min-w-0">
              <p class="text-[11px] font-bold text-violet-300">MCP Browser Tools</p>
              <p class="text-[11px] truncate" style="color:rgba(124,58,237,.55)">browser_navigate · snapshot · click · AI-assisted</p>
            </div>
          </div>
        </div>

        <!-- Connector C -->
        <div class="flex justify-center items-center py-1 opacity-0" style="animation:pwArchIn .3s ease forwards;animation-delay:680ms">
          <div class="flex flex-col items-center gap-0.5">
            <div class="w-px h-3" style="background:rgba(251,191,36,.3)"></div>
            <div class="w-1.5 h-1.5 rounded-full pw-arch-dot" style="background:rgba(251,191,36,.9);animation-delay:200ms"></div>
            <div class="w-px h-3" style="background:rgba(251,191,36,.3)"></div>
          </div>
        </div>

        <!-- Layer 4: App Under Test -->
        <div class="rounded-xl p-3 flex items-center gap-3 opacity-0" style="animation:pwArchIn .4s cubic-bezier(.22,1,.36,1) forwards;animation-delay:720ms;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.18)">
          <div class="w-8 h-8 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style="background:rgba(251,191,36,.15)">🧪</div>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-bold text-yellow-200">TestFlow SPA — App Under Test</p>
            <p class="text-[11px]" style="color:rgba(251,191,36,.5)">Projects · Suites · Test Cases · Runs · FastAPI · PostgreSQL</p>
          </div>
          <!-- Animated test result dots -->
          <div class="flex gap-1 flex-shrink-0">
            ${['#34d399','#34d399','#34d399','#fbbf24','#34d399'].map((c,i) => `<span class="w-2 h-2 rounded-full pw-arch-res" style="background:${c};animation-delay:${i*280}ms"></span>`).join('')}
          </div>
        </div>

        <!-- Bottom strip -->
        <div class="mt-4 pt-4 flex items-center justify-between flex-wrap gap-3 opacity-0" style="animation:pwArchIn .4s ease forwards;animation-delay:900ms;border-top:1px solid rgba(255,255,255,.07)">
          <div class="flex items-center gap-2">
            <span class="text-base">🎭</span>
            <p class="text-[11px]" style="color:rgba(255,255,255,.4)">
              <span class="font-semibold" style="color:rgba(56,189,248,.8)">Playwright TypeScript</span> · Page Object Model · Auth Fixtures · MCP Integration
            </p>
          </div>
          <div class="flex gap-2">
            <span class="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md" style="background:rgba(255,255,255,.05);color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.08)">TypeScript</span>
            <span class="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md" style="background:rgba(255,255,255,.05);color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.08)">GitHub Actions CI</span>
          </div>
        </div>
      </div>
    </div>
    <style>
      @keyframes pwArchIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      .pw-arch-dot { animation: pwDotPulse 1.6s ease-in-out infinite; }
      @keyframes pwDotPulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.4)} }
      .pw-arch-res { animation: pwResPulse 2.2s ease-in-out infinite; }
      @keyframes pwResPulse { 0%,100%{opacity:.35} 50%{opacity:1} }
    </style>
  ` : "";

  const sysArchBanner = !getToken() ? `
    <div class="relative rounded-2xl mb-6 overflow-hidden" style="background:linear-gradient(135deg,#020c1b,#071428,#030d1c)">
      <!-- Grid -->
      <div class="absolute inset-0 pointer-events-none" style="background-image:linear-gradient(rgba(99,102,241,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.05) 1px,transparent 1px);background-size:28px 28px"></div>
      <!-- Glow orbs -->
      <div class="absolute pointer-events-none" style="top:-80px;left:-60px;width:360px;height:360px;background:radial-gradient(circle,rgba(99,102,241,.12) 0%,transparent 65%)"></div>
      <div class="absolute pointer-events-none" style="bottom:-60px;right:-40px;width:300px;height:300px;background:radial-gradient(circle,rgba(16,185,129,.09) 0%,transparent 65%)"></div>

      <div class="relative z-10 p-5 sm:p-6">
        <!-- Header -->
        <div class="flex items-start justify-between mb-5 flex-wrap gap-3">
          <div>
            <p class="text-[11px] font-bold uppercase tracking-[.22em] mb-1 sys-arch-label">Microservice · Event-Driven · Real-time</p>
            <h2 class="text-lg sm:text-xl font-extrabold text-white">System Architecture</h2>
          </div>
          <div class="flex gap-2 flex-wrap">
            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style="background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.28)">
              <span class="text-sm font-black text-indigo-300">5</span>
              <span class="text-[11px] font-bold uppercase tracking-wider" style="color:rgba(99,102,241,.6)">Services</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25)">
              <span class="relative flex h-2 w-2 flex-shrink-0"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span></span>
              <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-300/80">Live WS</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2)">
              <span class="text-sm font-black text-yellow-300">Redis</span>
              <span class="text-[11px] font-bold uppercase tracking-wider" style="color:rgba(251,191,36,.55)">Pub/Sub</span>
            </div>
          </div>
        </div>

        <!-- Row 1: Browser -->
        <div class="flex justify-center mb-1 opacity-0" style="animation:sysArchIn .4s cubic-bezier(.22,1,.36,1) forwards;animation-delay:0ms">
          <div class="rounded-xl px-5 py-2.5 flex items-center gap-3" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)">
            <span class="text-lg">🌐</span>
            <div>
              <p class="text-[11px] font-bold text-white">Browser SPA</p>
              <p class="text-[11px]" style="color:rgba(255,255,255,.35)">Vanilla JS · Hash routing · Chart.js · WebSocket</p>
            </div>
          </div>
        </div>

        <!-- Connector → Gateway (animated packet) -->
        <div class="flex justify-center items-center py-1 opacity-0" style="animation:sysArchIn .3s ease forwards;animation-delay:150ms">
          <div class="flex flex-col items-center gap-0.5 relative">
            <div class="w-px h-4" style="background:rgba(99,102,241,.35)"></div>
            <div class="sys-pkt" style="width:6px;height:6px;border-radius:50%;background:#6366f1;position:absolute;top:0;animation:sysPacket 1.8s ease-in-out infinite;animation-delay:0ms"></div>
            <div class="w-1.5 h-1.5 rounded-full" style="background:rgba(99,102,241,.8)"></div>
            <div class="w-px h-4" style="background:rgba(99,102,241,.35)"></div>
          </div>
        </div>

        <!-- Row 2: Gateway -->
        <div class="flex justify-center mb-1 opacity-0" style="animation:sysArchIn .4s cubic-bezier(.22,1,.36,1) forwards;animation-delay:200ms">
          <div class="rounded-xl px-5 py-2.5 flex items-center gap-3 w-full max-w-sm" style="background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.3)">
            <span class="text-lg">🔀</span>
            <div class="flex-1 min-w-0">
              <p class="text-[11px] font-bold text-indigo-200">API Gateway <span class="text-[11px] font-mono text-indigo-400">:8000</span></p>
              <p class="text-[11px]" style="color:rgba(99,102,241,.55)">httpx proxy · WebSocket bridge · Static SPA serving</p>
            </div>
            <div class="sys-scan-bar flex-shrink-0" style="width:36px;height:4px;border-radius:2px;background:rgba(99,102,241,.15);overflow:hidden">
              <div style="height:100%;width:30%;background:rgba(99,102,241,.8);border-radius:2px;animation:sysGwScan 1.4s ease-in-out infinite"></div>
            </div>
          </div>
        </div>

        <!-- Connector Gateway → 4 services (fan-out) -->
        <div class="flex justify-around items-start py-1 opacity-0" style="animation:sysArchIn .3s ease forwards;animation-delay:340ms">
          ${[
            {color:'rgba(56,189,248,.6)', delay:0},
            {color:'rgba(16,185,129,.6)', delay:120},
            {color:'rgba(251,113,133,.6)', delay:240},
            {color:'rgba(251,191,36,.6)', delay:360},
          ].map(s => `
            <div class="flex flex-col items-center gap-0.5 relative">
              <div class="w-px h-3" style="background:${s.color}"></div>
              <div class="w-1.5 h-1.5 rounded-full sys-fanpkt" style="background:${s.color};animation-delay:${s.delay + 'ms'}"></div>
              <div class="w-px h-3" style="background:${s.color}"></div>
            </div>
          `).join('')}
        </div>

        <!-- Row 3: 4 services -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-1 opacity-0" style="animation:sysArchIn .5s cubic-bezier(.22,1,.36,1) forwards;animation-delay:380ms">
          ${[
            {icon:'🔐', name:'Auth',     port:':8001', desc:'JWT · Register · Login · Roles', bg:'rgba(56,189,248,.08)', border:'rgba(56,189,248,.22)', title:'text-sky-300'},
            {icon:'📋', name:'Projects', port:':8002', desc:'CRUD · Suites · Cases · Analytics', bg:'rgba(16,185,129,.07)', border:'rgba(16,185,129,.2)',  title:'text-emerald-300'},
            {icon:'▶️', name:'Runs',     port:':8003', desc:'Results · WebSocket · Redis events', bg:'rgba(251,113,133,.07)', border:'rgba(251,113,133,.2)', title:'text-pink-300'},
            {icon:'🤖', name:'AI',       port:':8004', desc:'Claude Haiku · Test generation', bg:'rgba(251,191,36,.06)', border:'rgba(251,191,36,.18)', title:'text-yellow-300'},
          ].map((s,i) => `
            <div class="rounded-xl p-2.5 flex flex-col gap-1 opacity-0" style="animation:sysArchIn .4s cubic-bezier(.22,1,.36,1) forwards;animation-delay:${420+i*60}ms;background:${s.bg};border:1px solid ${s.border}">
              <div class="flex items-center gap-1.5">
                <span class="text-base">${s.icon}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-[11px] font-bold ${s.title} leading-none">${s.name}</p>
                  <p class="text-[11px] font-mono" style="color:rgba(255,255,255,.25)">${s.port}</p>
                </div>
              </div>
              <p class="text-[11px] leading-relaxed" style="color:rgba(255,255,255,.35)">${s.desc}</p>
              <div class="h-0.5 rounded-full overflow-hidden" style="background:rgba(255,255,255,.06)">
                <div class="h-full rounded-full sys-svc-bar" style="background:${s.border};animation-delay:${i*200}ms"></div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Connector → storage -->
        <div class="flex justify-around items-center py-1 opacity-0" style="animation:sysArchIn .3s ease forwards;animation-delay:680ms">
          ${[
            {color:'rgba(168,85,247,.55)', delay:0},
            {color:'rgba(251,191,36,.55)', delay:200},
            {color:'rgba(239,68,68,.55)', delay:400},
          ].map(s => `
            <div class="flex flex-col items-center gap-0.5 relative">
              <div class="w-px h-3" style="background:${s.color}"></div>
              <div class="w-1.5 h-1.5 rounded-full sys-storepkt" style="background:${s.color};animation-delay:${s.delay + 'ms'}"></div>
              <div class="w-px h-3" style="background:${s.color}"></div>
            </div>
          `).join('')}
        </div>

        <!-- Row 4: Storage -->
        <div class="grid grid-cols-3 gap-2 mb-4 opacity-0" style="animation:sysArchIn .5s cubic-bezier(.22,1,.36,1) forwards;animation-delay:720ms">
          <div class="rounded-xl p-2.5 flex flex-col gap-1" style="background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.22)">
            <div class="flex items-center gap-1.5 mb-0.5">
              <span class="text-base">🐘</span>
              <p class="text-[11px] font-bold text-purple-300">PostgreSQL 16</p>
            </div>
            <div class="flex flex-col gap-0.5">
              ${['auth','projects','runs'].map((s,i) => `
                <div class="flex items-center gap-1.5">
                  <div class="w-1.5 h-1.5 rounded-sm flex-shrink-0" style="background:rgba(168,85,247,${.4+i*.2})"></div>
                  <p class="text-[11px] font-mono" style="color:rgba(168,85,247,.6)">schema: ${s}</p>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="rounded-xl p-2.5 flex flex-col gap-1" style="background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.2)">
            <div class="flex items-center gap-1.5 mb-0.5">
              <span class="text-base">⚡</span>
              <p class="text-[11px] font-bold text-yellow-300">Redis 7</p>
            </div>
            <p class="text-[11px]" style="color:rgba(251,191,36,.55)">Pub/Sub channel</p>
            <div class="flex items-center gap-1.5 mt-0.5">
              <div class="w-1.5 h-1.5 rounded-full sys-redis-dot"></div>
              <p class="text-[11px] font-mono" style="color:rgba(251,191,36,.4)">runs.completed</p>
            </div>
          </div>
          <div class="rounded-xl p-2.5 flex flex-col gap-1" style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.18)">
            <div class="flex items-center gap-1.5 mb-0.5">
              <span class="text-base">🧠</span>
              <p class="text-[11px] font-bold text-red-300">Anthropic</p>
            </div>
            <p class="text-[11px]" style="color:rgba(239,68,68,.5)">Claude Haiku</p>
            <p class="text-[11px]" style="color:rgba(239,68,68,.35)">Test generation</p>
          </div>
        </div>

        <!-- Bottom strip: legend -->
        <div class="pt-4 flex items-center justify-between flex-wrap gap-3 opacity-0" style="animation:sysArchIn .4s ease forwards;animation-delay:900ms;border-top:1px solid rgba(255,255,255,.07)">
          <div class="flex flex-wrap gap-3">
            ${[
              {dot:'#6366f1', label:'HTTP/REST (httpx)'},
              {dot:'#fbbf24', label:'Redis Pub/Sub'},
              {dot:'#34d399', label:'WebSocket (live)'},
              {dot:'#f87171', label:'Anthropic API'},
            ].map(l => `
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${l.dot}"></span>
                <span class="text-[11px]" style="color:rgba(255,255,255,.35)">${l.label}</span>
              </div>
            `).join('')}
          </div>
          <div class="flex gap-2">
            <span class="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md" style="background:rgba(255,255,255,.05);color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.08)">Docker Compose</span>
            <span class="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md" style="background:rgba(255,255,255,.05);color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.08)">FastAPI</span>
          </div>
        </div>
      </div>
    </div>
    <style>
      @keyframes sysArchIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      @keyframes sysPacket { 0%{top:0;opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{top:100%;opacity:0} }
      @keyframes sysGwScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }
      .sys-fanpkt { animation: sysFanPulse 1.4s ease-in-out infinite; }
      @keyframes sysFanPulse { 0%,100%{opacity:.3;transform:scale(.7)} 50%{opacity:1;transform:scale(1.5)} }
      .sys-storepkt { animation: sysStorePulse 2s ease-in-out infinite; }
      @keyframes sysStorePulse { 0%,100%{opacity:.25;transform:scale(.8)} 50%{opacity:1;transform:scale(1.4)} }
      .sys-svc-bar { animation: sysSvcBar 3s ease-in-out infinite alternate; width: 40%; }
      @keyframes sysSvcBar { from{width:30%} to{width:90%} }
      .sys-redis-dot { width:6px;height:6px;border-radius:50%;background:#fbbf24;animation:sysRedisPulse 1.2s ease-in-out infinite; }
      @keyframes sysRedisPulse { 0%,100%{opacity:.3;box-shadow:0 0 0 0 rgba(251,191,36,0)} 50%{opacity:1;box-shadow:0 0 0 4px rgba(251,191,36,.2)} }
      .sys-arch-label {
        background: linear-gradient(90deg,#818cf8,#f472b6,#34d399,#fbbf24,#818cf8);
        background-size: 250% auto;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: sysLabelShine 2.8s linear infinite, sysLabelFlash 1.4s ease-in-out infinite;
      }
      @keyframes sysLabelShine { to { background-position: 250% center; } }
      @keyframes sysLabelFlash { 0%,100%{opacity:1;filter:brightness(1)} 50%{opacity:.65;filter:brightness(1.6)} }
    </style>
  ` : "";

  const ownerCard = !getToken() ? `
    <div class="relative rounded-2xl mb-6 overflow-hidden opacity-0 owner-banner" style="animation:techCardIn .5s ease forwards;animation-delay:50ms;min-height:160px;background:linear-gradient(120deg,#020b18 0%,#041830 40%,#061f3a 60%,#050d20 100%)">
      <!-- Animated grid -->
      <div class="absolute inset-0 pointer-events-none" style="background-image:linear-gradient(rgba(0,180,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,.06) 1px,transparent 1px);background-size:36px 36px"></div>
      <!-- Horizontal scan line -->
      <div class="absolute inset-x-0 pointer-events-none owner-scan" style="height:1px;background:linear-gradient(90deg,transparent,rgba(0,200,255,.4),transparent)"></div>
      <!-- Glow orbs -->
      <div class="absolute pointer-events-none" style="top:-40px;left:-40px;width:220px;height:220px;background:radial-gradient(circle,rgba(0,100,255,.18) 0%,transparent 70%)"></div>
      <div class="absolute pointer-events-none" style="bottom:-30px;right:80px;width:180px;height:180px;background:radial-gradient(circle,rgba(0,180,255,.12) 0%,transparent 70%)"></div>
      <!-- Diamond sparkle (bottom-right like original) -->
      <div class="absolute bottom-3 right-4 text-white/20 text-2xl select-none pointer-events-none">✦</div>

      <!-- Content -->
      <div class="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6 p-6">
        <!-- Left: headline copy styled like the banner -->
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-bold uppercase tracking-[.25em] mb-2" style="color:rgba(0,200,255,.7)">Automation Team Lead | AI-First Quality Engineering</p>
          <div class="blur-in"><h2 class="text-xl sm:text-2xl font-black leading-tight mb-1 owner-title-flash">Leading Automation Architecture &amp;<br>AI-Driven Quality Strategy</h2></div>
          <p class="text-xs mb-4" data-testid="hero-leadership" style="color:rgba(100,200,255,.75)">10+ years in automation · leading QA &amp; automation teams across Israel, USA and India</p>
          <!-- Meta row -->
          <div class="flex flex-wrap items-center gap-3 text-[11px]" style="color:rgba(255,255,255,.5)">
            <span class="flex items-center gap-1.5"><span style="color:rgba(0,200,255,.6)">🏢</span><span class="font-semibold text-white/70">ZoomInfo</span></span>
            <span class="flex items-center gap-1.5"><span style="color:rgba(0,200,255,.6)">🎓</span><span class="font-semibold text-white/70">AFEKA / Tel Aviv University Branch</span></span>
            <span class="flex items-center gap-1.5"><span style="color:rgba(0,200,255,.6)">📍</span>Tel Aviv District, Israel</span>
          </div>
        </div>

        <!-- Right: name + badges + CTA -->
        <div class="flex flex-col items-start sm:items-end gap-3 flex-shrink-0">
          <div class="flex items-center gap-2 flex-wrap sm:justify-end">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-base font-black text-white flex-shrink-0" style="background:linear-gradient(135deg,#1d6ff5,#5b44f2);box-shadow:0 0 16px rgba(59,130,246,.5)">RA</div>
            <div>
              <p class="text-sm font-bold text-white">Rabin Avidan</p>
              <div class="flex gap-1.5 mt-0.5 flex-wrap">
                <span class="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style="background:rgba(59,130,246,.2);color:#93c5fd;border:1px solid rgba(59,130,246,.3)">Site Owner</span>
                <span class="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full owner-open-badge" style="background:rgba(16,185,129,.15);color:#6ee7b7;border:1px solid rgba(52,211,153,.3)">Open to Opportunities</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Primary hero actions, in order: Take the Tour, Download CV, Explore Live Demo, View GitHub, Connect on LinkedIn.
           (The architecture has its own tab, so it no longer needs a hero button.)
           The tour leads: it is the shortest guided path for a first-time visitor. -->
      <div class="relative z-10 flex flex-wrap items-center gap-2 px-6 pb-6" data-testid="hero-cta-row">
        <button type="button" data-testid="hero-tour-btn" onclick="startRecruiterTour(this)"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-900 text-xs font-bold transition-all hover:scale-105 hover:bg-blue-50"
          style="box-shadow:0 4px 16px rgba(255,255,255,.18)">
          <span aria-hidden="true">🧭</span>
          Take the 3-min Tour
        </button>
        <a href="/static/Rabin_Avidan_CV.pdf" download="Rabin_Avidan_Automation_Team_Lead_CV.pdf" data-testid="hero-cv-btn"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-bold transition-all hover:scale-105"
          style="background:linear-gradient(135deg,#6d28d9,#9333ea);box-shadow:0 4px 16px rgba(139,92,246,.4)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>
          Download CV
        </a>
        <button type="button" id="hero-demo-btn" data-testid="hero-explore-demo-btn"
          onclick="viewOrCreateDemo('testflow', {btnId: 'hero-demo-btn', labelId: 'hero-demo-label'})"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-bold transition-all hover:scale-105"
          style="background:linear-gradient(135deg,#059669,#10b981);box-shadow:0 4px 16px rgba(16,185,129,.35)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span id="hero-demo-label">Explore Live Demo</span>
        </button>
        <a href="https://github.com/rabinavidan/test-case-management" target="_blank" rel="noopener noreferrer"
          data-testid="hero-github-btn"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-bold transition-all hover:scale-105 border border-white/10"
          style="background:rgba(255,255,255,.08)">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.744.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
          View GitHub
        </a>
        <a href="https://www.linkedin.com/in/rabin-avidan-1aab6653/" target="_blank" rel="noopener noreferrer"
          data-testid="hero-linkedin-btn"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-bold transition-all hover:scale-105"
          style="background:linear-gradient(135deg,#0a66c2,#0f8ce8);box-shadow:0 4px 16px rgba(10,102,194,.4)">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          Connect on LinkedIn
        </a>
      </div>

      <!-- Skills strip: one swipeable row on phones, so the hero leaves room for the tab bar on the first screen -->
      <div data-testid="hero-skills" class="relative z-10 border-t flex flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar gap-2 px-6 py-3" style="border-color:rgba(255,255,255,.07);background:rgba(0,0,0,.25)">
        ${['Test Automation','AI Vibe Coding','FastAPI','Playwright','pytest','CI/CD','PostgreSQL','Full-Stack Dev','ISTQB','MCSD'].map(s =>
          `<span class="text-[11px] font-semibold px-3 py-1 rounded-full flex-shrink-0 whitespace-nowrap" style="background:rgba(255,255,255,.07);color:rgba(180,220,255,.8);border:1px solid rgba(255,255,255,.1)">${s}</span>`
        ).join('')}
      </div>
    </div>
    <style>
      @keyframes techCardIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      .owner-scan { animation: ownerScan 4s ease-in-out infinite; }
      @keyframes ownerScan { 0%{top:0%;opacity:0} 10%{opacity:1} 90%{opacity:.3} 100%{top:100%;opacity:0} }
      .owner-open-badge { animation: openBadgePulse 3s ease-in-out infinite; }
      .owner-title-flash {
        background: linear-gradient(90deg,#ffffff,#60a5fa,#a78bfa,#34d399,#fbbf24,#f472b6,#ffffff);
        background-size: 300% auto;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: ownerTitleShine 3s linear infinite, ownerTitlePulse 1.6s ease-in-out infinite;
      }
      @keyframes ownerTitleShine { to { background-position: 300% center; } }
      @keyframes ownerTitlePulse { 0%,100%{filter:brightness(1) drop-shadow(0 0 8px rgba(96,165,250,.3))} 50%{filter:brightness(1.35) drop-shadow(0 0 20px rgba(167,139,250,.6))} }
      @keyframes openBadgePulse { 0%,100%{box-shadow:0 0 0 0 rgba(52,211,153,0)} 50%{box-shadow:0 0 10px 2px rgba(52,211,153,.25)} }
      .owner-banner { transition: box-shadow .3s; }
      .owner-banner:hover { box-shadow: 0 8px 40px rgba(0,100,255,.2); }
    </style>
  ` : "";

  // Always-visible version of the same static/animated AI-pipeline
  // walkthrough behind the "See the pipeline" button in
  // aiFirstEngineeringSection below — placed right under the hero so a
  // recruiter sees it without hunting for a button. Same node data and
  // animation (renderAiPipelineTimelineInner), just a different, persistent
  // home instead of a click-to-open modal.
  const successStoriesSection = !getToken() ? renderSuccessStoriesSection() : "";
  const topReposSection = !getToken() ? renderTopReposSection() : "";

  const aiLiveDemoSection = !getToken() ? `
    <div class="relative rounded-2xl overflow-hidden mb-6 px-5 py-6" style="background:linear-gradient(135deg,#020c1b,#071428,#030d1c)" data-testid="ai-live-demo-section">
      <div class="absolute inset-0 pointer-events-none" style="background-image:linear-gradient(rgba(99,102,241,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.05) 1px,transparent 1px);background-size:28px 28px"></div>
      <div class="relative z-10">
        <h2 class="text-sm font-bold text-white uppercase tracking-wide mb-1">Live Demo — AI in This Repo’s CI/CD Pipeline</h2>
        <p class="text-[11px] mb-4" style="color:rgba(255,255,255,.45)">Where AI models actually sit in this pipeline, end to end — the same facts as the AI-First Engineering cards below, told as a sequence.</p>
        ${renderAiPipelineTimelineInner()}
      </div>
    </div>
    ${AI_PIPELINE_DEMO_KEYFRAMES}
  ` : "";

  // Every claim below is scoped to what this repository itself proves -
  // its CI workflows, test suites, and architecture docs - not a generic
  // "team leadership" narrative this solo-maintained project can't back up.
  const leadershipImpactSection = !getToken() ? `
    <div class="mb-6" data-testid="leadership-impact-section">
      <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Leadership Impact</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${[
          { icon: '🧭', title: 'Technical Direction & Governance', desc: 'Defines this repository’s contribution standards, architecture conventions, and CI quality gates — enforced automatically on every pull request, not just documented.' },
          { icon: '🧪', title: 'Quality Strategy', desc: 'A real Test Pyramid across 5 independent automation stacks (pytest, 3× Playwright, REST Assured), with an 85% coverage floor enforced in CI.' },
          { icon: '🚦', title: 'CI/CD Governance', desc: '9+ GitHub Actions workflows gate every PR — lint, coverage floor, contract tests, a live Docker-Compose boot smoke test. A failed gate blocks the merge.' },
          { icon: '🏗️', title: 'Architecture & Delivery', desc: 'Designed the microservices decomposition (5 services + gateway + worker) and used real load-testing to find and fix production concurrency bugs.' },
          { icon: '🤖', title: 'AI-First Engineering', desc: 'Built and operates an AI PR Steward that reads CI failures and review feedback and drives pull requests to green — the same automation behind this repository’s Kafka integration.' },
        ].map(c => `
          <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div class="text-xl mb-2" aria-hidden="true">${c.icon}</div>
            <h3 class="text-sm font-bold text-slate-800 mb-1">${c.title}</h3>
            <p class="text-xs text-slate-500 leading-relaxed">${c.desc}</p>
          </div>`).join('')}
      </div>
    </div>
  ` : "";

  // "How I Lead Engineering Delivery" - the workflow this section describes
  // is the one this very portfolio rebuild follows: a written plan, broken
  // into tracked milestones, each shipped as its own reviewable PR gated by
  // real CI - not an abstract Scrum claim.
  const deliveryWorkflowSection = !getToken() ? `
    <div class="mb-6" data-testid="delivery-workflow-section">
      <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">How I Lead Engineering Delivery</h2>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <ol class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          ${[
            { step: 'Product Requirements', desc: 'A written plan with acceptance criteria — before any code changes.' },
            { step: 'Technical Roadmap',     desc: 'Broken into scoped, tracked milestones, planned before implementation.' },
            { step: 'Epics & Stories',       desc: 'Each milestone decomposes into concrete, testable tasks.' },
            { step: 'Sprint Delivery',       desc: 'Every milestone ships as its own branch, PR, and CI run.' },
            { step: 'Quality Gates',         desc: 'Lint, coverage floor, contract tests, and a live boot smoke test must pass.' },
            { step: 'KPI Review',            desc: 'Each PR reports what changed, what was tested, and what remains open.' },
          ].map((s, i, arr) => `
            <li class="flex" data-testid="delivery-step">
              <div class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p class="text-[11px] font-bold text-blue-600 uppercase tracking-wide mb-1">${i + 1}. ${s.step}</p>
                <p class="text-[11px] text-slate-500 leading-snug">${s.desc}</p>
              </div>
            </li>`).join('')}
        </ol>
      </div>
    </div>
  ` : "";

  // Real counts from this repo's own suites (measured directly: pytest
  // --collect-only per tests/ layer, `playwright test --list` for the TS
  // suite, @Test/@ParameterizedTest counts for the two Java suites) - not
  // invented, and mapped honestly to the plan's 4 pyramid levels rather than
  // forced into an idealized taper: Component = tests/services (each
  // microservice tested in isolation, this repo's real analogue to
  // "isolated UI/service behavior" - there's no separate frontend framework
  // with its own component-test runner). Bar widths are proportional to the
  // actual counts, including where that isn't a clean pyramid shape.
  const TEST_PYRAMID_LEVELS = [
    { level: 'Unit',                 count: 220, desc: 'Pure functions — no DB, no HTTP, no I/O.', where: 'tests/unit' },
    { level: 'Component',            count: 145, desc: 'Each microservice tested in isolation via TestClient.', where: 'tests/services' },
    { level: 'API / Integration / Contract', count: 237, desc: 'Real FastAPI app + DB, plus property-based OpenAPI contract tests and black-box REST Assured HTTP tests.', where: 'tests/api + tests/contract + java-tests' },
    { level: 'E2E',                  count: 104, desc: 'Full user flows through the real UI — Python, TypeScript, and Java Playwright, plus Cucumber/Gherkin BDD.', where: 'tests/e2e + e2e/ + java-e2e + e2e-bdd' },
  ];
  const testPyramidSection = !getToken() ? `
    <div class="mb-6" data-testid="test-pyramid-section">
      <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Test Pyramid</h2>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div class="space-y-2">
          ${TEST_PYRAMID_LEVELS.map((l, i) => {
            const maxCount = Math.max(...TEST_PYRAMID_LEVELS.map(x => x.count));
            const pct = Math.round((l.count / maxCount) * 100);
            return `
            <div class="flex items-center gap-3">
              <div class="w-6 text-[11px] font-bold text-slate-500 text-right flex-shrink-0">${i + 1}</div>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline justify-between gap-2 mb-0.5">
                  <p class="text-xs font-bold text-slate-700">${l.level}</p>
                  <p class="text-xs font-bold text-blue-600 flex-shrink-0">${l.count} tests</p>
                </div>
                <div class="h-2 bg-slate-100 rounded-full overflow-hidden mb-1">
                  <div class="h-full bg-blue-500 rounded-full" style="width:${pct}%"></div>
                </div>
                <p class="text-[11px] text-slate-500 leading-snug">${l.desc} <span class="text-slate-500">— <code class="text-[11px]">${l.where}</code></span></p>
              </div>
            </div>`;
          }).join('')}
        </div>
        <p class="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-100">
          <strong class="text-slate-500">Shift-Left strategy:</strong> quality validation moves earlier into
          development through unit, component, contract, and API testing, while E2E stays focused on
          critical customer journeys rather than re-testing everything through a browser.
        </p>
      </div>
    </div>
  ` : "";

  // At least 4 concrete, repo-verifiable AI workflows, each with a real
  // outcome - not generic AI marketing copy. Every one of these is a real
  // file/workflow in this repository, several of them literally the
  // automation that built and merged the PRs this portfolio plan itself
  // produced.
  const aiFirstEngineeringSection = !getToken() ? `
    <div class="mb-6" data-testid="ai-first-engineering-section">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide">AI-First Quality Engineering</h2>
        <button data-testid="ai-pipeline-demo-btn" onclick="showModal('aiPipelineDemo')"
          class="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-1.5 rounded-lg transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          See the pipeline
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${[
          { title: 'AI Test-Case Generation', desc: 'Claude Haiku drafts test cases from a feature description (services/ai), optionally grounded by RAG over the suite’s existing cases with a pluggable embedding model — nomic-embed-text finds reworded duplicates the hashed baseline misses (R@1 1.00 vs 0.56, evals/retrieval_eval.py).' },
          { title: 'Test-Plan Gap Review', desc: 'A two-step LangChain agent (agents/test_plan_reviewer.py) critiques existing test cases for a feature, then drafts one test case per gap it finds.' },
          { title: 'Coverage-Gap Agent', desc: 'On every PR, diffs changed source against tests/ and posts concrete test suggestions when a change has no matching-layer test (coverage-gap-agent.yml).' },
          { title: 'Flaky-Test Detection', desc: 'Parses CI’s rerun results and auto-files/updates one tracking GitHub issue per flaky test, so evidence accumulates instead of vanishing (scripts/flake_report.py).' },
          { title: 'AI PR Steward', desc: 'Reads CI failures and review comments, diagnoses root cause, and pushes fixes until a PR is green — the same automation that drove every PR in this portfolio rebuild to merge.' },
          { title: 'Playwright Planning, Generation & Healing', desc: 'Dedicated agents (.claude/agents/playwright-test-*.md) plan coverage, author new Playwright specs, and repair broken locators across the 3-stack browser suite — and an Assertion Guard in CI blocks any heal that removes, skips, loosens or inverts an assertion (scripts/assertion_guard.py).' },
          { title: 'Agentic Failure Triage (Tool Use)', desc: 'Claude calls scoped, read-only tools (case history, similar cases via RAG, suite flakiness) in a bounded loop, checks environment health, and classifies each failure as product bug, flaky, or environment — a deterministic heuristic cross-checks every verdict and disagreements are flagged for human review (api/triage_agent.py).' },
          { title: 'Evals & Human-in-the-Loop', desc: 'An eval harness scores AI output quality and run-to-run variance in CI, and a trajectory eval scores what the triage agent actually did — which tools it called before deciding — so a prompt that stops it investigating fails CI; a LangGraph orchestrator pauses on interrupt() for human approval before generated specs ship (evals/, agents/).' },
        ].map(c => `
          <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h3 class="text-sm font-bold text-slate-800 mb-1">${c.title}</h3>
            <p class="text-xs text-slate-500 leading-relaxed">${c.desc}</p>
          </div>`).join('')}
      </div>
      <div data-testid="ai-roadmap" class="mt-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <h3 class="text-sm font-bold text-slate-800 mb-2">AI building-blocks roadmap</h3>
        <ul class="space-y-1.5">
          ${[
            { id: 'M7', title: 'Agentic failure triage — tool use', done: true },
            { id: 'M8', title: 'Real embedding model behind RAG retrieval', done: true },
            { id: 'M9', title: 'In-app human review of AI drafts → eval dataset', done: true },
            { id: 'M10', title: 'Trajectory evals — score which tools the agent chose', done: true },
            { id: 'R1', title: 'Triage verdicts: bug vs flaky vs environment, with a labelled eval', done: true },
            { id: 'R2', title: 'Assertion guard: a heal can’t change what a test verifies', done: true },
          ].map(m => `
            <li class="flex items-center gap-2 text-xs text-slate-600">
              <span class="font-mono font-bold text-slate-500 w-8">${m.id}</span>
              <span class="flex-1">${m.title}</span>
              <span class="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${m.done ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}">${m.done ? 'Done' : 'Planned'}</span>
            </li>`).join('')}
        </ul>
      </div>
    </div>
  ` : "";

  // KPI + Quality Gate dashboard. Per the plan: keep test-inventory count,
  // execution pass rate, requirement/risk coverage, and code coverage as
  // four *separate* concepts (never present "active test cases" as
  // complete product coverage), and never invent a number - a KPI with no
  // real data source here shows "Not yet measured" instead of a guess.
  // Pass Rate is the one live value: fetched from the flagship demo
  // project's own /stats endpoint, not a fixture.
  //
  // The two live cards render as "Loading…" and are filled in by
  // hydrateLiveKpis() after the page is on screen - /api/ci/pipeline-stats
  // calls the GitHub Actions API on a cold cache, and awaiting it here held
  // the whole homepage (owner card included) behind that round trip.
  const _formatDurationSeconds = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const kpiBadge = (status) => {
    const styles = {
      Healthy:  'bg-emerald-50 text-emerald-700 border-emerald-200',
      Attention: 'bg-amber-50 text-amber-700 border-amber-200',
      Blocked:  'bg-red-50 text-red-700 border-red-200',
      Enforced: 'bg-blue-50 text-blue-700 border-blue-200',
      'Not yet measured': 'bg-slate-50 text-slate-500 border-slate-200',
    };
    // Status is always spelled out as text, never conveyed by color alone.
    return `<span class="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${styles[status] || styles['Not yet measured']}">${status}</span>`;
  };

  const buildKpiCards = (flagshipStats, pipelineStats, pending) => {
    const _kpiTotal = flagshipStats
      ? flagshipStats.last_run_pass + flagshipStats.last_run_fail + flagshipStats.last_run_skip + flagshipStats.last_run_pending
      : 0;
    const livePassRate = _kpiTotal ? Math.round(flagshipStats.last_run_pass / _kpiTotal * 100) : null;
    const pipelineMeanSeconds = pipelineStats?.mean_duration_seconds ?? null;

    return [
      {
        name: 'Code Coverage', current: '89.1%', target: '85% floor (CI-enforced)',
        status: 'Healthy',
        def: 'Line coverage of api/, services/, and shared/ from the pytest suite — a PR that drops below the floor fails the build. Not the same as test-inventory count or pass rate.',
        source: '.github/workflows/test.yml',
      },
      {
        name: 'Pass Rate (live)',
        current: pending ? 'Loading…' : livePassRate !== null ? `${livePassRate}%` : 'No run recorded yet',
        target: '≥ 95%',
        status: pending ? 'Loading…' : livePassRate === null ? 'Not yet measured' : livePassRate >= 95 ? 'Healthy' : livePassRate >= 80 ? 'Attention' : 'Blocked',
        def: 'Percentage of executed results that passed in the flagship demo project’s most recent run — fetched live from /api/projects/{id}/stats, not a fixture. Execution pass rate only, not product or requirement coverage.',
        source: 'GET /api/projects/{id}/stats',
      },
      {
        name: 'Test Inventory', current: '706 tests / 4 layers', target: 'Grows with the codebase',
        status: 'Healthy',
        def: 'Total automated test count across unit, component, API/contract, and E2E layers (see Test Pyramid above). This counts tests that exist, not requirements or risk covered.',
        source: 'tests/, e2e/, java-tests/, java-e2e/, e2e-bdd/',
      },
      {
        name: 'Quality Gate Status', current: '4 gates enforced', target: 'All required checks pass before merge',
        status: 'Enforced',
        def: 'Lint, the coverage floor, contract tests, and a live Docker-Compose boot smoke test all block a PR from merging if any fails.',
        source: '.github/workflows/test.yml, microservices-smoke.yml',
      },
      {
        name: 'Flaky Test Rate', current: 'Not yet measured here', target: '—',
        status: 'Not yet measured',
        def: 'Tests that needed a rerun to pass are already detected and tracked automatically in one standing GitHub issue — not yet surfaced as a live rate in this dashboard.',
        source: 'scripts/flake_report.py',
      },
      {
        name: 'Heal Success Rate', current: 'Not yet measured', target: '—',
        status: 'Not yet measured',
        def: 'Of the locator/timing-drift failures the Playwright test-healer agent is allowed to auto-fix, the share it actually healed rather than escalated or skipped. Populates once heal-outcomes/heal_outcomes.jsonl has recorded healing sessions.',
        source: 'scripts/heal_metrics.py',
      },
      {
        name: 'False Heal Rate', current: 'Not yet measured', target: '0% (any nonzero value is a guardrail violation)',
        status: 'Not yet measured',
        def: 'Of the failures the healer classified as a suspected real product defect (behavior change), the share that were NOT escalated — i.e. silently healed or skipped instead. The healer prompt forbids this outcome; this rate is how it would be caught if it happened anyway.',
        source: 'scripts/heal_metrics.py',
      },
      {
        name: 'AI Call Latency', current: 'Not yet measured', target: '—',
        status: 'Not yet measured',
        def: 'Mean latency across AI Test Generation and AI Failure Triage calls, per provider (Anthropic/Ollama/Groq). Populates once ai-call-logs/ai_calls.jsonl has recorded live calls — see api/ai_gateway.py.',
        source: 'scripts/ai_call_metrics.py',
      },
      {
        name: 'AI Call Cost', current: 'Not yet measured', target: '—',
        status: 'Not yet measured',
        def: 'Deliberately not computed from a hardcoded $/token rate, which would silently go stale as providers reprice — token counts and latency are real per-call facts (see AI Call Latency); a cost figure needs a currently-accurate rate this app does not have configured.',
        source: 'scripts/ai_call_metrics.py',
      },
      {
        name: 'Pipeline Execution Time',
        current: pending ? 'Loading…' : pipelineMeanSeconds != null
          ? `${_formatDurationSeconds(pipelineMeanSeconds)} avg (n=${pipelineStats.runs_sampled})`
          : 'Not yet measured here',
        target: '—',
        status: pending ? 'Loading…' : pipelineMeanSeconds != null ? 'Healthy' : 'Not yet measured',
        def: pipelineMeanSeconds != null
          ? `Mean wall-clock duration of the last ${pipelineStats.runs_sampled} completed runs of the required "Tests" workflow on main, fetched live from the GitHub Actions API.`
          : 'Real run durations are visible per-workflow on GitHub Actions; not yet pulled into this dashboard.',
        source: 'GET /api/ci/pipeline-stats (GitHub Actions API)',
      },
      {
        name: 'Escaped Defects', current: 'Not yet measured', target: '—',
        status: 'Not yet measured',
        def: 'Would require a production incident or defect-tracking integration this app doesn’t have yet.',
        source: '—',
      },
      {
        name: 'Release Readiness', current: 'Not yet measured', target: '—',
        status: 'Not yet measured',
        def: 'No formal release-readiness gate beyond "all required CI checks pass on main" is defined yet.',
        source: '—',
      },
    ];
  };
  const kpiCardTestId = (k) => `kpi-card-${k.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
  // Unmeasured KPIs get a compact, muted card in their own "On the roadmap"
  // row, so the measured ones lead the section.
  const kpiUnmeasured = (k) => k.status === 'Not yet measured';
  const kpiCardHtml = (k) => kpiUnmeasured(k) ? `
          <div class="bg-slate-50/70 rounded-xl border border-dashed border-slate-300 px-3 py-2.5" data-testid="${kpiCardTestId(k)}" title="${escHtml(k.def)}">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-xs font-bold text-slate-700">${k.name}</h3>
              <span class="text-[11px] font-semibold text-slate-500 whitespace-nowrap">Not yet measured</span>
            </div>
            <p class="text-[11px] text-slate-500 leading-snug mt-1 line-clamp-2">${k.def}</p>
          </div>` : `
          <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4" data-testid="${kpiCardTestId(k)}">
            <div class="flex items-start justify-between gap-2 mb-1">
              <h3 class="text-xs font-bold text-slate-700">${k.name}</h3>
              ${kpiBadge(k.status)}
            </div>
            <p class="text-lg font-black text-slate-800 mb-0.5">${k.current}</p>
            <p class="text-[11px] text-slate-500 mb-2">Target: ${k.target}</p>
            <p class="text-[11px] text-slate-500 leading-snug">${k.def}</p>
            ${k.source !== '—' ? `<p class="text-[11px] text-slate-500 mt-1.5"><code>${k.source}</code></p>` : ''}
          </div>`;
  // Fetches the two live KPI sources in parallel and swaps in just those
  // cards. Same honest-fallback contract as before: a failed fetch leaves
  // null, which renders "Not yet measured", never a guessed number.
  const hydrateLiveKpis = async () => {
    if (getToken()) return;
    const flagship = state.projects.find(p => DEMO_KINDS.testflow.namePattern.test(p.name));
    const [flagshipStats, pipelineStats] = await Promise.all([
      flagship ? GET(`/api/projects/${flagship.id}/stats`).catch(() => null) : null,
      GET('/api/ci/pipeline-stats').catch(() => null),
    ]);
    const live = new Set(['Pass Rate (live)', 'Pipeline Execution Time']);
    for (const k of buildKpiCards(flagshipStats, pipelineStats, false).filter(k => live.has(k.name))) {
      const card = document.querySelector(`[data-testid="${kpiCardTestId(k)}"]`);
      if (!card) continue;
      card.outerHTML = kpiCardHtml(k);
      // A live KPI that turned out unmeasured (or measured) moves to its row.
      const fresh = document.querySelector(`[data-testid="${kpiCardTestId(k)}"]`);
      const row = document.querySelector(kpiUnmeasured(k) ? '[data-testid="kpi-roadmap-grid"]' : '[data-testid="kpi-measured-grid"]');
      if (fresh && row && fresh.parentElement !== row) row.appendChild(fresh);
    }
  };
  const kpiDashboardSection = !getToken() ? `
    <div class="mb-6" data-testid="kpi-dashboard-section">
      <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Quality Engineering KPIs</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="kpi-measured-grid">
        ${buildKpiCards(null, null, true).filter(k => !kpiUnmeasured(k)).map(kpiCardHtml).join('')}
      </div>
      <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wide mt-5 mb-2">On the roadmap — not yet measured</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2" data-testid="kpi-roadmap-grid">
        ${buildKpiCards(null, null, true).filter(kpiUnmeasured).map(kpiCardHtml).join('')}
      </div>
      <p class="text-[11px] text-slate-500 mt-3">
        Test-inventory count, execution pass rate, requirement/risk coverage, and code coverage are
        tracked separately on purpose — an inventory of existing test cases is not the same claim as
        complete product coverage.
      </p>
    </div>
  ` : "";

  // Architecture decisions & trade-offs — folded into the same showcase
  // panel "View Architecture" already reveals, so the CTA has one coherent
  // destination: the live diagram plus the reasoning behind it. Every
  // point below is sourced directly from services/README.md, k8s/README.md,
  // or terraform/modules/monitoring/ - not invented.
  const architectureStorySection = `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6" data-testid="architecture-story-section">
      <h2 class="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Architecture Decisions &amp; Trade-offs</h2>
      <div class="space-y-3">
        ${[
          { icon: '🧩', title: 'Why five services', desc: 'gateway, auth, projects, runs, and ai split along domain boundaries so each is independently deployable and scalable; worker is a sixth process with no HTTP surface, draining async work off the request path.' },
          { icon: '📋', title: 'Ownership & boundaries', desc: 'One flat PostgreSQL namespace, tables prefixed per owning service (auth_users, projects_projects, runs_test_runs…) — logical separation without the operational cost of a schema-per-service.' },
          { icon: '🔀', title: 'API Gateway', desc: 'Routes every /api/* request to the right downstream service via a declarative table matched by exact path shape (not string-prefix), serves the static SPA, and proxies the WebSocket connection.' },
          { icon: '📡', title: 'Redis / WebSocket event flow', desc: 'Pub/Sub fans out WebSocket updates across replicas and publishes run-completion events; a Redis Stream queues TestResult population off the request path. Both degrade to local/inline behavior if Redis is unreachable — nothing depends on it being up.' },
          { icon: '🗄️', title: 'PostgreSQL schema separation', desc: 'Table-name prefixing was chosen over Postgres schema-qualification specifically because it works identically against SQLite in tests and Postgres in production — no ATTACH-DATABASE workaround needed.' },
          { icon: '☸️', title: 'Docker & Kubernetes deployment', desc: 'docker-compose.microservices.yml locally; Kustomize base + four environment overlays (staging/regression/preprod/prod) in k8s/, each pinned to a named node — mirroring the same four environments the in-app Environments dashboard reports on.' },
          { icon: '🚦', title: 'CI/CD quality gates', desc: 'Lint, an 85% coverage floor, contract tests, and a live Docker-Compose boot smoke test all block a merge — see the Quality Gate Status KPI above.' },
          { icon: '🔎', title: 'Observability & failure diagnostics', desc: 'A correlation ID threads through every request and log line across every service. In the GCP deployment, Terraform provisions a Cloud Monitoring dashboard (latency, error rate, pod health), alerting (5xx spikes, crash-loops, an uptime check, a budget guard), wired through Pub/Sub to a Cloud Function that auto-files and updates a GitHub issue per incident.' },
          { icon: '⚖️', title: 'Trade-offs, found by testing — not assumed', desc: 'Load-testing the same scenarios against both backends found a real trade: the SQLite monolith’s DELETE+GET race (issue #214) never reproduced under Postgres/microservices, but that same run surfaced a different race the async worker introduces (issue #219) that the monolith can’t have. Trading one concurrency bug for a different one, not a strict win.' },
        ].map(a => `
          <div class="flex items-start gap-3">
            <span class="text-base flex-shrink-0 mt-0.5" aria-hidden="true">${a.icon}</span>
            <div class="min-w-0">
              <p class="text-xs font-bold text-slate-700">${a.title}</p>
              <p class="text-[11px] text-slate-500 leading-relaxed">${a.desc}</p>
            </div>
          </div>`).join('')}
      </div>
    </div>
  `;

  // Recruiter Tour — a 5-step, read-only, no-auth guided path through
  // sections already on this page (see RECRUITER_TOUR_STEPS / startRecruiterTour
  // below). Skippable at any point; never creates or modifies data.
  // Also the only guest-facing prompt to sign in: it's built into the final
  // innerHTML below, unlike a banner inserted before the render, which that
  // innerHTML assignment would wipe.
  const recruiterTourBanner = !getToken() ? `
    <div class="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl px-5 py-3.5" data-testid="recruiter-tour-banner">
      <div class="flex items-start gap-2.5 text-sm text-blue-900">
        <span class="text-lg flex-shrink-0" aria-hidden="true">🧭</span>
        <span><strong class="font-bold">New here?</strong> Take a 5-step guided tour — leadership, architecture, test strategy, quality gates, and AI engineering. Under 3 minutes, no sign-in, nothing is created.
          <span class="block mt-1 text-xs text-blue-700" data-testid="guest-signin-prompt">You're browsing as a guest. <button type="button" onclick="showAuthModal('login')" data-testid="guest-signin-link" class="font-semibold underline hover:text-blue-900">Sign in</button> to add and manage projects.</span>
        </span>
      </div>
      <button type="button" onclick="startRecruiterTour(this)" data-testid="start-tour-btn"
        class="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap">
        Start Recruiter Tour
      </button>
    </div>
  ` : "";

  if (!state.projects.length) {
    el.innerHTML = `
      <div class="fade-in">
        ${ownerCard}
        ${homeTabsHtml({
          stories: successStoriesSection, repos: topReposSection, demo: aiLiveDemoSection,
          leadership: leadershipImpactSection + deliveryWorkflowSection, strategy: testPyramidSection,
          ai: aiFirstEngineeringSection, kpis: kpiDashboardSection,
          architecture: getToken() ? "" : demoBanner + renderShowcaseSection([archDiagram, techStackBanner, sysArchBanner, architectureStorySection]),
        })}
        ${recruiterTourBanner}
        <div data-testid="empty-state" class="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div class="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <h2 class="text-xl font-bold text-slate-700 mb-2">No projects yet</h2>
          <p class="text-slate-500 mb-6 max-w-sm text-sm">Create your first project to start organizing test suites and cases.</p>
          ${isAdmin() ? `<button onclick="showModal('project')" data-testid="new-project-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors shadow-sm">
            Create First Project
          </button>` : ""}
        </div>
        ${getToken() ? `<div class="mt-8">${renderShowcaseSection([demoBanner, archDiagram, techStackBanner, sysArchBanner, architectureStorySection])}</div>` : ""}
      </div>`;
    hydrateLiveKpis();
    initHomeCarousels();
    initAiPipelineDemo(document.querySelector('[data-testid="ai-live-demo-section"]'));
    if (!state.user) { applyReveal(el); positionHomeTabIndicator(); }
    return;
  }

  // The project list: the "Projects" tab for a guest, the page itself when signed in.
  const projectsListHtml = `
      <!-- Projects table header -->
      <div class="flex items-center justify-between mb-3">
        <div>
          <h1 class="text-xl font-bold text-slate-800">Projects</h1>
          <p class="text-slate-500 text-xs mt-0.5" id="proj-count-label">${state.projects.length} project${state.projects.length !== 1 ? "s" : ""}</p>
        </div>
        <div class="flex items-center gap-2">
          <div id="bulk-toolbar" class="hidden items-center gap-2">
            ${isAdmin() ? `
            <span id="bulk-count" class="text-sm text-slate-600 font-medium"></span>
            <button onclick="bulkDeleteProjects()" class="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              Remove Selected
            </button>
            <button onclick="clearProjectSelection()" class="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl transition-colors">Cancel</button>
            ` : ""}
          </div>
          ${isAdmin() ? `<button onclick="showModal('project')" data-testid="new-project-btn" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            New Project
          </button>` : ""}
        </div>
      </div>
      <!-- Filter / search bar -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm mb-3 px-3 py-2 flex items-center gap-3">
        <svg class="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"/></svg>
        <input id="proj-search" oninput="filterProjectTable()" type="text" placeholder="Filter by name or description…"
          class="flex-1 text-sm outline-none bg-transparent text-slate-700 placeholder-slate-400" />
        <select id="proj-sort" aria-label="Sort projects" onchange="filterProjectTable()"
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
                ${isAdmin() ? `<input type="checkbox" id="proj-select-all" aria-label="Select all projects" onchange="toggleSelectAllProjects(this.checked)"
                  class="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer accent-blue-600" />` : ""}
              </th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Description</th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell w-32">Created</th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell w-44">Last Run</th>
              <th class="w-16 px-3 py-3"></th>
            </tr>
          </thead>
          <tbody id="proj-table-body"></tbody>
        </table>
        <div id="proj-empty-filter" class="hidden py-10 text-center text-slate-500 text-sm">No projects match your filter.</div>
      </div>
      <div id="proj-pagination" class="flex items-center justify-between flex-wrap gap-3 mt-3"></div>
  `;

  el.innerHTML = `
    <div class="fade-in">
      ${ownerCard}
      ${homeTabsHtml({
        stories: successStoriesSection, repos: topReposSection, demo: aiLiveDemoSection,
        leadership: leadershipImpactSection + deliveryWorkflowSection, strategy: testPyramidSection,
        ai: aiFirstEngineeringSection, kpis: kpiDashboardSection,
        architecture: getToken() ? "" : demoBanner + renderShowcaseSection([archDiagram, techStackBanner, sysArchBanner, architectureStorySection]),
        projects: getToken() ? "" : projectsListHtml,
      })}
      ${recruiterTourBanner}
      ${getToken() ? projectsListHtml : ""}
      ${getToken() ? `<div class="mt-8">${renderShowcaseSection([demoBanner, archDiagram, techStackBanner, sysArchBanner, architectureStorySection])}</div>` : ""}
    </div>`;
  filterProjectTable();
  hydrateLiveKpis();
  initHomeCarousels();
  initAiPipelineDemo(document.querySelector('[data-testid="ai-live-demo-section"]'));
  if (!state.user) { applyReveal(el); positionHomeTabIndicator(); }
}

async function loadProjectStats(projects) {
  if (!projects.length) return;
  await Promise.all(projects.map(async p => {
    const cell = document.getElementById(`pstats-${p.id}`);
    if (!cell) return;
    try {
      const s = await GET(`/api/projects/${p.id}/stats`);
      const total = s.last_run_pass + s.last_run_fail + s.last_run_skip + s.last_run_pending;
      if (!total) {
        cell.innerHTML = `<span class="text-slate-500 text-xs italic">No runs</span>`;
        return;
      }
      const pct = v => Math.round((v / total) * 100);
      const passW = pct(s.last_run_pass), failW = pct(s.last_run_fail), skipW = pct(s.last_run_skip), pendW = pct(s.last_run_pending);
      const overall = s.last_run_fail > 0 ? "fail" : s.last_run_pending > 0 ? "pending" : "pass";
      const dot = overall === "fail" ? "bg-red-500" : overall === "pending" ? "bg-amber-400" : "bg-emerald-500";
      cell.innerHTML = `
        <div class="flex flex-col gap-1 min-w-[120px]">
          <div class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0"></span>
            <span class="text-[11px] text-slate-500 truncate max-w-[110px]" title="${escHtml(s.last_run_name||'')}">${escHtml(s.last_run_name||'Last run')}</span>
          </div>
          <div class="flex h-1.5 rounded-full overflow-hidden w-full bg-slate-100 gap-px">
            ${passW ? `<div class="bg-emerald-500 h-full rounded-l-full transition-all" style="width:${passW}%"></div>` : ""}
            ${failW ? `<div class="bg-red-500 h-full transition-all" style="width:${failW}%"></div>` : ""}
            ${skipW ? `<div class="bg-amber-400 h-full transition-all" style="width:${skipW}%"></div>` : ""}
            ${pendW ? `<div class="bg-slate-300 h-full rounded-r-full transition-all" style="width:${pendW}%"></div>` : ""}
          </div>
          <div class="flex items-center gap-2 text-[11px] font-semibold">
            ${s.last_run_pass ? `<span class="text-emerald-700">${s.last_run_pass}P</span>` : ""}
            ${s.last_run_fail ? `<span class="text-red-600">${s.last_run_fail}F</span>` : ""}
            ${s.last_run_skip ? `<span class="text-amber-700">${s.last_run_skip}S</span>` : ""}
            <span class="ml-auto font-bold ${overall === 'pass' ? 'text-emerald-700' : overall === 'fail' ? 'text-red-600' : 'text-amber-700'}">${passW}%</span>
            ${s.last_run_pending ? `<span class="text-slate-500">${s.last_run_pending}?</span>` : ""}
          </div>
        </div>`;
    } catch {
      if (cell) cell.innerHTML = `<span class="text-slate-500 text-xs">—</span>`;
    }
  }));
}

function projectRow(p) {
  return `
    <tr id="pcard-${p.id}" data-testid="project-row-${p.id}" onclick="handleProjectCardClick(event, ${p.id})"
      class="border-b border-slate-100 last:border-0 hover:bg-blue-50/40 transition-colors cursor-pointer group select-none">
      <td class="px-4 py-3" onclick="event.stopPropagation()">
        ${isAdmin() ? `<input type="checkbox" id="pcheck-${p.id}" aria-label="Select project ${escHtml(p.name)}" onchange="toggleProjectSelectByCheckbox(${p.id}, this.checked)"
          class="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer accent-blue-600" />` : ""}
      </td>
      <td class="px-3 py-3">
        <div class="flex items-center gap-3">
          <span data-testid="project-name-${p.id}" title="${escHtml(p.name)}" class="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors truncate max-w-[220px]">${escHtml(p.name)}</span>
        </div>
      </td>
      <td class="px-3 py-3 hidden md:table-cell text-slate-500 text-xs max-w-[260px]">
        <span class="line-clamp-1" title="${escHtml(p.description || "")}">${escHtml(p.description || "—")}</span>
      </td>
      <td class="px-3 py-3 hidden sm:table-cell text-slate-500 text-xs whitespace-nowrap">${formatDate(p.created_at)}</td>
      <td id="pstats-${p.id}" class="px-3 py-3 hidden lg:table-cell">
        <div class="w-6 h-6 border-2 border-slate-200 border-t-transparent rounded-full animate-spin opacity-40"></div>
      </td>
      <td class="px-3 py-3 text-right" onclick="event.stopPropagation()">
        ${isAdmin() ? `<button data-testid="delete-project-${p.id}" onclick="deleteProject(${p.id})"
          title="Delete project" aria-label="Delete project ${escHtml(p.name)}"
          class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 w-7 h-7 inline-flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>` : ""}
      </td>
    </tr>`;
}

const PROJECTS_PAGE_SIZE = 5;
let projectsPage = 1;

function setProjectsPage(page) {
  projectsPage = page;
  filterProjectTable(false);
}

function filterProjectTable(resetPage = true) {
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

  if (resetPage) projectsPage = 1;
  const totalPages = Math.max(1, Math.ceil(rows.length / PROJECTS_PAGE_SIZE));
  projectsPage = Math.min(Math.max(1, projectsPage), totalPages);
  const pageRows = rows.slice((projectsPage - 1) * PROJECTS_PAGE_SIZE, projectsPage * PROJECTS_PAGE_SIZE);

  const tbody = document.getElementById("proj-table-body");
  const empty = document.getElementById("proj-empty-filter");
  const countLabel = document.getElementById("proj-count-label");
  const pagination = document.getElementById("proj-pagination");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    tbody.innerHTML = pageRows.map(p => projectRow(p)).join("");
    loadProjectStats(pageRows);
    // Re-apply selection state
    _selectedProjects.forEach(id => {
      const cb = document.getElementById(`pcheck-${id}`);
      const row = document.getElementById(`pcard-${id}`);
      if (cb) cb.checked = true;
      if (row) row.classList.add("bg-blue-50", "ring-1", "ring-inset", "ring-blue-200");
    });
  }
  countLabel.textContent = `${rows.length} of ${state.projects.length} project${state.projects.length !== 1 ? "s" : ""}`;

  if (pagination) {
    const rangeStart = rows.length === 0 ? 0 : (projectsPage - 1) * PROJECTS_PAGE_SIZE + 1;
    const rangeEnd = Math.min(projectsPage * PROJECTS_PAGE_SIZE, rows.length);
    pagination.innerHTML = !rows.length ? "" : `
      <p class="text-xs text-slate-500">Showing ${rangeStart}–${rangeEnd} of ${rows.length} · Page ${projectsPage} of ${totalPages}</p>
      <div class="flex items-center gap-2">
        <button data-testid="proj-prev-btn" onclick="setProjectsPage(${projectsPage - 1})" ${projectsPage <= 1 ? "disabled" : ""}
          class="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Previous</button>
        <button data-testid="proj-next-btn" onclick="setProjectsPage(${projectsPage + 1})" ${projectsPage >= totalPages ? "disabled" : ""}
          class="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next</button>
      </div>`;
  }
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

// A suite and its project by ID. These views used to scan every project's
// suites to find a parent: that only saw the 20 newest projects, cost a
// request per project, and failed outright if another user deleted any
// project mid-scan.
async function getSuiteWithProject(suiteId) {
  const suite = await GET(`/api/suites/${suiteId}`);
  const project = await GET(`/api/projects/${suite.project_id}`);
  return { suite, project };
}

// ─── Project View ─────────────────────────────────────────────────────────────
async function renderProject(projectId) {
  const el = document.getElementById("view-project");
  el.classList.remove("hidden");
  el.innerHTML = pageSkeleton();

  let project, suites, stats;
  try {
    project = await GET(`/api/projects/${projectId}`);
    [suites, stats] = await Promise.all([
      GET(`/api/projects/${projectId}/suites`),
      GET(`/api/projects/${projectId}/stats`),
    ]);
    // A stats payload missing a field would otherwise render the literal
    // string "undefined" for that number - default every field so a
    // partial/malformed response degrades to zero, not visible garbage.
    stats = {
      total_suites: 0, total_cases: 0, total_runs: 0,
      last_run_pass: 0, last_run_fail: 0, last_run_skip: 0, last_run_pending: 0,
      last_run_name: "", ...stats,
    };
  } catch (e) {
    el.innerHTML = `<div class="text-red-500 text-center py-16">${escHtml(e.message)}</div>`;
    return;
  }

  state.currentProject = project;
  _selectedSuites.clear();
  await loadSidebar();

  setBreadcrumb([
    { label: "Projects", href: "projects" },
    { label: project.name, href: `project/${projectId}` },
  ]);

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
        <div class="flex items-center gap-2 flex-wrap">
          <button onclick="renderAnalytics(${projectId})"
            class="bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            Analytics
          </button>
          ${isAdmin() ? `<button onclick="showModal('suite', {projectId: ${projectId}})" data-testid="new-suite-btn"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            New Suite
          </button>` : ""}
        </div>
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
          <p class="text-2xl font-bold text-emerald-700">${passP}%</p>
          <p class="text-xs font-medium text-slate-500 mt-1">Pass Rate</p>
        </div>
      </div>

      <!-- Architecture diagram (Alerts Microservice / TestFlow projects - visible
           to every visitor, guest included; "View Architecture" must work
           without signing in) -->
      ${project.name.startsWith("Alerts Microservice") ? alertsArchDiagram() : project.name.startsWith("TestFlow") ? testflowArchDiagram() : ""}

      <!-- Last run progress bar (non-demo projects only) -->
      ${total && !project.name.startsWith("Alerts Microservice") && !project.name.startsWith("TestFlow") ? `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <h3 class="font-semibold text-slate-800 text-sm">Latest Run</h3>
            <p class="text-xs text-slate-500 mt-0.5">${escHtml(stats.last_run_name || "")}</p>
          </div>
          <div class="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
            <span class="flex items-center gap-1.5 text-emerald-700">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>${stats.last_run_pass} pass
            </span>
            <span class="flex items-center gap-1.5 text-red-600">
              <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>${stats.last_run_fail} fail
            </span>
            <span class="flex items-center gap-1.5 text-amber-700">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>${stats.last_run_skip} skip
            </span>
            ${stats.last_run_pending ? `<span class="flex items-center gap-1.5 text-slate-500">
              <span class="w-2.5 h-2.5 rounded-full bg-slate-300"></span>${stats.last_run_pending} pending
            </span>` : ""}
          </div>
        </div>
        <div class="h-3 bg-slate-100 rounded-full overflow-hidden flex">
          ${passP ? `<div class="bg-emerald-500 h-full transition-all" style="width:${passP}%"></div>` : ""}
          ${failP ? `<div class="bg-red-500 h-full transition-all" style="width:${failP}%"></div>` : ""}
          ${skipP ? `<div class="bg-amber-400 h-full transition-all" style="width:${skipP}%"></div>` : ""}
        </div>
        <p class="text-xs text-slate-500 mt-2">${total} test${total !== 1 ? "s" : ""} · ${passP}% passing</p>
      </div>` : ""}

      <!-- Test Report (demo projects with runs) -->
      ${(project.name.startsWith("Alerts Microservice") || project.name.startsWith("TestFlow")) && stats.total_runs > 0 ? `
      <div id="test-report-section">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold text-slate-700">Test Report</h2>
          <span class="text-xs text-slate-500">Last run per suite</span>
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
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold text-slate-700">Test Suites</h2>
          ${isAdmin() ? `<div id="suite-bulk-toolbar" class="hidden items-center gap-2">
            <span id="suite-bulk-count" class="text-sm text-slate-600 font-medium"></span>
            <button onclick="bulkDeleteSuites(${projectId})" class="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              Remove Selected
            </button>
            <button onclick="clearSuiteSelection()" class="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl transition-colors">Cancel</button>
          </div>` : ""}
        </div>
        ${!suites.length ? `
          <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
            <p class="text-slate-500 mb-3">No test suites yet.</p>
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
    pending: 'bg-slate-100 text-slate-600',
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
            <p class="text-xs text-slate-500 mt-0.5">${totAll} test cases across ${suites.length} suites</p>
          </div>
          <div class="flex items-center gap-4 text-xs font-semibold">
            <span class="flex items-center gap-1.5 text-emerald-700"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>${totPass} pass</span>
            <span class="flex items-center gap-1.5 text-red-700"><span class="w-2 h-2 rounded-full bg-red-500"></span>${totFail} fail</span>
            <span class="flex items-center gap-1.5 text-amber-700"><span class="w-2 h-2 rounded-full bg-amber-400"></span>${totSkip} skip</span>
            <span class="text-lg font-bold ${overallPct >= 80 ? 'text-emerald-700' : overallPct >= 50 ? 'text-amber-700' : 'text-red-600'}">${overallPct}%</span>
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
            <span class="text-xs text-slate-500">No runs yet</span>
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
          <td class="px-3 py-2.5 text-xs text-slate-500 hidden sm:table-cell">
            <span class="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${r.test_case.priority === 'high' ? 'bg-red-50 text-red-700' : r.test_case.priority === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}">${r.test_case.priority}</span>
          </td>
          <td class="px-3 py-2.5 text-xs text-slate-500 hidden md:table-cell whitespace-nowrap">${r.executed_at ? new Date(r.executed_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</td>
        </tr>`).join('');

      return `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-3">
              <span class="font-semibold text-slate-700 text-sm">${escHtml(suite.name)}</span>
              <span class="text-xs text-slate-500">${escHtml(run.name)}</span>
            </div>
            <div class="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
              <span class="text-emerald-700">${pass}✓</span>
              <span class="text-red-700">${fail}✗</span>
              <span class="text-amber-700">${skip}↷</span>
              <span class="font-bold ${pct >= 80 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-red-600'}">${pct}%</span>
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
                <th class="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Test Case</th>
                <th class="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">Status</th>
                <th class="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-20 hidden sm:table-cell">Priority</th>
                <th class="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-20 hidden md:table-cell">Executed</th>
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
    <div id="scard-${s.id}" data-testid="suite-card-${s.id}" onclick="handleSuiteCardClick(event, ${s.id})"
      class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group">
      <div class="p-4 flex items-center gap-4">
        ${isAdmin() ? `<div onclick="event.stopPropagation()" class="flex-shrink-0">
          <input type="checkbox" id="scheck-${s.id}" aria-label="Select suite ${escHtml(s.name)}" onchange="toggleSuiteSelect(${s.id}, this.checked)"
            class="w-4 h-4 rounded border-slate-300 text-indigo-600 cursor-pointer accent-indigo-600" />
        </div>` : ""}
        <div class="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <h3 title="${escHtml(s.name)}" class="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors truncate">${escHtml(s.name)}</h3>
          ${s.description ? `<p title="${escHtml(s.description)}" class="text-sm text-slate-500 truncate mt-0.5">${escHtml(s.description)}</p>` : ""}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-xs text-slate-500">${formatDate(s.created_at)}</span>
          ${isAdmin() ? `<button data-testid="delete-suite-${s.id}" onclick="event.stopPropagation(); deleteSuite(${s.id}, ${projectId})"
            title="Delete suite" aria-label="Delete suite ${escHtml(s.name)}"
            class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 w-7 h-7 flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
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
            <span title="${escHtml(r.name)}" class="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors truncate">${escHtml(r.name)}</span>
            ${status}
            ${envBadge(r.environment_key)}
          </div>
          <span class="inline-block text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">${escHtml(suiteName)}</span>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="text-xs text-slate-500">${formatDate(r.created_at)}</div>
          <div class="flex items-center justify-end gap-1 mt-0.5">
            <svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            <span class="text-xs text-slate-500 font-medium">${r.created_by_username ? escHtml(r.created_by_username) : "—"}</span>
          </div>
        </div>
      </div>
      ${total ? `
        <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden flex mb-2">
          ${passP ? `<div class="bg-emerald-500 h-full" style="width:${passP}%"></div>` : ""}
          ${fail ? `<div class="bg-red-500 h-full" style="width:${Math.round(fail/total*100)}%"></div>` : ""}
        </div>
        <div class="flex items-center justify-between">
          <div class="flex gap-3 text-xs text-slate-500">
            <span class="text-emerald-700 font-medium">${pass} pass</span>
            <span class="text-red-600 font-medium">${fail} fail</span>
            ${pending ? `<span class="text-slate-500">${pending} pending</span>` : ""}
          </div>
          <span class="text-xs font-bold ${passP >= 80 ? "text-emerald-700" : passP >= 50 ? "text-amber-700" : "text-red-600"}">${passP}%</span>
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

const _selectedSuites = new Set();

function handleSuiteCardClick(event, id) {
  if (_selectedSuites.size > 0) {
    toggleSuiteSelect(id, !_selectedSuites.has(id));
  } else {
    navigate(`suite/${id}`);
  }
}

function toggleSuiteSelect(id, checked) {
  const card = document.getElementById(`scard-${id}`);
  const cb = document.getElementById(`scheck-${id}`);
  if (checked) {
    _selectedSuites.add(id);
    if (card) card.classList.add("ring-2", "ring-inset", "ring-indigo-300", "bg-indigo-50");
    if (cb) cb.checked = true;
  } else {
    _selectedSuites.delete(id);
    if (card) card.classList.remove("ring-2", "ring-inset", "ring-indigo-300", "bg-indigo-50");
    if (cb) cb.checked = false;
  }
  const toolbar = document.getElementById("suite-bulk-toolbar");
  const countEl = document.getElementById("suite-bulk-count");
  if (_selectedSuites.size > 0) {
    if (toolbar) { toolbar.classList.remove("hidden"); toolbar.classList.add("flex"); }
    if (countEl) countEl.textContent = `${_selectedSuites.size} selected`;
  } else {
    if (toolbar) { toolbar.classList.add("hidden"); toolbar.classList.remove("flex"); }
  }
}

function clearSuiteSelection() {
  [..._selectedSuites].forEach(id => {
    const card = document.getElementById(`scard-${id}`);
    const cb = document.getElementById(`scheck-${id}`);
    if (card) card.classList.remove("ring-2", "ring-inset", "ring-indigo-300", "bg-indigo-50");
    if (cb) cb.checked = false;
  });
  _selectedSuites.clear();
  const toolbar = document.getElementById("suite-bulk-toolbar");
  if (toolbar) { toolbar.classList.add("hidden"); toolbar.classList.remove("flex"); }
}

async function bulkDeleteSuites(projectId) {
  const ids = [..._selectedSuites];
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} suite${ids.length > 1 ? "s" : ""} and all their test cases?`)) return;
  try {
    await Promise.all(ids.map(id => DEL(`/api/suites/${id}`)));
    toast(`${ids.length} suite${ids.length > 1 ? "s" : ""} deleted`);
    _selectedSuites.clear();
    navigate(`project/${projectId}`);
  } catch (e) { toast(e.message, "error"); }
}

// ─── Suite View ───────────────────────────────────────────────────────────────
async function renderSuite(suiteId) {
  const el = document.getElementById("view-suite");
  el.classList.remove("hidden");
  el.innerHTML = pageSkeleton();

  let suite, testcases, project, runs, aiReviews;
  try {
    ({ suite, project } = await getSuiteWithProject(suiteId));
    [testcases, runs, aiReviews] = await Promise.all([
      GET(`/api/suites/${suiteId}/testcases`),
      GET(`/api/suites/${suiteId}/runs`),
      loadPendingAIReviews(suiteId),
    ]);
  } catch (e) {
    el.innerHTML = `<div class="text-red-500 text-center py-16">${escHtml(e.message)}</div>`;
    return;
  }

  state.currentSuite = suite;
  state.currentProject = project;
  state.currentView = null;
  _selectedTestCases.clear();
  await loadSidebar();

  setBreadcrumb([
    { label: "Projects", href: "projects" },
    { label: project.name, href: `project/${project.id}` },
    { label: suite.name, href: `suite/${suiteId}` },
  ]);

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
        <div class="flex items-center gap-2 flex-wrap">
          <button onclick="showModal('run', {suiteId: ${suiteId}})"
            class="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Start Run
          </button>
          <button onclick="showFlakyTestsModal(${suiteId})"
            class="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Flaky Tests
          </button>
          <a href="/api/suites/${suiteId}/export/csv" download data-testid="export-csv-btn"
            class="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2-9a4 4 0 010 8H7a4 4 0 01-.99-7.88A5.5 5.5 0 0117 8a4 4 0 010 8"/></svg>
            Export CSV
          </a>
          ${isAdmin() ? `<button onclick="showModal('testcase', {suiteId: ${suiteId}})" data-testid="new-testcase-btn"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            New Test Case
          </button>
          <button onclick="showAIGenerateModal(${suiteId})"
            class="bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Generate with AI
          </button>` : ""}
        </div>
      </div>

      <!-- Status counts -->
      ${tcFilterBar(testcases, counts)}

      ${aiReviewPanel(suiteId, aiReviews)}

      <!-- Test cases -->
      ${!testcases.length ? `
        <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <p class="text-slate-500 mb-3">No test cases yet.</p>
          <button onclick="showModal('testcase', {suiteId: ${suiteId}})" class="text-blue-600 hover:underline text-sm font-semibold">
            Add your first test case
          </button>
        </div>` : `
        <div>
          ${isAdmin() ? `<div id="tc-bulk-toolbar" class="hidden items-center gap-2 mb-3">
            <span id="tc-bulk-count" class="text-sm text-slate-600 font-medium"></span>
            <button onclick="bulkDeleteTestCases(${suiteId})" class="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              Remove Selected
            </button>
            <button onclick="clearTestCaseSelection()" class="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl transition-colors">Cancel</button>
          </div>` : ""}
          <div class="space-y-3">
            ${testcases.map(tc => testCaseCard(tc)).join("")}
          </div>
        </div>`}

      <!-- Runs history -->
      <div>
        <h2 class="text-lg font-semibold text-slate-700 mb-3">Test Runs</h2>
        ${!runs.length ? `
          <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-500 text-sm">
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
    <div id="tccard-${tc.id}" data-testid="testcase-card-${tc.id}" data-tc-status="${tc.status}" data-tc-text="${escHtml(`${tc.title} ${tc.description || ""}`.toLowerCase())}" class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
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
            <input type="checkbox" id="tccheck-${tc.id}" aria-label="Select test case ${escHtml(tc.title)}" onchange="toggleTestCaseSelect(${tc.id}, this.checked)"
              class="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer accent-blue-600 mr-1" />
            <button data-testid="edit-testcase-${tc.id}" onclick='showModal("editTestCase", JSON.parse(this.dataset.tc))'
              data-tc="${tcJson}"
              class="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit" aria-label="Edit test case ${escHtml(tc.title)}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button data-testid="delete-testcase-${tc.id}" onclick="deleteTestCase(${tc.id}, ${tc.suite_id})"
              class="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Delete" aria-label="Delete test case ${escHtml(tc.title)}">
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

const _selectedTestCases = new Set();

function toggleTestCaseSelect(id, checked) {
  const card = document.getElementById(`tccard-${id}`);
  const cb = document.getElementById(`tccheck-${id}`);
  if (checked) {
    _selectedTestCases.add(id);
    if (card) card.classList.add("ring-2", "ring-inset", "ring-blue-300", "bg-blue-50");
    if (cb) cb.checked = true;
  } else {
    _selectedTestCases.delete(id);
    if (card) card.classList.remove("ring-2", "ring-inset", "ring-blue-300", "bg-blue-50");
    if (cb) cb.checked = false;
  }
  const toolbar = document.getElementById("tc-bulk-toolbar");
  const countEl = document.getElementById("tc-bulk-count");
  if (_selectedTestCases.size > 0) {
    if (toolbar) { toolbar.classList.remove("hidden"); toolbar.classList.add("flex"); }
    if (countEl) countEl.textContent = `${_selectedTestCases.size} selected`;
  } else {
    if (toolbar) { toolbar.classList.add("hidden"); toolbar.classList.remove("flex"); }
  }
}

function clearTestCaseSelection() {
  [..._selectedTestCases].forEach(id => {
    const card = document.getElementById(`tccard-${id}`);
    const cb = document.getElementById(`tccheck-${id}`);
    if (card) card.classList.remove("ring-2", "ring-inset", "ring-blue-300", "bg-blue-50");
    if (cb) cb.checked = false;
  });
  _selectedTestCases.clear();
  const toolbar = document.getElementById("tc-bulk-toolbar");
  if (toolbar) { toolbar.classList.add("hidden"); toolbar.classList.remove("flex"); }
}

async function bulkDeleteTestCases(suiteId) {
  const ids = [..._selectedTestCases];
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} test case${ids.length > 1 ? "s" : ""}?`)) return;
  try {
    await Promise.all(ids.map(id => DEL(`/api/testcases/${id}`)));
    toast(`${ids.length} test case${ids.length > 1 ? "s" : ""} deleted`);
    _selectedTestCases.clear();
    navigate(`suite/${suiteId}`);
  } catch (e) { toast(e.message, "error"); }
}

// ─── Suite Test Cases View ────────────────────────────────────────────────────
async function renderSuiteTestCases(suiteId) {
  const el = document.getElementById("view-suite");
  el.classList.remove("hidden");
  el.innerHTML = pageSkeleton();

  let suite, project, testcases;
  try {
    ({ suite, project } = await getSuiteWithProject(suiteId));
    testcases = await GET(`/api/suites/${suiteId}/testcases`);
  } catch (e) {
    el.innerHTML = `<div class="text-red-500 text-center py-16">${escHtml(e.message)}</div>`;
    return;
  }

  state.currentSuite = suite;
  state.currentProject = project;
  state.currentView = `suite-cases-${suiteId}`;
  _selectedTestCases.clear();
  await loadSidebar();

  setBreadcrumb([
    { label: "Projects", href: "projects" },
    { label: project.name, href: `project/${project.id}` },
    { label: suite.name, href: `suite/${suiteId}` },
    { label: "Test Cases", href: `suite/${suiteId}/testcases` },
  ]);

  const counts = { draft: 0, active: 0, deprecated: 0 };
  testcases.forEach(tc => { if (counts[tc.status] !== undefined) counts[tc.status]++; });

  el.innerHTML = `
    <div class="fade-in space-y-6">
      <div class="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Test Cases</h1>
          <p class="text-slate-500 text-sm mt-1">${escHtml(suite.name)} · ${testcases.length} case${testcases.length !== 1 ? "s" : ""}</p>
        </div>
        ${isAdmin() ? `<button onclick="showModal('testcase', {suiteId: ${suiteId}})" data-testid="new-testcase-btn"
          class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          New Test Case
        </button>` : ""}
      </div>
      ${tcFilterBar(testcases, counts)}
      ${!testcases.length ? `
        <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <p class="text-slate-500 mb-3">No test cases yet.</p>
          <button onclick="showModal('testcase', {suiteId: ${suiteId}})" class="text-blue-600 hover:underline text-sm font-semibold">
            Add your first test case
          </button>
        </div>` : `
        <div>
          ${isAdmin() ? `<div id="tc-bulk-toolbar" class="hidden items-center gap-2 mb-3">
            <span id="tc-bulk-count" class="text-sm text-slate-600 font-medium"></span>
            <button onclick="bulkDeleteTestCases(${suiteId})" class="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              Remove Selected
            </button>
            <button onclick="clearTestCaseSelection()" class="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl transition-colors">Cancel</button>
          </div>` : ""}
          <div class="space-y-3">
            ${testcases.map(tc => testCaseCard(tc)).join("")}
          </div>
        </div>`}
    </div>`;
}

// ─── Suite Runs View ──────────────────────────────────────────────────────────
async function renderSuiteRuns(suiteId) {
  const el = document.getElementById("view-suite");
  el.classList.remove("hidden");
  el.innerHTML = pageSkeleton();

  let suite, project, runs;
  try {
    ({ suite, project } = await getSuiteWithProject(suiteId));
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

  el.innerHTML = `
    <div class="fade-in space-y-6">
      <div class="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Test Runs</h1>
          <p class="text-slate-500 text-sm mt-1">${escHtml(suite.name)} · ${runs.length} run${runs.length !== 1 ? "s" : ""}</p>
        </div>
        <button onclick="showModal('run', {suiteId: ${suiteId}})"
          class="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Start Run
        </button>
      </div>
      ${!runs.length ? `
        <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-500 text-sm">
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
  el.innerHTML = pageSkeleton();

  let run, suite = null, project = null;
  try {
    run = await GET(`/api/runs/${runId}`);
  } catch (e) {
    el.innerHTML = `<div class="text-red-500 text-center py-16">${escHtml(e.message)}</div>`;
    return;
  }

  try {
    ({ suite, project } = await getSuiteWithProject(run.suite_id));
  } catch {
    // Only the breadcrumb and Back button need the parents - render the run without them.
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

  // The page keeps its results, so marking a result, a live update or a
  // filter change re-renders only what changed instead of refetching the run.
  _runView = { runId, run, results: run.results || [], filter: null, failuresFirst: false };
  const results = _runView.results;
  const canRecord = !!state.user;

  el.innerHTML = `
    <div class="fade-in space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <h1 class="text-2xl font-bold text-slate-800">${escHtml(run.name)}</h1>
            <span id="run-status-badge">${runStatusBadge(run)}</span>
            ${envBadge(run.environment_key)}
          </div>
          <p class="text-sm text-slate-500">Started ${formatDate(run.created_at)}${run.created_by_username ? ` by <span class="font-medium text-slate-700">${escHtml(run.created_by_username)}</span>` : ""}</p>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          ${isAdmin() ? `<button onclick="showTriageModal(${runId})"
            class="bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            AI Triage
          </button>` : ""}
          ${suite ? `
            <button onclick="navigate('suite/${suite.id}')"
              class="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
              Back to Suite
            </button>` : ""}
        </div>
      </div>

      <!-- Progress card; its count tiles double as filters -->
      <div id="run-progress" class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">${runProgressInner()}</div>

      <!-- Results list -->
      <div>
        <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 class="text-lg font-semibold text-slate-700">Test Cases</h2>
          <div class="flex items-center gap-3 flex-wrap">
            ${results.length ? `<label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input type="checkbox" id="run-failures-first" data-testid="run-failures-first" onchange="setRunFailuresFirst(this.checked)" class="w-4 h-4 rounded accent-blue-600">
              Failures first
            </label>` : ""}
            <span id="ws-indicator" class="hidden items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>Live
            </span>
          </div>
        </div>
        ${canRecord && results.length ? `
          <p class="hidden sm:block text-xs text-slate-500 mb-3" data-testid="run-shortcuts-hint">
            Keyboard: <kbd class="run-kbd">J</kbd>/<kbd class="run-kbd">K</kbd> or <kbd class="run-kbd">↑</kbd>/<kbd class="run-kbd">↓</kbd> move between tests ·
            <kbd class="run-kbd">P</kbd> pass · <kbd class="run-kbd">F</kbd> fail · <kbd class="run-kbd">S</kbd> skip
          </p>` : ""}
        ${!results.length ? `
          <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-500">
            No active test cases were found in this suite when the run was created.
          </div>` : `
          <div id="run-filter-status" data-testid="run-filter-status"></div>
          <div id="results-list" class="space-y-3">${runResultsListInner()}</div>`}
      </div>
    </div>
    <style>.run-kbd{display:inline-block;min-width:1.25rem;padding:0 .3rem;border:1px solid #cbd5e1;border-bottom-width:2px;border-radius:.3rem;background:#fff;font:600 11px/1.4 ui-monospace,monospace;text-align:center;color:#334155}</style>`;

  // Start WebSocket for live collaboration
  connectRunWebSocket(runId);
}

let _runView = null;

const RESULT_STYLES = {
  pending: { border: "border-slate-200", badge: "bg-slate-100 text-slate-600", label: "Pending" },
  pass:    { border: "border-emerald-200 bg-emerald-50/40", badge: "bg-emerald-100 text-emerald-700", label: "Pass" },
  fail:    { border: "border-red-200 bg-red-50/40",     badge: "bg-red-100 text-red-700",     label: "Fail" },
  skip:    { border: "border-amber-200 bg-amber-50/40",  badge: "bg-amber-100 text-amber-800",  label: "Skip" },
};

function runStatusBadge(run) {
  return run.completed_at
    ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Completed</span>`
    : `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">In Progress</span>`;
}

function runResult(tcId) {
  return _runView?.results.find(r => r.test_case.id === tcId);
}

function runProgressInner() {
  const { results, filter } = _runView;
  const count = s => results.filter(r => r.status === s).length;
  const pass = count("pass"), fail = count("fail"), skip = count("skip"), pending = count("pending");
  const total = results.length;
  const passP = total ? Math.round(pass / total * 100) : 0;
  const failP = total ? Math.round(fail / total * 100) : 0;
  const skipP = total ? Math.round(skip / total * 100) : 0;
  const tile = (status, label, n, cls, numCls, ringCls) => `
    <div>
      <button type="button" data-testid="run-filter-${status}" onclick="setRunFilter('${status}')"
        aria-pressed="${filter === status}" title="${filter === status ? "Show all results" : `Show only ${label.toLowerCase()} results`}"
        class="w-full ${cls} border rounded-xl p-3 transition-all hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${filter === status ? `ring-2 ring-offset-1 ${ringCls}` : ""}">
        <p class="text-xl font-bold ${numCls}">${n}</p>
        <p class="text-xs text-slate-600 mt-0.5">${label}</p>
      </button>
    </div>`;
  return `
    <div class="flex items-center justify-between gap-x-3 gap-y-1 flex-wrap mb-4">
      <h3 class="font-semibold text-slate-700">Run Progress</h3>
      <div class="flex items-center gap-3">
        <span class="text-sm text-slate-500 font-medium">${total - pending} / ${total} executed</span>
        <span class="text-lg font-bold ${passP >= 80 ? "text-emerald-700" : passP >= 50 ? "text-amber-700" : "text-red-600"}">${passP}% pass rate</span>
      </div>
    </div>
    <div class="h-3 bg-slate-100 rounded-full overflow-hidden flex mb-4">
      ${passP ? `<div class="bg-emerald-500 h-full transition-all duration-500" style="width:${passP}%"></div>` : ""}
      ${failP ? `<div class="bg-red-500 h-full transition-all duration-500" style="width:${failP}%"></div>` : ""}
      ${skipP ? `<div class="bg-amber-400 h-full transition-all duration-500" style="width:${skipP}%"></div>` : ""}
    </div>
    <div class="grid grid-cols-4 gap-3 text-center">
      ${tile("pass",    "Pass",    pass,    "bg-emerald-50 border-emerald-200", "text-emerald-700", "ring-emerald-500")}
      ${tile("fail",    "Fail",    fail,    "bg-red-50 border-red-200",         "text-red-600",     "ring-red-500")}
      ${tile("skip",    "Skip",    skip,    "bg-amber-50 border-amber-200",     "text-amber-700",   "ring-amber-500")}
      ${tile("pending", "Pending", pending, "bg-slate-50 border-slate-200",     "text-slate-600",   "ring-slate-500")}
    </div>`;
}

// The results in display order: the active filter, then failures first if asked.
function runVisibleResults() {
  const { results, filter, failuresFirst } = _runView;
  const shown = filter ? results.filter(r => r.status === filter) : results.slice();
  if (failuresFirst) shown.sort((a, b) => (a.status === "fail" ? 0 : 1) - (b.status === "fail" ? 0 : 1));
  return shown;
}

function runResultsListInner() {
  return runVisibleResults().map(r => resultRow(r, _runView.runId)).join("");
}

function renderRunFilterStatus() {
  const box = document.getElementById("run-filter-status");
  if (!box) return;
  const { filter, results } = _runView;
  if (!filter) { box.innerHTML = ""; return; }
  const label = RESULT_STYLES[filter].label.toLowerCase();
  const n = results.filter(r => r.status === filter).length;
  box.innerHTML = `
    <div class="flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-3 text-sm text-blue-900">
      <span>${n ? `Showing ${n} ${label} of ${results.length} results` : `No ${label} results in this run.`}</span>
      <button type="button" data-testid="run-filter-clear" onclick="setRunFilter(null)" class="font-semibold underline hover:text-blue-700">Show all</button>
    </div>`;
}

// Re-renders the list, keeping keyboard focus on the row (or the same button
// in it) that had it - replacing the DOM would otherwise drop focus to <body>.
function renderRunResults() {
  const list = document.getElementById("results-list");
  if (!list) return;
  const active = document.activeElement;
  const row = active?.closest?.("#results-list > [data-tc-id]");
  const focusId = row?.dataset.tcId;
  const focusBtn = active !== row ? active?.dataset?.testid : null;
  list.innerHTML = runResultsListInner();
  renderRunFilterStatus();
  if (focusId) focusRunRow(+focusId, focusBtn);
}

function refreshRunProgress() {
  const box = document.getElementById("run-progress");
  if (box) box.innerHTML = runProgressInner();
  const badge = document.getElementById("run-status-badge");
  if (badge) badge.innerHTML = runStatusBadge(_runView.run);
}

function setRunFilter(status) {
  if (!_runView) return;
  _runView.filter = _runView.filter === status ? null : status;
  refreshRunProgress();
  renderRunResults();
}

function setRunFailuresFirst(on) {
  if (!_runView) return;
  _runView.failuresFirst = on;
  renderRunResults();
}

function focusRunRow(tcId, buttonTestId) {
  const row = document.querySelector(`#results-list > [data-tc-id="${tcId}"]`);
  if (!row) return;
  const btn = buttonTestId && row.querySelector(`[data-testid="${buttonTestId}"]`);
  (btn || row).focus();
}

// Swaps one row for a freshly rendered copy. A row the filter hides stays hidden.
function replaceResultRow(tcId) {
  const old = document.querySelector(`#results-list > [data-tc-id="${tcId}"]`);
  const r = runResult(tcId);
  if (!old || !r) return null;
  const active = document.activeElement;
  const hadFocus = old.contains(active);
  const focusBtn = hadFocus && active !== old ? active.dataset?.testid : null;
  const tpl = document.createElement("template");
  tpl.innerHTML = resultRow(r, _runView.runId).trim();
  const fresh = tpl.content.firstElementChild;
  old.replaceWith(fresh);
  if (hadFocus) focusRunRow(tcId, focusBtn);
  return fresh;
}

// After a result changes: its row, the counts, and the run's own status.
function onRunResultChanged(tcId) {
  const v = _runView;
  const wasCompleted = !!v.run.completed_at;
  if (!wasCompleted && v.results.every(r => r.status !== "pending")) v.run.completed_at = new Date().toISOString();
  const row = replaceResultRow(tcId);
  refreshRunProgress();
  renderRunFilterStatus();
  return { row, justCompleted: !wasCompleted && !!v.run.completed_at };
}

// One-click result: keeps the result's notes (the API replaces them) and,
// when driven from the keyboard, moves on to the next test in the list.
async function markResultInline(tcId, status, { advance = false } = {}) {
  const v = _runView;
  const r = runResult(tcId);
  if (!v || !r) return;
  const runId = v.runId;
  const row = document.querySelector(`#results-list > [data-tc-id="${tcId}"]`);
  row?.querySelectorAll("[data-mark]").forEach(b => { b.disabled = true; });
  row?.setAttribute("aria-busy", "true");
  try {
    const saved = await PUT(`/api/runs/${runId}/results/${tcId}`, { status, notes: r.notes || null });
    if (_runView !== v) return; // navigated away meanwhile
    r.status = saved.status;
    r.notes = saved.notes;
    r.executed_at = new Date().toISOString();
    const { justCompleted } = onRunResultChanged(tcId);
    if (advance) {
      const rows = [...document.querySelectorAll("#results-list > [data-tc-id]")];
      const i = rows.findIndex(x => +x.dataset.tcId === tcId);
      const next = rows[i + 1] || rows[i];
      next?.focus();
      next?.scrollIntoView({ block: "nearest" });
    } else {
      focusRunRow(tcId, `mark-${status}-${tcId}`);
    }
    if (justCompleted) toast("Run complete — every test has a result", "success");
  } catch (e) {
    toast(e.message, "error");
    if (_runView === v) {
      row?.querySelectorAll("[data-mark]").forEach(b => { b.disabled = false; });
      row?.removeAttribute("aria-busy");
    }
  }
}

// Keyboard: J/K (or arrows inside the list) move between rows, P/F/S record.
function handleRunShortcut(e) {
  if (!_runView || document.getElementById("view-run")?.classList.contains("hidden")) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const t = e.target;
  if (t?.closest?.("input, textarea, select, [contenteditable='true']")) return;
  if (!document.getElementById("modal-overlay")?.classList.contains("hidden")) return;
  const auth = document.getElementById("auth-modal");
  if (auth && !auth.classList.contains("hidden")) return;
  const rows = [...document.querySelectorAll("#results-list > [data-tc-id]")];
  if (!rows.length) return;
  const current = t?.closest?.("#results-list > [data-tc-id]");
  const key = e.key.toLowerCase();
  const move = d => {
    const i = current ? rows.indexOf(current) : -1;
    const next = rows[i === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, i + d))];
    next.focus();
    next.scrollIntoView({ block: "nearest" });
  };
  if (key === "j" || (key === "arrowdown" && current)) { e.preventDefault(); move(1); }
  else if (key === "k" || (key === "arrowup" && current)) { e.preventDefault(); move(-1); }
  else if (current && state.user && ["p", "f", "s"].includes(key)) {
    e.preventDefault();
    markResultInline(+current.dataset.tcId, { p: "pass", f: "fail", s: "skip" }[key], { advance: true });
  }
}
document.addEventListener("keydown", handleRunShortcut);

function resultRow(r, runId) {
  const tc = r.test_case;
  const s = RESULT_STYLES[r.status] || RESULT_STYLES.pending;
  const markBtn = (status, label, onCls, icon) => {
    const on = r.status === status;
    return `<button type="button" data-mark data-testid="mark-${status}-${tc.id}" aria-pressed="${on}"
      onclick="markResultInline(${tc.id}, '${status}')" title="${label} (${label[0]})"
      class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500
        ${on ? onCls : "bg-white text-slate-600 hover:bg-slate-50"}">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="${icon}"/></svg>
      ${label}
    </button>`;
  };

  return `
    <div class="bg-white rounded-2xl border ${s.border} shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      data-tc-id="${tc.id}" tabindex="0" role="group" aria-label="${escHtml(tc.title)}: ${s.label}">
      <div class="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-0.5">
            <span class="font-semibold text-slate-800">${escHtml(tc.title)}</span>
            ${priorityBadge(tc.priority)}
          </div>
          ${tc.description ? `<p title="${escHtml(tc.description)}" class="text-xs text-slate-500 truncate">${escHtml(tc.description)}</p>` : ""}
          ${r.notes ? `<p class="text-xs text-slate-600 mt-1.5 bg-slate-50 rounded-lg px-2 py-1 italic">"${escHtml(r.notes)}"</p>` : ""}
          ${r.executed_at ? `<p class="text-xs text-slate-600 mt-1">Executed ${formatDate(r.executed_at)}</p>` : ""}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <span data-status-badge="${r.status}" class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.badge}">${s.label}</span>
          ${state.user ? `<div role="group" aria-label="Record result for ${escHtml(tc.title)}" class="inline-flex rounded-lg border border-slate-200 overflow-hidden divide-x divide-slate-200">
            ${markBtn("pass", "Pass", "bg-emerald-700 text-white", "M5 13l4 4L19 7")}
            ${markBtn("fail", "Fail", "bg-red-600 text-white", "M6 18L18 6M6 6l12 12")}
            ${markBtn("skip", "Skip", "bg-amber-500 text-slate-900", "M13 5l7 7-7 7M5 5l7 7-7 7")}
          </div>` : ""}
          <button
            onclick="showModal('result', {runId: ${runId}, tcId: ${tc.id}, tcTitle: ${escHtml(JSON.stringify(tc.title))}, currentStatus: '${r.status}', currentNotes: ${escHtml(JSON.stringify(r.notes || ''))}})"
            title="Record with notes"
            class="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 rounded-lg text-xs font-semibold transition-all">
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
    deprecated: "bg-slate-100 text-slate-600",
  };
  return `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${m[s] || m.draft}">${s}</span>`;
}

function priorityBadge(p) {
  const m = {
    low:      "bg-slate-100 text-slate-600",
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

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

// ─── Alerts Microservice architecture diagram ────────────────────────────────
// Architecture diagrams: white text needs a dark enough box behind it, and
// arrow labels a darker shade than their dashed line, to meet WCAG AA contrast.
const DIAGRAM_LABEL_COLORS = {
  blue: '#1d4ed8', violet: '#6d28d9', emerald: '#047857', amber: '#b45309',
  slate: '#475569', red: '#b91c1c', orange: '#c2410c', pink: '#be185d',
};
function diagramBoxBg(bg, tc) {
  return tc === 'text-white' ? bg.replace(/-(?:400|500|600)(?![0-9])/, '-700') : bg;
}

function alertsArchDiagram() {
  // Coloured component box
  const box = (bg, border, tc, label, sub, d = 0) =>
    `<div class="aad-box opacity-0 rounded-lg px-3 py-2 border ${border} ${diagramBoxBg(bg, tc)} flex-shrink-0"
        style="animation:aadIn .35s ease forwards;animation-delay:${d + 'ms'}">
      <p class="text-xs font-bold ${tc} leading-tight whitespace-nowrap">${label}</p>
      ${sub ? `<p class="text-[11px] ${tc} leading-tight mt-0.5 whitespace-nowrap">${sub}</p>` : ''}
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
    const lbl$ = lbl ? `<span class="text-[11px] font-medium whitespace-nowrap" style="color:${DIAGRAM_LABEL_COLORS[clr] || head}">${lbl}</span>` : '';
    return isV
      ? `<div class="flex flex-col items-center gap-0 opacity-0 flex-shrink-0" style="animation:aadIn .25s ease forwards;animation-delay:${d}ms">
          ${lbl$}${line}${tip}
        </div>`
      : `<div class="flex flex-col items-center gap-0.5 opacity-0 flex-shrink-0" style="animation:aadIn .25s ease forwards;animation-delay:${d}ms">
          ${lbl$}<div class="flex items-center">${line}${tip}</div>
        </div>`;
  };

  const lane = (label, clr) =>
    `<p class="text-[11px] font-bold uppercase tracking-widest ${clr} mb-2">${label}</p>`;

  // Small tag chip (used for annotations like JWT / Rate limit / node-pod groups)
  const tag = (lbl, bg, tc, d = 0) =>
    `<span class="opacity-0 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold border flex-shrink-0 ${bg} ${tc}"
        style="animation:aadIn .3s ease forwards;animation-delay:${d + 'ms'}">${lbl}</span>`;

  return `
  <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 overflow-x-auto min-w-0">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-slate-800 text-sm">System Architecture</h3>
      <span class="text-[11px] bg-blue-50 text-blue-700 font-semibold px-2.5 py-1 rounded-full border border-blue-200 flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-blue-500 aad-live"></span>GCP · GKE
      </span>
    </div>

    <!-- ① Subscribe & Gateway Flow ─────────────────── -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('① Client → Gateway — User Subscribes to an Alert', 'text-blue-600')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-slate-700','border-slate-800','text-white','User','',0)}
        ${arrow('subscribe on alert','70','right','blue',36)}
        ${box('bg-blue-600','border-blue-700','text-white','FE - SalesOS','Angular Frontend',140)}
        ${arrow('REST','210','right','blue',28)}
        ${box('bg-blue-500','border-blue-600','text-white','Apps Gateway (GW)','JWT Auth · Rate Limit',280)}
        ${arrow('REST','350','right','blue',28)}
        ${box('bg-indigo-500','border-indigo-600','text-white','BE for FE (BFF)','microservice',420)}
        ${arrow('write','490','right','slate',28)}
        ${box('bg-white','border-slate-300','text-slate-700','MongoDB Alerts','Alert Definitions',560)}
      </div>
    </div>

    <!-- ② Application Layer - GCP ──────────────────── -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('② Application Layer — GCP · Email Alert Cron & Workers', 'text-rose-700')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-rose-100','border-rose-300','text-rose-800','Email Alert CRON','CronJob · at 12AM',630)}
        ${arrow('read alerts','700','right','slate',32)}
        ${box('bg-white','border-slate-300','text-slate-700','MongoDB Alerts','Alert Definitions',770)}
        ${arrow('','830','left','rose',24)}
        ${box('bg-rose-100','border-rose-300','text-rose-800','Email Alert CRON','push alerts',900)}
        ${arrow('push alerts','970','right','amber',36)}
        ${box('bg-amber-500','border-amber-600','text-white','Redis DB Queue','In-Memory DB',1040)}
        ${arrow('read events','1110','right','amber',36)}
        ${box('bg-rose-200','border-rose-400','text-rose-900','Email Alert Workers','GKE x 30',1180)}
      </div>
    </div>

    <!-- ③ Search Layer & Async Services ────────────── -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('③ Fan-out — Search Enrichment & Notification Delivery', 'text-amber-700')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-rose-200','border-rose-400','text-rose-900','Email Alert Workers','GKE x 30',1250)}
        ${arrow('search query on news/company','1320','right','amber',48)}
        ${box('bg-amber-50','border-amber-300','text-amber-800','Search-Service','Search Layer',1390)}
        ${arrow('search','1460','right','amber',28)}
        ${box('bg-white','border-slate-300','text-slate-700','SOLR DB','Full-text Index',1530)}
        <div class="flex-1 min-w-4"></div>
        ${arrow('send event of notification','1600','left','slate',48)}
        ${box('bg-amber-50','border-amber-300','text-amber-800','Notification Center','Async Services',1670)}
        ${arrow('send email','1740','right','slate',28)}
        ${box('bg-amber-50','border-amber-300','text-amber-800','Emailer service','Async Services',1810)}
        ${arrow('','1880','right','slate',20)}
        ${box('bg-slate-100','border-slate-300','text-slate-700','📧 Email','Delivered to user',1950)}
      </div>
    </div>

    <!-- ④ Kubernetes Deployment — Availability ─────── -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('④ Kubernetes Deployment — Availability (make sure the system is always running)', 'text-violet-700')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-slate-700','border-slate-800','text-white','User','',2020)}
        ${arrow('alert app','2090','right','violet',32)}
        ${box('bg-violet-600','border-violet-700','text-white','Load Balancer','',2160)}
        ${arrow('','2220','right','violet',24)}
        ${box('bg-violet-100','border-violet-300','text-violet-800','cluster K8S','GCP: GKE · AWS: EKS',2280)}
        <div class="flex items-center gap-1.5 flex-wrap">
          ${tag('Node 1 · Pod 1 → App Alert container','bg-violet-50 border-violet-200','text-violet-700',2350)}
          ${tag('Node 1 · Pod 2','bg-slate-50 border-slate-200','text-slate-500',2380)}
          ${tag('Node 2 · Pod 1 → App Alert container','bg-violet-50 border-violet-200','text-violet-700',2410)}
          ${tag('Node 2 · Pod 2','bg-slate-50 border-slate-200','text-slate-500',2440)}
        </div>
      </div>
    </div>

    <!-- ⑤ Communication Patterns ────────────────────── -->
    <div>
      ${lane('⑤ Communication Patterns — Sync vs Async', 'text-emerald-700')}
      <div class="flex items-center gap-2 flex-wrap mb-2">
        ${box('bg-emerald-700','border-emerald-700','text-white','my service','/api/webhook',2470)}
        ${arrow('subscribe (webhook REST endpoint)','2540','right','emerald',44)}
        ${box('bg-emerald-50','border-emerald-300','text-emerald-800','external service','',2610)}
        ${arrow('calculate / response','2680','left','emerald',44)}
        ${box('bg-emerald-700','border-emerald-700','text-white','my service','',2750)}
        ${arrow('/api/webhook (async)','2820','right','slate',44)}
        ${box('bg-emerald-50','border-emerald-300','text-emerald-800','external service','callback',2890)}
      </div>
      <div class="flex items-center gap-4 flex-wrap mt-2">
        <div>
          <p class="text-[11px] font-bold text-slate-500 mb-1">Sync (point2point)</p>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${tag('REST','bg-emerald-50 border-emerald-200','text-emerald-700',2960)}
            ${tag('webSockets','bg-emerald-50 border-emerald-200','text-emerald-700',2990)}
            ${tag('gRPC · internal','bg-emerald-50 border-emerald-200','text-emerald-700',3020)}
          </div>
        </div>
        <div>
          <p class="text-[11px] font-bold text-slate-500 mb-1">Async</p>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${tag('Queue','bg-slate-50 border-slate-200','text-slate-600',3050)}
            ${tag('Pub/sub','bg-slate-50 border-slate-200','text-slate-600',3080)}
          </div>
        </div>
      </div>
    </div>

    <!-- Legend + live indicator ───────────────────── -->
    <div class="flex items-center gap-4 flex-wrap mt-4 pt-3 border-t border-slate-100">
      ${[['#3b82f6','Gateway / Auth'],['#f59e0b','Queue / Workers'],['#ec4899','Application Layer'],['#8b5cf6','K8s Deployment'],['#10b981','Sync / Async Comms']].map(([c,l])=>`
        <div class="flex items-center gap-1.5">
          <div style="height:2px;width:18px;background:repeating-linear-gradient(to right,${c} 0,${c} 4px,transparent 4px,transparent 8px);background-size:10px 100%;animation:aadFlowR .4s linear infinite"></div>
          <span class="text-[11px] text-slate-500">${l}</span>
        </div>`).join('')}
      <div class="ml-auto flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 aad-live"></span>
        <span class="text-[11px] text-slate-500 font-medium">Live data flow</span>
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
// Demo project name prefixes as templated server-side (api/main.py) - anchored
// to a following date so "TestFlow {ts}" (DEMO_KINDS.testflow) never matches
// "TestFlow Repo - ..." (DEMO_KINDS.playwright), which also starts with
// "TestFlow ".
const DEMO_KINDS = {
  alerts:     { btnId: "demo-seed-btn", labelId: "demo-seed-label", endpoint: "/api/demo/alerts-microservice", namePattern: /^Alerts Microservice \d{4}-\d{2}-\d{2}/, defaultLabel: "Run Alerts Microservice Demo" },
  testflow:   { btnId: "demo-tf-btn",   labelId: "demo-tf-label",   endpoint: "/api/demo/testflow",            namePattern: /^TestFlow \d{4}-\d{2}-\d{2}/,             defaultLabel: "Run TestFlow Demo" },
  playwright: { btnId: "demo-pw-btn",   labelId: "demo-pw-label",   endpoint: "/api/demo/playwright",          namePattern: /^TestFlow Repo — API & E2E Tests Demo/,   defaultLabel: "Run Playwright Architecture Demo" },
};

// GET /api/projects has no auth dependency (api/main.py's list_projects) -
// safe to call as a guest. Finds the most recently created project matching
// a demo kind's name pattern; results are already ordered newest-first.
async function findLatestDemoProject(namePattern) {
  const res = await GET("/api/projects?page_size=100");
  const items = res?.items ?? [];
  return items.find(p => namePattern.test(p.name)) || null;
}

// A guest (no token) can't call the demo-seed endpoints - they require
// get_current_user and reject a missing/placeholder token with a 401. Rather
// than surface that as an error, a guest gets a read-only view of the most
// recently seeded demo project instead: no sign-in prompt, no new data
// created. A signed-in user keeps the original behavior - seed a fresh demo
// project and jump to it.
async function viewOrCreateDemo(kind, elementIds) {
  const cfg = DEMO_KINDS[kind];
  const btn = document.getElementById(elementIds?.btnId || cfg.btnId);
  const label = document.getElementById(elementIds?.labelId || cfg.labelId);
  if (!btn) return;
  btn.disabled = true;
  btn.classList.add("opacity-60");

  if (!getToken()) {
    label.textContent = "Opening demo…";
    try {
      const existing = await findLatestDemoProject(cfg.namePattern);
      if (existing) {
        navigate(`project/${existing.id}`);
      } else {
        toast("No demo project is seeded yet — sign in to create one.", "info");
      }
    } catch (e) {
      toast("Couldn't open the demo right now. Please try again.", "error");
    } finally {
      btn.disabled = false;
      label.textContent = cfg.defaultLabel;
      btn.classList.remove("opacity-60");
    }
    return;
  }

  label.textContent = "Creating demo project…";
  try {
    const project = await POST(cfg.endpoint);
    toast(`Demo project "${project.name}" created!`, "success");
    await loadSidebar();
    navigate(`project/${project.id}`);
  } catch (e) {
    toast("Failed to create demo: " + e.message, "error");
  } finally {
    btn.disabled = false;
    label.textContent = cfg.defaultLabel;
    btn.classList.remove("opacity-60");
  }
}

async function seedAlertsDemo()     { return viewOrCreateDemo("alerts"); }
async function seedTestFlowDemo()   { return viewOrCreateDemo("testflow"); }
async function seedPlaywrightDemo() { return viewOrCreateDemo("playwright"); }

// ─── User Journey Demo (animated, client-side simulation) ────────────────────
const JOURNEY_STEPS = [
  { actor: 'Admin', avatar: 'A', color: '#3b82f6', icon: '🔑', title: 'Admin signs in',
    desc: 'Authenticates with JWT — role: admin', kind: 'login',
    data: { name: 'Rabin (Admin)', role: 'admin' } },
  { actor: 'Admin', avatar: 'A', color: '#3b82f6', icon: '📁', title: 'Creates a Project',
    desc: '"Checkout Service" organizes all related test work', kind: 'create',
    data: { icon: '📁', entity: 'Project', name: 'Checkout Service', fields: [['Name', 'Checkout Service'], ['Description', 'Payment & checkout coverage']] } },
  { actor: 'Admin', avatar: 'A', color: '#3b82f6', icon: '🗂️', title: 'Creates a Suite',
    desc: '"Checkout Flow" groups related test cases', kind: 'create',
    data: { icon: '🗂️', entity: 'Suite', name: 'Checkout Flow', fields: [['Name', 'Checkout Flow'], ['Project', 'Checkout Service']] } },
  { actor: 'Admin', avatar: 'A', color: '#3b82f6', icon: '✅', title: 'Creates a Test Case',
    desc: '"Apply discount code at checkout" — Priority: High', kind: 'create',
    data: { icon: '✅', entity: 'Test Case', name: 'Apply discount code at checkout', fields: [['Priority', 'High'], ['Status', 'Active']] } },
  { actor: 'Admin', avatar: 'A', color: '#3b82f6', icon: '👤', title: 'Creates an Executor user',
    desc: '"jane.tester" — ready to run tests', kind: 'create',
    data: { icon: '👤', entity: 'User', name: 'jane.tester', fields: [['Role', 'Executor'], ['Email', 'jane@company.com']] } },
  { actor: 'Executor', avatar: 'J', color: '#8b5cf6', icon: '🔑', title: 'Executor signs in',
    desc: 'Authenticates with JWT — role: executor', kind: 'login',
    data: { name: 'Jane Tester', role: 'executor' } },
  { actor: 'Executor', avatar: 'J', color: '#8b5cf6', icon: '▶️', title: 'Starts a Test Run',
    desc: '"Sprint 24 Regression" pulls in active test cases', kind: 'create',
    data: { icon: '▶️', entity: 'Run', name: 'Sprint 24 Regression', fields: [['Suite', 'Checkout Flow'], ['Test cases', '1 active']] } },
  { actor: 'Executor', avatar: 'J', color: '#8b5cf6', icon: '📊', title: 'Marks results & sees status',
    desc: 'Pass / fail — live progress updates instantly', kind: 'run' },
];

let _journeyIndex = 0;
let _journeyTimer = null;
let _journeyPlaying = true;

function ensureJourneyStyles() {
  if (document.getElementById("journey-style")) return;
  const style = document.createElement("style");
  style.id = "journey-style";
  style.textContent = `
    @keyframes journeyBarFill { from{width:0%} to{width:100%} }
    @keyframes journeyFadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    .journey-fade-in { opacity:0; animation:journeyFadeIn .4s ease forwards; }
  `;
  document.head.appendChild(style);
}

function journeySceneHTML(step) {
  if (step.kind === 'login') {
    return `
      <div class="flex flex-col items-center justify-center h-full gap-3">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-lg" style="background:${step.color}">${step.data.name[0]}</div>
        <p class="text-sm font-bold text-slate-700">${step.data.name}</p>
        <span class="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full" style="background:${step.color}1a;color:${step.color}">${step.data.role}</span>
        <div class="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold mt-1 journey-fade-in" style="animation-delay:.6s">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          JWT issued
        </div>
      </div>`;
  }
  if (step.kind === 'create') {
    return `
      <div class="flex flex-col items-center justify-center h-full gap-3 w-full max-w-xs mx-auto">
        <div class="w-full rounded-xl border border-slate-200 bg-white shadow-sm p-3">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-lg">${step.data.icon}</span>
            <p class="text-xs font-bold text-slate-700">New ${step.data.entity}</p>
          </div>
          ${step.data.fields.map(([l, v], i) => `
            <div class="mb-1.5 journey-fade-in" style="animation-delay:${.15 + i * .15}s">
              <p class="text-[11px] font-semibold text-slate-500 uppercase">${l}</p>
              <p class="text-xs text-slate-700 border border-slate-200 rounded-md px-2 py-1 bg-slate-50 truncate">${v}</p>
            </div>
          `).join('')}
        </div>
        <div class="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold journey-fade-in" style="animation-delay:${.15 + step.data.fields.length * .15 + .2}s">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          "${step.data.name}" created
        </div>
      </div>`;
  }
  // kind === 'run'
  const rows = [
    { name: 'Apply discount code at checkout', badge: 'Pass', cls: 'bg-emerald-100 text-emerald-700', delay: .3 },
  ];
  return `
    <div class="flex flex-col gap-3 w-full max-w-sm mx-auto">
      <div class="rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
        ${rows.map(r => `
          <div class="flex items-center justify-between px-3 py-2">
            <p class="text-xs text-slate-700 truncate pr-2">${r.name}</p>
            <span class="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${r.cls} journey-fade-in" style="animation-delay:${r.delay}s">${r.badge}</span>
          </div>
        `).join('')}
      </div>
      <div class="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center justify-between journey-fade-in" style="animation-delay:1.1s">
        <p class="text-xs font-bold text-emerald-700">Run complete</p>
        <p class="text-sm font-black text-emerald-700">100% pass</p>
      </div>
    </div>`;
}

function openUserJourneyDemo() {
  ensureJourneyStyles();
  _journeyIndex = 0;
  _journeyPlaying = true;
  document.getElementById("modal-title").textContent = "Live Demo · User Journey";
  document.getElementById("modal-overlay").classList.remove("hidden");
  renderJourneyStep(0);
}

function startJourneyTimer() {
  clearInterval(_journeyTimer);
  _journeyTimer = setInterval(() => {
    const overlay = document.getElementById("modal-overlay");
    if (!overlay || overlay.classList.contains("hidden")) { clearInterval(_journeyTimer); return; }
    if (!_journeyPlaying) return;
    if (_journeyIndex >= JOURNEY_STEPS.length - 1) { clearInterval(_journeyTimer); return; }
    _journeyIndex++;
    renderJourneyStep(_journeyIndex);
  }, 2400);
}

function journeyGoto(i) {
  _journeyIndex = Math.max(0, Math.min(JOURNEY_STEPS.length - 1, i));
  renderJourneyStep(_journeyIndex);
}

function journeyToggle() {
  _journeyPlaying = !_journeyPlaying;
  renderJourneyStep(_journeyIndex);
}

function closeJourneyDemo() {
  clearInterval(_journeyTimer);
  hideModal();
}

function renderJourneyStep(i) {
  const step = JOURNEY_STEPS[i];
  const body = document.getElementById("modal-body");
  body.innerHTML = `
    <div class="w-full">
      <div class="flex gap-1 mb-4">
        ${JOURNEY_STEPS.map((s, idx) => `
          <div class="h-1 flex-1 rounded-full overflow-hidden bg-slate-100">
            ${idx < i
              ? `<div class="h-full rounded-full" style="width:100%;background:${s.color}"></div>`
              : idx === i
                ? `<div class="h-full rounded-full" style="background:${s.color};${_journeyPlaying ? 'animation:journeyBarFill 2.4s linear forwards' : 'width:0%'}"></div>`
                : `<div class="h-full rounded-full" style="width:0%;background:${s.color}"></div>`}
          </div>
        `).join('')}
      </div>

      <div class="flex items-center gap-2 mb-3">
        <span class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white flex-shrink-0" style="background:${step.color}">${step.avatar}</span>
        <div class="min-w-0">
          <p class="text-[11px] font-bold uppercase tracking-wider" style="color:${step.color}">${step.actor} · Step ${i + 1} of ${JOURNEY_STEPS.length}</p>
          <p class="text-sm font-bold text-slate-800 truncate">${step.icon} ${step.title}</p>
        </div>
      </div>
      <p class="text-xs text-slate-500 mb-4">${step.desc}</p>

      <div class="rounded-2xl bg-slate-50 border border-slate-200 h-56 flex items-center justify-center p-4 mb-4 overflow-hidden">
        ${journeySceneHTML(step)}
      </div>

      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex gap-1.5">
          ${JOURNEY_STEPS.map((_, idx) => `
            <button onclick="journeyGoto(${idx})" class="h-2 rounded-full transition-all ${idx === i ? 'w-5 bg-blue-600' : 'w-2 bg-slate-300 hover:bg-slate-400'}"></button>
          `).join('')}
        </div>
        <div class="flex items-center gap-2">
          <button onclick="journeyGoto(${Math.max(0, i - 1)})" class="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-30" ${i === 0 ? 'disabled' : ''}>Prev</button>
          <button onclick="journeyToggle()" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white">${_journeyPlaying ? '⏸ Pause' : '▶ Play'}</button>
          <button onclick="${i === JOURNEY_STEPS.length - 1 ? 'journeyGoto(0)' : `journeyGoto(${i + 1})`}" class="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800">${i === JOURNEY_STEPS.length - 1 ? 'Replay' : 'Next'}</button>
          <button onclick="closeJourneyDemo()" class="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-600">Close</button>
        </div>
      </div>
    </div>`;

  if (_journeyPlaying) startJourneyTimer(); else clearInterval(_journeyTimer);
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
    `<div class="tf-box opacity-0 rounded-lg px-3 py-2 border ${border} ${diagramBoxBg(bg, tc)} flex-shrink-0"
        style="animation:tfIn .35s ease forwards;animation-delay:${d + 'ms'}">
      <p class="text-xs font-bold ${tc} leading-tight whitespace-nowrap">${label}</p>
      ${sub ? `<p class="text-[11px] ${tc} leading-tight mt-0.5 whitespace-nowrap">${sub}</p>` : ''}
    </div>`;
  const tag = (lbl, bg, tc, d = 0) =>
    `<span class="opacity-0 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold border flex-shrink-0 ${bg} ${tc}"
        style="animation:tfIn .3s ease forwards;animation-delay:${d + 'ms'}">${lbl}</span>`;
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
    const lbl$ = lbl ? `<span class="text-[11px] font-medium whitespace-nowrap" style="color:${DIAGRAM_LABEL_COLORS[clr] || head}">${lbl}</span>` : '';
    return isV
      ? `<div class="flex flex-col items-center gap-0 opacity-0 flex-shrink-0" style="animation:tfIn .25s ease forwards;animation-delay:${d}ms">${lbl$}${line}${tip}</div>`
      : `<div class="flex flex-col items-center gap-0.5 opacity-0 flex-shrink-0" style="animation:tfIn .25s ease forwards;animation-delay:${d}ms">${lbl$}<div class="flex items-center">${line}${tip}</div></div>`;
  };
  const lane = (lbl, clr) => `<p class="text-[11px] font-bold uppercase tracking-widest ${clr} mb-2">${lbl}</p>`;

  return `
  <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 overflow-x-auto min-w-0">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-slate-800 text-sm">Playwright Tests — Architecture</h3>
      <span class="text-[11px] bg-red-50 text-red-700 font-semibold px-2.5 py-1 rounded-full border border-red-200 flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-red-500 aad-live"></span>UI E2E · API · POM
      </span>
    </div>

    <!-- ① Spec Layer -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('① Spec Layer — *.spec.ts  ·  *-be.spec.ts  (pure orchestration)', 'text-blue-600')}
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
      ${lane('② Fixtures — src/fixtures/fixtures.ts  (inject, never instantiate)', 'text-violet-700')}
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
        ${box('bg-slate-100','border-slate-300','text-slate-600','+12 more','page objects',1130)}
      </div>
    </div>

    <!-- ③ UI Path — Page Objects -->
    <div class="mb-3 pb-3 border-b border-slate-100">
      ${lane('③ UI Path — Page Object Model  ·  src/pages/*.ts', 'text-emerald-700')}
      <div class="flex items-center gap-2 flex-wrap">
        ${box('bg-emerald-700','border-emerald-700','text-white','Page Class','constructor(page)',1200)}
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
      ${lane('④ API Path — *-endpoint.ts  →  *-helper.ts  →  BaseApiClient', 'text-orange-700')}
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
      ${lane('⑤ Shared Infrastructure — Logger · Utilities · Test Data · Reporting', 'text-pink-700')}
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
          <span class="text-[11px] text-slate-500">${l}</span>
        </div>`).join('')}
      <div class="ml-auto flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-red-400 aad-live"></span>
        <span class="text-[11px] text-slate-500 font-medium">Live data flow</span>
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

// ─── Users View (admin only) ─────────────────────────────────────────────────
async function renderUsers() {
  setBreadcrumb([{ label: "Users", href: "users" }]);
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const el = document.getElementById("view-users");
  el.classList.remove("hidden");
  el.innerHTML = pageSkeleton();
  await loadSidebar();

  const users = await GET("/api/users");
  const roleBadge = r => r === "admin"
    ? `<span class="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">Admin</span>`
    : `<span class="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Executor</span>`;
  const statusBadge = active => active
    ? `<span class="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Active</span>`
    : `<span class="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Inactive</span>`;

  el.innerHTML = `
    <div class="fade-in space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Users</h1>
          <p class="text-sm text-slate-500 mt-0.5">${users.length} account${users.length !== 1 ? "s" : ""}</p>
        </div>
        <button onclick="showAddUserModal()"
          class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          Add Executor
        </button>
      </div>

      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Username</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Email</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Created</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${users.map(u => `
              <tr class="group hover:bg-slate-50 transition-colors ${u.is_active === false ? 'opacity-60' : ''}">
                <td class="px-4 py-3 font-medium text-slate-800">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-full ${u.is_active === false ? 'bg-slate-400' : 'bg-brand-600'} flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      ${escHtml(u.username[0].toUpperCase())}
                    </div>
                    ${escHtml(u.username)}
                  </div>
                </td>
                <td class="px-4 py-3 text-slate-500 hidden sm:table-cell">${escHtml(u.email)}</td>
                <td class="px-4 py-3">${roleBadge(u.role)}</td>
                <td class="px-4 py-3">${statusBadge(u.is_active !== false)}</td>
                <td class="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell">${formatDate(u.created_at)}</td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-1">
                  ${u.role !== "admin" ? `
                  <button onclick="toggleUserStatus(${u.id}, '${escHtml(u.username)}', ${u.is_active !== false})"
                    aria-label="${u.is_active !== false ? 'Deactivate' : 'Activate'} ${escHtml(u.username)}"
                    class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 w-7 h-7 inline-flex items-center justify-center rounded-lg transition-all ${u.is_active !== false ? 'text-slate-500 hover:text-amber-500 hover:bg-amber-50' : 'text-slate-500 hover:text-emerald-500 hover:bg-emerald-50'}"
                    title="${u.is_active !== false ? 'Deactivate' : 'Activate'}">
                    ${u.is_active !== false
                      ? `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>`
                      : `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`}
                  </button>
                  <button onclick="deleteUser(${u.id}, '${escHtml(u.username)}')"
                    aria-label="Remove ${escHtml(u.username)}"
                    class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 w-7 h-7 inline-flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Remove">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>` : ""}
                  </div>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function showAddUserModal() {
  const cls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";
  document.getElementById("modal-title").textContent = "Add Executor";
  document.getElementById("modal-body").innerHTML = `
    <div class="space-y-3">
      <div><label class="block text-xs font-semibold text-slate-600 mb-1">Username *</label>
        <input id="f-name" class="${cls}" placeholder="john_doe" autofocus /></div>
      <div><label class="block text-xs font-semibold text-slate-600 mb-1">Email *</label>
        <input id="f-email" type="email" class="${cls}" placeholder="john@company.com" /></div>
      <div><label class="block text-xs font-semibold text-slate-600 mb-1">Password *</label>
        <input id="f-password" type="password" class="${cls}" placeholder="Min. 6 characters" /></div>
    </div>
    <div class="flex justify-end gap-2 mt-6">
      <button onclick="hideModal()" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
      <button data-testid="modal-submit-btn" onclick="createExecutor()"
        class="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors">
        Create Executor
      </button>
    </div>`;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

async function createExecutor() {
  const username = document.getElementById("f-name").value.trim();
  const email = document.getElementById("f-email").value.trim();
  const password = document.getElementById("f-password").value;
  if (!username || !email || !password) { toast("All fields are required", "error"); return; }
  try {
    await POST("/api/users", { username, email, password });
    hideModal();
    toast(`Executor "${username}" created`);
    navigate("users");
  } catch (e) { toast(e.message, "error"); }
}

async function deleteUser(userId, username) {
  if (!confirm(`Remove executor "${username}"?`)) return;
  try {
    await DEL(`/api/users/${userId}`);
    toast(`"${username}" removed`);
    navigate("users");
  } catch (e) { toast(e.message, "error"); }
}

async function toggleUserStatus(userId, username, currentlyActive) {
  const action = currentlyActive ? "deactivate" : "activate";
  if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${username}"?`)) return;
  try {
    await api("PATCH", `/api/users/${userId}/status`);
    toast(`"${username}" ${currentlyActive ? "deactivated" : "activated"}`);
    navigate("users");
  } catch (e) { toast(e.message, "error"); }
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
  document.getElementById("setup-banner").classList.add("hidden");
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
      <button onclick="navigate('environments')" title="Environments" data-testid="environments-btn"
        class="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors text-xs font-medium">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
        </svg>
        <span class="hidden lg:inline">Environments</span>
      </button>
      ${user.role === "admin" ? `
      <button onclick="navigate('users')" title="User Management" data-testid="users-btn"
        class="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors text-xs font-medium">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        <span class="hidden lg:inline">Users</span>
      </button>
      <button onclick="navigate('logs')" title="Log Center" data-testid="logs-btn"
        class="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors text-xs font-medium">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <span class="hidden lg:inline">Logs</span>
      </button>` : ""}
      <div class="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        ${escHtml(user.username[0].toUpperCase())}
      </div>
      <div class="hidden lg:flex flex-col leading-none">
        <span class="text-sm font-medium text-slate-700">${escHtml(user.username)}</span>
        <span class="text-[11px] font-semibold border rounded px-1 mt-0.5 uppercase tracking-wide ${roleCls}">${escHtml(user.role)}</span>
      </div>
      <button onclick="logout()" title="Log out" aria-label="Log out"
        class="ml-1 text-slate-500 hover:text-red-500 transition-colors" data-testid="logout-btn">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
        </svg>
      </button>
    </div>`;
}

function renderAuthForm(mode) {
  const isSetup = mode === "setup";
  document.getElementById("auth-form-container").innerHTML = `
    <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full p-8 fade-in relative">
      <button onclick="hideAuthModal()" aria-label="Close"
        class="absolute top-4 right-4 text-slate-500 hover:text-slate-600 transition-colors">
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
          <p class="text-xs text-slate-500">Test Case Management</p>
        </div>
      </div>

      ${isSetup ? `
      <div class="mb-5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
        <svg class="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z"/>
        </svg>
        <p class="text-xs text-amber-700">No accounts yet. Create the admin account to get started.</p>
      </div>` : ""}

      <h2 class="text-lg font-semibold text-slate-800 mb-5">${isSetup ? "Create Admin Account" : "Sign in"}</h2>

      <form onsubmit="submitAuth(event, '${mode}')" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Username</label>
          <input id="auth-username" data-testid="auth-username" type="text" autocomplete="username"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            placeholder="${isSetup ? "admin" : "your_username"}" required autofocus />
        </div>
        ${isSetup ? `
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Email</label>
          <input id="auth-email" data-testid="auth-email" type="email" autocomplete="email"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            placeholder="admin@company.com" required />
        </div>` : ""}
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Password</label>
          <input id="auth-password" data-testid="auth-password" type="password" autocomplete="${isSetup ? "new-password" : "current-password"}"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            placeholder="${isSetup ? "Min. 6 characters" : "••••••••"}" required />
        </div>
        <div id="auth-error" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"></div>
        <button type="submit" data-testid="auth-submit-btn"
          class="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
          ${isSetup ? "Create Admin Account" : "Sign in"}
        </button>
      </form>

      ${!isSetup ? `<p class="mt-4 text-center text-xs text-slate-500">Contact your admin to get an account.</p>` : ""}
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
  btn.textContent = mode === "setup" ? "Creating…" : "Signing in…";
  try {
    let url, body;
    if (mode === "setup") {
      const email = document.getElementById("auth-email").value.trim();
      url = "/api/auth/register";
      body = { username, email, password };
    } else {
      url = "/api/auth/login";
      body = { username, password };
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { throw new Error(data.detail || "Authentication failed"); }
    setToken(data.access_token);
    setStoredUser(data.user);
    hideAuthModal();
    showAppShell(data.user);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = mode === "setup" ? "Create Admin Account" : "Sign in";
  }
}

// ─── Client-side error reporting (feeds the Log Center) ───────────────────────
function reportClientError(message, stack) {
  try {
    fetch("/api/logs/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: String(message).slice(0, 500), stack: stack ? String(stack).slice(0, 2000) : null, url: location.href }),
    }).catch(() => {});
  } catch {}
}
window.addEventListener("error", (e) => reportClientError(e.message, e.error && e.error.stack));
window.addEventListener("unhandledrejection", (e) => reportClientError(`Unhandled rejection: ${e.reason}`, e.reason && e.reason.stack));

// ─── Bootstrap ───────────────────────────────────────────────────────────────
window.addEventListener("hashchange", () => router());
document.addEventListener("DOMContentLoaded", async () => {
  const token = getToken();
  if (token) {
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
  // Fetch and display live version
  fetch("/api/version").then(r => r.json()).then(d => {
    const el = document.getElementById("app-version");
    if (el && d.version) el.textContent = `v${d.version}`;
  }).catch(() => {});
  // No admin account yet (a fresh install): say so in a notice, never a
  // popup - visitors must still be able to browse the home page as guests.
  if (!state.user) {
    try {
      const setup = await fetch("/api/auth/setup").then(r => r.json());
      if (setup.setup_needed) document.getElementById("setup-banner").classList.remove("hidden");
    } catch { /* ignore — server may be starting up */ }
  }
});

// ─── WebSocket: Live Run Collaboration ────────────────────────────────────────
let _activeRunWs = null;

// Closing a socket that is still connecting makes the browser log "WebSocket
// is closed before the connection is established"; leaving a run page quickly
// did exactly that. A connecting socket is closed as soon as it opens instead.
function closeRunWebSocket(ws) {
  if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close();
  else ws.close();
}

function connectRunWebSocket(runId) {
  if (_activeRunWs) {
    closeRunWebSocket(_activeRunWs);
    _activeRunWs = null;
  }

  // Browsers can't send an Authorization header on a WebSocket handshake,
  // so the JWT goes in the query string (see shared/ws_protocol.py).
  const token = getToken();
  if (!token) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/runs/${runId}?token=${encodeURIComponent(token)}`);
  _activeRunWs = ws;

  ws.onopen = () => {
    // Open is not live yet: the server accepts first, then checks the token
    // and run, then joins the room and says "subscribed" (shared/ws_protocol.py).
    // Keepalive ping every 25s
    ws._ping = setInterval(() => { if (ws.readyState === 1) ws.send("ping"); }, 25000);
  };

  ws.onmessage = (evt) => {
    if (evt.data === "pong") return;
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === "pong" || msg.type === "error") return;
      if (msg.type === "subscribed") {
        const ind = document.getElementById("ws-indicator");
        if (ind) ind.classList.remove("hidden"), ind.classList.add("flex");
        // Catch up on anything recorded between this page's fetch and the
        // subscription - those updates were broadcast before we were listening.
        reconcileRunResults(runId);
        return;
      }
      if (msg.type === "result_updated") {
        _reconcileTouched?.add(msg.testcase_id);
        // Our own change comes back over the socket too; this page already
        // shows it, so only other people's changes are announced.
        const own = !!msg.updated_by && msg.updated_by === state.user?.username;
        applyLiveResultUpdate(msg, { quiet: own });
        if (msg.run_completed && !own) {
          toast(`Run completed by ${msg.updated_by}`, "info");
        }
      } else if (msg.type === "results_populated") {
        // Run was created with results still pending (services/worker
        // populates them asynchronously) - refetch now that they exist.
        renderRun(runId);
      }
    } catch { /* ignore malformed */ }
  };

  ws.onclose = (evt) => {
    clearInterval(ws._ping);
    // 4401 = token rejected, 4404 = run gone; live updates are best-effort,
    // so just log it — the page itself still works over REST.
    if (evt.code === 4401 || evt.code === 4404) {
      console.warn(`Live updates unavailable for run ${runId} (close ${evt.code}: ${evt.reason})`);
    }
    // Only if this is still the active socket: an older one closing after a
    // newer one opened must not hide its indicator or drop the reference
    // (which would leave the newer socket open after leaving the page).
    if (_activeRunWs !== ws) return;
    const ind = document.getElementById("ws-indicator");
    if (ind) ind.classList.add("hidden");
    _activeRunWs = null;
  };

  ws.onerror = () => ws.close();
}

// Test cases a live update reached while a catch-up fetch was in flight: that
// fetch's response can predate the update, so it must not overwrite them.
let _reconcileTouched = null;

async function reconcileRunResults(runId) {
  const touched = _reconcileTouched = new Set();
  let run;
  try { run = await GET(`/api/runs/${runId}`); } catch { return; }
  finally { if (_reconcileTouched === touched) _reconcileTouched = null; }
  if (_runView?.runId !== runId) return;
  for (const r of run?.results || []) {
    if (touched.has(r.testcase_id)) continue;
    const mine = runResult(r.testcase_id);
    if (mine && mine.status !== r.status) {
      applyLiveResultUpdate({ testcase_id: r.testcase_id, status: r.status, notes: r.notes }, { quiet: true });
    }
  }
}

function applyLiveResultUpdate(msg, { quiet = false } = {}) {
  const r = runResult(msg.testcase_id);
  if (!r) return;
  // Our own change echoed back is already on the page: re-rendering would
  // only drop keyboard focus from the row.
  const changed = r.status !== msg.status || ("notes" in msg && (msg.notes ?? null) !== (r.notes ?? null));
  if (changed) {
    r.status = msg.status;
    if ("notes" in msg) r.notes = msg.notes;
    if (msg.status !== "pending") r.executed_at = r.executed_at || new Date().toISOString();
    const { row } = onRunResultChanged(msg.testcase_id);
    if (row) {
      row.classList.add("ring-2", "ring-blue-400");
      setTimeout(() => row.classList.remove("ring-2", "ring-blue-400"), 1500);
    }
  }
  if (!quiet) toast(`${msg.updated_by} marked a test as ${msg.status}`, "info");
}


// ─── AI Test Case Generation ──────────────────────────────────────────────────
function showAIGenerateModal(suiteId) {
  const title = document.getElementById("modal-title");
  const body  = document.getElementById("modal-body");
  const overlay = document.getElementById("modal-overlay");
  title.textContent = "Generate Test Cases with AI";
  body.innerHTML = `
    <div class="space-y-4">
      <div class="bg-violet-50 border border-violet-200 rounded-xl p-3 text-sm text-violet-700">
        Describe the feature or scenario you want to test. Claude AI will generate detailed, actionable test cases.
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1.5">Feature Description</label>
        <textarea id="ai-desc" rows="4" placeholder="e.g. User login with email and password, including error cases for wrong credentials and locked accounts..."
          class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"></textarea>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1.5">Number of test cases</label>
        <select id="ai-count" class="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
          <option value="3">3</option>
          <option value="5" selected>5</option>
          <option value="8">8</option>
          <option value="10">10</option>
        </select>
      </div>
      <div id="ai-error" class="hidden text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2"></div>
      <div id="ai-results" class="hidden space-y-3"></div>
      <div class="flex gap-2 pt-2">
        <button id="ai-generate-btn" onclick="runAIGenerate(${suiteId})"
          class="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          Generate
        </button>
        <button onclick="hideModal()" class="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl transition-colors">Cancel</button>
      </div>
    </div>`;
  overlay.classList.remove("hidden");
}

async function runAIGenerate(suiteId) {
  const desc = document.getElementById("ai-desc")?.value.trim();
  const count = parseInt(document.getElementById("ai-count")?.value || "5");
  const errEl = document.getElementById("ai-error");
  const btn   = document.getElementById("ai-generate-btn");
  const resultsEl = document.getElementById("ai-results");

  errEl.classList.add("hidden");
  if (!desc) { errEl.textContent = "Please enter a feature description."; errEl.classList.remove("hidden"); return; }

  btn.disabled = true;
  btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"/><path fill="currentColor" class="opacity-75" d="M4 12a8 8 0 018-8v8z"/></svg> Generating…`;

  try {
    const data = await POST(`/api/suites/${suiteId}/testcases/generate`, { feature_description: desc, count });
    if (!data) throw new Error("No response from server");

    const tcs = data.test_cases || [];
    resultsEl.classList.remove("hidden");
    resultsEl.innerHTML = `
      <div class="flex items-center justify-between">
        <p class="text-sm font-semibold text-slate-700">${tcs.length} test cases generated <span class="text-xs font-normal text-slate-500">via ${data.model}</span></p>
        <button onclick="saveAllAITestCases(${suiteId})"
          class="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
          Save All
        </button>
      </div>
      ${tcs.map((tc, i) => `
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
          <div class="flex items-start justify-between gap-2">
            <p class="text-sm font-semibold text-slate-800">${escHtml(tc.title)}</p>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
              tc.priority === 'critical' ? 'bg-red-100 text-red-700' :
              tc.priority === 'high'     ? 'bg-orange-100 text-orange-700' :
              tc.priority === 'medium'   ? 'bg-blue-100 text-blue-700' :
                                          'bg-slate-100 text-slate-600'
            }">${tc.priority}</span>
          </div>
          <p class="text-xs text-slate-500">${escHtml(tc.description)}</p>
          ${tc.steps ? `<p class="text-xs text-slate-600 mt-1"><strong>Steps:</strong> ${escHtml(tc.steps)}</p>` : ""}
          ${tc.expected_result ? `<p class="text-xs text-slate-600"><strong>Expected:</strong> ${escHtml(tc.expected_result)}</p>` : ""}
        </div>`).join("")}`;

    // Store generated cases for bulk save
    window._aiGeneratedCases = tcs;
    window._aiTargetSuiteId  = suiteId;
    window._aiGenerationId   = data.generation_id || null;

    btn.disabled = false;
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Regenerate`;
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove("hidden");
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Generate`;
  }
}

async function saveAllAITestCases(suiteId) {
  const cases = window._aiGeneratedCases;
  if (!cases || !cases.length) return;
  try {
    // generation_id links each saved draft to the call that produced it, so
    // its human review can be exported as an eval case (see api/ai_review.py).
    const gen = window._aiGenerationId ? `?generation_id=${encodeURIComponent(window._aiGenerationId)}` : "";
    const result = await api("POST", `/api/suites/${suiteId}/testcases/generate/save${gen}`, cases);
    toast(`${result.saved} drafts saved — review them below`, "success");
    hideModal();
    await renderSuite(suiteId);
  } catch (e) {
    toast(e.message, "error");
  }
}


// ─── Human review of AI drafts (M9, see api/ai_review.py) ──────────────────
// Every saved AI draft gets a pending review: accept, edit, or reject with a
// reason. Verdicts are exported as eval cases, and rejections are fed into
// the suite's next generation prompt.
let _aiPendingReviews = {};

async function loadPendingAIReviews(suiteId) {
  try {
    const reviews = (await GET(`/api/suites/${suiteId}/ai-reviews?verdict=pending`)) || [];
    _aiPendingReviews = Object.fromEntries(reviews.map(r => [r.id, r]));
    return reviews;
  } catch {
    // Review is an add-on to the suite page: if it can't load, the page still renders.
    _aiPendingReviews = {};
    return [];
  }
}

function aiReviewPanel(suiteId, reviews) {
  if (!reviews || !reviews.length) return "";
  const admin = isAdmin();
  return `
    <div id="ai-review-panel" data-testid="ai-review-panel" class="bg-violet-50/60 border border-violet-200 rounded-2xl p-4 space-y-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 class="text-sm font-semibold text-violet-800">${reviews.length} AI draft${reviews.length !== 1 ? "s" : ""} awaiting review</h2>
          <p class="text-xs text-violet-700/80">Accept, edit, or reject with a reason. Rejections teach the next generation and become eval cases.</p>
        </div>
      </div>
      ${reviews.map(r => `
        <div data-testid="ai-review-${r.id}" class="bg-white border border-violet-100 rounded-xl p-3">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-slate-800">${escHtml(r.original.title)}</p>
              ${r.original.description ? `<p class="text-xs text-slate-500 mt-0.5">${escHtml(r.original.description)}</p>` : ""}
              ${r.feature_description ? `<p class="text-[11px] text-slate-500 mt-1">From: “${escHtml(r.feature_description)}”${r.model ? ` · ${escHtml(r.model)}` : ""}</p>` : ""}
            </div>
            ${admin ? `<div class="flex items-center gap-1.5 flex-shrink-0">
              <button data-testid="ai-review-accept-${r.id}" onclick="reviewAIDraft(${suiteId}, ${r.id}, {verdict: 'accepted'})"
                class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white">Accept</button>
              <button data-testid="ai-review-edit-${r.id}" onclick="showAIDraftEditModal(${suiteId}, ${r.id})"
                class="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Edit</button>
              <button data-testid="ai-review-reject-${r.id}" onclick="showAIDraftRejectModal(${suiteId}, ${r.id})"
                class="text-xs font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Reject</button>
            </div>` : ""}
          </div>
        </div>`).join("")}
    </div>`;
}

async function reviewAIDraft(suiteId, reviewId, decision) {
  try {
    await POST(`/api/ai-reviews/${reviewId}`, decision);
    const verb = { accepted: "accepted", edited: "saved with your edits", rejected: "rejected" }[decision.verdict];
    toast(`Draft ${verb}`, "success");
    hideModal();
    await renderSuite(suiteId);
  } catch (e) {
    const err = document.getElementById("ai-review-error");
    if (err) { err.textContent = e.message; err.classList.remove("hidden"); }
    else toast(e.message, "error");
  }
}

function _openReviewModal(titleText, bodyHtml) {
  document.getElementById("modal-title").textContent = titleText;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function showAIDraftRejectModal(suiteId, reviewId) {
  const r = _aiPendingReviews[reviewId];
  if (!r) return;
  _openReviewModal("Reject AI draft", `
    <div class="space-y-3">
      <p class="text-sm text-slate-700"><strong>${escHtml(r.original.title)}</strong></p>
      <label class="block text-sm font-medium text-slate-700" for="ai-reject-reason">Why is it wrong? <span class="text-red-600">*</span></label>
      <textarea id="ai-reject-reason" rows="3" maxlength="1000" placeholder="e.g. Duplicates an existing case; too vague to execute; out of scope"
        class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"></textarea>
      <p class="text-xs text-slate-500">The reason is shown to the model on this suite's next generation, and the draft becomes an eval case.</p>
      <div id="ai-review-error" class="hidden text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2"></div>
      <div class="flex gap-2 pt-1">
        <button data-testid="ai-reject-confirm" onclick="submitAIDraftReject(${suiteId}, ${reviewId})"
          class="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-xl">Reject draft</button>
        <button onclick="hideModal()" class="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl">Cancel</button>
      </div>
    </div>`);
}

function submitAIDraftReject(suiteId, reviewId) {
  const reason = document.getElementById("ai-reject-reason")?.value.trim();
  if (!reason) {
    const err = document.getElementById("ai-review-error");
    err.textContent = "Please say why — the reason is what the model and the eval learn from.";
    err.classList.remove("hidden");
    return;
  }
  reviewAIDraft(suiteId, reviewId, { verdict: "rejected", reason });
}

function showAIDraftEditModal(suiteId, reviewId) {
  const r = _aiPendingReviews[reviewId];
  if (!r) return;
  const o = r.original;
  const field = (id, label, value, rows) => `
    <div>
      <label class="block text-xs font-medium text-slate-600 mb-1" for="${id}">${label}</label>
      ${rows ? `<textarea id="${id}" rows="${rows}" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">${escHtml(value || "")}</textarea>`
             : `<input id="${id}" value="${escHtml(value || "")}" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">`}
    </div>`;
  _openReviewModal("Edit AI draft", `
    <div class="space-y-3">
      ${field("ai-edit-title", "Title", o.title)}
      ${field("ai-edit-description", "Description", o.description, 2)}
      ${field("ai-edit-steps", "Steps", o.steps, 3)}
      ${field("ai-edit-expected", "Expected result", o.expected_result, 2)}
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1" for="ai-edit-priority">Priority</label>
        <select id="ai-edit-priority" class="border border-slate-200 rounded-xl px-3 py-2 text-sm">
          ${["low", "medium", "high", "critical"].map(p => `<option value="${p}" ${p === o.priority ? "selected" : ""}>${p}</option>`).join("")}
        </select>
      </div>
      <div id="ai-review-error" class="hidden text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2"></div>
      <div class="flex gap-2 pt-1">
        <button data-testid="ai-edit-confirm" onclick="submitAIDraftEdit(${suiteId}, ${reviewId})"
          class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-xl">Save & accept</button>
        <button onclick="hideModal()" class="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl">Cancel</button>
      </div>
    </div>`);
}

function submitAIDraftEdit(suiteId, reviewId) {
  const o = _aiPendingReviews[reviewId]?.original || {};
  const now = {
    title: document.getElementById("ai-edit-title").value.trim(),
    description: document.getElementById("ai-edit-description").value,
    steps: document.getElementById("ai-edit-steps").value,
    expected_result: document.getElementById("ai-edit-expected").value,
    priority: document.getElementById("ai-edit-priority").value,
  };
  // Send only what changed, so the eval export records exactly what the reviewer fixed.
  const edits = Object.fromEntries(Object.entries(now).filter(([k, v]) => v !== (o[k] ?? "")));
  if (!now.title) { const err = document.getElementById("ai-review-error"); err.textContent = "Title can't be empty."; err.classList.remove("hidden"); return; }
  if (!Object.keys(edits).length) { reviewAIDraft(suiteId, reviewId, { verdict: "accepted" }); return; }
  reviewAIDraft(suiteId, reviewId, { verdict: "edited", edits });
}


// ─── Flaky Test Detection ──────────────────────────────────────────────────────
async function showFlakyTestsModal(suiteId) {
  const title = document.getElementById("modal-title");
  const body = document.getElementById("modal-body");
  const overlay = document.getElementById("modal-overlay");
  title.textContent = "Flaky Tests";
  body.innerHTML = `<div class="flex items-center justify-center py-8"><div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>`;
  overlay.classList.remove("hidden");

  try {
    const data = await GET(`/api/suites/${suiteId}/flaky-tests`);
    const cases = data.flaky_cases || [];
    if (!cases.length) {
      body.innerHTML = `
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700">
          No flaky tests detected — every test case's pass/fail history across runs has been stable (or there isn't enough run history yet).
        </div>
        <button onclick="hideModal()" class="w-full mt-4 px-4 py-2.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl transition-colors">Close</button>`;
      return;
    }
    body.innerHTML = `
      <div class="space-y-3">
        <p class="text-sm text-slate-500">Test cases whose results have flip-flopped between pass and fail across multiple runs — worth investigating before trusting their result.</p>
        ${cases.map(c => `
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div class="flex items-center justify-between gap-2 mb-1">
              <p class="text-sm font-semibold text-slate-800">${escHtml(c.title)}</p>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">${Math.round(c.flakiness_score * 100)}% flaky</span>
            </div>
            <p class="text-xs text-slate-500">${c.flip_count} flips across ${c.executions} executions</p>
            <div class="flex gap-1 mt-2">
              ${c.history.map(s => `<span class="w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold ${s === "pass" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}" title="${s}">${s === "pass" ? "✓" : "✗"}</span>`).join("")}
            </div>
          </div>`).join("")}
        <button onclick="hideModal()" class="w-full px-4 py-2.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl transition-colors">Close</button>
      </div>`;
  } catch (e) {
    body.innerHTML = `<div class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">${escHtml(e.message)}</div>`;
  }
}


// ─── AI Failure Triage ──────────────────────────────────────────────────────────
const TRIAGE_VERDICT_LABELS = {
  product_bug: ["Product bug", "bg-red-100 text-red-700"],
  flaky:       ["Flaky test", "bg-amber-100 text-amber-700"],
  environment: ["Environment", "bg-sky-100 text-sky-700"],
  unknown:     ["Undecided", "bg-slate-200 text-slate-600"],
};

// Bug vs flaky vs environment for one failing case: the agent's verdict
// (or the heuristic's in single-shot mode), the evidence behind it, and a
// "needs review" flag when agent and heuristic disagree or nobody could tell.
function triageVerdictHtml(v) {
  if (!v) return "";
  const [label, cls] = TRIAGE_VERDICT_LABELS[v.verdict] || TRIAGE_VERDICT_LABELS.unknown;
  const evidence = v.agent_evidence || v.heuristic_evidence;
  const crossCheck = v.agent_verdict && v.agent_verdict !== v.heuristic_verdict
    ? ` · heuristic says ${escHtml((TRIAGE_VERDICT_LABELS[v.heuristic_verdict] || TRIAGE_VERDICT_LABELS.unknown)[0])}` : "";
  return `
    <div data-testid="triage-verdict" class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      <span class="px-2 py-0.5 rounded-full font-semibold ${cls}">${label}</span>
      ${v.needs_human_review ? `<span data-testid="triage-needs-review" class="px-2 py-0.5 rounded-full font-semibold bg-orange-100 text-orange-700">Needs human review</span>` : ""}
      <span class="text-slate-500">${escHtml(evidence)}${crossCheck}</span>
    </div>`;
}

async function showTriageModal(runId) {
  const title = document.getElementById("modal-title");
  const body = document.getElementById("modal-body");
  const overlay = document.getElementById("modal-overlay");
  title.textContent = "AI Failure Triage";
  body.innerHTML = `<div class="flex items-center justify-center py-8"><div class="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin"></div></div>`;
  overlay.classList.remove("hidden");

  try {
    // Agentic mode (course milestone M7): the model may call read-only tools
    // (case history, similar cases, suite flakiness) before diagnosing. The
    // server falls back to single-shot for non-Anthropic providers.
    const data = await POST(`/api/runs/${runId}/triage?agentic=true`);
    const toolCalls = data.tool_calls || [];
    const verdicts = Object.fromEntries((data.verdicts || []).map(v => [v.testcase_id, v]));
    body.innerHTML = `
      <div class="space-y-4">
        <div class="bg-violet-50 border border-violet-200 rounded-xl p-3 text-sm text-violet-800">
          ${escHtml(data.summary)}
        </div>
        ${data.mode === "agentic" ? `
          <div data-testid="triage-tool-trace" class="border border-slate-200 rounded-xl p-3">
            <p class="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Evidence gathered · ${toolCalls.length} tool call${toolCalls.length === 1 ? "" : "s"}${data.hit_iteration_cap ? " · step limit reached" : ""}</p>
            ${toolCalls.length ? `<ol class="space-y-1.5">
              ${toolCalls.map((c, i) => `
                <li class="text-xs text-slate-600">
                  <span class="font-mono font-semibold ${c.is_error ? "text-red-600" : "text-violet-700"}">${i + 1}. ${escHtml(c.name)}</span>
                  <span class="font-mono text-slate-500">${escHtml(JSON.stringify(c.input))}</span>
                </li>`).join("")}
            </ol>` : `<p class="text-xs text-slate-500">The agent answered without needing extra evidence.</p>`}
          </div>` : ""}
        ${data.problem_results.length ? `
          <div class="space-y-2">
            ${data.problem_results.map(r => `
              <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-sm font-semibold text-slate-800">${escHtml(r.title)}</p>
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium ${r.status === "fail" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}">${r.status}</span>
                </div>
                ${r.notes ? `<p class="text-xs text-slate-500 mt-1">${escHtml(r.notes)}</p>` : ""}
                ${triageVerdictHtml(verdicts[r.testcase_id])}
              </div>`).join("")}
          </div>` : ""}
        ${data.model ? `<p class="text-xs text-slate-500">via ${escHtml(data.model)}</p>` : ""}
        <button onclick="hideModal()" class="w-full px-4 py-2.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl transition-colors">Close</button>
      </div>`;
  } catch (e) {
    body.innerHTML = `<div class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">${escHtml(e.message)}</div>`;
  }
}


// ─── Environments ───────────────────────────────────────────────────────────
function envBadge(key) {
  if (!key) return "";
  const cls = key === "prod" ? "bg-rose-100 text-rose-700"
            : key === "preprod" ? "bg-orange-100 text-orange-700"
            : key === "regression" ? "bg-cyan-100 text-cyan-700"
            :                        "bg-slate-100 text-slate-600";
  return `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${cls}">${escHtml(key)}</span>`;
}

function envStatusCls(status) {
  return status === "healthy" ? "bg-emerald-100 text-emerald-700"
       : status === "degraded" ? "bg-amber-100 text-amber-700"
       :                         "bg-red-100 text-red-700";
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days}d ${hours}h` : `${hours}h`;
}

async function renderEnvironments() {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const el = document.getElementById("view-environments");
  el.classList.remove("hidden");
  el.innerHTML = pageSkeleton();

  let envs;
  try {
    envs = await GET("/api/environments");
  } catch (e) {
    console.error("Failed to load environments", e);
    el.innerHTML = `<div class="text-red-500 text-center py-16">${escHtml(e.message || "Failed to load environments")}</div>`;
    return;
  }
  // GET() returns null (not a thrown error) on a 401 — it redirects to the
  // sign-in modal itself, so just stop here instead of crashing on .map.
  if (!envs) return;

  setBreadcrumb([
    { label: "Projects", href: "projects" },
    { label: "Environments", href: "environments" },
  ]);

  el.innerHTML = `
    <div class="fade-in space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Environments</h1>
        <p class="text-sm text-slate-500 mt-0.5">Deployment pipeline · each environment runs on its own Kubernetes node (see <code class="bg-slate-100 text-slate-700 px-1 py-0.5 rounded text-xs">k8s/overlays/</code>)</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        ${envs.map(envCard).join("")}
      </div>
      <p class="text-xs text-slate-500">Pod/CPU/memory figures are simulated telemetry for this demo (no live cluster behind it) — refreshes every 5 minutes.</p>
    </div>`;
}

function envCard(e) {
  return `
    <div data-testid="env-card-${e.key}" class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div class="flex items-center justify-between mb-2">
        <span class="font-semibold text-slate-800">${escHtml(e.name)}</span>
        <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${envStatusCls(e.status)}">${escHtml(e.status)}</span>
      </div>
      <div class="space-y-1 text-xs text-slate-500 mb-3">
        <div class="flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          <span class="font-mono">${escHtml(e.node_name)}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 1.1 3.6 2 8 2s8-.9 8-2V7M4 7c0 1.1 3.6 2 8 2s8-.9 8-2M4 7c0-1.1 3.6-2 8-2s8 .9 8 2"/></svg>
          <span class="font-mono">${escHtml(e.namespace)}</span>
        </div>
        <div>${escHtml(e.region)} · uptime ${formatUptime(e.uptime_seconds)}</div>
      </div>
      <div class="flex items-center justify-between text-xs mb-1">
        <span class="text-slate-500">Pods</span>
        <span class="font-semibold ${e.pods_ready === e.pods_desired ? "text-emerald-700" : "text-amber-700"}">${e.pods_ready}/${e.pods_desired}</span>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div class="flex justify-between text-slate-500 mb-0.5"><span>CPU</span><span>${e.cpu_pct}%</span></div>
          <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-blue-500" style="width:${e.cpu_pct}%"></div></div>
        </div>
        <div>
          <div class="flex justify-between text-slate-500 mb-0.5"><span>Mem</span><span>${e.mem_pct}%</span></div>
          <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-violet-500" style="width:${e.mem_pct}%"></div></div>
        </div>
      </div>
    </div>`;
}

// ─── Log Center ──────────────────────────────────────────────────────────────
const LOG_PAGE_SIZE = 25;
const logFilters = { level: "", source: "", search: "", page: 1 };

function logLevelCls(level) {
  return level === "error" ? "bg-red-100 text-red-700"
       : level === "warning" ? "bg-amber-100 text-amber-700"
       :                       "bg-slate-100 text-slate-600";
}

function setLogFilter(field, value) {
  logFilters[field] = value;
  logFilters.page = 1;
  loadLogs();
}

function setLogPage(page) {
  logFilters.page = page;
  loadLogs();
}

async function renderLogs() {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const el = document.getElementById("view-logs");
  el.classList.remove("hidden");
  el.innerHTML = pageSkeleton();

  setBreadcrumb([
    { label: "Projects", href: "projects" },
    { label: "Log Center", href: "logs" },
  ]);

  logFilters.page = 1;
  await loadLogs();
}

// Each filter change starts a load; only the latest may render, or a slower
// earlier response would replace newer results with stale ones.
let _logsLoadSeq = 0;

async function loadLogs() {
  const seq = ++_logsLoadSeq;
  const el = document.getElementById("view-logs");
  const params = new URLSearchParams({ page: String(logFilters.page), page_size: String(LOG_PAGE_SIZE) });
  if (logFilters.level) params.set("level", logFilters.level);
  if (logFilters.source) params.set("source", logFilters.source);
  if (logFilters.search) params.set("search", logFilters.search);

  let resp;
  try {
    resp = await GET(`/api/logs?${params.toString()}`);
  } catch (e) {
    if (seq !== _logsLoadSeq) return;
    el.innerHTML = `<div class="text-red-500 text-center py-16">${escHtml(e.message)}</div>`;
    return;
  }
  if (seq !== _logsLoadSeq) return;
  if (!resp) return;
  const entries = resp.items ?? resp ?? [];
  const total = resp.total ?? entries.length;
  const page = resp.page ?? 1;
  const totalPages = resp.total_pages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * LOG_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * LOG_PAGE_SIZE, total);

  const errorCount = entries.filter(x => x.level === "error").length;
  const warningCount = entries.filter(x => x.level === "warning").length;

  el.innerHTML = `
    <div class="fade-in space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Log Center</h1>
          <p class="text-sm text-slate-500 mt-0.5">Showing ${rangeStart}–${rangeEnd} of ${total} · <span class="${errorCount ? "text-red-600 font-semibold" : "text-slate-500"}">${errorCount} error${errorCount === 1 ? "" : "s"}</span> · <span class="${warningCount ? "text-amber-700 font-semibold" : "text-slate-500"}">${warningCount} warning${warningCount === 1 ? "" : "s"}</span></p>
        </div>
        <button onclick="loadLogs()" class="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.13-5.36M20 15a9 9 0 01-14.13 5.36"/></svg>
          Refresh
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-slate-200 p-3">
        <select id="log-f-level" aria-label="Filter by level" onchange="setLogFilter('level', this.value)" class="${inputCls} w-auto text-sm">
          <option value="">All levels</option>
          <option value="error" ${logFilters.level === "error" ? "selected" : ""}>Error</option>
          <option value="warning" ${logFilters.level === "warning" ? "selected" : ""}>Warning</option>
          <option value="info" ${logFilters.level === "info" ? "selected" : ""}>Info</option>
        </select>
        <select id="log-f-source" aria-label="Filter by source" onchange="setLogFilter('source', this.value)" class="${inputCls} w-auto text-sm">
          <option value="">All sources</option>
          <option value="server" ${logFilters.source === "server" ? "selected" : ""}>Server</option>
          <option value="client" ${logFilters.source === "client" ? "selected" : ""}>Client (browser)</option>
        </select>
        <input id="log-f-search" value="${escHtml(logFilters.search)}" placeholder="Search message…"
          onkeydown="if(event.key==='Enter'){setLogFilter('search', this.value);}"
          class="${inputCls} flex-1 min-w-[160px] text-sm" />
        <button onclick="setLogFilter('search', document.getElementById('log-f-search').value)"
          class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors">Search</button>
      </div>
      ${!entries.length ? `
        <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-500 text-sm">No log entries match these filters.</div>` : `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th class="px-4 py-2 font-medium">Time</th>
                <th class="px-4 py-2 font-medium">Level</th>
                <th class="px-4 py-2 font-medium">Source</th>
                <th class="px-4 py-2 font-medium">Message</th>
                <th class="px-4 py-2 font-medium">Status</th>
                <th class="px-4 py-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${entries.map(logRowHtml).join("")}
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between flex-wrap gap-3" data-testid="log-pagination">
          <p class="text-xs text-slate-500">Page ${page} of ${totalPages}</p>
          <div class="flex items-center gap-2">
            <button data-testid="log-prev-btn" onclick="setLogPage(${page - 1})" ${page <= 1 ? "disabled" : ""}
              class="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Previous</button>
            <button data-testid="log-next-btn" onclick="setLogPage(${page + 1})" ${page >= totalPages ? "disabled" : ""}
              class="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next</button>
          </div>
        </div>`}
    </div>`;
}

function logRowHtml(e) {
  return `
    <tr data-testid="log-row-${e.id}" class="hover:bg-slate-50">
      <td class="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">${formatDateTime(e.created_at)}</td>
      <td class="px-4 py-2"><span class="px-2 py-0.5 rounded-full text-xs font-semibold ${logLevelCls(e.level)}">${escHtml(e.level)}</span></td>
      <td class="px-4 py-2 text-xs text-slate-500">${escHtml(e.source)}</td>
      <td class="px-4 py-2 text-slate-700 max-w-md truncate" title="${escHtml(e.extra || "")}">${escHtml(e.message)}</td>
      <td class="px-4 py-2 text-xs text-slate-500">${e.status_code ?? "—"}</td>
      <td class="px-4 py-2 text-xs text-slate-500">${e.duration_ms != null ? e.duration_ms + "ms" : "—"}</td>
    </tr>`;
}

// ─── Analytics Dashboard ──────────────────────────────────────────────────────
let _analyticsChart = null;

async function renderAnalytics(projectId) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const el = document.getElementById("view-analytics");
  el.classList.remove("hidden");
  el.innerHTML = pageSkeleton();

  let data;
  try {
    data = await GET(`/api/projects/${projectId}/analytics`);
  } catch (e) {
    el.innerHTML = `<div class="text-red-500 text-center py-16">${escHtml(e.message)}</div>`;
    return;
  }

  setBreadcrumb([
    { label: "Projects", href: "projects" },
    { label: data.project_name, href: `project/${projectId}` },
    { label: "Analytics", href: `project/${projectId}` },
  ]);

  const history = data.run_history || [];
  const coverage = data.suite_coverage || [];

  el.innerHTML = `
    <div class="fade-in space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Analytics</h1>
          <p class="text-sm text-slate-500 mt-0.5">${escHtml(data.project_name)}</p>
        </div>
        <button onclick="navigate('project/${projectId}')" class="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Back
        </button>
      </div>

      ${!history.length ? `
        <div class="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-16 text-center">
          <p class="text-slate-500 text-sm">No completed runs yet. Execute some test runs to see analytics.</p>
        </div>` : `

      <!-- Pass rate trend -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 class="text-base font-semibold text-slate-700 mb-1">Pass Rate Trend</h2>
        <p class="text-xs text-slate-500 mb-4">Last ${history.length} completed runs across all suites</p>
        <div style="position:relative;height:240px">
          <canvas id="analytics-chart"></canvas>
        </div>
      </div>

      <!-- Run breakdown table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100">
          <h2 class="text-base font-semibold text-slate-700">Run History</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-xs text-slate-500 font-medium uppercase tracking-wider">
              <tr>
                <th class="px-4 py-3 text-left">Run</th>
                <th class="px-4 py-3 text-right text-emerald-700">Pass</th>
                <th class="px-4 py-3 text-right text-red-600">Fail</th>
                <th class="px-4 py-3 text-right text-amber-700">Skip</th>
                <th class="px-4 py-3 text-right">Pass Rate</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${history.map(r => `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="px-4 py-3 font-medium text-slate-800">${escHtml(r.run_name)}</td>
                  <td class="px-4 py-3 text-right text-emerald-700 font-semibold">${r.pass_count}</td>
                  <td class="px-4 py-3 text-right text-red-600 font-semibold">${r.fail_count}</td>
                  <td class="px-4 py-3 text-right text-amber-700 font-semibold">${r.skip_count}</td>
                  <td class="px-4 py-3 text-right">
                    <span class="font-bold ${r.pass_rate >= 80 ? 'text-emerald-700' : r.pass_rate >= 50 ? 'text-amber-700' : 'text-red-600'}">${r.pass_rate}%</span>
                  </td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Suite coverage -->
      ${coverage.length ? `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 class="text-base font-semibold text-slate-700 mb-4">Suite Coverage</h2>
        <div class="space-y-3">
          ${coverage.map(s => {
            const pct = s.total ? Math.round(s.active / s.total * 100) : 0;
            return `
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span title="${escHtml(s.suite_name)}" class="font-medium text-slate-700 truncate max-w-[60%]">${escHtml(s.suite_name)}</span>
                <span class="text-slate-500 flex-shrink-0">${s.active}/${s.total} active (${pct}%)</span>
              </div>
              <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full bg-blue-500 rounded-full transition-all" style="width:${pct}%"></div>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>` : ""}
      `}
    </div>`;

  if (history.length) {
    if (_analyticsChart) { _analyticsChart.destroy(); _analyticsChart = null; }
    const ctx = document.getElementById("analytics-chart")?.getContext("2d");
    if (ctx) {
      _analyticsChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: history.map(r => r.run_name),
          datasets: [
            {
              label: "Pass Rate %",
              data: history.map(r => r.pass_rate),
              borderColor: "#10b981",
              backgroundColor: "rgba(16,185,129,0.08)",
              fill: true,
              tension: 0.4,
              pointBackgroundColor: "#10b981",
              pointRadius: 5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { min: 0, max: 100, ticks: { callback: v => v + "%" }, grid: { color: "#f1f5f9" } },
            x: { grid: { display: false }, ticks: { maxRotation: 30 } },
          },
        },
      });
    }
  }
}

// ─── Modern UI layer ──────────────────────────────────────────────────────────
// Header shadow on scroll, the reading-progress bar (where CSS scroll-driven
// animations aren't supported), reveal-on-scroll, skeleton loaders, the hero's
// blur-in headline and the Ctrl/Cmd+K command palette.

(function initScrollChrome() {
  const header = document.getElementById("app-header");
  const bar = document.getElementById("scroll-progress");
  const cssDriven = !!window.CSS?.supports?.("animation-timeline: scroll()");
  let queued = false;
  const update = () => {
    queued = false;
    header?.classList.toggle("is-scrolled", window.scrollY > 4);
    if (!cssDriven && bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty("--progress", max > 0 ? (window.scrollY / max).toFixed(4) : "0");
    }
  };
  window.addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  update();
  if (header && "ResizeObserver" in window) {
    new ResizeObserver(() => document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`)).observe(header);
  }
})();

// Sections, and the cards in their grids, rise into place the first time they
// scroll into view. The first section (the hero) is left alone.
let _revealObserver = null;
function applyReveal(container) {
  if (!container || !("IntersectionObserver" in window)) return;
  _revealObserver ||= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("is-visible");
      _revealObserver.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
  const page = container.firstElementChild || container;
  const watch = (el, delay) => {
    if (el.classList.contains("reveal")) return;
    el.classList.add("reveal");
    el.style.setProperty("--reveal-delay", `${delay}ms`);
    _revealObserver.observe(el);
  };
  // The hero and the tab bar stay put; each tab panel's sections (and the
  // cards in their grids) rise in as they come into view.
  const sections = [...page.children].slice(1).flatMap((el) =>
    el.matches("[data-home-panel]") ? [...el.children] : el.matches('[data-testid="home-tabs"], style') ? [] : [el]);
  sections.forEach((section) => {
    if (section.tagName === "STYLE") return;
    watch(section, 0);
    section.querySelectorAll(".grid > *").forEach((card, i) => watch(card, 120 + (i % 6) * 70));
  });
}

// Shown while a page loads: the rough shape of a page, shimmering.
function pageSkeleton() {
  return `
    <div class="space-y-6" aria-busy="true" aria-label="Loading">
      <div class="flex items-center justify-between gap-4">
        <div class="space-y-2 flex-1"><div class="skel h-7 w-56 max-w-full"></div><div class="skel h-4 w-80 max-w-full"></div></div>
        <div class="skel h-10 w-32 flex-shrink-0"></div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">${'<div class="skel h-24"></div>'.repeat(4)}</div>
      <div class="space-y-3">${'<div class="skel h-16"></div>'.repeat(4)}</div>
    </div>`;
}

// ─── Command palette (Ctrl/Cmd+K) ─────────────────────────────────────────────
let _cmdk = null; // { items, filtered, selected, opener }

function _cmdkPages() {
  const pages = [
    { label: "Projects", group: "Page", icon: "📁", run: () => navigate("projects") },
  ];
  if (state.user) pages.push({ label: "Environments", group: "Page", icon: "🌐", run: () => navigate("environments") });
  if (isAdmin()) {
    pages.push({ label: "User Management", group: "Page", icon: "👥", run: () => navigate("users") });
    pages.push({ label: "Log Center", group: "Page", icon: "📜", run: () => navigate("logs") });
    pages.push({ label: "New project", group: "Action", icon: "➕", run: () => { navigate("projects"); setTimeout(() => showModal("project"), 250); } });
  }
  if (!state.user) {
    pages.push({ label: "Take the 3-min Recruiter Tour", group: "Action", icon: "🧭", run: () => startRecruiterTour(document.querySelector('[data-testid="hero-tour-btn"]')) });
    pages.push({ label: "Sign in", group: "Action", icon: "🔑", run: () => showAuthModal("login") });
  }
  pages.push({ label: "View architecture", group: "Action", icon: "🏗️", run: () => { navigate("projects"); setTimeout(() => viewArchitecture(), 250); } });
  pages.push({ label: "Source code on GitHub", group: "Link", icon: "🐙", run: () => window.open("https://github.com/rabinavidan/test-case-management", "_blank", "noopener") });
  if (state.user) pages.push({ label: "Sign out", group: "Action", icon: "🚪", run: () => logout() });
  return pages;
}

// Projects and their suites, fetched without the app's api() helper: a guest
// whose request is refused should just get fewer results, not a sign-in popup.
async function _cmdkLoadData() {
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const get = async (p) => { const r = await fetch(p, { headers }); if (!r.ok) throw new Error(r.status); return r.json(); };
  try {
    const res = await get("/api/projects?page_size=100");
    const projects = res?.items ?? res ?? [];
    const items = projects.map((p) => ({ label: p.name, group: "Project", icon: "🗂️", run: () => navigate(`project/${p.id}`) }));
    const suites = await Promise.all(projects.slice(0, 25).map((p) =>
      get(`/api/projects/${p.id}/suites`).then((ss) => ss.map((s) => ({ label: s.name, group: `Suite · ${p.name}`, icon: "🧪", run: () => navigate(`suite/${s.id}`) }))).catch(() => [])));
    return items.concat(suites.flat());
  } catch { return []; }
}

function openCommandPalette() {
  if (_cmdk) return;
  _cmdk = { items: _cmdkPages(), filtered: [], selected: 0, opener: document.activeElement };
  document.getElementById("cmdk-root").innerHTML = `
    <div id="cmdk" data-testid="cmdk" class="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh]"
      onmousedown="if (event.target === this) closeCommandPalette()">
      <div id="cmdk-panel" role="dialog" aria-modal="true" aria-label="Search and jump to"
        class="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div class="flex items-center gap-3 px-4 border-b border-slate-200">
          <svg class="w-5 h-5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"/></svg>
          <input id="cmdk-input" data-testid="cmdk-input" type="text" autocomplete="off" spellcheck="false"
            role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" aria-label="Search projects, suites and pages"
            placeholder="Search projects, suites and pages…" class="flex-1 py-4 text-base bg-transparent focus:outline-none" style="outline:none">
          <kbd class="kbd">Esc</kbd>
        </div>
        <ul id="cmdk-list" data-testid="cmdk-list" role="listbox" aria-label="Results" class="max-h-[50vh] overflow-y-auto p-2"></ul>
        <div class="px-4 py-2 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1 bg-slate-50">
          <span><kbd class="kbd">↑</kbd> <kbd class="kbd">↓</kbd> move</span>
          <span><kbd class="kbd">Enter</kbd> open</span>
          <span><kbd class="kbd">Esc</kbd> close</span>
        </div>
      </div>
    </div>`;
  const input = document.getElementById("cmdk-input");
  input.addEventListener("input", () => { _cmdk.selected = 0; _cmdkRender(); });
  input.addEventListener("keydown", _cmdkKeydown);
  _cmdkRender();
  input.focus();
  const opened = _cmdk;
  _cmdkLoadData().then((data) => {
    if (_cmdk !== opened) return;
    _cmdk.items = _cmdk.items.concat(data);
    _cmdkRender();
  });
}

function closeCommandPalette() {
  if (!_cmdk) return;
  const opener = _cmdk.opener;
  _cmdk = null;
  document.getElementById("cmdk-root").innerHTML = "";
  if (opener && document.body.contains(opener)) opener.focus?.();
}

function _cmdkRender() {
  const list = document.getElementById("cmdk-list");
  if (!list || !_cmdk) return;
  const q = document.getElementById("cmdk-input").value.trim().toLowerCase();
  const score = (it) => {
    const label = it.label.toLowerCase(), group = it.group.toLowerCase();
    if (!q) return 1;
    if (label.startsWith(q)) return 3;
    if (label.includes(q)) return 2;
    if (group.includes(q)) return 1;
    return 0;
  };
  _cmdk.filtered = _cmdk.items.map((it) => [score(it), it]).filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0]).slice(0, 50).map(([, it]) => it);
  _cmdk.selected = Math.min(_cmdk.selected, Math.max(0, _cmdk.filtered.length - 1));
  list.innerHTML = _cmdk.filtered.length ? _cmdk.filtered.map((it, i) => `
    <li id="cmdk-opt-${i}" role="option" aria-selected="${i === _cmdk.selected}" data-testid="cmdk-option"
      onmousemove="_cmdkSelect(${i})" onclick="_cmdkRun(${i})"
      class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-slate-700">
      <span class="text-lg w-6 text-center flex-shrink-0" aria-hidden="true">${it.icon}</span>
      <span class="flex-1 min-w-0 truncate font-medium">${escHtml(it.label)}</span>
      <span class="text-xs text-slate-500 truncate max-w-[45%]">${escHtml(it.group)}</span>
    </li>`).join("") : `<li class="px-3 py-8 text-center text-sm text-slate-500">No matches for “${escHtml(q)}”.</li>`;
  document.getElementById("cmdk-input").setAttribute("aria-activedescendant", _cmdk.filtered.length ? `cmdk-opt-${_cmdk.selected}` : "");
}

function _cmdkSelect(i) {
  if (!_cmdk || _cmdk.selected === i) return;
  _cmdk.selected = i;
  document.querySelectorAll("#cmdk-list [role=option]").forEach((el, j) => el.setAttribute("aria-selected", String(j === i)));
  document.getElementById("cmdk-input").setAttribute("aria-activedescendant", `cmdk-opt-${i}`);
}

function _cmdkRun(i) {
  const it = _cmdk?.filtered[i];
  if (!it) return;
  _cmdk.opener = null; // the chosen destination decides where focus goes
  closeCommandPalette();
  it.run();
}

function _cmdkKeydown(e) {
  if (!_cmdk) return;
  const n = _cmdk.filtered.length;
  if (e.key === "ArrowDown" && n) { e.preventDefault(); _cmdkSelect((_cmdk.selected + 1) % n); document.getElementById(`cmdk-opt-${_cmdk.selected}`)?.scrollIntoView({ block: "nearest" }); }
  else if (e.key === "ArrowUp" && n) { e.preventDefault(); _cmdkSelect((_cmdk.selected - 1 + n) % n); document.getElementById(`cmdk-opt-${_cmdk.selected}`)?.scrollIntoView({ block: "nearest" }); }
  else if (e.key === "Enter") { e.preventDefault(); _cmdkRun(_cmdk.selected); }
  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeCommandPalette(); }
  else if (e.key === "Tab") { e.preventDefault(); } // keep focus in the dialog
}

document.addEventListener("keydown", (e) => {
  const typing = e.target?.closest?.("input, textarea, select, [contenteditable='true']");
  if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    _cmdk ? closeCommandPalette() : openCommandPalette();
  } else if (e.key === "/" && !typing && !_cmdk && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    openCommandPalette();
  }
});

// ─── Test case search & filter ────────────────────────────────────────────────
// The suite and Test Cases pages narrow their list as you type, and the status
// chips double as filters - all client-side, over the cards already rendered.
let _tcFilter = { q: "", status: null };

function tcFilterBar(testcases, counts) {
  _tcFilter = { q: "", status: null };
  const chip = (status, label, n, cls) => `
    <button type="button" data-tc-filter="${status}" data-testid="tc-filter-${status}" aria-pressed="false"
      onclick="setTcStatusFilter('${status}')"
      class="px-3 py-1 rounded-full text-xs font-medium transition-all hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${cls}">${n} ${label}</button>`;
  return `
    <div class="flex flex-wrap items-center gap-2">
      ${testcases.length ? `
      <label class="relative flex-1 min-w-[12rem] max-w-sm">
        <span class="sr-only">Search test cases</span>
        <svg class="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"/></svg>
        <input type="search" data-testid="tc-search" oninput="setTcQuery(this.value)" placeholder="Search test cases…"
          class="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
      </label>` : ""}
      ${chip("all", "total", testcases.length, "bg-slate-100 text-slate-600")}
      ${chip("active", "active", counts.active, "bg-emerald-100 text-emerald-700")}
      ${chip("draft", "draft", counts.draft, "bg-amber-100 text-amber-700")}
      ${chip("deprecated", "deprecated", counts.deprecated, "bg-slate-100 text-slate-600")}
    </div>
    <p data-testid="tc-filter-empty" class="hidden text-sm text-slate-500 bg-white border border-dashed border-slate-200 rounded-2xl px-4 py-6 text-center">No test cases match. <button type="button" onclick="clearTcFilter()" class="font-semibold text-blue-600 hover:underline">Clear filters</button></p>`;
}

function setTcQuery(q) { _tcFilter.q = q.trim().toLowerCase(); applyTcFilter(); }

function setTcStatusFilter(status) {
  _tcFilter.status = status === "all" || _tcFilter.status === status ? null : status;
  applyTcFilter();
}

function clearTcFilter() {
  _tcFilter = { q: "", status: null };
  const input = document.querySelector('#view-suite [data-testid="tc-search"]');
  if (input) input.value = "";
  applyTcFilter();
}

function applyTcFilter() {
  const view = document.getElementById("view-suite");
  if (!view) return;
  const { q, status } = _tcFilter;
  let shown = 0;
  view.querySelectorAll('[data-testid^="testcase-card-"]').forEach((card) => {
    const match = (!status || card.dataset.tcStatus === status) && (!q || card.dataset.tcText.includes(q));
    card.classList.toggle("hidden", !match);
    if (match) shown++;
  });
  view.querySelectorAll("[data-tc-filter]").forEach((b) => {
    const on = !!status && b.dataset.tcFilter === status;
    b.setAttribute("aria-pressed", String(on));
    b.classList.toggle("ring-2", !!on);
    b.classList.toggle("ring-blue-500", !!on);
  });
  view.querySelector('[data-testid="tc-filter-empty"]')?.classList.toggle("hidden", shown > 0 || (!q && !status));
}

// ─── Home page tabs ───────────────────────────────────────────────────────────
// The guest home page shows one section at a time under the hero, chosen from
// a sticky tab bar, instead of one long scroll. #home/<tab> links straight to
// a tab; anything that scrolls to a section (the Recruiter Tour, "View
// Architecture") switches to its tab first.
const HOME_TABS = [
  { id: "stories",      label: "Success Stories", icon: "⭐" },
  { id: "repos",        label: "Open Source",     icon: "📦" },
  { id: "demo",         label: "Live Demo",       icon: "⚡" },
  { id: "leadership",   label: "Leadership",      icon: "🧭" },
  { id: "strategy",     label: "Test Strategy",   icon: "🧪" },
  { id: "ai",           label: "AI Engineering",  icon: "🤖" },
  { id: "kpis",         label: "KPIs",            icon: "📊" },
  { id: "architecture", label: "Architecture",    icon: "🏗️" },
  { id: "projects",     label: "Projects",        icon: "📁" },
];
let _homeTab = null;

function _homeTabFromHash() {
  const [route, tab] = window.location.hash.replace("#", "").split("/");
  return route === "home" ? tab : null;
}

// `panels` maps a tab id to its HTML. Signed in, there are no tabs: the
// sections render one after another, as before.
function homeTabsHtml(panels) {
  const tabs = HOME_TABS.filter((t) => panels[t.id]);
  if (getToken() || !tabs.length) return tabs.map((t) => panels[t.id]).join("");
  let stored = null;
  try { stored = sessionStorage.getItem("tf_home_tab"); } catch {}
  const wanted = _homeTabFromHash() || _homeTab || stored;
  const active = tabs.some((t) => t.id === wanted) ? wanted : tabs[0].id;
  _homeTab = active;
  return `
    <div data-testid="home-tabs" class="sticky z-20 -mx-4 px-4 pt-1 pb-3 mb-3" style="top:var(--header-h, 56px)">
      <div role="tablist" aria-label="Explore this site" onkeydown="_homeTabsKeydown(event)"
        class="relative flex gap-1 overflow-x-auto no-scrollbar bg-white/85 backdrop-blur-md border border-slate-200 rounded-2xl p-1 shadow-sm">
        <span class="home-tab-indicator" aria-hidden="true"></span>
        ${tabs.map((t) => `
          <button type="button" role="tab" id="home-tab-${t.id}" data-home-tab="${t.id}" data-testid="home-tab-${t.id}"
            aria-controls="home-panel-${t.id}" aria-selected="${t.id === active}" tabindex="${t.id === active ? 0 : -1}"
            onclick="showHomeTab('${t.id}')"
            class="home-tab relative z-10 flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-xl text-sm font-semibold">
            <span aria-hidden="true">${t.icon}</span>${t.label}
          </button>`).join("")}
      </div>
    </div>
    ${tabs.map((t) => `
      <section role="tabpanel" id="home-panel-${t.id}" data-home-panel="${t.id}" aria-labelledby="home-tab-${t.id}"
        class="home-panel ${t.id === active ? "" : "hidden"}">${panels[t.id]}</section>`).join("")}`;
}

let _homeTabsObserver = null;
function positionHomeTabIndicator() {
  const btn = document.querySelector('[data-home-tab][aria-selected="true"]');
  const ind = btn?.parentElement.querySelector(".home-tab-indicator");
  if (!btn || !ind) return;
  ind.style.width = `${btn.offsetWidth}px`;
  ind.style.transform = `translateX(${btn.offsetLeft}px)`;
  // Tabs change width when the web font or the Tailwind CDN's CSS arrives
  // after the first measurement; follow them.
  if (!_homeTabsObserver && "ResizeObserver" in window) _homeTabsObserver = new ResizeObserver(() => positionHomeTabIndicator());
  if (_homeTabsObserver && !btn.parentElement._tabsObserved) {
    _homeTabsObserver.disconnect();
    // The tabs only: the indicator moves in response, and watching it too would loop.
    btn.parentElement.querySelectorAll("[data-home-tab]").forEach((c) => _homeTabsObserver.observe(c));
    btn.parentElement._tabsObserved = true;
  }
}

function showHomeTab(id, { focus = false, scroll = true } = {}) {
  const panel = document.getElementById(`home-panel-${id}`);
  if (!panel) return;
  _homeTab = id;
  try { sessionStorage.setItem("tf_home_tab", id); } catch {}
  document.querySelectorAll("[data-home-tab]").forEach((b) => {
    const on = b.dataset.homeTab === id;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll("[data-home-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.homePanel !== id));
  positionHomeTabIndicator();
  const btn = document.getElementById(`home-tab-${id}`);
  const list = btn?.parentElement;
  if (btn && list) list.scrollTo({ left: btn.offsetLeft - (list.clientWidth - btn.offsetWidth) / 2, behavior: "smooth" });
  if (focus) btn?.focus();
  if (scroll) {
    // Bring the panel's top up under the sticky tab bar if the page is
    // scrolled past it, so a new tab never opens half-way down.
    const bar = document.querySelector('[data-testid="home-tabs"]');
    const gap = (bar?.getBoundingClientRect().bottom ?? 0) + 8;
    const top = panel.getBoundingClientRect().top;
    if (top < gap) window.scrollTo({ top: window.scrollY + top - gap, behavior: "smooth" });
  }
}

// Arrow keys, Home and End move between tabs, as the ARIA tabs pattern expects.
function _homeTabsKeydown(e) {
  const tabs = [...document.querySelectorAll("[data-home-tab]")];
  const i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
  const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (to === undefined || !tabs.length) return;
  e.preventDefault();
  showHomeTab(tabs[(to + tabs.length) % tabs.length].dataset.homeTab, { focus: true });
}

// Shows the tab holding `el`, if it is in a hidden one.
function revealHomeSection(el) {
  const panel = el?.closest?.("[data-home-panel]");
  if (panel?.classList.contains("hidden")) showHomeTab(panel.dataset.homePanel, { scroll: false });
}

window.addEventListener("resize", positionHomeTabIndicator, { passive: true });
