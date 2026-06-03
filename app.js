/* ============================================
   SOJO Singer Directory — App Logic
   ============================================ */

const API_URL        = 'https://script.google.com/macros/s/AKfycbyMzS0N4UhQx32FEN3_delMMaeCoajsuFJUpQDSfzEsTN_nH-WcnheTw88izVtRud-s/exec';
const STORAGE_KEY    = 'sojoAllData';
const STORAGE_BACKUP = 'sojoAllDataBackup';
const STORAGE_UPDATED = 'sojoLastUpdated';
const SESSION_PIN    = 'sojoPinVerified';

// ---- State ----
let allSingers  = [];
let appConfig   = {};
let currentSinger = null;
let pendingAction = null; // what to do after PIN
let attDateCol  = null;   // current attendance date column

// ---- DOM ----
const screenHome       = document.getElementById('screen-home');
const screenProfile    = document.getElementById('screen-profile');
const screenEdit       = document.getElementById('screen-edit');
const screenAttendance = document.getElementById('screen-attendance');
const singerList       = document.getElementById('singer-list');
const singerCount      = document.getElementById('singer-count');
const searchInput      = document.getElementById('search-input');
const btnClearSearch   = document.getElementById('btn-clear-search');
const sectionFilter    = document.getElementById('section-filter');
const positionFilter   = document.getElementById('position-filter');
const profileContent   = document.getElementById('profile-content');
const editContent      = document.getElementById('edit-content');
const attContent       = document.getElementById('attendance-content');
const loadingOverlay   = document.getElementById('loading-overlay');
const lastUpdated      = document.getElementById('last-updated');
const pinModal         = document.getElementById('pin-modal');
const pinError         = document.getElementById('pin-error');

// ---- Init ----
window.addEventListener('load', init);

async function init() {
  registerSW();
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const data = JSON.parse(stored);
      allSingers = data.singers || [];
      appConfig  = data.config  || {};
      renderList();
      showLastUpdated();
      loadingOverlay.classList.add('hidden');
    } catch(e) {
      await fetchFromWeb();
    }
  } else {
    await fetchFromWeb();
  }
  setupEvents();
}

// ---- Service Worker ----
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          const banner = document.getElementById('update-banner');
          if (banner) banner.classList.remove('hidden');
          document.getElementById('btn-update').addEventListener('click', () => {
            nw.postMessage('skipWaiting');
            window.location.reload();
          });
          document.getElementById('btn-dismiss-update').addEventListener('click', () => {
            banner.classList.add('hidden');
          });
        }
      });
    });
  }).catch(() => {});
}

// ---- Fetch ----
async function fetchFromWeb() {
  loadingOverlay.classList.remove('hidden');
  try {
    const [configRes, singersRes] = await Promise.all([
      fetch(`${API_URL}?action=getConfig`),
      fetch(`${API_URL}?action=getSingers`)
    ]);
    const config  = await configRes.json();
    const singers = await singersRes.json();

    if (config.error || singers.error) throw new Error(config.error || singers.error);

    const current = localStorage.getItem(STORAGE_KEY);
    if (current) localStorage.setItem(STORAGE_BACKUP, current);

    const data = { config, singers: singers.singers };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(STORAGE_UPDATED, new Date().toLocaleString());

    allSingers = data.singers;
    appConfig  = config;
    renderList();
    showLastUpdated();
  } catch(err) {
    console.error('Fetch error:', err);
    if (allSingers.length === 0) {
      singerList.innerHTML = `<div class="empty-state"><p>⚠️ Could not load data.<br>Check connection and refresh.</p></div>`;
    }
  } finally {
    loadingOverlay.classList.add('hidden');
  }
}

