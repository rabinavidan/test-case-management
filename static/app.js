// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  projects: [],
  currentProject: null,
  currentSuite: null,
  currentRun: null,
  view: 'projects',
};

// ─── API helpers ─────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

const get  = (p)    => api('GET',    p);
const post = (p, b) => api('POST',   p, b);
const put  = (p, b) => api('PUT',    p, b);
const del  = (p)    => api('DELETE', p);

// ─── Toast ───────────────────────────────────────────────────────────────────
function toast(msg, ok = true) {
  const t = document.getElementById('toast');
  const i = document.getElementById('toast-inner');
  i.className = `px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 max-w-xs ${ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`;
  i.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${ok ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'}"/></svg>${escHtml(msg)}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3000);
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function showModal(type, data) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  const title = document.getElementById('modal-title');
  const body  = document.getElementById('modal-body');

  if (type === 'project') {
    title.textContent = 'New Project';
    body.innerHTML = formHtml([
      { id: 'name', label: 'Name', required: true },
      { id: 'description', label: 'Description', type: 'textarea' },
    ], 'createProject');

  } else if (type === 'suite') {
    title.textContent = 'New Test Suite';
    body.innerHTML = formHtml([
      { id: 'name', label: 'Name', required: true },
      { id: 'description', label: 'Description', type: 'textarea' },
    ], 'createSuite');

  } else if (type === 'testcase') {
    title.textContent = data ? 'Edit Test Case' : 'New Test Case';
    body.innerHTML = formHtml([
      { id: 'title', label: 'Title', required: true, value: data?.title },
      { id: 'description', label: 'Description', type: 'textarea', value: data?.description },
      { id: 'steps', label: 'Steps', type: 'textarea', value: data?.steps, rows: 4 },
      { id: 'expected_result', label: 'Expected Result', type: 'textarea', value: data?.expected_result },
      { id: 'priority', label: 'Priority', type: 'select', options: ['low','medium','high','critical'], value: data?.priority || 'medium' },
      { id: 'status', label: 'Status', type: 'select', options: ['draft','active','deprecated'], value: data?.status || 'draft' },
    ], data ? 'updateTestCase' : 'createTestCase', data?.id);

  } else if (type === 'run') {
    title.textContent = 'Start Test Run';
    body.innerHTML = formHtml([
      { id: 'name', label: 'Run Name', required: true, value: `Run ${new Date().toLocaleDateString()}` },
    ], 'createRun');
  }
}

function formHtml(fields, action, dataId) {
  const inputs = fields.map(f => {
    const val = f.value ? escHtml(f.value) : '';
    if (f.type === 'textarea') {
      return `<div class="mb-4"><label class="block text-sm font-medium text-slate-700 mb-1">${f.label}</label>
        <textarea id="f-${f.id}" rows="${f.rows || 3}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">${val}</textarea></div>`;
    }
    if (f.type === 'select') {
      const opts = f.options.map(o => `<option value="${o}" ${o === f.value ? 'selected' : ''}>${o.charAt(0).toUpperCase()+o.slice(1)}</option>`).join('');
      return `<div class="mb-4"><label class="block text-sm font-medium text-slate-700 mb-1">${f.label}</label>
        <select id="f-${f.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">${opts}</select></div>`;
    }
    return `<div class="mb-4"><label class="block text-sm font-medium text-slate-700 mb-1">${f.label}${f.required ? ' <span class="text-red-500">*</span>' : ''}</label>
      <input id="f-${f.id}" type="text" value="${val}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" ${f.required ? 'required' : ''}></div>`;
  }).join('');

  const extra = dataId ? `data-id="${dataId}"` : '';
  return `<form onsubmit="handleForm(event,'${action}')" ${extra}>
    ${inputs}
    <div class="flex justify-end gap-3 pt-2">
      <button type="button" onclick="hideModal()" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
      <button type="submit" class="px-4 py-2 text-sm rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium transition-colors">Save</button>
    </div>
  </form>`;
}

function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function closeModal(e) {
  if (e.target === document.getElementById('modal-overlay')) hideModal();
}

function fv(id) { return document.getElementById('f-' + id)?.value.trim() || null; }

async function handleForm(e, action) {
  e.preventDefault();
  const form = e.target;
  try {
    if (action === 'createProject') {
      const p = await post('/projects', { name: fv('name'), description: fv('description') });
      state.projects.push(p); renderSidebar(); hideModal(); toast('Project created');
      navigate('project', p.id);
    } else if (action === 'createSuite') {
      const s = await post(`/projects/${state.currentProject.id}/suites`, { name: fv('name'), description: fv('description') });
      hideModal(); toast('Suite created'); navigate('project', state.currentProject.id);
    } else if (action === 'createTestCase') {
      await post(`/suites/${state.currentSuite.id}/testcases`, {
        title: fv('title'), description: fv('description'), steps: fv('steps'),
        expected_result: fv('expected_result'), priority: fv('priority'), status: fv('status'),
      });
      hideModal(); toast('Test case created'); navigate('suite', state.currentSuite.id);
    } else if (action === 'updateTestCase') {
      const id = parseInt(form.dataset.id);
      await put(`/testcases/${id}`, {
        title: fv('title'), description: fv('description'), steps: fv('steps'),
        expected_result: fv('expected_result'), priority: fv('priority'), status: fv('status'),
      });
      hideModal(); toast('Test case updated'); navigate('suite', state.currentSuite.id);
    } else if (action === 'createRun') {
      const r = await post(`/suites/${state.currentSuite.id}/runs`, { name: fv('name') });
      hideModal(); toast('Run started'); navigate('run', r.id);
    }
  } catch (err) {
    toast(err.message, false);
  }
}

// ─── Navigation ──────────────────────────────────────────────────────────────
function navigate(view, id) {
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${view}`).classList.remove('hidden');

  const navBtn = document.getElementById('nav-new-btn');
  const navLabel = document.getElementById('nav-new-label');
  navBtn.classList.add('hidden');

  if (view === 'projects') {
    renderProjects();
    setBreadcrumb([]);
  } else if (view === 'project') {
    renderProject(id);
    navBtn.classList.remove('hidden');
    navLabel.textContent = 'New Suite';
  } else if (view === 'suite') {
    renderSuite(id);
    navBtn.classList.remove('hidden');
    navLabel.textContent = 'New Test Case';
  } else if (view === 'run') {
    renderRun(id);
  }
}

function handleNewBtn() {
  if (state.view === 'project') showModal('suite');
  else if (state.view === 'suite') showModal('testcase');
}

function setBreadcrumb(parts) {
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML = parts.map((p, i) => {
    const sep = i > 0 ? '<span class="mx-1 text-slate-300">/</span>' : '';
    if (p.link) return `${sep}<button onclick="navigate('${p.link.view}',${p.link.id})" class="hover:text-brand-600 transition-colors">${escHtml(p.label)}</button>`;
    return `${sep}<span class="text-slate-700 font-medium">${escHtml(p.label)}</span>`;
  }).join('');
}

// ─── Projects view ───────────────────────────────────────────────────────────
async function renderProjects() {
  const el = document.getElementById('view-projects');
  el.innerHTML = `<div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-slate-800">Projects</h1>
    <button onclick="showModal('project')" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>New Project
    </button>
  </div>
  <div id="projects-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>`;

  try {
    state.projects = await get('/projects');
    renderSidebar();
    const grid = document.getElementById('projects-grid');
    if (!state.projects.length) {
      grid.innerHTML = emptyState('No projects yet', 'Create your first project to get started.', "showModal('project')");
      return;
    }
    grid.innerHTML = state.projects.map(p => projectCard(p)).join('');
  } catch (e) { toast(e.message, false); }
}

function projectCard(p) {
  return `<div class="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-brand-300 transition-all cursor-pointer group" onclick="navigate('project',${p.id})">
    <div class="p-5">
      <div class="flex items-start justify-between mb-3">
        <div class="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-lg">${escHtml(p.name[0].toUpperCase())}</div>
        <button onclick="event.stopPropagation();deleteProject(${p.id})" class="text-slate-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
      <h3 class="font-semibold text-slate-800 mb-1">${escHtml(p.name)}</h3>
      <p class="text-sm text-slate-500 line-clamp-2">${escHtml(p.description || 'No description')}</p>
      <p class="text-xs text-slate-400 mt-3">${formatDate(p.created_at)}</p>
    </div>
  </div>`;
}

async function deleteProject(id) {
  if (!confirm('Delete this project and all its data?')) return;
  try {
    await del(`/projects/${id}`);
    toast('Project deleted');
    renderProjects();
  } catch(e) { toast(e.message, false); }
}

// ─── Project view ────────────────────────────────────────────────────────────
async function renderProject(id) {
  const el = document.getElementById('view-project');
  el.innerHTML = `<div class="animate-pulse space-y-4"><div class="h-8 bg-slate-200 rounded w-1/3"></div><div class="h-32 bg-slate-200 rounded"></div></div>`;

  try {
    const [project, suites, stats] = await Promise.all([
      state.projects.find(p => p.id === id) || get(`/projects`).then(ps => ps.find(p => p.id === id)),
      get(`/projects/${id}/suites`),
      get(`/projects/${id}/stats`),
    ]);
    state.currentProject = project;
    setBreadcrumb([{ label: project.name }]);

    el.innerHTML = `
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-slate-800 mb-1">${escHtml(project.name)}</h1>
        ${project.description ? `<p class="text-slate-500">${escHtml(project.description)}</p>` : ''}
      </div>

      <!-- Stats bar -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        ${statCard('Suites', stats.total_suites, 'bg-blue-50 text-blue-700')}
        ${statCard('Test Cases', stats.total_cases, 'bg-indigo-50 text-indigo-700')}
        ${statCard('Runs', stats.total_runs, 'bg-violet-50 text-violet-700')}
        ${statCard('Last Run', stats.last_run_name ? `${stats.last_run_pass}P / ${stats.last_run_fail}F / ${stats.last_run_skip}S` : '—', 'bg-slate-50 text-slate-700')}
      </div>

      ${stats.last_run_name ? lastRunBar(stats) : ''}

      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-slate-800">Test Suites</h2>
        <button onclick="showModal('suite')" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>New Suite
        </button>
      </div>

      ${!suites.length ? emptyState('No test suites', 'Add a suite to start organizing test cases.', "showModal('suite')") :
        `<div class="space-y-3">${suites.map(s => suiteRow(s, project)).join('')}</div>`}`;
  } catch(e) { toast(e.message, false); }
}

function statCard(label, value, cls) {
  return `<div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
    <p class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">${label}</p>
    <p class="text-2xl font-bold ${cls} rounded px-1">${value}</p>
  </div>`;
}

function lastRunBar(stats) {
  const total = stats.last_run_pass + stats.last_run_fail + stats.last_run_skip + stats.last_run_pending;
  if (!total) return '';
  const pct = (n) => ((n / total) * 100).toFixed(1);
  return `<div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
    <p class="text-sm font-medium text-slate-600 mb-2">Last Run: <span class="font-semibold text-slate-800">${escHtml(stats.last_run_name)}</span></p>
    <div class="flex rounded-full overflow-hidden h-3 mb-2">
      ${stats.last_run_pass    ? `<div class="bg-green-500" style="width:${pct(stats.last_run_pass)}%"></div>` : ''}
      ${stats.last_run_fail    ? `<div class="bg-red-500"   style="width:${pct(stats.last_run_fail)}%"></div>` : ''}
      ${stats.last_run_skip   ? `<div class="bg-yellow-400" style="width:${pct(stats.last_run_skip)}%"></div>` : ''}
      ${stats.last_run_pending ? `<div class="bg-slate-300" style="width:${pct(stats.last_run_pending)}%"></div>` : ''}
    </div>
    <div class="flex gap-4 text-xs text-slate-500">
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500 inline-block"></span>Pass: ${stats.last_run_pass}</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500 inline-block"></span>Fail: ${stats.last_run_fail}</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-yellow-400 inline-block"></span>Skip: ${stats.last_run_skip}</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-slate-300 inline-block"></span>Pending: ${stats.last_run_pending}</span>
    </div>
  </div>`;
}

function suiteRow(s, project) {
  return `<div class="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-brand-300 transition-all cursor-pointer group flex items-center px-5 py-4" onclick="navigate('suite',${s.id})">
    <div class="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 mr-4 flex-shrink-0">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h7"/></svg>
    </div>
    <div class="flex-1 min-w-0">
      <p class="font-medium text-slate-800">${escHtml(s.name)}</p>
      ${s.description ? `<p class="text-sm text-slate-500 truncate">${escHtml(s.description)}</p>` : ''}
    </div>
    <div class="flex items-center gap-3 ml-4">
      <span class="text-xs text-slate-400">${formatDate(s.created_at)}</span>
      <button onclick="event.stopPropagation();deleteSuite(${s.id})" class="text-slate-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>
    </div>
  </div>`;
}

async function deleteSuite(id) {
  if (!confirm('Delete this suite and all its test cases?')) return;
  try {
    await del(`/suites/${id}`);
    toast('Suite deleted');
    navigate('project', state.currentProject.id);
  } catch(e) { toast(e.message, false); }
}

// ─── Suite view ───────────────────────────────────────────────────────────────
async function renderSuite(id) {
  const el = document.getElementById('view-suite');
  el.innerHTML = `<div class="animate-pulse space-y-4"><div class="h-8 bg-slate-200 rounded w-1/3"></div></div>`;

  try {
    const suite = await get(`/projects/${state.currentProject?.id || 0}/suites`)
      .then(ss => ss.find(s => s.id === id))
      .catch(() => null);

    if (!suite && state.currentSuite?.id !== id) {
      // Fallback: just get test cases directly
    }
    const resolvedSuite = suite || state.currentSuite;
    state.currentSuite = resolvedSuite || { id };

    const testcases = await get(`/suites/${id}/testcases`);

    const proj = state.currentProject;
    setBreadcrumb([
      proj ? { label: proj.name, link: { view: 'project', id: proj.id } } : null,
      resolvedSuite ? { label: resolvedSuite.name } : { label: 'Suite' },
    ].filter(Boolean));

    el.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">${escHtml(resolvedSuite?.name || 'Test Suite')}</h1>
          ${resolvedSuite?.description ? `<p class="text-slate-500 mt-1">${escHtml(resolvedSuite.description)}</p>` : ''}
        </div>
        <div class="flex gap-2">
          <button onclick="showModal('run')" class="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Start Run
          </button>
          <button onclick="showModal('testcase')" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            New Test Case
          </button>
        </div>
      </div>

      <div class="mb-3 flex items-center justify-between">
        <span class="text-sm text-slate-500">${testcases.length} test case${testcases.length !== 1 ? 's' : ''}</span>
      </div>

      ${!testcases.length ? emptyState('No test cases', 'Add test cases to this suite.', "showModal('testcase')") :
        `<div class="space-y-3">${testcases.map(tc => testCaseCard(tc)).join('')}</div>`}`;
  } catch(e) { toast(e.message, false); }
}

function testCaseCard(tc) {
  const priBadge = { low: 'bg-slate-100 text-slate-600', medium: 'bg-blue-100 text-blue-700', high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700' };
  const statusBadge = { draft: 'bg-yellow-100 text-yellow-700', active: 'bg-green-100 text-green-700', deprecated: 'bg-slate-100 text-slate-500' };

  return `<div class="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
    <div class="p-5">
      <div class="flex items-start justify-between gap-3">
        <h3 class="font-medium text-slate-800 flex-1">${escHtml(tc.title)}</h3>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-xs font-medium px-2 py-0.5 rounded-full ${priBadge[tc.priority] || priBadge.medium}">${tc.priority}</span>
          <span class="text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge[tc.status] || ''}">${tc.status}</span>
          <button onclick="showModal('testcase', ${escJson(tc)})" class="text-slate-400 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button onclick="deleteTestCase(${tc.id})" class="text-slate-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
      ${tc.description ? `<p class="text-sm text-slate-500 mt-2">${escHtml(tc.description)}</p>` : ''}
      ${tc.steps ? `<details class="mt-3"><summary class="text-xs font-medium text-brand-600 cursor-pointer hover:text-brand-700">View Steps</summary>
        <pre class="mt-2 text-xs bg-slate-50 p-3 rounded-lg whitespace-pre-wrap text-slate-700 border border-slate-200">${escHtml(tc.steps)}</pre></details>` : ''}
      ${tc.expected_result ? `<div class="mt-2 text-xs text-slate-500"><span class="font-medium text-slate-600">Expected:</span> ${escHtml(tc.expected_result)}</div>` : ''}
    </div>
  </div>`;
}

async function deleteTestCase(id) {
  if (!confirm('Delete this test case?')) return;
  try {
    await del(`/testcases/${id}`);
    toast('Test case deleted');
    navigate('suite', state.currentSuite.id);
  } catch(e) { toast(e.message, false); }
}

// ─── Run view ─────────────────────────────────────────────────────────────────
async function renderRun(id) {
  const el = document.getElementById('view-run');
  el.innerHTML = `<div class="animate-pulse space-y-4"><div class="h-8 bg-slate-200 rounded w-1/3"></div></div>`;

  try {
    const run = await get(`/runs/${id}`);
    state.currentRun = run;

    const suite = state.currentSuite;
    setBreadcrumb([
      state.currentProject ? { label: state.currentProject.name, link: { view: 'project', id: state.currentProject.id } } : null,
      suite ? { label: suite.name, link: { view: 'suite', id: suite.id } } : null,
      { label: run.name },
    ].filter(Boolean));

    renderRunView(run);
  } catch(e) { toast(e.message, false); }
}

function renderRunView(run) {
  const el = document.getElementById('view-run');
  const results = run.results || [];
  const pass = results.filter(r => r.status === 'pass').length;
  const fail = results.filter(r => r.status === 'fail').length;
  const skip = results.filter(r => r.status === 'skip').length;
  const pending = results.filter(r => r.status === 'pending').length;
  const total = results.length;
  const done = total - pending;

  const pct = total ? Math.round((done / total) * 100) : 0;

  el.innerHTML = `
    <div class="mb-6">
      <div class="flex items-center gap-3 mb-2">
        <h1 class="text-2xl font-bold text-slate-800">${escHtml(run.name)}</h1>
        ${run.completed_at ? `<span class="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Completed</span>` : `<span class="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">In Progress</span>`}
      </div>
      <p class="text-sm text-slate-500">Started ${formatDate(run.created_at)}</p>
    </div>

    <!-- Progress -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-slate-700">Progress</span>
        <span class="text-sm font-semibold text-slate-800">${done} / ${total} (${pct}%)</span>
      </div>
      <div class="w-full bg-slate-200 rounded-full h-2 mb-4">
        <div class="bg-brand-600 h-2 rounded-full transition-all" style="width:${pct}%"></div>
      </div>
      <div class="grid grid-cols-4 gap-3 text-center">
        <div class="bg-green-50 rounded-lg p-3"><p class="text-2xl font-bold text-green-600">${pass}</p><p class="text-xs text-green-600 font-medium">Pass</p></div>
        <div class="bg-red-50 rounded-lg p-3"><p class="text-2xl font-bold text-red-500">${fail}</p><p class="text-xs text-red-500 font-medium">Fail</p></div>
        <div class="bg-yellow-50 rounded-lg p-3"><p class="text-2xl font-bold text-yellow-500">${skip}</p><p class="text-xs text-yellow-600 font-medium">Skip</p></div>
        <div class="bg-slate-50 rounded-lg p-3"><p class="text-2xl font-bold text-slate-500">${pending}</p><p class="text-xs text-slate-500 font-medium">Pending</p></div>
      </div>
    </div>

    <!-- Test results -->
    <div class="space-y-3">
      ${!results.length ? `<p class="text-slate-400 text-sm text-center py-8">No active test cases in this suite.</p>` :
        results.map(r => resultRow(run.id, r)).join('')}
    </div>`;
}

function resultRow(runId, r) {
  const tc = r.test_case;
  const statusMap = {
    pending: { cls: 'bg-slate-100 text-slate-600', label: 'Pending' },
    pass:    { cls: 'bg-green-100 text-green-700', label: 'Pass' },
    fail:    { cls: 'bg-red-100 text-red-600',     label: 'Fail' },
    skip:    { cls: 'bg-yellow-100 text-yellow-700', label: 'Skip' },
  };
  const s = statusMap[r.status] || statusMap.pending;

  return `<div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5" id="result-${r.id}">
    <div class="flex items-start justify-between gap-4">
      <div class="flex-1 min-w-0">
        <h3 class="font-medium text-slate-800 mb-1">${escHtml(tc.title)}</h3>
        ${tc.steps ? `<details class="mb-2"><summary class="text-xs text-brand-600 cursor-pointer hover:text-brand-700">Steps</summary>
          <pre class="mt-1 text-xs bg-slate-50 p-2 rounded whitespace-pre-wrap text-slate-600 border border-slate-100">${escHtml(tc.steps)}</pre></details>` : ''}
        ${tc.expected_result ? `<p class="text-xs text-slate-500"><span class="font-medium">Expected:</span> ${escHtml(tc.expected_result)}</p>` : ''}
      </div>
      <span class="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${s.cls}">${s.label}</span>
    </div>

    <div class="mt-3 pt-3 border-t border-slate-100">
      <div class="flex items-center gap-2 flex-wrap">
        <button onclick="setResult(${runId},${r.testcase_id},'pass')" class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${r.status==='pass' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}">✓ Pass</button>
        <button onclick="setResult(${runId},${r.testcase_id},'fail')" class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${r.status==='fail' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}">✗ Fail</button>
        <button onclick="setResult(${runId},${r.testcase_id},'skip')" class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${r.status==='skip' ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'}">— Skip</button>
        <input id="notes-${r.testcase_id}" type="text" value="${escHtml(r.notes || '')}" placeholder="Add notes…" class="flex-1 min-w-0 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300">
      </div>
    </div>
  </div>`;
}

async function setResult(runId, tcId, status) {
  const notes = document.getElementById(`notes-${tcId}`)?.value || '';
  try {
    await put(`/runs/${runId}/results/${tcId}`, { status, notes });
    const run = await get(`/runs/${runId}`);
    state.currentRun = run;
    renderRunView(run);
    toast(`Marked as ${status}`);
  } catch(e) { toast(e.message, false); }
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function renderSidebar() {
  const ul = document.getElementById('sidebar-projects');
  if (!state.projects.length) {
    ul.innerHTML = `<li class="px-4 py-3 text-sm text-slate-400 italic">No projects</li>`;
    return;
  }
  ul.innerHTML = state.projects.map(p => `
    <li>
      <button onclick="navigate('project',${p.id})" class="w-full text-left px-4 py-2.5 text-sm hover:bg-brand-50 hover:text-brand-700 transition-colors truncate ${state.currentProject?.id === p.id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-700'}">
        ${escHtml(p.name)}
      </button>
    </li>`).join('');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function emptyState(title, desc, action) {
  return `<div class="text-center py-16 text-slate-400">
    <svg class="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
    <p class="font-medium text-slate-600">${title}</p>
    <p class="text-sm mt-1">${desc}</p>
    <button onclick="${action}" class="mt-4 text-sm text-brand-600 hover:text-brand-700 font-medium">Get started →</button>
  </div>`;
}

function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function escJson(obj) {
  return escHtml(JSON.stringify(obj));
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Boot ────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    state.projects = await get('/projects');
    renderSidebar();
  } catch(e) { /* API not ready yet */ }
  navigate('projects');
}

boot();
