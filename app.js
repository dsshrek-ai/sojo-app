/* ============================================
   SOJO Singer Directory — App Logic
   ============================================ */

const API_URL         = 'https://script.google.com/macros/s/AKfycbyMzS0N4UhQx32FEN3_delMMaeCoajsuFJUpQDSfzEsTN_nH-WcnheTw88izVtRud-s/exec';
const STORAGE_KEY     = 'sojoAllData';
const STORAGE_BACKUP  = 'sojoAllDataBackup';
const STORAGE_UPDATED = 'sojoLastUpdated';
const SESSION_PIN     = 'sojoPinVerified';

// ---- State ----
let allSingers    = [];
let appConfig     = {};
let currentSinger = null;
let pendingAction = null;
let attDateCol    = null;

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
const shareSheet       = document.getElementById('share-sheet');
const shareContent     = document.getElementById('share-content');

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
  document.getElementById('btn-share').addEventListener('click', openShareSheet);
  document.getElementById('btn-back-profile').addEventListener('click', goHome);
  document.getElementById('btn-edit').addEventListener('click', () => requirePin(() => openEditSinger(currentSinger)));
  document.getElementById('btn-back-edit').addEventListener('click', () => {
    slideOut(screenEdit);
    if (currentSinger) { slideIn(screenProfile); }
    else goHome();
  });
  document.getElementById('btn-save').addEventListener('click', saveSinger);
  document.getElementById('btn-back-attendance').addEventListener('click', goHome);
  document.getElementById('btn-close-share').addEventListener('click', closeShareSheet);
  document.querySelector('.bottom-sheet-backdrop').addEventListener('click', closeShareSheet);

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

  document.querySelectorAll('.pin-key').forEach(btn => {
    btn.addEventListener('click', () => handlePinKey(btn.dataset.key));
  });
  document.querySelector('.modal-backdrop').addEventListener('click', closePinModal);
}

// ---- Get filtered singers (shared logic) ----
function getFilteredSingers() {
  const search   = searchInput.value.toLowerCase().trim();
  const section  = sectionFilter.value;
  const position = positionFilter.value;

  return allSingers.filter(s => {
    // Exclude HOLD unless explicitly filtering for it
    const isHold = String(s.seq) === '90' || s.section === 'HOLD' || s.position === 'HOLD';
    if (isHold && section !== 'HOLD') return false;
    if (!isHold && section === 'HOLD') return false;

    if (section !== 'all' && section !== 'HOLD' && s.section !== section) return false;
    if (position !== 'all' && s.position !== position) return false;
    if (search) {
      const haystack = [s.firstname, s.lastname, s.combined, s.email,
                        s.cellPhone, s.homePhone, s.position, s.section,
                        s.notes, s.notes2, s.folder].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

// ---- Render Singer List ----
function renderList() {
  const filtered = getFilteredSingers();
  singerCount.textContent = `${filtered.length} singer${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    singerList.innerHTML = `<div class="empty-state"><p>No singers found.</p></div>`;
    return;
  }

  // Group by SEQ — Tenor all together, Bass all together
  const groups = {};
  filtered.forEach(s => {
    const seq = parseInt(s.seq) || 0;
    let key;
    if      (seq === 10) key = 'Soprano - 1st';
    else if (seq === 20) key = 'Soprano - 2nd';
    else if (seq === 30) key = 'Alto - 1st';
    else if (seq === 40) key = 'Alto - 2nd';
    else if (seq === 50) key = 'Tenor';
    else if (seq === 60) key = 'Bass';
    else if (seq === 90) key = 'HOLD';
    else                 key = s.position || s.section || 'Other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  const groupOrder = ['Soprano - 1st','Soprano - 2nd','Alto - 1st','Alto - 2nd','Tenor','Bass','HOLD'];
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ai = groupOrder.indexOf(a);
    const bi = groupOrder.indexOf(b);
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
      const initials    = getInitials(s);
      const sectionClass = (s.section || '').toLowerCase();
      const badges = [];
      if (s.new2026 === 'Y')  badges.push('<span class="badge badge-new">New</span>');
      if (s.verified === 'Y') badges.push('<span class="badge badge-verify">✓</span>');
      if (s.iphone === 'Y')   badges.push('<span class="badge badge-iphone">📱</span>');
      html += `<div class="singer-card" data-id="${escHtml(s.id)}">
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
      const singer = allSingers.find(s => String(s.id) === card.dataset.id);
      if (singer) openProfile(singer);
    });
  });
}

