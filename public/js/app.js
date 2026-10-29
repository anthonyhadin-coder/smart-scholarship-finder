const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

const state = {
  token: localStorage.getItem('sf-token') || null,
  user: null,
  scholarships: [],
  filtered: [],
  providerScholarships: [],
  providerApplications: [],
  myApplications: new Map(), // scholarshipId -> application
  lastMatches: [],
  saved: new Set(JSON.parse(localStorage.getItem('sf-saved') || '[]')),
  page: 1,
  pageSize: 9,
  connectionStatus: 'unknown', // 'connected' | 'disconnected' | 'network_error' | 'unknown'
  isRetrying: false
};

const palettes = ['', 'green', 'lilac', 'peach', 'blue', 'pink'];
const symbols = ['✦', '◈', '✳', '✧', '◎', '✺'];
let toastTimer;

function toast(msg) {
  const n = $('#toast');
  if (!n) return;
  n.textContent = msg;
  n.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.classList.remove('show'), 3000);
}

// API Helper with automatic JWT Bearer header
async function api(url, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {}),
    ...(opts.headers || {})
  };

  let r;
  try {
    r = await fetch(url, { ...opts, headers });
  } catch (netErr) {
    const error = new Error('Network or server unreachable. Please check your internet connection.');
    error.isNetworkError = true;
    throw error;
  }

  let d = {};
  try {
    d = await r.json();
  } catch (err) {}

  if (!r.ok) {
    const error = new Error(d.message || `Request failed (${r.status})`);
    error.status = r.status;
    error.data = d;
    throw error;
  }
  return d;
}

function safe(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function money(n, c = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `₹${Number(n || 0).toLocaleString('en-IN')}`;
  }
}

