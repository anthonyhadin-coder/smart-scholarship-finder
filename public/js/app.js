const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

const state = {
  token: localStorage.getItem('sf-token') || null,
  user: null,
  scholarships: [],
  filtered: [],
  providerScholarships: [],
  saved: new Set(JSON.parse(localStorage.getItem('sf-saved') || '[]')),
  page: 1,
  pageSize: 9,
  isDbConnected: true
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

  const r = await fetch(url, { ...opts, headers });
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

function render(items, target = '#scholarshipGrid') {
  const n = $(target);
  if (!n) return;

  if (!state.isDbConnected) {
    n.innerHTML = `
      <div class="db-error-card">
        <span style="font-size:32px">⚠️</span>
        <h3>Database Connection Unavailable</h3>
        <p>Could not connect to MongoDB. If running on Vercel or Cloud, please verify that <code>MONGO_URI</code> is configured in environment variables.</p>
        <button id="retryDbBtn" class="btn btn-yellow">↻ Retry Connection</button>
      </div>
    `;
    const btn = $('#retryDbBtn');
    if (btn) btn.addEventListener('click', () => { btn.textContent = 'Connecting…'; load(); });
    return;
  }

  if (!items.length) {
    n.innerHTML = `
      <div class="empty-state">
        <b>No published opportunities found.</b>
        <p style="margin:8px 0 0;font-size:11px">Are you an organization offering an educational award? Create a Provider account to publish a scholarship!</p>
      </div>
    `;
    return;
  }

  n.innerHTML = items.map(card).join('');
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
  if (countEl) countEl.textContent = `${state.filtered.length} opportunity${state.filtered.length === 1 ? '' : 'ies'} found`;

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

    state.isDbConnected = true;
    state.scholarships = listRes.data || [];

    $('#statScholarships').textContent = sumRes.data.total;
    $('#statClosing').textContent = sumRes.data.closingSoon;
    $('#heroCount').textContent = `${sumRes.data.total} opportunities listed`;

    filter();
    renderSaved();
  } catch (e) {
    state.isDbConnected = false;
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

// Render Ranked Eligibility Matches with 3 Outcomes
function renderMatches(matches) {
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
      const statusClass = x.status || 'eligible';
      const statusLabel = x.statusLabel || (statusClass === 'ineligible' ? 'Not eligible based on known mandatory criteria' : statusClass === 'needs_verification' ? 'More information required' : 'Potentially eligible');

      const passedItems = (x.reasons || []).map(r => `<div class="criteria-item passed"><span>✓</span><span>${safe(r)}</span></div>`).join('');
      const unmetItems = (x.unmetCriteria || []).map(r => `<div class="criteria-item failed"><span>✗</span><span>${safe(r)}</span></div>`).join('');
      const missingItems = (x.unknownCriteria || []).map(r => `<div class="criteria-item missing"><span>?</span><span>${safe(r)}</span></div>`).join('');

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
    } else if (state.user.role === 'student') {
      populateStudentMatcher();
      syncStudentSaved();
    }
  } catch (err) {
    logout();
  }
}

function updateNavForGuest() {
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
      <button id="navProviderListingsBtn" class="btn btn-outline nav-btn">My Listings</button>
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
  localStorage.removeItem('sf-token');
  updateNavForGuest();
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

// PROVIDER WORKFLOW: Load & Manage Own Scholarships
async function loadProviderScholarships() {
  if (!state.user || state.user.role !== 'provider') return;
  try {
    const res = await api('/api/provider/scholarships');
    state.providerScholarships = res.data || [];
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
        $('#providerDashboard').scrollIntoView({ behavior: 'smooth' });
      } else if (state.user.role === 'student') {
        populateStudentMatcher();
        syncStudentSaved();
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