function updatePositionFilter() {
  const section   = sectionFilter.value;
  const positions = appConfig.positions || [];
  let relevant;
  if (section === 'all')  relevant = positions.filter(p => p !== 'HOLD');
  else if (section === 'HOLD') relevant = ['HOLD'];
  else relevant = positions.filter(p => p.toLowerCase().startsWith(section.toLowerCase()));

  positionFilter.innerHTML = '<option value="all">All Positions</option>';
  relevant.forEach(p => {
    positionFilter.innerHTML += `<option value="${escHtml(p)}">${escHtml(p)}</option>`;
  });
}

// ---- Profile Screen ----
function openProfile(singer) {
  currentSinger = singer;
  const dates   = appConfig.dates || [];
  const initials = getInitials(singer);
  const sectionClass = (singer.section || '').toLowerCase();

  let html = `<div class="profile-hero">
    <div class="profile-avatar ${sectionClass}">${initials}</div>
    <div>
      <div class="profile-name">${escHtml(singer.firstname)} ${escHtml(singer.lastname)}</div>
      <div class="profile-position">${escHtml(singer.position || singer.section)}</div>
      <div class="profile-badges">`;
  if (singer.new2026  === 'Y') html += '<span class="badge badge-new">New 2026</span>';
  if (singer.verified === 'Y') html += '<span class="badge badge-verify">Verified</span>';
  if (singer.iphone   === 'Y') html += '<span class="badge badge-iphone">iPhone</span>';
  if (singer.pic      === 'Y') html += '<span class="badge badge-verify">📷 Pic</span>';
  html += `</div></div></div><div class="profile-body">`;

  // Contact
  html += `<div class="info-section"><div class="info-section-title">Contact</div>`;
  html += infoRow('Cell',    singer.cellPhone ? phoneLink(singer.cellPhone) : '');
  html += infoRow('Home',    singer.homePhone ? phoneLink(singer.homePhone) : '');
  html += infoRow('Email',   singer.email     ? `<a href="mailto:${escHtml(singer.email)}" style="color:var(--navy-light)">${escHtml(singer.email)}</a>` : '');
  if (singer.address1) {
    const addr = [singer.address1, singer.city, singer.state, singer.zip].filter(Boolean).join(', ');
    html += infoRow('Address', escHtml(addr));
  }
  html += `</div>`;

  // Details
  html += `<div class="info-section"><div class="info-section-title">Details</div>`;
  html += infoRow('Section',  escHtml(singer.section));
  html += infoRow('Position', escHtml(singer.position));
  html += infoRow('Folder',   escHtml(singer.folder));
  html += infoRow('Height',   escHtml(singer.height));
  if (singer.notes)  html += infoRow('Notes',   escHtml(singer.notes));
  if (singer.notes2) html += infoRow('Notes 2', escHtml(singer.notes2));
  html += `</div>`;

  // Attendance
  if (dates.length > 0) {
    const present = Object.values(singer.attendance).filter(v => v === 'X').length;
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
      html += `<div class="att-cell ${cellClass}">
        <div class="att-date">${formatShortDate(d.label)}</div>
        <div class="att-code">${escHtml(code || '–')}</div>
      </div>`;
    });
    html += `</div></div>`;
  }

  html += `</div>`;
  profileContent.innerHTML = html;
  profileContent.scrollTop = 0;
  slideOut(screenHome);
  slideIn(screenProfile);
}