// ---- Events ----
function setupEvents() {
  document.getElementById('btn-refresh').addEventListener('click', fetchFromWeb);
  document.getElementById('btn-add').addEventListener('click', () => requirePin(() => openAddSinger()));
  document.getElementById('btn-attendance').addEventListener('click', () => requirePin(() => openAttendance()));
  document.getElementById('btn-back-profile').addEventListener('click', goHome);
  document.getElementById('btn-edit').addEventListener('click', () => requirePin(() => openEditSinger(currentSinger)));
  document.getElementById('btn-back-edit').addEventListener('click', () => {
    slideOut(screenEdit);
    if (currentSinger) slideIn(screenProfile);
    else goHome();
  });
  document.getElementById('btn-save').addEventListener('click', saveSinger);
  document.getElementById('btn-back-attendance').addEventListener('click', goHome);

  searchInput.addEventListener('input', () => {
    btnClearSearch.classList.toggle('hidden', !searchInput.value);
    renderList();
  });

  btnClearSearch.addEventListener('click', () => {
    searchInput.value = '';
    btnClearSearch.classList.add('hidden');
    renderList();
  });

  sectionFilter.addEventListener('change', () => {
    updatePositionFilter();
    renderList();
  });

  positionFilter.addEventListener('change', renderList);

  // PIN keypad
  document.querySelectorAll('.pin-key').forEach(btn => {
    btn.addEventListener('click', () => handlePinKey(btn.dataset.key));
  });

  document.querySelector('.modal-backdrop').addEventListener('click', closePinModal);
}

