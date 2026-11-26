/*
 * Portfolio — the guest home page's personal/marketing content (owner card,
 * overview, success stories, top repos, leadership, test strategy, AI
 * engineering, KPIs, architecture showcase), kept out of the product SPA in
 * static/app.js. Loaded before app.js (static/index.html): app.js renders
 * these sections through buildPortfolioSections() and the helpers below,
 * and nothing here runs at load time.
 */

function buildPortfolioSections() {

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
        <h2 class="text-white text-lg font-bold mb-1">End-to-end test management pipeline</h2>
        <p class="text-[11px] mb-5" style="color:rgba(191,219,254,.8)">The product workflow, step by step - not a service architecture diagram. The service architecture is in the panel below.</p>

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
            <span class="text-[11px] font-mono" style="color:rgba(255,255,255,.2)">tests/e2e/tests/</span>
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
          <p class="text-[11px] font-bold uppercase tracking-[.25em] mb-2" style="color:rgba(0,200,255,.7)">Hands-on Automation Tech Lead | Software Engineer</p>
          <div class="blur-in"><h2 class="text-xl lg:text-2xl font-black leading-tight mb-1 owner-title-flash">Automation Infrastructure, Backend &amp; AI Engineering</h2></div>
          <p class="text-xs mb-3" data-testid="hero-leadership" style="color:rgba(100,200,255,.75)">I build automation frameworks, backend services and AI-assisted quality workflows, with hands-on technical leadership across Israel, USA and India.</p>
          <!-- Meta row -->
          <div class="flex flex-wrap items-center gap-3 text-[11px]" style="color:rgba(255,255,255,.5)">
            <span class="flex items-center gap-1.5"><span style="color:rgba(0,200,255,.6)">🏢</span><span class="font-semibold text-white/70">ZoomInfo</span></span>
            <span class="flex items-center gap-1.5"><span style="color:rgba(0,200,255,.6)">🎓</span><span class="font-semibold text-white/70">AFEKA / Tel Aviv University Branch</span></span>
            <span class="flex items-center gap-1.5"><span style="color:rgba(0,200,255,.6)">📍</span>Tel Aviv District, Israel</span>
          </div>
        </div>

        <!-- Right: name + badges + CTA -->
        <div class="flex flex-col items-start sm:items-end gap-3 flex-shrink-0">
          <div class="flex items-center gap-2 sm:justify-end">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-base font-black text-white flex-shrink-0" style="background:linear-gradient(135deg,#1d6ff5,#5b44f2);box-shadow:0 0 16px rgba(59,130,246,.5)">RA</div>
            <div class="min-w-0">
              <p class="text-sm font-bold text-white">Rabin Avidan</p>
              <div class="flex gap-1.5 mt-0.5 flex-wrap">
                <span class="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full owner-open-badge" style="background:rgba(16,185,129,.15);color:#6ee7b7;border:1px solid rgba(52,211,153,.3)">Open to Opportunities</span>
              </div>
            </div>
          </div>
          <!-- Impact at a glance: sits beside the headline on wider screens, so the hero doesn't grow -->
          <p id="hero-impact-label" class="text-[11px] font-semibold uppercase tracking-wider -mb-1.5 w-full sm:w-80 sm:text-right" style="color:rgba(190,225,255,.75)">TestFlow Repository Metrics</p>
          <dl data-testid="hero-impact" aria-labelledby="hero-impact-label" class="grid grid-cols-4 gap-1.5 w-full sm:w-80">
            ${HERO_IMPACT.map((f) => `
              <div class="flex flex-col-reverse rounded-lg px-1.5 py-1.5 text-center" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)">
                <dt class="text-[11px] leading-tight" style="color:rgba(190,225,255,.85)">${f.label}</dt>
                <dd class="text-base font-black text-white leading-tight">${f.value}</dd>
              </div>`).join('')}
          </dl>
        </div>
      </div>

      <!-- Primary hero actions, in order: Take the Tour, Explore TestFlow, Watch AI Pipeline, View TestFlow Source, Connect on LinkedIn.
           (The architecture has its own tab, so it no longer needs a hero button.)
           The tour leads: it is the shortest guided path for a first-time visitor. -->
      <div class="relative z-10 flex flex-wrap items-center gap-2 px-4 sm:px-6 pb-6" data-testid="hero-cta-row">
        <button type="button" data-testid="hero-tour-btn" onclick="startRecruiterTour(this)"
          class="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-white text-slate-900 text-xs font-bold transition-all hover:scale-105 hover:bg-blue-50"
          style="box-shadow:0 4px 16px rgba(255,255,255,.18)">
          <span aria-hidden="true">🧭</span>
          Take the 3-min Tour
        </button>
        <button type="button" id="hero-demo-btn" data-testid="hero-explore-demo-btn"
          onclick="exploreTestFlow()"
          class="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-white text-xs font-bold transition-all hover:scale-105"
          style="background:linear-gradient(135deg,#059669,#10b981);box-shadow:0 4px 16px rgba(16,185,129,.35)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span id="hero-demo-label">Explore TestFlow</span>
        </button>
        <button type="button" data-testid="hero-ai-pipeline-btn" onclick="showHomeTab('demo', { focus: true })"
          class="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-white text-xs font-bold transition-all hover:scale-105"
          style="background:linear-gradient(135deg,#6d28d9,#7c3aed);box-shadow:0 4px 16px rgba(124,58,237,.35)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          Watch AI Pipeline
        </button>
        <a href="https://github.com/rabinavidan/test-case-management" target="_blank" rel="noopener noreferrer"
          data-testid="hero-github-btn" aria-label="View TestFlow source on GitHub (opens in a new tab)"
          class="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-white text-xs font-bold transition-all hover:scale-105 border border-white/10"
          style="background:rgba(255,255,255,.08)">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.744.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
          View TestFlow Source
        </a>
        <a href="https://www.linkedin.com/in/rabin-avidan/" target="_blank" rel="noopener noreferrer"
          data-testid="hero-linkedin-btn"
          class="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-white text-xs font-bold transition-all hover:scale-105"
          style="background:linear-gradient(135deg,#0a66c2,#0f8ce8);box-shadow:0 4px 16px rgba(10,102,194,.4)">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          Connect on LinkedIn
        </a>
      </div>

      <!-- Skills strip: wider screens only - on phones the impact row takes its place, so the tab bar stays on the first screen.
           One row: where the chips don't all fit, the strip scrolls sideways instead of wrapping. -->
      <div data-testid="hero-skills" role="region" aria-label="Skills" tabindex="0" class="relative z-10 border-t hidden sm:flex flex-nowrap overflow-x-auto gap-2 px-6 py-3" style="border-color:rgba(255,255,255,.07);background:rgba(0,0,0,.25);scrollbar-width:thin">
        ${['Test Automation','AI-Assisted Development','FastAPI','Playwright','pytest','CI/CD','PostgreSQL','Full-Stack Dev','ISTQB','MCSD'].map(s =>
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
  const overviewSection = !getToken() ? renderOverviewSection() : "";
  const successStoriesSection = !getToken() ? renderSuccessStoriesSection() : "";
  const topReposSection = !getToken() ? renderTopReposSection() : "";

  const aiLiveDemoSection = !getToken() ? `
    <div class="relative rounded-2xl overflow-hidden mb-6 px-5 py-6" style="background:linear-gradient(135deg,#020c1b,#071428,#030d1c)" data-testid="ai-live-demo-section">
      <div class="absolute inset-0 pointer-events-none" style="background-image:linear-gradient(rgba(99,102,241,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.05) 1px,transparent 1px);background-size:28px 28px"></div>
      <div class="relative z-10">
        <h2 class="text-sm font-bold text-white uppercase tracking-wide mb-1">AI in the CI/CD Pipeline</h2>
        <p class="text-[11px] mb-4" style="color:rgba(255,255,255,.6)">An animated walkthrough of the AI workflows configured in this repository.</p>
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
      <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">Technical Leadership</h2>
      <p class="text-sm text-slate-600 mb-3">What this repository shows is hands-on: the standards, quality gates and delivery practice I apply myself. Leading automation engineers across Israel, USA and India is my professional experience; this personal project doesn’t demonstrate team management.</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${[
          { icon: '🧭', title: 'Technical Direction & Governance', desc: 'Defines this repository’s contribution standards, architecture conventions, and CI quality gates — enforced automatically on every pull request, not just documented.' },
          { icon: '🧪', title: 'Quality Strategy', desc: `A real Test Pyramid across ${SITE_FACTS.testStacks} independent automation stacks (${SITE_FACTS.testStackNames}), with an 85% coverage floor enforced in CI.` },
          { icon: '🚦', title: 'CI/CD Governance', desc: 'GitHub Actions check every PR — lint, coverage floor, contract tests, and a live Docker-Compose boot smoke test when the services change. A failed gate fails the PR’s CI run.' },
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
      <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">How Work Ships in This Repository</h2>
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
  // forced into an idealized taper: Component = tests/backend/services (each
  // microservice tested in isolation, this repo's real analogue to
  // "isolated UI/service behavior" - there's no separate frontend framework
  // with its own component-test runner). Bar widths are proportional to the
  // actual counts, including where that isn't a clean pyramid shape.
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
        <div>
          <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide">AI Engineering</h2>
          <p class="text-sm text-slate-600 mt-1">AI-assisted test generation, failure investigation and development workflows, with evaluations and human review.</p>
        </div>
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
        name: 'Code Coverage', current: SITE_FACTS.coverage, target: '85% floor (CI-enforced)',
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
        name: 'Test Inventory', current: `${TEST_TOTAL} tests / ${TEST_PYRAMID_LEVELS.length} layers`, target: 'Grows with the codebase',
        status: 'Healthy',
        def: 'Total automated test count across unit, component, API/contract, and E2E layers (see Test Pyramid above). This counts tests that exist, not requirements or risk covered.',
        source: 'tests/',
      },
      {
        name: 'Quality Gate Status', current: `${SITE_FACTS.ciGates} gates enforced`, target: 'All required checks pass before merge',
        status: 'Enforced',
        def: 'Lint, the coverage floor and contract tests run on every PR, and a live Docker-Compose boot smoke test on PRs that touch the services; any failure fails the PR’s CI run.',
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
      <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Quality Metrics</h2>
      <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Measured</h3>
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
  // point below is sourced directly from services/README.md or
  // k8s/README.md - not invented.
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
          { icon: '🚦', title: 'CI/CD quality gates', desc: 'Lint, an 85% coverage floor, contract tests, and a live Docker-Compose boot smoke test each fail a PR’s CI run — see the Quality Gate Status metric.' },
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
        <span><strong class="font-bold">New here?</strong> Take a 5-step guided tour — technical leadership, how TestFlow works, test strategy, quality metrics and AI engineering. Under 3 minutes, no sign-in, nothing is created.
          <span class="block mt-1 text-xs text-blue-700" data-testid="guest-signin-prompt">You're browsing as a guest. <button type="button" onclick="showAuthModal('login')" data-testid="guest-signin-link" class="font-semibold underline hover:text-blue-900">Sign in</button> to add and manage projects.</span>
        </span>
      </div>
      <button type="button" onclick="startRecruiterTour(this)" data-testid="start-tour-btn"
        class="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap">
        Start Recruiter Tour
      </button>
    </div>
  ` : "";

  return {
    archDiagram, demoBanner, techStackBanner, sysArchBanner, ownerCard, overviewSection, successStoriesSection, topReposSection, aiLiveDemoSection, leadershipImpactSection, deliveryWorkflowSection, testPyramidSection, aiFirstEngineeringSection, kpiDashboardSection, architectureStorySection, recruiterTourBanner, hydrateLiveKpis,
  };
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
]; // id -> { index, autoplay, abort }

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

function toggleCarouselAutoplay(id) {
  const ap = _carousels.get(id)?.autoplay;
  if (!ap) return;
  ap.userPaused = !ap.userPaused;
  ap.sync();
}

const _extLinkIcon = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 17L17 7M9 7h8v8"/></svg>`;

function renderSuccessStoriesSection() {
  const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const postUrl = (s) => `https://www.linkedin.com/feed/update/urn:li:activity:${s.activity}/`;
  return renderCarousel({
    id: "success-stories", prefix: "stories", noun: "story", slideTestId: "story-slide",
    heading: "Engineering Insights", subtitle: "Practical lessons on automation infrastructure, testing patterns and AI workflows, shared on LinkedIn.",
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
    summary: "This site: AI-assisted test case management with real-time runs, five services and five test stacks.",
    // A getter: TEST_PYRAMID_LEVELS is declared further down the file.
    get fact() { return `${TEST_TOTAL} tests across ${TEST_PYRAMID_LEVELS.length} layers`; },
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
    heading: "Selected Projects",
    subtitle: "Applications, automation frameworks and infrastructure projects I’ve built, with source code and available demos. ",
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
// Numbers the home page states in more than one place (the hero's impact row,
// the Test Pyramid, the KPI cards) come from here, so they can't drift apart.
// Counts as collected on 2026-11-09: pytest --collect-only per directory
// (backend) and `playwright test --list` (Chromium project, plus the mocked
// config) for the Playwright TypeScript E2E/UI suite.
const TEST_PYRAMID_LEVELS = [
  { level: 'Unit',                 count: 501, desc: 'Pure functions — no DB, no HTTP, no I/O.', where: 'tests/backend/unit + tests/tooling' },
  { level: 'Component',            count: 170, desc: 'Each microservice tested in isolation via TestClient.', where: 'tests/backend/services' },
  { level: 'API / Integration / Contract', count: 368, desc: 'Real FastAPI app + DB, plus property-based OpenAPI contract tests.', where: 'tests/backend/api + tests/backend/contract' },
  { level: 'E2E',                  count: 304, desc: 'Full user flows through the real UI — Playwright + TypeScript, real-backend and fully mocked.', where: 'tests/e2e/' },
];
const TEST_TOTAL = TEST_PYRAMID_LEVELS.reduce((n, l) => n + l.count, 0);
const SITE_FACTS = {
  coverage: '93.2%',  // pytest line coverage of api/, services/ and shared/ on main's CI (floor 85%)
  ciGates: 4,         // lint, coverage floor, contract tests, Docker Compose boot smoke test
  testStacks: 2,      // one per layer: pytest (backend) and Playwright TypeScript (E2E/UI)
  testStackNames: 'pytest for the backend, Playwright TypeScript for E2E/UI',
};
const HERO_IMPACT = [
  { value: String(TEST_TOTAL), label: 'automated tests' },
  { value: SITE_FACTS.coverage, label: 'code coverage' },
  { value: String(SITE_FACTS.ciGates), label: 'CI quality gates' },
  { value: String(SITE_FACTS.testStacks), label: 'test stacks' },
];

// ─── Home page: Overview tab ──────────────────────────────────────────────────
// The 30-second read for a recruiter: who, how they work, skills, education.
// Deliberately no employer names or dates (the site owner's choice).
const OVERVIEW_SKILLS = [
  { group: "Automation & test design", items: ["Playwright", "pytest", "Selenium", "REST Assured", "JUnit / TestNG", "Cucumber / BDD", "Test Pyramid", "API & E2E testing"] },
  { group: "Programming", items: ["TypeScript", "Python", "Java", "JavaScript", "C#"] },
  { group: "CI/CD & cloud", items: ["GitHub Actions", "Jenkins", "Quality gates", "Docker", "Kubernetes / GKE", "GCP", "AWS", "Azure"] },
  { group: "Data & diagnostics", items: ["PostgreSQL", "MongoDB", "Redis", "Kafka", "Pub/Sub", "Datadog", "Grafana", "Allure"] },
  { group: "Generative AI", items: ["AI agents", "Agentic workflows", "MCP servers", "LLM workflows", "RAG", "LangGraph", "Claude Code", "GitHub Copilot"] },
  { group: "Quality & collaboration", items: ["QA strategy", "Shift-Left", "Design & code reviews", "KPIs", "Agile / Scrum", "Mentoring", "Team leadership", "Delivery ownership"] },
];

// Education, certifications and professional development, in display order.
// Only verified details: no dates, no credential links until a verified URL
// or certificate file exists for an item.
const OVERVIEW_CREDENTIALS = [
  { group: "Education", items: [
    { title: "B.Sc. Electronic & Computer Engineering", detail: "AFEKA / Tel Aviv University Branch" },
  ] },
  { group: "Professional Development", items: [
    { title: "Emerging Leader", detail: "ZoomInfo · Leadership development program" },
    { title: "Build with AI: Reasoning Models for AI Agents", detail: "LinkedIn · Course completion" },
  ] },
  { group: "Professional Certifications", items: [
    { title: "ISTQB", detail: "Software testing certification" },
    { title: "MCSD", detail: "ASP.NET / MVC" },
  ] },
];

function renderOverviewSection() {
  const chip = (s) => `<span class="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">${escHtml(s)}</span>`;
  const jump = (tab, label) => `<button type="button" onclick="showHomeTab('${tab}')" data-testid="overview-go-${tab}"
      class="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800 hover:underline underline-offset-2">${label}
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg></button>`;
  return `
    <div class="space-y-4 mb-6" data-testid="overview-section">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">About Me</h2>
          <p class="text-slate-700 leading-relaxed mb-3"><strong class="text-slate-900">Software Engineer</strong> building automation frameworks, infrastructures, backend services, productivity tools, quality dashboards and CI/CD pipelines. Tech Lead since 2024. I&#39;ve designed automation for web apps, mobile, REST APIs and microservices running on GitHub Actions, Docker and Kubernetes.</p>
          <p class="text-slate-700 leading-relaxed">I embed AI into the automation lifecycle: AI agents, MCP servers and LLM workflows for test generation, failure investigation, regression classification and coverage analysis, connected to Jira, TestRail and Slack. I lead automation engineers across <strong class="text-slate-900">Israel, USA and India</strong>, so I&#39;m used to setting standards and reviewing designs as well as writing the code.</p>
          <div class="flex flex-wrap gap-x-5 gap-y-2 mt-4 pt-4 border-t border-slate-100">
            ${jump("repos", "Portfolio")}
            ${jump("engineering", "Engineering Practices")}
            ${jump("demo", "Watch AI Pipeline")}
            ${jump("stories", "Engineering Insights")}
          </div>
        </div>
        <div class="lg:relative">
        <div class="lg:absolute lg:inset-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-5" data-testid="overview-credentials">
          <h2 id="overview-credentials-heading" class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Education, Certifications &amp; Professional Development</h2>
          <!-- Side by side with About, this list scrolls when it is taller than the About card. -->
          <div class="space-y-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            data-testid="overview-credentials-scroll" role="region" aria-labelledby="overview-credentials-heading" tabindex="0" style="scrollbar-width:thin">
            ${OVERVIEW_CREDENTIALS.map((g) => `
              <div data-testid="credentials-group">
                <h3 class="text-xs font-semibold text-slate-600 mb-1.5">${escHtml(g.group)}</h3>
                <ul class="space-y-2 text-sm">
                  ${g.items.map((i) => `<li><p class="font-semibold text-slate-900">${escHtml(i.title)}</p><p class="text-slate-600">${escHtml(i.detail)}</p></li>`).join("")}
                </ul>
              </div>`).join("")}
          </div>
        </div>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Core skills</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4" data-testid="overview-skills">
          ${OVERVIEW_SKILLS.map((g) => `
            <div>
              <h3 class="text-xs font-semibold text-slate-600 mb-2">${escHtml(g.group)}</h3>
              <div class="flex flex-wrap gap-1.5">${g.items.map(chip).join("")}</div>
            </div>`).join("")}
        </div>
      </div>
    </div>`;
}

// ─── Demo seed ───────────────────────────────────────────────────────────────
// Demo project name prefixes as templated server-side (api/main.py) - anchored
// to a following date so "TestFlow {ts}" (DEMO_KINDS.testflow) never matches
// "TestFlow Repo - ..." (DEMO_KINDS.playwright), which also starts with
// "TestFlow ".
const DEMO_KINDS = {
  alerts:     { btnId: "demo-seed-btn", labelId: "demo-seed-label", endpoint: "/api/demo/alerts-microservice", namePattern: /^Alerts Microservice \d{4}-\d{2}-\d{2}/ },
  testflow:   { btnId: "demo-tf-btn",   labelId: "demo-tf-label",   endpoint: "/api/demo/testflow",            namePattern: /^TestFlow \d{4}-\d{2}-\d{2}/ },
  playwright: { btnId: "demo-pw-btn",   labelId: "demo-pw-label",   endpoint: "/api/demo/playwright",          namePattern: /^TestFlow Repo — API & E2E Tests Demo/ },
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
// "Explore TestFlow": the Test Workspace tab when the project list is on the
// page; with no projects yet, the demo project, as this button always opened.
function exploreTestFlow() {
  if (document.getElementById("home-panel-projects")) showHomeTab("projects", { focus: true });
  else viewOrCreateDemo("testflow", { btnId: "hero-demo-btn", labelId: "hero-demo-label" });
}

async function viewOrCreateDemo(kind, elementIds) {
  const cfg = DEMO_KINDS[kind];
  const btn = document.getElementById(elementIds?.btnId || cfg.btnId);
  const label = document.getElementById(elementIds?.labelId || cfg.labelId);
  if (!btn) return;
  const originalLabel = label.textContent;
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
      label.textContent = originalLabel;
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
    label.textContent = originalLabel;
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