function infoRow(label, value) {
  const isEmpty = !value || value.toString().trim() === '';
  return `<div class="info-row">
    <span class="info-label">${label}</span>
    <span class="info-value${isEmpty ? ' empty' : ''}">${isEmpty ? 'Not provided' : value}</span>
  </div>`;
}

function phoneLink(phone) {
  const clean = escHtml(phone);
  return `<a href="tel:${clean}" style="color:var(--navy-light);text-decoration:none;display:inline-flex;align-items:center;gap:6px">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.69h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.08 6.08l1.28-1.28a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
    ${clean}
  </a>`;
}

// ---- Edit Singer ----
function openEditSinger(singer) {
  const isNew = !singer;
  document.getElementById('edit-title').textContent = isNew ? 'Add Singer' : `Edit ${singer ? singer.lastname : ''}`;

  const positions = appConfig.positions || ['Soprano - 1st','Soprano - 2nd','Alto - 1st','Alto - 2nd','Tenor - 1st','Tenor - 2nd','Bass - 1st','Bass - 2nd','HOLD'];
  const sections  = appConfig.sections  || ['Soprano','Alto','Tenor','Bass','HOLD'];
  const s = singer || {};

  let html = `<div class="form-section"><div class="form-section-title">Name & Voice Part</div>`;
  html += formRow('First Name', `<input class="form-input" id="f-firstname" value="${escHtml(s.firstname || '')}">`);
  html += formRow('Last Name',  `<input class="form-input" id="f-lastname"  value="${escHtml(s.lastname  || '')}">`);

  html += `<div class="form-row"><label class="form-label">Section</label>
    <select class="form-select" id="f-section">`;
  sections.forEach(sec => {
    html += `<option value="${escHtml(sec)}"${s.section === sec ? ' selected' : ''}>${escHtml(sec)}</option>`;
  });
  html += `</select></div>`;

  html += `<div class="form-row"><label class="form-label">Position</label>
    <select class="form-select" id="f-position">`;
  positions.forEach(pos => {
    html += `<option value="${escHtml(pos)}"${s.position === pos ? ' selected' : ''}>${escHtml(pos)}</option>`;
  });
  html += `</select></div></div>`;

  html += `<div class="form-section"><div class="form-section-title">Contact</div>`;
  html += formRow('Cell Phone', `<input class="form-input" id="f-cellPhone" type="tel" value="${escHtml(s.cellPhone || '')}">`);
  html += formRow('Home Phone', `<input class="form-input" id="f-homePhone" type="tel" value="${escHtml(s.homePhone || '')}">`);
  html += formRow('Email',      `<input class="form-input" id="f-email" type="email" value="${escHtml(s.email || '')}">`);
  html += formRow('Address',    `<input class="form-input" id="f-address1" value="${escHtml(s.address1 || '')}">`);
  html += `<div class="form-row-2">
    <div>${formRow('City',  `<input class="form-input" id="f-city"  value="${escHtml(s.city  || '')}">`)}</div>
    <div>${formRow('State', `<input class="form-input" id="f-state" value="${escHtml(s.state || '')}">`)}</div>
  </div>`;
  html += formRow('Zip', `<input class="form-input" id="f-zip" value="${escHtml(s.zip || '')}">`);
  html += `</div>`;

  html += `<div class="form-section"><div class="form-section-title">Profile</div>`;
  html += formRow('Height', `<input class="form-input" id="f-height" value="${escHtml(s.height || '')}">`);
  html += formRow('Folder', `<input class="form-input" id="f-folder" value="${escHtml(s.folder || '')}">`);
  html += checkRow('f-verified', 'Verified',      s.verified === 'Y');
  html += checkRow('f-new2026',  'New 2026',       s.new2026  === 'Y');
  html += checkRow('f-iphone',   'Has iPhone',     s.iphone   === 'Y');
  html += checkRow('f-pic',      'Photo on file',  s.pic      === 'Y');
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
    <input type="checkbox" id="${id}"${checked ? ' checked' : ''}>
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
  const seqNum = getSeqForPosition(singerData.position);
  singerData.seq = String(seqNum);

  const body = isNew
    ? { action: 'addSinger', pin, seq: seqNum, singer: singerData }
    : { action: 'updateSinger', pin, id: currentSinger.id, singer: singerData };

  const saveBtn = document.getElementById('btn-save');
  saveBtn.textContent = 'Saving…';
  saveBtn.disabled = true;

  try {
    const res  = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (isNew) {
      singerData.id         = String(data.id || Date.now());
      singerData.attendance = {};
      singerData.combined   = singerData.lastname + ', ' + singerData.firstname;
      allSingers.push(singerData);
    } else {
      const idx = allSingers.findIndex(s => s.id === currentSinger.id);
      if (idx >= 0) {
        allSingers[idx] = { ...allSingers[idx], ...singerData };
        currentSinger   = allSingers[idx];
      }
    }

    saveLocalData();
    renderList();
    document.getElementById('btn-back-edit').click();
    if (!isNew) openProfile(currentSinger);

  } catch(err) {
    alert('Save failed: ' + err.message);
  } finally {
    saveBtn.textContent = 'Save';
    saveBtn.disabled    = false;
  }
}