// ---- Render Singer List ----
function renderList() {
  const search   = searchInput.value.toLowerCase().trim();
  const section  = sectionFilter.value;
  const position = positionFilter.value;

  let filtered = allSingers.filter(s => {
    if (section !== 'all' && s.section !== section) return false;
    if (position !== 'all' && s.position !== position) return false;
    if (search) {
      const haystack = [s.firstname, s.lastname, s.combined, s.email,
                        s.cellPhone, s.homePhone, s.position, s.section,
                        s.notes, s.notes2].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  singerCount.textContent = `${filtered.length} singer${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    singerList.innerHTML = `<div class="empty-state"><p>No singers found.</p></div>`;
    return;
  }

  // Group by section
  const groups = {};
  filtered.forEach(s => {
    const key = s.position || s.section || 'Other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  const sectionOrder = [
    'Soprano - 1st', 'Soprano - 2nd',
    'Alto - 1st', 'Alto - 2nd',
    'Tenor - 1st', 'Tenor - 2nd',
    'Baritone', 'Bass - 1st', 'Bass - 2nd', 'Bass'
  ];

  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ai = sectionOrder.indexOf(a);
    const bi = sectionOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  let html = '';
  sortedKeys.forEach(key => {
    const singers = groups[key].sort((a, b) => a.lastname.localeCompare(b.lastname));
    html += `<div class="section-group">
      <div class="section-label">${escHtml(key)} (${singers.length})</div>`;
    singers.forEach(s => {
      const initials = getInitials(s);
      const sectionClass = s.section ? s.section.toLowerCase() : 'soprano';
      const badges = [];
      if (s.new2026 === 'Y') badges.push('<span class="badge badge-new">New</span>');
      if (s.verified === 'Y') badges.push('<span class="badge badge-verify">✓</span>');
      if (s.iphone === 'Y') badges.push('<span class="badge badge-iphone">📱</span>');
      html += `<div class="singer-card" data-seq="${escHtml(s.seq)}" data-lastname="${escHtml(s.lastname)}">
        <div class="singer-avatar ${sectionClass}">${initials}</div>
        <div class="singer-info">
          <div class="singer-name">${escHtml(s.lastname)}, ${escHtml(s.firstname)}</div>
          <div class="singer-sub">${escHtml(s.position || s.section)}${s.folder ? ' · Folder ' + escHtml(s.folder) : ''}</div>
        </div>
        <div class="singer-badges">${badges.join('')}</div>
      </div>`;
    });
    html += '</div>';
  });

  singerList.innerHTML = html;

  document.querySelectorAll('.singer-card').forEach(card => {
    card.addEventListener('click', () => {
      const seq = card.dataset.seq;
      const ln  = card.dataset.lastname;
      const singer = allSingers.find(s => String(s.seq) === seq && s.lastname === ln);
      if (singer) openProfile(singer);
    });
  });
}

function updatePositionFilter() {
  const section = sectionFilter.value;
  const positions = appConfig.positions || [];
  const relevant = section === 'all'
    ? positions
    : positions.filter(p => p.toLowerCase().startsWith(section.toLowerCase()));

  positionFilter.innerHTML = '<option value="all">All Positions</option>';
  relevant.forEach(p => {
    positionFilter.innerHTML += `<option value="${escHtml(p)}">${escHtml(p)}</option>`;
  });
}

// ---- Profile Screen ----
function openProfile(singer) {
  currentSinger = singer;
  const dates = appConfig.dates || [];

  const initials = getInitials(singer);
  const sectionClass = singer.section ? singer.section.toLowerCase() : '';

  let html = `<div class="profile-hero">
    <div class="profile-avatar ${sectionClass}">${initials}</div>
    <div>
      <div class="profile-name">${escHtml(singer.firstname)} ${escHtml(singer.lastname)}</div>
      <div class="profile-position">${escHtml(singer.position || singer.section)}</div>
      <div class="profile-badges">`;

  if (singer.new2026 === 'Y') html += '<span class="badge badge-new">New 2026</span>';
  if (singer.verified === 'Y') html += '<span class="badge badge-verify">Verified</span>';
  if (singer.iphone === 'Y') html += '<span class="badge badge-iphone">iPhone</span>';
  if (singer.pic === 'Y') html += '<span class="badge badge-verify">📷 Pic</span>';

  html += `</div></div></div><div class="profile-body">`;

  // Contact
  html += `<div class="info-section"><div class="info-section-title">Contact</div>`;
  html += infoRow('Cell', singer.cellPhone ? `<a href="tel:${singer.cellPhone}">${escHtml(singer.cellPhone)}</a>` : '');
  html += infoRow('Home', singer.homePhone ? `<a href="tel:${singer.homePhone}">${escHtml(singer.homePhone)}</a>` : '');
  html += infoRow('Email', singer.email ? `<a href="mailto:${singer.email}">${escHtml(singer.email)}</a>` : '');
  if (singer.address1) {
    const addr = [singer.address1, singer.city, singer.state, singer.zip].filter(Boolean).join(', ');
    html += infoRow('Address', escHtml(addr));
  }
  html += `</div>`;

  // Details
  html += `<div class="info-section"><div class="info-section-title">Details</div>`;
  html += infoRow('Section', escHtml(singer.section));
  html += infoRow('Position', escHtml(singer.position));
  html += infoRow('Folder', escHtml(singer.folder));
  html += infoRow('Height', escHtml(singer.height));
  if (singer.notes)  html += infoRow('Notes', escHtml(singer.notes));
  if (singer.notes2) html += infoRow('Notes 2', escHtml(singer.notes2));
  html += `</div>`;

  // Attendance
  if (dates.length > 0) {
    const present = Object.values(singer.attendance).filter(v => v === 'X').length;
    const out     = Object.values(singer.attendance).filter(v => v === 'O').length;
    const total   = dates.length;

    html += `<div class="info-section"><div class="info-section-title">Attendance — ${present}/${total} present</div>
      <div class="att-legend">
        <div class="att-legend-item"><div class="legend-dot legend-X"></div> Present</div>
        <div class="att-legend-item"><div class="legend-dot legend-O"></div> Notified Out</div>
        <div class="att-legend-item"><div class="legend-dot legend-blank"></div> Unknown</div>
      </div>
      <div class="attendance-grid">`;

    dates.forEach(d => {
      const code = (singer.attendance[d.col] || '').trim();
      const cellClass = code === 'X' ? 'att-X' : code === 'O' ? 'att-O' : 'att-blank';
      const display   = code || '–';
      const shortDate = formatShortDate(d.label);
      html += `<div class="att-cell ${cellClass}">
        <div class="att-date">${shortDate}</div>
        <div class="att-code">${escHtml(display)}</div>
      </div>`;
    });

    html += `</div></div>`;
  }

  html += `</div>`; // end profile-body

  profileContent.innerHTML = html;
  profileContent.scrollTop = 0;
  slideOut(screenHome);
  slideIn(screenProfile);
}

function infoRow(label, value) {
  const isEmpty = !value || value.trim() === '';
  return `<div class="info-row">
    <span class="info-label">${label}</span>
    <span class="info-value${isEmpty ? ' empty' : ''}">${isEmpty ? 'Not provided' : value}</span>
  </div>`;
}

// ---- Edit Singer ----
function openEditSinger(singer) {
  const isNew = !singer;
  document.getElementById('edit-title').textContent = isNew ? 'Add Singer' : `Edit ${singer ? singer.lastname : ''}`;

  const positions = appConfig.positions || [];
  const sections  = appConfig.sections  || ['Soprano', 'Alto', 'Tenor', 'Bass'];

  const s = singer || {};

  let html = `<div class="form-section"><div class="form-section-title">Name & Voice Part</div>`;

  html += formRow('First Name', `<input class="form-input" id="f-firstname" value="${escHtml(s.firstname || '')}">`);
  html += formRow('Last Name',  `<input class="form-input" id="f-lastname"  value="${escHtml(s.lastname  || '')}">`);

  html += `<div class="form-row"><label class="form-label">Section</label>
    <select class="form-select" id="f-section">`;
  sections.forEach(sec => {
    html += `<option value="${escHtml(sec)}" ${s.section === sec ? 'selected' : ''}>${escHtml(sec)}</option>`;
  });
  html += `</select></div>`;

  html += `<div class="form-row"><label class="form-label">Position</label>
    <select class="form-select" id="f-position">`;
  positions.forEach(pos => {
    html += `<option value="${escHtml(pos)}" ${s.position === pos ? 'selected' : ''}>${escHtml(pos)}</option>`;
  });
  html += `</select></div></div>`;

  html += `<div class="form-section"><div class="form-section-title">Contact</div>`;
  html += formRow('Cell Phone',  `<input class="form-input" id="f-cellPhone"  type="tel" value="${escHtml(s.cellPhone  || '')}">`);
  html += formRow('Home Phone',  `<input class="form-input" id="f-homePhone"  type="tel" value="${escHtml(s.homePhone  || '')}">`);
  html += formRow('Email',       `<input class="form-input" id="f-email"      type="email" value="${escHtml(s.email    || '')}">`);
  html += formRow('Address',     `<input class="form-input" id="f-address1"   value="${escHtml(s.address1  || '')}">`);
  html += `<div class="form-row-2">`;
  html += `<div>${formRow('City',  `<input class="form-input" id="f-city"  value="${escHtml(s.city  || '')}">`)}</div>`;
  html += `<div>${formRow('State', `<input class="form-input" id="f-state" value="${escHtml(s.state || '')}">`)}</div>`;
  html += `</div>`;
  html += formRow('Zip', `<input class="form-input" id="f-zip" value="${escHtml(s.zip || '')}">`);
  html += `</div>`;

  html += `<div class="form-section"><div class="form-section-title">Profile</div>`;
  html += formRow('Height', `<input class="form-input" id="f-height" value="${escHtml(s.height || '')}">`);
  html += formRow('Folder', `<input class="form-input" id="f-folder" value="${escHtml(s.folder || '')}">`);

  html += checkRow('f-verified', 'Verified',   s.verified === 'Y');
  html += checkRow('f-new2026',  'New 2026',   s.new2026  === 'Y');
  html += checkRow('f-iphone',   'Has iPhone', s.iphone   === 'Y');
  html += checkRow('f-pic',      'Photo on file', s.pic   === 'Y');

  html += formRow('Notes',   `<input class="form-input" id="f-notes"  value="${escHtml(s.notes  || '')}">`);
  html += formRow('Notes 2', `<input class="form-input" id="f-notes2" value="${escHtml(s.notes2 || '')}">`);
  html += `</div>`;

  editContent.innerHTML = html;
  editContent.scrollTop = 0;

  if (currentSinger) slideOut(screenProfile);
  else slideOut(screenHome);
  slideIn(screenEdit);
}

function formRow(label, input) {
  return `<div class="form-row"><label class="form-label">${label}</label>${input}</div>`;
}

function checkRow(id, label, checked) {
  return `<div class="form-checkbox-row">
    <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
    <label for="${id}">${label}</label>
  </div>`;
}

function openAddSinger() {
  currentSinger = null;
  openEditSinger(null);
}

async function saveSinger() {
  const pin = sessionStorage.getItem(SESSION_PIN);
  if (!pin) { requirePin(() => saveSinger()); return; }

  const singerData = {
    firstname: document.getElementById('f-firstname').value.trim(),
    lastname:  document.getElementById('f-lastname').value.trim(),
    section:   document.getElementById('f-section').value,
    position:  document.getElementById('f-position').value,
    cellPhone: document.getElementById('f-cellPhone').value.trim(),
    homePhone: document.getElementById('f-homePhone').value.trim(),
    email:     document.getElementById('f-email').value.trim(),
    address1:  document.getElementById('f-address1').value.trim(),
    city:      document.getElementById('f-city').value.trim(),
    state:     document.getElementById('f-state').value.trim(),
    zip:       document.getElementById('f-zip').value.trim(),
    height:    document.getElementById('f-height').value.trim(),
    folder:    document.getElementById('f-folder').value.trim(),
    verified:  document.getElementById('f-verified').checked ? 'Y' : '',
    new2026:   document.getElementById('f-new2026').checked  ? 'Y' : '',
    iphone:    document.getElementById('f-iphone').checked   ? 'Y' : '',
    pic:       document.getElementById('f-pic').checked      ? 'Y' : '',
    notes:     document.getElementById('f-notes').value.trim(),
    notes2:    document.getElementById('f-notes2').value.trim(),
  };

  const isNew = !currentSinger;
  const body = isNew
    ? { action: 'addSinger', pin, seq: getSeqForPosition(singerData.position), singer: singerData }
    : { action: 'updateSinger', pin, seq: currentSinger.seq, lastname: currentSinger.lastname, singer: singerData };

  document.getElementById('btn-save').textContent = 'Saving…';
  document.getElementById('btn-save').disabled = true;

  try {
    const res  = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Update local data
    if (isNew) {
      singerData.seq = String(getSeqForPosition(singerData.position));
      singerData.attendance = {};
      singerData.combined = singerData.lastname + ', ' + singerData.firstname;
      allSingers.push(singerData);
    } else {
      const idx = allSingers.findIndex(s => s.seq === currentSinger.seq && s.lastname === currentSinger.lastname);
      if (idx >= 0) {
        allSingers[idx] = { ...allSingers[idx], ...singerData };
        currentSinger = allSingers[idx];
      }
    }

    saveLocalData();
    renderList();

    document.getElementById('btn-back-edit').click();
    if (!isNew) openProfile(currentSinger);

  } catch(err) {
    alert('Save failed: ' + err.message);
  } finally {
    document.getElementById('btn-save').textContent = 'Save';
    document.getElementById('btn-save').disabled = false;
  }
}

function getSeqForPosition(position) {
  if (position.startsWith('Soprano - 1')) return 10;
  if (position.startsWith('Soprano - 2')) return 20;
  if (position.startsWith('Alto - 1'))    return 30;
  if (position.startsWith('Alto - 2'))    return 40;
  if (position.startsWith('Tenor'))       return 50;
  return 60; // Bass / Baritone
}

// ---- Attendance Screen ----
function openAttendance() {
  const dates = appConfig.dates || [];
  if (dates.length === 0) {
    alert('No dates found. Please refresh data.');
    return;
  }

  // Default to most recent past date
  const today = new Date();
  let defaultDate = dates[0];
  for (const d of dates) {
    const parts = d.label.split('/');
    const dt = new Date(parts[2], parts[0] - 1, parts[1]);
    if (dt <= today) defaultDate = d;
  }
  attDateCol = defaultDate.col;

  let html = `<div class="att-date-picker">
    <div class="att-date-label">Select Date</div>
    <select class="att-date-select" id="att-date-select">`;
  dates.forEach(d => {
    html += `<option value="${d.col}" ${d.col === attDateCol ? 'selected' : ''}>${d.label}</option>`;
  });
  html += `</select></div><div id="att-singer-rows"></div>`;

  attContent.innerHTML = html;

  document.getElementById('att-date-select').addEventListener('change', e => {
    attDateCol = parseInt(e.target.value);
    renderAttendanceRows();
  });

  renderAttendanceRows();
  slideOut(screenHome);
  slideIn(screenAttendance);
}

function renderAttendanceRows() {
  const sections = ['Soprano', 'Alto', 'Tenor', 'Bass'];
  const pin = sessionStorage.getItem(SESSION_PIN);
  let html = '';

  sections.forEach(section => {
    const singers = allSingers
      .filter(s => s.section === section)
      .sort((a, b) => a.lastname.localeCompare(b.lastname));
    if (singers.length === 0) return;

    html += `<div class="att-section-group"><div class="att-section-header">${escHtml(section)}</div>`;
    singers.forEach(s => {
      const current = (s.attendance[attDateCol] || '').trim();
      html += `<div class="att-singer-row">
        <span class="att-singer-name">${escHtml(s.lastname)}, ${escHtml(s.firstname)}</span>
        <div class="att-buttons">
          <button class="att-btn ${current === 'X' ? 'active-X' : ''}" 
            data-seq="${escHtml(s.seq)}" data-ln="${escHtml(s.lastname)}" data-val="X">X</button>
          <button class="att-btn ${current === 'O' ? 'active-O' : ''}" 
            data-seq="${escHtml(s.seq)}" data-ln="${escHtml(s.lastname)}" data-val="O">O</button>
          <button class="att-btn ${current === '' ? 'active-blank' : ''}" 
            data-seq="${escHtml(s.seq)}" data-ln="${escHtml(s.lastname)}" data-val="">–</button>
        </div>
      </div>`;
    });
    html += '</div>';
  });

  document.getElementById('att-singer-rows').innerHTML = html;

  document.querySelectorAll('.att-btn').forEach(btn => {
    btn.addEventListener('click', () => markAttendance(btn.dataset.seq, btn.dataset.ln, btn.dataset.val, btn));
  });
}

async function markAttendance(seq, lastname, value, btn) {
  const pin = sessionStorage.getItem(SESSION_PIN);
  if (!pin) { requirePin(() => markAttendance(seq, lastname, value, btn)); return; }

  // Optimistic update
  const singer = allSingers.find(s => String(s.seq) === seq && s.lastname === lastname);
  if (singer) {
    singer.attendance[attDateCol] = value;
    saveLocalData();
  }
  renderAttendanceRows();

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'updateAttendance',
        pin, seq, lastname,
        col: attDateCol,
        value
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
  } catch(err) {
    alert('Failed to save attendance: ' + err.message);
    // Revert
    if (singer) singer.attendance[attDateCol] = value === 'X' ? '' : 'X';
    renderAttendanceRows();
  }
}

// ---- PIN System ----
let pinBuffer = '';

function requirePin(callback) {
  const stored = sessionStorage.getItem(SESSION_PIN);
  if (stored) { callback(); return; }
  pendingAction = callback;
  pinBuffer = '';
  updatePinDots();
  pinError.classList.add('hidden');
  pinModal.classList.remove('hidden');
}

function handlePinKey(key) {
  if (key === 'cancel') { closePinModal(); return; }
  if (key === 'delete') { pinBuffer = pinBuffer.slice(0, -1); updatePinDots(); return; }
  if (pinBuffer.length >= 4) return;
  pinBuffer += key;
  updatePinDots();
  if (pinBuffer.length === 4) verifyPin();
}

function verifyPin() {
  // PIN is verified server-side on actual writes; here we just check locally
  // The real security is on the Apps Script side
  const CORRECT = '1234'; // keep in sync with Apps Script
  if (pinBuffer === CORRECT) {
    sessionStorage.setItem(SESSION_PIN, pinBuffer);
    closePinModal();
    if (pendingAction) { pendingAction(); pendingAction = null; }
  } else {
    pinError.classList.remove('hidden');
    pinBuffer = '';
    updatePinDots();
    setTimeout(() => pinError.classList.add('hidden'), 2000);
  }
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    dot.classList.toggle('filled', i < pinBuffer.length);
  }
}

function closePinModal() {
  pinModal.classList.add('hidden');
  pinBuffer = '';
  updatePinDots();
  pendingAction = null;
}

// ---- Navigation ----
function goHome() {
  [screenProfile, screenEdit, screenAttendance].forEach(s => slideOut(s));
  screenHome.classList.remove('slide-out');
  screenHome.classList.add('active');
}

function slideIn(screen) {
  screen.classList.add('active');
}

function slideOut(screen) {
  screen.classList.remove('active');
  screen.classList.remove('slide-out');
}

// ---- Helpers ----
function getInitials(singer) {
  const f = (singer.firstname || '').trim()[0] || '';
  const l = (singer.lastname  || '').trim()[0] || '';
  return (f + l).toUpperCase();
}

function formatShortDate(label) {
  // "9/11/2025" → "9/11"
  const parts = label.split('/');
  return parts.length >= 2 ? parts[0] + '/' + parts[1] : label;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function saveLocalData() {
  const data = { config: appConfig, singers: allSingers };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function showLastUpdated() {
  const ts = localStorage.getItem(STORAGE_UPDATED);
  lastUpdated.textContent = ts ? `Updated ${ts}` : '';
}