function days(date) {
  return date ? Math.ceil((new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
}

function dateLabel(date) {
  if (!date) return 'Not specified';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'Not specified';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function saveState() {
  localStorage.setItem('sf-saved', JSON.stringify([...state.saved]));
  const countEl = $('#savedNavCount');
  if (countEl) countEl.textContent = state.saved.size;
}

// Render Public Scholarship Card
function card(x, i) {
  const id = String(x._id || x.id);
  const saved = state.saved.has(id);
  const left = days(x.deadline);
  const deadline = !x.deadline ? 'Deadline N/A' : left < 0 ? 'Expired' : left <= 14 ? `${left} days left` : dateLabel(x.deadline);
  const providerVerification = x.providerVerified
    ? '<span class="verified-tag" title="Verified Provider">✓ Verified</span>'
    : '<span class="unverified-tag" title="Self-registered provider; verify details officially">Unverified Provider</span>';

  return `
    <article class="scholarship-card">
      <div class="card-art ${palettes[i % palettes.length]}">
        <span class="card-art-label">${safe((x.fieldsOfStudy || []).slice(0, 2).join(' · ') || 'OPEN FIELD')}</span>
        <span class="card-art-symbol">${symbols[i % symbols.length]}</span>
        <button class="bookmark-btn ${saved ? 'saved' : ''}" data-save="${safe(id)}" aria-label="Toggle saved">${saved ? '♥' : '♡'}</button>
      </div>
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span class="card-provider">${safe(x.provider)}</span>
          ${providerVerification}
        </div>
        <h3 class="card-title">${safe(x.title)}</h3>
        <p class="card-description">${safe(x.description)}</p>
        <div class="card-meta">
          <div class="card-amount"><b>${money(x.amount, x.currency)}</b><small>Listed award</small></div>
          <div class="card-deadline"><b>${safe(deadline)}</b><small>Deadline</small></div>
        </div>
      </div>
      <div class="card-footer">
        <div class="card-tags">${(x.tags || []).slice(0, 3).map(t => `<span class="tag">${safe(t)}</span>`).join('')}</div>
        <button class="details-btn" data-detail="${safe(id)}">Details ↗</button>
      </div>
    </article>
  `;
}

// Renders the 4 distinct states
function render(items, target = '#scholarshipGrid') {
  const n = $(target);
  if (!n) return;

  // State 1: Database Connection Unavailable
  if (state.connectionStatus === 'disconnected') {
    const errorDetail = state.lastDbError
      ? `<div class="db-error-detail"><b>Diagnostic details:</b> ${safe(state.lastDbError)}</div>`
      : '';

    n.innerHTML = `
      <div class="db-error-card">
        <span style="font-size:32px">⚠️</span>
        <h3>Database Connection Unavailable</h3>
        <p>The backend is active, but it could not connect to MongoDB. If hosted on Vercel or Cloud, please verify that <code>MONGO_URI</code> is saved in your Project Settings and redeployed.</p>
        ${errorDetail}
        <button id="retryDbBtn" class="btn btn-yellow" style="margin-top:10px">↻ Retry Connection</button>
      </div>
    `;
    const btn = $('#retryDbBtn');
    if (btn) btn.onclick = retryConnection;
    return;
  }

  // State 4: Temporary API or Network Failure
  if (state.connectionStatus === 'network_error') {
    n.innerHTML = `
      <div class="db-error-card" style="background:#f0f4ff;border-color:#c7d7fe;color:#1e3a8a">
        <span style="font-size:32px">📡</span>
        <h3 style="color:#1e3a8a">Network / Server Connection Error</h3>
        <p style="color:#2563eb">Unable to reach the server. Please check your internet connection or verify that the backend service is running.</p>
        <button id="retryDbBtn" class="btn btn-dark">↻ Retry Server Connection</button>
      </div>
    `;
    const btn = $('#retryDbBtn');
    if (btn) btn.onclick = retryConnection;
    return;
  }

  // State 2: Database Connected, but No Scholarship Records Exist
  if (!items.length) {
    n.innerHTML = `
      <div class="empty-state">
        <span style="font-size:28px">✦</span>
        <h3 style="margin:8px 0 4px">Database Connected (0 Records)</h3>
        <p style="margin:0 0 12px;font-size:11px;color:#707684">No published scholarships exist in the database yet. Are you a scholarship provider? Create an account to publish your organization's awards!</p>
        <button id="emptyStateProviderBtn" class="btn btn-yellow" style="font-size:10px">Sign In as Provider ↗</button>
      </div>
    `;
    const btn = $('#emptyStateProviderBtn');
    if (btn) {
      btn.onclick = () => {
        $('#authDialog').showModal();
        $('#authTabRegister').click();
        const r = document.querySelector('input[name="accountRole"][value="provider"]');
        if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
      };
    }
    return;
  }

  // State 3: Scholarships Successfully Loaded
  n.innerHTML = items.map(card).join('');
}

// Real Retry Connection handler with debouncing and real backend verification
async function retryConnection() {
  if (state.isRetrying) return;
  state.isRetrying = true;

  const btn = $('#retryDbBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span> Checking backend & database…';
  }

  try {
    const health = await api('/api/health');
    if (health.database && health.database.connected) {
      state.connectionStatus = 'connected';
      state.lastDbError = null;
      toast('✓ Database connected! Loading opportunities…');
      await load();
    } else {
      state.connectionStatus = 'disconnected';
      state.lastDbError = health.database?.error || health.message || 'Database connection unavailable.';
      render([], '#scholarshipGrid');
      toast(state.lastDbError);
    }
  } catch (err) {
    if (err.isNetworkError) {
      state.connectionStatus = 'network_error';
      state.lastDbError = 'Network or server unreachable.';
    } else {
      state.connectionStatus = 'disconnected';
      state.lastDbError = err.data?.message || err.data?.database?.error || err.message;
    }
    render([], '#scholarshipGrid');
    toast(state.lastDbError);
  } finally {
    setTimeout(() => {
      state.isRetrying = false;
      const b = $('#retryDbBtn');
      if (b) {
        b.disabled = false;
        b.textContent = '↻ Retry Connection';
      }
    }, 1200);
  }
}

function filter() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const degree = $('#degreeFilter').value;
  const sort = $('#sortFilter').value;

  state.filtered = state.scholarships.filter(x => {
    const matchesSearch = !q || [x.title, x.provider, x.description, ...(x.tags || []), ...(x.fieldsOfStudy || [])].join(' ').toLowerCase().includes(q);
    const matchesDegree = !degree || (x.degreeLevels || []).includes(degree);
    return matchesSearch && matchesDegree;
  });

  if (sort === 'amount') state.filtered.sort((a, b) => b.amount - a.amount);
  else if (sort === 'title') state.filtered.sort((a, b) => a.title.localeCompare(b.title));
  else state.filtered.sort((a, b) => (a.deadline ? new Date(a.deadline) : Infinity) - (b.deadline ? new Date(b.deadline) : Infinity));

  state.page = 1;
  const shown = state.filtered.slice(0, state.pageSize);
  render(shown);

  const countEl = $('#resultCount');
  if (countEl) {
    if (state.connectionStatus === 'connected') {
      countEl.textContent = `${state.filtered.length} opportunity${state.filtered.length === 1 ? '' : 'ies'} found`;
    } else {
      countEl.textContent = 'Database unavailable';
    }
  }

  const loadMoreBtn = $('#loadMore');
  if (loadMoreBtn) loadMoreBtn.classList.toggle('hidden', shown.length >= state.filtered.length);
}

function renderSaved() {
  saveState();
  const savedItems = state.scholarships.filter(x => state.saved.has(String(x._id)));
  render(savedItems, '#savedGrid');
  if (!state.saved.size) {
    $('#savedGrid').innerHTML = '<div class="empty-state">Your shortlist is waiting. Tap the heart on any scholarship to save it here.</div>';
  }
}

// Load public scholarships and statistics
async function load() {
  try {
    const [listRes, sumRes] = await Promise.all([
      api('/api/scholarships?sort=deadline'),
      api('/api/scholarships/summary')
    ]);

    state.connectionStatus = 'connected';
    state.scholarships = listRes.data || [];

    $('#statScholarships').textContent = sumRes.data.total;
    $('#statClosing').textContent = sumRes.data.closingSoon;
    $('#heroCount').textContent = `${sumRes.data.total} opportunities listed`;

    filter();
    renderSaved();
  } catch (e) {
    if (e.isNetworkError) {
      state.connectionStatus = 'network_error';
    } else {
      state.connectionStatus = 'disconnected';
    }
    render([], '#scholarshipGrid');
    $('#resultCount').textContent = 'Database unavailable';
  }
}

// Scholarship Detail Modal
async function detail(id) {
  try {
    let x = state.scholarships.find(s => String(s._id) === id);
    if (!x) x = (await api(`/api/scholarships/${encodeURIComponent(id)}`)).data;

    const docs = (x.requiredDocuments || []).map(d => `<li>${safe(d)}</li>`).join('') || '<li>Check official provider instructions.</li>';
    const link = x.applicationUrl && /^https?:\/\//i.test(x.applicationUrl)
      ? `<a class="btn btn-dark" target="_blank" rel="noopener noreferrer" href="${safe(x.applicationUrl)}">Visit provider ↗</a>`
      : '<p>No application URL provided for this listing.</p>';

    const verificationNotice = x.providerVerified
      ? '<span class="verified-tag">✓ Verified Provider</span>'
      : '<span class="unverified-tag">⚠️ Unverified Provider (Self-registered)</span>';

    $('#detailContent').innerHTML = `
      <div class="detail-content">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="eyebrow">✦ SCHOLARSHIP DETAILS</span>
          ${verificationNotice}
        </div>
        <h2>${safe(x.title)}</h2>
        <p><b>Provider Organization:</b> ${safe(x.provider)}</p>
        <p>${safe(x.description)}</p>
        <div class="detail-info">
          <div><small>Listed award</small><b>${money(x.amount, x.currency)}</b></div>
          <div><small>Deadline</small><b>${safe(dateLabel(x.deadline))}</b></div>
          <div><small>Degree level</small><b>${safe((x.degreeLevels || []).join(', ') || 'Not specified')}</b></div>
          <div><small>Minimum GPA</small><b>${safe(x.minGPA || 0)} / ${safe(x.gpaScale || 10)}</b></div>
        </div>
        <h4>Fields of study</h4>
        <p>${safe((x.fieldsOfStudy || []).join(', ') || 'Open field / not specified')}</p>
        ${x.maxIncome ? `<h4>Income Limit</h4><p>Annual family income must be ≤ ₹${x.maxIncome.toLocaleString('en-IN')}</p>` : ''}
        ${x.genderRestriction && x.genderRestriction !== 'all' ? `<h4>Gender Criteria</h4><p>${safe(x.genderRestriction)} applicants only</p>` : ''}
        <h4>Documents to prepare</h4>
        <ul>${docs}</ul>
        <p class="unverified-disclaimer"><b>Notice:</b> Always verify official requirements, dates, and terms directly with the offering organization before applying.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:15px">
          <button class="btn btn-yellow" data-save="${safe(String(x._id))}">${state.saved.has(String(x._id)) ? '♥ Saved' : '♡ Save scholarship'}</button>
          ${link}
        </div>
      </div>
    `;
    $('#detailDialog').showModal();
  } catch (e) {
    toast(e.message);
  }
}

function csv(v) {
  return String(v || '').split(',').map(x => x.trim()).filter(Boolean);
}

// Render Ranked Eligibility Matches with 3 Outcomes and Register / Apply Action
function renderMatches(matches) {
  state.lastMatches = matches;
  const n = $('#matchResults');
  n.classList.remove('hidden');

  if (!matches.length) {
    n.innerHTML = '<h3>Your explainable matches</h3><p>No active published scholarships found to match against.</p>';
    return;
  }

  n.innerHTML = `
    <h3>Your explainable matches</h3>
    <p>Ranked guidance based on your academic profile and criteria.</p>
    ${matches.slice(0, 15).map(x => {
      const id = String(x.scholarshipId || x._id || x.id);
      const statusClass = x.status || 'eligible';
      const statusLabel = x.statusLabel || (statusClass === 'ineligible' ? 'Not eligible based on known mandatory criteria' : statusClass === 'needs_verification' ? 'More information required' : 'Potentially eligible');

      const passedItems = (x.reasons || []).map(r => `<div class="criteria-item passed"><span>✓</span><span>${safe(r)}</span></div>`).join('');
      const unmetItems = (x.unmetCriteria || []).map(r => `<div class="criteria-item failed"><span>✗</span><span>${safe(r)}</span></div>`).join('');
      const missingItems = (x.unknownCriteria || []).map(r => `<div class="criteria-item missing"><span>?</span><span>${safe(r)}</span></div>`).join('');

      // Application Status or Register/Apply Button
      const app = state.myApplications.get(id);
      let actionArea = '';
      if (app) {
        const appStatus = app.status || 'pending';
        const statusText = appStatus === 'approved'
          ? '✓ Application Approved!'
          : appStatus === 'rejected'
          ? '✗ Application Rejected'
          : '⏳ Application Pending Review';
        actionArea = `<span class="app-status-pill ${safe(appStatus)}">${safe(statusText)}</span>`;
      } else {
        actionArea = `
          <button class="btn btn-yellow apply-match-btn" data-apply="${safe(id)}" data-score="${x.score}" data-title="${safe(x.title)}">
            Register / Apply ↗
          </button>
        `;
      }

      return `
        <div class="match-result-item">
          <div class="score-ring" style="--score:${x.score}%">
            <span>${x.score}</span>
          </div>
          <div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <h4>${safe(x.title)}</h4>
              <span class="match-status ${safe(statusClass)}">${safe(statusLabel)}</span>
            </div>
            <p>${safe(x.provider)} · ${money(x.amount, x.currency)} · ${safe(dateLabel(x.deadline))}</p>
            <div class="breakdown">
              ${Object.entries(x.breakdown || {}).map(([k, v]) => `<span>${safe(k)}: ${v}</span>`).join('')}
            </div>
            <div class="match-criteria-box">
              ${passedItems}
              ${unmetItems}
              ${missingItems}
            </div>
            <div class="match-item-footer">
              <div class="match-action-container" data-apply-container="${safe(id)}">
                ${actionArea}
              </div>
              <button class="details-btn" data-detail="${safe(id)}">View Details ↗</button>
            </div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

// Eligibility Match Submission
async function match(e) {
  e.preventDefault();
  const gpa = Number($('#gpaInput').value);
  const gpaScale = Number($('#gpaScaleInput').value || 10);

  if (!Number.isFinite(gpa) || gpa < 0 || gpa > gpaScale) {
    return toast(`Enter a valid GPA from 0 to ${gpaScale}.`);
  }

  const btn = $('#matcherForm button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Calculating…';

  try {
    const body = {
      gpa,
      gpaScale,
      degreeLevel: $('#degreeInput').value,
      educationLevel: $('#degreeInput').value,
      fieldsOfStudy: csv($('#fieldInput').value),
      annualFamilyIncome: $('#incomeInput').value ? Number($('#incomeInput').value) : null,
      state: $('#stateInput').value.trim(),
      citizenship: $('#citizenshipInput').value.trim(),
      category: $('#categoryInput').value.trim(),
      gender: $('#genderInput').value,
      minAmount: Number($('#amountInput').value) || 0
    };

    const r = await api('/api/scholarships/match', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    renderMatches(r.data.matches || []);
    $('#matchResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Calculate my matches ↗';
  }
}

// AUTHENTICATION & USER WORKFLOWS
async function checkAuth() {
  if (!state.token) {
    updateNavForGuest();
    return;
  }

  try {
    const res = await api('/api/auth/me');
    state.user = res.user;
    updateNavForUser();
    if (state.user.role === 'provider') {
      loadProviderScholarships();
      loadProviderApplications();
    } else if (state.user.role === 'student') {
      populateStudentMatcher();
      syncStudentSaved();
      loadStudentApplications();
    }
  } catch (err) {
    logout();
  }
}

function updateNavForGuest() {
  state.myApplications.clear();
  state.providerApplications = [];
  state.providerScholarships = [];
  $('#authNavArea').innerHTML = `
    <button id="navLoginBtn" class="btn btn-outline nav-btn">Sign In / Register</button>
  `;
  $('#heroRoleNote').textContent = 'Two-Role Platform: Students & Providers';
  $('#providerDashboard').classList.add('hidden');
  $('#savedSyncNote').textContent = 'Saved opportunities stay in this browser. Log in to sync across devices.';
  attachAuthEvents();
}

function updateNavForUser() {
  const u = state.user;
  if (!u) return;

  if (u.role === 'student') {
    $('#authNavArea').innerHTML = `
      <span class="user-greeting">🎓 ${safe(u.name)}</span>
      <button id="navProfileBtn" class="btn btn-outline nav-btn">My Profile</button>
      <button id="navLogoutBtn" class="btn btn-outline nav-btn">Log Out</button>
    `;
    $('#heroRoleNote').textContent = `Logged in as Student: ${u.name}`;
    $('#providerDashboard').classList.add('hidden');
    $('#savedSyncNote').textContent = 'Your shortlisted scholarships are synced with your student account.';
  } else if (u.role === 'provider') {
    const org = u.organization?.orgName || u.name;
    const badge = u.isVerified
      ? '<span class="verified-tag">Verified</span>'
      : '<span class="unverified-tag" title="Self-registered provider; not government-verified.">Unverified</span>';

    $('#authNavArea').innerHTML = `
      <span class="user-greeting">🏢 ${safe(org)} ${badge}</span>
      <button id="navProviderListingsBtn" class="btn btn-outline nav-btn">My Workspace</button>
      <button id="navLogoutBtn" class="btn btn-outline nav-btn">Log Out</button>
    `;
    $('#heroRoleNote').textContent = `Scholarship Provider: ${org}`;
    $('#providerDashboard').classList.remove('hidden');
    $('#providerOrgTitle').textContent = org;
  }

  attachAuthEvents();
}

function logout() {
  state.token = null;
  state.user = null;
  state.myApplications.clear();
  state.providerScholarships = [];
  state.providerApplications = [];
  localStorage.removeItem('sf-token');
  updateNavForGuest();
  if (state.lastMatches && state.lastMatches.length) {
    renderMatches(state.lastMatches);
  }
  toast('You have logged out.');
}

function populateStudentMatcher() {
  if (!state.user || state.user.role !== 'student') return;
  const p = state.user.profile || {};
  if (p.gpa) $('#gpaInput').value = p.gpa;
  if (p.gpaScale) $('#gpaScaleInput').value = p.gpaScale;
  if (p.educationLevel) $('#degreeInput').value = p.educationLevel;
  if (p.courses?.length) $('#fieldInput').value = p.courses.join(', ');
  if (p.annualFamilyIncome) $('#incomeInput').value = p.annualFamilyIncome;
  if (p.state) $('#stateInput').value = p.state;
  if (p.country) $('#citizenshipInput').value = p.country;
  if (p.category) $('#categoryInput').value = p.category;
  if (p.gender) $('#genderInput').value = p.gender;

  $('#matcherFormSubtitle').innerHTML = `✓ Auto-filled from your Student Profile. <a href="javascript:void(0)" id="reEditProfile">Edit Profile</a>`;
  const re = $('#reEditProfile');
  if (re) re.addEventListener('click', openProfileModal);
}

async function syncStudentSaved() {
  if (!state.user || state.user.role !== 'student') return;
  try {
    const res = await api('/api/student/saved');
    if (res.data) {
      res.data.forEach(s => state.saved.add(String(s._id || s.id)));
      saveState();
      filter();
      renderSaved();
    }
  } catch (err) {}
}

// STUDENT APPLICATION WORKFLOW
async function loadStudentApplications() {
  if (!state.user || state.user.role !== 'student') return;
  try {
    const res = await api('/api/student/applications');
    state.myApplications.clear();
    (res.data || []).forEach(app => {
      const sId = String(app.scholarship?._id || app.scholarship);
      state.myApplications.set(sId, app);
    });
    if (state.lastMatches && state.lastMatches.length) {
      renderMatches(state.lastMatches);
    }
  } catch (err) {
    console.error('Failed to load student applications:', err);
  }
}

async function handleApplyScholarship(scholarshipId, score, btnEl, containerEl) {
  if (!state.user) {
    toast('Please sign in or register as a Student to apply for scholarships.');
    $('#authDialog').showModal();
    return;
  }

  if (state.user.role === 'provider') {
    return toast('You are logged in as a Scholarship Provider. Only students can apply for scholarships.');
  }

  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = 'Submitting…';
  }

  try {
    const res = await api(`/api/student/apply/${scholarshipId}`, {
      method: 'POST',
      body: JSON.stringify({ matchScore: score })
    });

    state.myApplications.set(String(scholarshipId), res.data);
    if (containerEl) {
      containerEl.innerHTML = `<span class="app-status-pill pending">⏳ Application Pending Review</span>`;
    }
    toast('Application submitted successfully! The scholarship provider will review it.');
  } catch (err) {
    toast(err.message);
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = 'Register / Apply ↗';
    }
  }
}

// PROVIDER WORKFLOW: Load & Manage Own Scholarships
async function loadProviderScholarships() {
  if (!state.user || state.user.role !== 'provider') return;
  try {
    const res = await api('/api/provider/scholarships');
    state.providerScholarships = res.data || [];
    const countEl = $('#providerListingsCount');
    if (countEl) countEl.textContent = state.providerScholarships.length;
    renderProviderListings();
  } catch (err) {
    $('#providerGrid').innerHTML = `<div class="empty-state">Could not load your listings: ${safe(err.message)}</div>`;
  }
}

function renderProviderListings() {
  const n = $('#providerGrid');
  if (!state.providerScholarships.length) {
    n.innerHTML = `
      <div class="empty-state">
        <b>You haven't submitted any scholarships yet.</b>
        <p style="margin:8px 0 0;font-size:11px">Click "+ Post New Scholarship" to publish an award or save a draft.</p>
      </div>
    `;
    return;
  }

  n.innerHTML = state.providerScholarships.map(x => {
    const id = String(x._id);
    const statusClass = x.status || 'draft';
    const statusLabel = statusClass.toUpperCase();

    return `
      <article class="scholarship-card">
        <div class="card-art peach">
          <span class="card-art-label">${safe((x.fieldsOfStudy || []).slice(0, 2).join(' · ') || 'OPEN FIELD')}</span>
          <span class="status-pill ${safe(statusClass)}">${safe(statusLabel)}</span>
        </div>
        <div class="card-body">
          <h3 class="card-title">${safe(x.title)}</h3>
          <p class="card-description">${safe(x.description)}</p>
          <div class="card-meta">
            <div class="card-amount"><b>${money(x.amount, x.currency)}</b><small>Listed award</small></div>
            <div class="card-deadline"><b>${safe(dateLabel(x.deadline))}</b><small>Deadline</small></div>
          </div>
          <div class="provider-actions">
            <button class="btn btn-outline" style="padding:6px 10px;font-size:10px" data-edit-listing="${safe(id)}">Edit</button>
            <button class="btn btn-outline" style="padding:6px 10px;font-size:10px" data-toggle-status="${safe(id)}" data-current-status="${safe(statusClass)}">
              ${statusClass === 'published' ? 'Close Listing' : 'Publish'}
            </button>
            <button class="btn btn-outline" style="padding:6px 10px;font-size:10px;color:#c0392b" data-delete-listing="${safe(id)}">Delete</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// PROVIDER WORKFLOW: Review & Decide Student Applications (Approve or Reject)
async function loadProviderApplications() {
  if (!state.user || state.user.role !== 'provider') return;
  try {
    const res = await api('/api/provider/applications');
    state.providerApplications = res.data || [];
    const countEl = $('#providerAppCount');
    if (countEl) countEl.textContent = state.providerApplications.length;
    renderProviderApplications();
  } catch (err) {
    const el = $('#providerAppList');
    if (el) el.innerHTML = `<div class="empty-state">Could not load applicant submissions: ${safe(err.message)}</div>`;
  }
}

function renderProviderApplications() {
  const n = $('#providerAppList');
  if (!n) return;

  if (!state.providerApplications.length) {
    n.innerHTML = `
      <div class="empty-state">
        <b>No applicant submissions yet.</b>
        <p style="margin:8px 0 0;font-size:11px">When students match with and register/apply for your published scholarships, their application cards and academic details will appear here for your review and approval.</p>
      </div>
    `;
    return;
  }

  n.innerHTML = state.providerApplications.map(app => {
    const id = String(app._id);
    const snap = app.studentSnapshot || {};
    const studentName = snap.name || app.student?.name || 'Student Applicant';
    const studentEmail = snap.email || app.student?.email || 'N/A';
    const scholarshipTitle = app.scholarship?.title || 'Scholarship Award';
    const status = app.status || 'pending';
    const gpaText = snap.gpa !== null && snap.gpa !== undefined
      ? `${snap.gpa} / ${snap.gpaScale || 10}`
      : 'Not reported';
    const incomeText = snap.annualFamilyIncome
      ? `₹${snap.annualFamilyIncome.toLocaleString('en-IN')}`
      : 'Not reported';
    const coursesText = (snap.courses || []).length
      ? snap.courses.join(', ')
      : 'Not specified';
    const educationText = snap.educationLevel || 'Not specified';
    const locationText = [snap.state, snap.category, snap.gender].filter(Boolean).join(' · ') || 'General';

    let decisionHtml = '';
    if (status === 'pending') {
      decisionHtml = `
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-approve" data-decide-app="${safe(id)}" data-decision="approved">✓ Approve Application</button>
          <button class="btn-reject" data-decide-app="${safe(id)}" data-decision="rejected">✗ Reject</button>
        </div>
      `;
    } else if (status === 'approved') {
      decisionHtml = `
        <div style="display:flex;align-items:center;gap:10px">
          <span class="app-status-pill approved">✓ Approved</span>
          <button class="btn-change-decision" data-decide-app="${safe(id)}" data-decision="rejected">Change to Reject</button>
        </div>
      `;
    } else {
      decisionHtml = `
        <div style="display:flex;align-items:center;gap:10px">
          <span class="app-status-pill rejected">✗ Rejected</span>
          <button class="btn-change-decision" data-decide-app="${safe(id)}" data-decision="approved">Change to Approve</button>
        </div>
      `;
    }

    const decidedTime = app.decidedAt ? `<small style="color:#6b7280;margin-left:8px">Decided: ${safe(dateLabel(app.decidedAt))}</small>` : '';

    return `
      <article class="applicant-card">
        <div class="applicant-card-header">
          <div>
            <h4>👤 ${safe(studentName)} <span class="app-status-pill ${safe(status)}">${safe(status.toUpperCase())}</span></h4>
            <p class="applicant-sub">Applied for: <b>${safe(scholarshipTitle)}</b> · ${safe(dateLabel(app.appliedAt || app.createdAt))}</p>
          </div>
          <div style="text-align:right">
            <span class="unverified-tag" style="background:#eef2ff;color:#3730a3;border-color:#c7d2fe;font-size:11px">
              ✦ Match Score: ${app.matchScore || 0}%
            </span>
          </div>
        </div>

        <div class="applicant-profile-details">
          <div><b>Contact Email</b><span>${safe(studentEmail)}</span></div>
          <div><b>Education Level</b><span>${safe(educationText)}</span></div>
          <div><b>Fields / Courses</b><span>${safe(coursesText)}</span></div>
          <div><b>GPA / Marks</b><span>${safe(gpaText)}</span></div>
          <div><b>Family Income</b><span>${safe(incomeText)}</span></div>
          <div><b>Category / Region</b><span>${safe(locationText)}</span></div>
        </div>

        <div class="applicant-decision-bar">
          <div>
            <span style="font-size:11px;font-weight:700;color:#374151">Provider Decision:</span>
            ${decidedTime}
          </div>
          ${decisionHtml}
        </div>
      </article>
    `;
  }).join('');
}

async function handleApplicationDecision(appId, decision) {
  try {
    const res = await api(`/api/provider/applications/${appId}/decision`, {
      method: 'PATCH',
      body: JSON.stringify({ status: decision })
    });
    toast(res.message || `Application marked as ${decision}.`);
    await loadProviderApplications();
  } catch (err) {
    toast(err.message);
  }
}

// Open Student Profile Modal
function openProfileModal() {
  if (!state.user) return toast('Please log in first.');
  const p = state.user.profile || {};
  $('#pEducationLevel').value = p.educationLevel || '';
  $('#pCourses').value = (p.courses || []).join(', ');
  $('#pGpa').value = p.gpa ?? '';
  $('#pGpaScale').value = p.gpaScale || 10;
  $('#pIncome').value = p.annualFamilyIncome ?? '';
  $('#pState').value = p.state || '';
  $('#pCountry').value = p.country || 'India';
  $('#pGender').value = p.gender || '';
  $('#pCategory').value = p.category || '';
  $('#pInstitution').value = p.institution || '';
  $('#profileDialog').showModal();
}

// Open Provider Scholarship Modal (Create or Edit)
function openListingModal(listingId = null) {
  if (!state.user || state.user.role !== 'provider') return toast('Provider account required.');

  if (listingId) {
    const item = state.providerScholarships.find(s => String(s._id) === listingId);
    if (!item) return;
    $('#listingDialogTitle').innerHTML = 'Edit <em>Scholarship</em>';
    $('#listingId').value = listingId;
    $('#lTitle').value = item.title;
    $('#lDescription').value = item.description;
    $('#lAmount').value = item.amount;
    $('#lDeadline').value = item.deadline ? new Date(item.deadline).toISOString().slice(0, 10) : '';
    $('#lDegreeLevels').value = (item.degreeLevels || []).join(', ');
    $('#lFieldsOfStudy').value = (item.fieldsOfStudy || []).join(', ');
    $('#lMinGpa').value = item.minGPA || '';
    $('#lGpaScale').value = item.gpaScale || 10;
    $('#lMaxIncome').value = item.maxIncome || '';
    $('#lGender').value = item.genderRestriction || 'all';
    $('#lLocations').value = (item.locations || []).join(', ');
    $('#lAppUrl').value = item.applicationUrl || '';
    $('#lTags').value = (item.tags || []).join(', ');
    $('#lStatus').value = item.status || 'published';
  } else {
    $('#listingDialogTitle').innerHTML = 'Post New <em>Scholarship</em>';
    $('#listingId').value = '';
    $('#listingForm').reset();
    $('#lStatus').value = 'published';
  }

  $('#listingDialog').showModal();
}

function attachAuthEvents() {
  const loginBtn = $('#navLoginBtn');
  if (loginBtn) loginBtn.onclick = () => { $('#authDialog').showModal(); };

  const profileBtn = $('#navProfileBtn');
  if (profileBtn) profileBtn.onclick = openProfileModal;

  const providerListingsBtn = $('#navProviderListingsBtn');
  if (providerListingsBtn) providerListingsBtn.onclick = () => {
    $('#providerDashboard').scrollIntoView({ behavior: 'smooth' });
  };

  const logoutBtn = $('#navLogoutBtn');
  if (logoutBtn) logoutBtn.onclick = logout;
}

// Event Listeners Initialization
function events() {
  // Mobile Nav Toggle
  $('#menuToggle').addEventListener('click', () => $('#mainNav').classList.toggle('open'));
  $$('#mainNav a').forEach(a => a.addEventListener('click', () => {
    $('#mainNav').classList.remove('open');
    $$('.nav-link').forEach(n => n.classList.toggle('active', n.hash === a.hash));
  }));

  // Filtering & Search
  ['input', 'change'].forEach(ev => $('#searchInput').addEventListener(ev, filter));
  $('#degreeFilter').addEventListener('change', filter);
  $('#sortFilter').addEventListener('change', filter);
  $('#clearFilters').addEventListener('click', () => {
    $('#searchInput').value = '';
    $('#degreeFilter').value = '';
    $('#sortFilter').value = 'deadline';
    filter();
  });

  $('#loadMore').addEventListener('click', () => {
    state.page++;
    const shown = state.filtered.slice(0, state.page * state.pageSize);
    render(shown);
    $('#loadMore').classList.toggle('hidden', shown.length >= state.filtered.length);
  });

  $('#quickSearchForm').addEventListener('submit', e => {
    e.preventDefault();
    $('#searchInput').value = $('#quickSearchInput').value;
    filter();
    location.hash = '#scholarships';
  });

  $$('.popular-tags button').forEach(b => b.addEventListener('click', () => {
    $('#searchInput').value = b.dataset.search;
    filter();
    location.hash = '#scholarships';
  }));

  // Eligibility Matcher
  $('#matcherForm').addEventListener('submit', match);
  $('#matcherLoginPrompt')?.addEventListener('click', () => $('#authDialog').showModal());
  $('#ctaProviderBtn')?.addEventListener('click', () => {
    $('#authDialog').showModal();
    $('#authTabRegister').click();
    const radio = document.querySelector('input[name="accountRole"][value="provider"]');
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));
    }
  });

  // Bookmark / Save and Detail Click
  document.addEventListener('click', async e => {
    const s = e.target.closest('[data-save]');
    const d = e.target.closest('[data-detail]');
    const editBtn = e.target.closest('[data-edit-listing]');
    const toggleStatusBtn = e.target.closest('[data-toggle-status]');
    const deleteBtn = e.target.closest('[data-delete-listing]');
    const applyBtn = e.target.closest('[data-apply]');
    const decideBtn = e.target.closest('[data-decide-app]');

    if (applyBtn) {
      const scholarshipId = applyBtn.dataset.apply;
      const score = Number(applyBtn.dataset.score) || 0;
      const container = applyBtn.closest('.match-action-container');
      handleApplyScholarship(scholarshipId, score, applyBtn, container);
      return;
    }

    if (decideBtn) {
      const appId = decideBtn.dataset.decideApp;
      const decision = decideBtn.dataset.decision;
      handleApplicationDecision(appId, decision);
      return;
    }

    if (s) {
      const id = s.dataset.save;
      if (state.user && state.user.role === 'student') {
        try {
          const res = await api(`/api/student/saved/${id}`, { method: 'POST' });
          if (res.isSaved) {
            state.saved.add(id);
            toast('Saved to your student shortlist!');
          } else {
            state.saved.delete(id);
            toast('Removed from shortlist.');
          }
        } catch (err) {
          toast(err.message);
        }
      } else {
        if (state.saved.has(id)) {
          state.saved.delete(id);
          toast('Removed from shortlist.');
        } else {
          state.saved.add(id);
          toast('Saved on this device.');
        }
      }
      saveState();
      filter();
      renderSaved();
    }

    if (d) detail(d.dataset.detail);

    if (editBtn) openListingModal(editBtn.dataset.editListing);

    if (toggleStatusBtn) {
      const id = toggleStatusBtn.dataset.toggleStatus;
      const current = toggleStatusBtn.dataset.currentStatus;
      const nextStatus = current === 'published' ? 'closed' : 'published';
      try {
        await api(`/api/provider/scholarships/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus })
        });
        toast(`Listing status updated to ${nextStatus}.`);
        loadProviderScholarships();
        load();
      } catch (err) {
        toast(err.message);
      }
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.deleteListing;
      if (confirm('Are you sure you want to delete this scholarship listing?')) {
        try {
          await api(`/api/provider/scholarships/${id}`, { method: 'DELETE' });
          toast('Listing deleted.');
          loadProviderScholarships();
          load();
        } catch (err) {
          toast(err.message);
        }
      }
    }
  });

  // Modal Closures
  $('#dialogClose').addEventListener('click', () => $('#detailDialog').close());
  $('#authDialogClose').addEventListener('click', () => $('#authDialog').close());
  $('#profileDialogClose').addEventListener('click', () => $('#profileDialog').close());
  $('#listingDialogClose').addEventListener('click', () => $('#listingDialog').close());

  // Auth Dialog Tab Switching
  $('#authTabLogin').addEventListener('click', () => {
    $('#authTabLogin').classList.add('active');
    $('#authTabRegister').classList.remove('active');
    $('#loginForm').classList.remove('hidden');
    $('#registerForm').classList.add('hidden');
  });

  $('#authTabRegister').addEventListener('click', () => {
    $('#authTabRegister').classList.add('active');
    $('#authTabLogin').classList.remove('active');
    $('#registerForm').classList.remove('hidden');
    $('#loginForm').classList.add('hidden');
  });

  // Provider Workspace Tab Switching
  const tabListings = $('#tabProviderListings');
  const tabApps = $('#tabProviderApplications');
  if (tabListings && tabApps) {
    tabListings.addEventListener('click', () => {
      tabListings.classList.add('active');
      tabApps.classList.remove('active');
      $('#providerListingsView')?.classList.remove('hidden');
      $('#providerApplicationsView')?.classList.add('hidden');
      $('#createListingBtn')?.classList.remove('hidden');
    });

    tabApps.addEventListener('click', () => {
      tabApps.classList.add('active');
      tabListings.classList.remove('active');
      $('#providerApplicationsView')?.classList.remove('hidden');
      $('#providerListingsView')?.classList.add('hidden');
      $('#createListingBtn')?.classList.add('hidden');
      loadProviderApplications();
    });
  }

  // Role Selection (Student vs Provider)
  $$('input[name="accountRole"]').forEach(r => r.addEventListener('change', () => {
    const isProvider = $('input[name="accountRole"]:checked').value === 'provider';
    $('#providerFieldsArea').classList.toggle('hidden', !isProvider);
  }));

  // Login Form Submission
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;

    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('sf-token', state.token);
      $('#authDialog').close();
      toast(res.message);
      updateNavForUser();
      if (state.user.role === 'provider') {
        loadProviderScholarships();
        loadProviderApplications();
        $('#providerDashboard').scrollIntoView({ behavior: 'smooth' });
      } else if (state.user.role === 'student') {
        populateStudentMatcher();
        syncStudentSaved();
        loadStudentApplications();
      }
    } catch (err) {
      toast(err.message);
    }
  });

  // Register Form Submission
  $('#registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const role = $('input[name="accountRole"]:checked').value;
    const name = $('#regName').value.trim();
    const email = $('#regEmail').value.trim();
    const password = $('#regPassword').value;

    const body = { name, email, password, role };
    if (role === 'provider') {
      body.organization = {
        orgName: $('#regOrgName').value.trim() || name,
        website: $('#regOrgWebsite').value.trim(),
        description: $('#regOrgDescription').value.trim(),
        contactEmail: email
      };
    }

    try {
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('sf-token', state.token);
      $('#authDialog').close();
      toast(res.message);
      updateNavForUser();
      if (state.user.role === 'provider') {
        loadProviderScholarships();
        loadProviderApplications();
      } else if (state.user.role === 'student') {
        populateStudentMatcher();
        syncStudentSaved();
        loadStudentApplications();
      }
    } catch (err) {
      toast(err.message);
    }
  });

  // Student Profile Save
  $('#studentProfileForm').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
      educationLevel: $('#pEducationLevel').value,
      courses: csv($('#pCourses').value),
      gpa: $('#pGpa').value ? Number($('#pGpa').value) : null,
      gpaScale: Number($('#pGpaScale').value || 10),
      annualFamilyIncome: $('#pIncome').value ? Number($('#pIncome').value) : null,
      state: $('#pState').value.trim(),
      country: $('#pCountry').value.trim(),
      gender: $('#pGender').value,
      category: $('#pCategory').value.trim(),
      institution: $('#pInstitution').value.trim()
    };

    try {
      const res = await api('/api/student/profile', {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      state.user.profile = res.data;
      $('#profileDialog').close();
      toast('Student profile saved successfully!');
      populateStudentMatcher();
    } catch (err) {
      toast(err.message);
    }
  });

  // Provider Post/Edit Listing Submit
  $('#createListingBtn').addEventListener('click', () => openListingModal());

  $('#listingForm').addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('#listingId').value;
    const body = {
      title: $('#lTitle').value.trim(),
      description: $('#lDescription').value.trim(),
      amount: Number($('#lAmount').value),
      deadline: $('#lDeadline').value ? $('#lDeadline').value : null,
      degreeLevels: csv($('#lDegreeLevels').value),
      fieldsOfStudy: csv($('#lFieldsOfStudy').value),
      minGPA: $('#lMinGpa').value ? Number($('#lMinGpa').value) : 0,
      gpaScale: Number($('#lGpaScale').value || 10),
      maxIncome: $('#lMaxIncome').value ? Number($('#lMaxIncome').value) : null,
      genderRestriction: $('#lGender').value,
      locations: csv($('#lLocations').value),
      applicationUrl: $('#lAppUrl').value.trim(),
      tags: csv($('#lTags').value),
      status: $('#lStatus').value
    };

    try {
      if (id) {
        await api(`/api/provider/scholarships/${id}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
        toast('Scholarship updated successfully.');
      } else {
        await api('/api/provider/scholarships', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        toast('Scholarship created successfully.');
      }
      $('#listingDialog').close();
      loadProviderScholarships();
      load();
    } catch (err) {
      toast(err.message);
    }
  });
}

function reveal() {
  const nodes = $$('.reveal');
  if (!('IntersectionObserver' in window)) {
    nodes.forEach(n => n.classList.add('visible'));
    return;
  }
  const ob = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      ob.unobserve(e.target);
    }
  }), { threshold: .12 });
  nodes.forEach(n => ob.observe(n));
}

document.addEventListener('DOMContentLoaded', () => {
  $('#year').textContent = new Date().getFullYear();
  events();
  reveal();
  checkAuth();
  load();
});