function getSeqForPosition(position) {
  if (position === 'Soprano - 1st') return 10;
  if (position === 'Soprano - 2nd') return 20;
  if (position === 'Alto - 1st')    return 30;
  if (position === 'Alto - 2nd')    return 40;
  if (position === 'Tenor - 1st' || position === 'Tenor - 2nd') return 50;
  if (position === 'Bass - 1st'  || position === 'Bass - 2nd')  return 60;
  if (position === 'HOLD')          return 90;
  return 60;
}

// ---- Attendance ----
async function openAttendance() {
  if (!appConfig.dates || appConfig.dates.length === 0) {
    try {
      const res    = await fetch(`${API_URL}?action=getConfig`);
      const config = await res.json();
      if (!config.error) {
        appConfig = config;
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          data.config = config;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
      }
    } catch(e) {
      alert('Could not load dates. Check connection.');
      return;
    }
  }

  const dates = appConfig.dates || [];
  if (dates.length === 0) { alert('No dates found. Please refresh data.'); return; }

  const today = new Date();
  let defaultDate = dates[0];
  for (const d of dates) {
    const parts = d.label.split('/');
    const dt = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    if (dt <= today) defaultDate = d;
  }
  attDateCol = defaultDate.col;

  let html = `<div class="att-date-picker">
    <div class="att-date-label">Select Date</div>
    <select class="att-date-select" id="att-date-select">`;
  dates.forEach(d => {
    html += `<option value="${d.col}"${d.col === attDateCol ? ' selected' : ''}>${d.label}</option>`;
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
  const sections = ['Soprano','Alto','Tenor','Bass'];
  let html = '';

  sections.forEach(section => {
    const singers = allSingers
      .filter(s => s.section === section && String(s.seq) !== '90' && s.position !== 'HOLD')
      .sort((a, b) => a.lastname.localeCompare(b.lastname));
    if (singers.length === 0) return;

    html += `<div class="att-section-group"><div class="att-section-header">${escHtml(section)}</div>`;
    singers.forEach(s => {
      const current = (s.attendance[attDateCol] || '').trim();
      html += `<div class="att-singer-row">
        <span class="att-singer-name">${escHtml(s.lastname)}, ${escHtml(s.firstname)}</span>
        <div class="att-buttons">
          <button class="att-btn${current === 'X' ? ' active-X' : ''}" data-id="${escHtml(s.id)}" data-val="X">X</button>
          <button class="att-btn${current === 'O' ? ' active-O' : ''}" data-id="${escHtml(s.id)}" data-val="O">O</button>
          <button class="att-btn${current === ''  ? ' active-blank' : ''}" data-id="${escHtml(s.id)}" data-val="">–</button>
        </div>
      </div>`;
    });
    html += '</div>';
  });

  document.getElementById('att-singer-rows').innerHTML = html;
  document.querySelectorAll('.att-btn').forEach(btn => {
    btn.addEventListener('click', () => markAttendance(btn.dataset.id, btn.dataset.val));
  });
}

async function markAttendance(id, value) {
  const pin = sessionStorage.getItem(SESSION_PIN);
  if (!pin) { requirePin(() => markAttendance(id, value)); return; }

  const singer = allSingers.find(s => String(s.id) === id);
  const prev   = singer ? (singer.attendance[attDateCol] || '') : '';
  if (singer) { singer.attendance[attDateCol] = value; saveLocalData(); }
  renderAttendanceRows();

  try {
    const res  = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'updateAttendance', pin, id, col: attDateCol, value }) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
  } catch(err) {
    alert('Failed to save: ' + err.message);
    if (singer) { singer.attendance[attDateCol] = prev; }
    renderAttendanceRows();
  }
}

// ---- Share ----
function openShareSheet() {
  buildShareContent();
  shareSheet.classList.remove('hidden');
}

function closeShareSheet() {
  shareSheet.classList.add('hidden');
}

function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

function buildShareContent() {
  const filtered = getFilteredSingers();

  // Sort by SEQ then lastname
  const seqOrder = [10,20,30,40,50,60];
  const sorted = [...filtered].sort((a, b) => {
    const sa = parseInt(a.seq) || 99;
    const sb = parseInt(b.seq) || 99;
    const oi = seqOrder.indexOf(sa);
    const oj = seqOrder.indexOf(sb);
    const ai = oi === -1 ? 99 : oi;
    const bi = oj === -1 ? 99 : oj;
    if (ai !== bi) return ai - bi;
    return a.lastname.localeCompare(b.lastname);
  });

  const withPhone  = sorted.filter(s => s.cellPhone && s.cellPhone.trim());
  const validEmails = sorted.filter(s => isValidEmail(s.email)).map(s => s.email.trim());

  // Build text groups of 10 in order
  const textGroups = [];
  let groupNum = 0;
  let currentGroup = null;
  let currentSeq = null;

  withPhone.forEach(s => {
    const seq = parseInt(s.seq) || 0;
    if (!currentGroup || seq !== currentSeq || currentGroup.numbers.length >= 10) {
      if (currentGroup) textGroups.push(currentGroup);
      groupNum++;
      currentSeq   = seq;
      currentGroup = { index: groupNum, label: getSeqLabel(seq), numbers: [] };
    }
    currentGroup.numbers.push(s.cellPhone.trim());
  });
  if (currentGroup && currentGroup.numbers.length > 0) textGroups.push(currentGroup);

  let html = `<div class="share-summary">
    Showing <strong>${filtered.length}</strong> singers · 
    <strong>${withPhone.length}</strong> with phone · 
    <strong>${validEmails.length}</strong> with valid email
  </div>`;

  // Text Groups
  html += `<div class="share-section-title">📱 Text Groups</div>`;
  if (textGroups.length === 0) {
    html += `<p style="font-size:13px;color:var(--text-light)">No singers with phone numbers in current selection.</p>`;
  } else {
    textGroups.forEach((group, gi) => {
      html += `<div class="share-group">
        <div class="share-group-header">
          <span class="share-group-label">Group ${group.index} — ${escHtml(group.label)}</span>
          <span class="share-group-count">${group.numbers.length} numbers</span>
        </div>
        <div class="share-numbers" id="nums-${gi}">${escHtml(group.numbers.join(', '))}</div>
        <button class="share-btn" data-copy-id="nums-${gi}">Copy Numbers</button>
      </div>`;
    });
  }

  // Email
  html += `<div class="share-section-title">✉️ Email List</div>`;
  if (validEmails.length === 0) {
    html += `<p style="font-size:13px;color:var(--text-light)">No valid email addresses in current selection.</p>`;
  } else {
    const emailStr   = validEmails.join(', ');
    const mailtoLink = 'mailto:?bcc=' + encodeURIComponent(validEmails.join(','));
    html += `<div class="share-group">
      <div class="share-group-header">
        <span class="share-group-label">All Emails</span>
        <span class="share-group-count">${validEmails.length} addresses</span>
      </div>
      <div class="share-email-list" id="email-list">${escHtml(emailStr)}</div>
      <button class="share-btn gold" id="btn-open-mail" data-mailto="${encodeURIComponent(mailtoLink)}">Open in Mail App</button>
      <button class="share-btn" data-copy-id="email-list">Copy List</button>
    </div>`;
  }

  shareContent.innerHTML = html;

  // Wire up copy buttons
  shareContent.querySelectorAll('[data-copy-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById(btn.dataset.copyId);
      if (el) copyText(el.textContent, btn);
    });
  });

  // Wire up mail button
  const mailBtn = document.getElementById('btn-open-mail');
  if (mailBtn) {
    mailBtn.addEventListener('click', () => {
      const mailto = decodeURIComponent(mailBtn.dataset.mailto);
      // Use a temporary anchor for maximum iOS compatibility
      const a = document.createElement('a');
      a.href = mailto;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 100);
    });
  }
}

function getSeqLabel(seq) {
  const map = {10:'Soprano 1st',20:'Soprano 2nd',30:'Alto 1st',40:'Alto 2nd',50:'Tenor',60:'Bass',90:'Hold'};
  return map[seq] || 'Other';
}

function copyText(text, btn) {
  const orig = btn.textContent;
  const success = () => {
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
  };

  // Modern clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(success).catch(() => fallbackCopy(text, success));
    return;
  }
  fallbackCopy(text, success);
}

function fallbackCopy(text, success) {
  // iOS-compatible fallback
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '-9999px';
  ta.setAttribute('readonly', '');
  document.body.appendChild(ta);

  // iOS requires this specific approach
  const range = document.createRange();
  range.selectNodeContents(ta);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  ta.setSelectionRange(0, 999999);

  try {
    document.execCommand('copy');
    success();
  } catch(e) {
    alert('Copy failed. Please select and copy the text manually.');
  }
  document.body.removeChild(ta);
}

// ---- PIN ----
let pinBuffer = '';

function requirePin(callback) {
  if (sessionStorage.getItem(SESSION_PIN)) { callback(); return; }
  pendingAction = callback;
  pinBuffer = '';
  updatePinDots();
  pinError.classList.add('hidden');
  pinModal.classList.remove('hidden');
}

function handlePinKey(key) {
  if (key === 'cancel') { closePinModal(); return; }
  if (key === 'delete') { pinBuffer = pinBuffer.slice(0,-1); updatePinDots(); return; }
  if (pinBuffer.length >= 4) return;
  pinBuffer += key;
  updatePinDots();
  if (pinBuffer.length === 4) verifyPin();
}

function verifyPin() {
  if (pinBuffer === '1234') {
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
    document.getElementById(`dot-${i}`).classList.toggle('filled', i < pinBuffer.length);
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

function slideIn(screen)  { screen.classList.add('active'); }
function slideOut(screen) { screen.classList.remove('active'); screen.classList.remove('slide-out'); }

// ---- Helpers ----
function getInitials(singer) {
  const f = (singer.firstname || '').trim()[0] || '';
  const l = (singer.lastname  || '').trim()[0] || '';
  return (f + l).toUpperCase();
}

function formatShortDate(label) {
  const parts = label.split('/');
  return parts.length >= 2 ? parts[0] + '/' + parts[1] : label;
}

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function saveLocalData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ config: appConfig, singers: allSingers }));
}

function showLastUpdated() {
  const ts = localStorage.getItem(STORAGE_UPDATED);
  lastUpdated.textContent = ts ? `Updated ${ts}` : '';
}
