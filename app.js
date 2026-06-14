/* ============================================
   SOJO App — Google Apps Script API
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
const menuDrawer       = document.getElementById('menu-drawer');

// ---- Init ----
window.addEventListener('load', init);

async function init() {
  registerSW();
  setupEvents();
  loadingOverlay.classList.add('hidden');
  if (!sessionStorage.getItem(SESSION_PIN)) {
    requirePin(() => loadApp());
  } else {
    await loadApp();
  }
}

// ---- Load App ----
// Always try to show cached data immediately, then refresh from network in background.
async function loadApp() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const data = JSON.parse(stored);
      allSingers = data.singers || [];
      appConfig  = data.config  || {};
      renderList();
      showLastUpdated();
      loadingOverlay.classList.add('hidden');
      // Silently refresh in background — show offline banner only if it fails
      fetchFromWeb({ silent: true });
      return;
    } catch(e) { /* fall through to full fetch */ }
  }
  // No cache — must fetch
  await fetchFromWeb({ silent: false });
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
// silent: true  → already showing cached data; don't show spinner, show offline banner on fail
// silent: false → no cache; show spinner, show error message on fail
async function fetchFromWeb({ silent = false } = {}) {
  if (!silent) loadingOverlay.classList.remove('hidden');

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

    // Hide offline banner if it was showing
    document.getElementById('offline-banner').classList.add('hidden');

  } catch(err) {
    console.error('Fetch error:', err);

    if (silent) {
      // We're already showing cached data — just notify the user quietly
      showOfflineBanner();
    } else {
      // No cache at all — this is a hard failure
      if (allSingers.length === 0) {
        singerList.innerHTML = `<div class="empty-state"><p>⚠️ Could not load data.<br>Check connection and refresh.</p></div>`;
      }
    }
  } finally {
    loadingOverlay.classList.add('hidden');
  }
}

function showOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.classList.remove('hidden');
}

// ---- Events ----
function setupEvents() {
  // Hamburger menu
  document.getElementById('btn-menu').addEventListener('click', openMenu);
  document.getElementById('btn-close-menu').addEventListener('click', closeMenu);
  document.querySelector('.drawer-backdrop').addEventListener('click', closeMenu);
  document.getElementById('menu-share').addEventListener('click', () => { closeMenu(); openShareSheet(); });
  document.getElementById('menu-attendance').addEventListener('click', () => { closeMenu(); openAttendance(); });
  document.getElementById('menu-refresh').addEventListener('click', () => { closeMenu(); fetchFromWeb({ silent: false }); });

  // Offline banner dismiss
  document.getElementById('btn-dismiss-offline').addEventListener('click', () => {
    document.getElementById('offline-banner').classList.add('hidden');
  });

  // Profile / Edit navigation
  document.getElementById('btn-back-profile').addEventListener('click', goHome);
  document.getElementById('btn-edit').addEventListener('click', () => openEditSinger(currentSinger));
  document.getElementById('btn-back-edit').addEventListener('click', () => {
    slideOut(screenEdit);
    if (currentSinger) { slideIn(screenProfile); }
    else goHome();
  });
  document.getElementById('btn-save').addEventListener('click', saveSinger);
  document.getElementById('btn-back-attendance').addEventListener('click', goHome);

  // Share sheet
  document.getElementById('btn-close-share').addEventListener('click', closeShareSheet);
  document.querySelector('.bottom-sheet-backdrop').addEventListener('click', closeShareSheet);

  // Search & filter
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

  // PIN
  document.querySelectorAll('.pin-key').forEach(btn => {
    btn.addEventListener('click', () => handlePinKey(btn.dataset.key));
  });
  document.querySelector('.modal-backdrop').addEventListener('click', closePinModal);
}

// ---- Hamburger Menu ----
function openMenu() {
  menuDrawer.classList.remove('hidden');
  // Small delay so the CSS transition fires
  requestAnimationFrame(() => menuDrawer.classList.add('open'));
}

function closeMenu() {
  menuDrawer.classList.remove('open');
  // Wait for slide-out transition before hiding
  setTimeout(() => menuDrawer.classList.add('hidden'), 300);
}

// ---- Get filtered singers (shared logic) ----
function getFilteredSingers() {
  const search   = searchInput.value.toLowerCase().trim();
  const section  = sectionFilter.value;
  const position = positionFilter.value;

  return allSingers.filter(s => {
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

      const missing = getMissingFields(s);
      if (missing.length > 0) {
        badges.push(`<span class="badge badge-missing" data-id="${escHtml(s.id)}">⚠ Info</span>`);
      }

      const neededActions = computeNeededActions(s);
      const pendingActions = neededActions & ~(s.actionTaken || 0);
      if (pendingActions) {
        badges.push(`<span class="badge badge-action" data-id="${escHtml(s.id)}">! Action</span>`);
      }

      const hasNote = !!(s.notes || '').trim();
      html += `<div class="singer-card" data-id="${escHtml(s.id)}">
        <div class="singer-avatar ${sectionClass}">${initials}</div>
        <div class="singer-info">
          <div class="singer-name">${escHtml(s.lastname)}, ${escHtml(s.firstname)}</div>
          <div class="singer-sub">${escHtml(s.position || s.section)}${s.folder ? ' · Folder ' + escHtml(s.folder) : ''}</div>
        </div>
        <div class="singer-badges">${badges.join('')}</div>
        <button class="note-btn${hasNote ? ' has-note' : ''}" data-id="${escHtml(s.id)}" title="Note" aria-label="Note">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        </button>
      </div>`;
    });
    html += '</div>';
  });

  singerList.innerHTML = html;

  document.querySelectorAll('.singer-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.badge-missing')) return;
      if (e.target.closest('.badge-action'))  return;
      if (e.target.closest('.note-btn'))      return;
      const singer = allSingers.find(s => String(s.id) === card.dataset.id);
      if (singer) openProfile(singer);
    });
  });

  document.querySelectorAll('.badge-action').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const singer = allSingers.find(s => String(s.id) === badge.dataset.id);
      if (singer) openActionModal(singer);
    });
  });

  document.querySelectorAll('.note-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const singer = allSingers.find(s => String(s.id) === btn.dataset.id);
      if (singer) openNoteModal(singer);
    });
  });

  // Wire up missing info badges
  document.querySelectorAll('.badge-missing').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const singer = allSingers.find(s => String(s.id) === badge.dataset.id);
      if (singer) showMissingInfoModal(singer);
    });
  });
}

function updatePositionFilter() {
  const section   = sectionFilter.value;
  const positions = appConfig.positions || [];
  let relevant;
  if (section === 'all')       relevant = positions.filter(p => p !== 'HOLD');
  else if (section === 'HOLD') relevant = ['HOLD'];
  else relevant = positions.filter(p => p.toLowerCase().startsWith(section.toLowerCase()));

  positionFilter.innerHTML = '<option value="all">All Positions</option>';
  relevant.forEach(p => {
    positionFilter.innerHTML += `<option value="${escHtml(p)}">${escHtml(p)}</option>`;
  });
}

// ---- Missing Info ----
function getMissingFields(singer) {
  const missing = [];
  if (!singer.cellPhone || !singer.cellPhone.trim()) missing.push('Cell Phone');
  if (!singer.address1  || !singer.address1.trim())  missing.push('Address');
  if (!singer.email     || !singer.email.trim())     missing.push('Email');
  if (!singer.height    || !singer.height.trim())    missing.push('Height');
  return missing;
}

function showMissingInfoModal(singer) {
  const missing = getMissingFields(singer);
  const name    = `${singer.firstname} ${singer.lastname}`.trim();

  // Remove any existing missing-info modal
  const existing = document.getElementById('missing-info-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'missing-info-modal';
  modal.className = 'missing-modal';
  modal.innerHTML = `
    <div class="missing-modal-box">
      <div class="missing-modal-title">Missing Info</div>
      <div class="missing-modal-name">${escHtml(name)}</div>
      <ul class="missing-modal-list">
        ${missing.map(f => `<li>${escHtml(f)}</li>`).join('')}
      </ul>
      <p class="missing-modal-hint">Tap anywhere to dismiss</p>
    </div>`;

  modal.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}

// ---- Action Flags ----
// Bit 0 (1): 2+ consecutive O's  → contact: still singing?
// Bit 1 (2): 3+ total O's        → contact: still singing?
// Bit 2 (4): 4+ total O's        → contact: get music back
function computeNeededActions(singer) {
  const dates = appConfig.dates || [];
  let flags = 0;
  let totalMisses = 0;
  let consec = 0;
  let maxConsec = 0;

  dates.forEach(d => {
    const v = (singer.attendance[d.col] || '').trim();
    if (v === 'O') {
      totalMisses++;
      consec++;
      if (consec > maxConsec) maxConsec = consec;
    } else {
      consec = 0;
    }
  });

  if (maxConsec >= 2) flags |= 1;
  if (totalMisses >= 3) flags |= 2;
  if (totalMisses >= 4) flags |= 4;
  return flags;
}

const ACTION_DEFS = [
  { bit: 1, required: 'Contact required — missed 2 in a row.',         done: 'Contacted — missed 2 in a row.' },
  { bit: 2, required: 'Contact required — 3 or more total misses.',    done: 'Contacted — 3 or more total misses.' },
  { bit: 4, required: 'Contact required — arrange return of music.',   done: 'Contacted — music return arranged.' },
];

function openActionModal(singer) {
  const existing = document.getElementById('action-modal');
  if (existing) existing.remove();

  const needed = computeNeededActions(singer);
  const taken  = Number(singer.actionTaken || 0);
  const name   = `${singer.firstname} ${singer.lastname}`.trim();

  // Only show actions that have been triggered
  const triggered = ACTION_DEFS.filter(a => needed & a.bit);

  const rows = triggered.map(a => {
    const isDone    = !!(taken & a.bit);
    const checked   = isDone ? 'checked' : '';
    const labelText = isDone ? a.done : a.required;
    const rowClass  = isDone ? 'action-checkbox-row done' : 'action-checkbox-row';
    return `<label class="${rowClass}">
      <input type="checkbox" class="action-cb" data-bit="${a.bit}" ${checked}>
      <div class="action-cb-text">
        <div class="action-cb-label">${escHtml(labelText)}</div>
      </div>
    </label>`;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'action-modal';
  modal.className = 'action-modal';
  modal.innerHTML = `
    <div class="action-modal-box">
      <div class="action-modal-header">
        <div class="action-modal-title">Actions — ${escHtml(name)}</div>
        <button class="note-modal-close" aria-label="Close">×</button>
      </div>
      <div class="action-modal-body">${rows}</div>
      <div class="note-modal-footer">
        <button class="note-modal-save" id="action-modal-save">Save</button>
      </div>
    </div>`;

  modal.querySelector('.note-modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // Swap label text when checkbox is toggled
  modal.querySelectorAll('.action-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const bit  = parseInt(cb.dataset.bit);
      const def  = ACTION_DEFS.find(a => a.bit === bit);
      const row  = cb.closest('.action-checkbox-row');
      const lbl  = row.querySelector('.action-cb-label');
      if (cb.checked) { row.classList.add('done');    lbl.textContent = def.done; }
      else            { row.classList.remove('done'); lbl.textContent = def.required; }
    });
  });

  modal.querySelector('#action-modal-save').addEventListener('click', () => saveActionTaken(singer, modal));

  document.body.appendChild(modal);
}

async function saveActionTaken(singer, modal) {
  const pin = sessionStorage.getItem(SESSION_PIN);
  let newTaken = Number(singer.actionTaken || 0);

  modal.querySelectorAll('.action-cb').forEach(cb => {
    const bit = parseInt(cb.dataset.bit);
    if (cb.checked) newTaken |= bit;
    else            newTaken &= ~bit;
  });

  const saveBtn = modal.querySelector('#action-modal-save');
  saveBtn.textContent = 'Saving…';
  saveBtn.disabled = true;

  try {
    const singerData = { ...singer, actionTaken: newTaken };
    const body = { action: 'updateSinger', pin, id: singer.id, singer: singerData };
    const res  = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const idx = allSingers.findIndex(s => s.id === singer.id);
    if (idx >= 0) allSingers[idx].actionTaken = newTaken;

    modal.remove();
    renderList();
  } catch(err) {
    alert('Save failed: ' + err.message);
    saveBtn.textContent = 'Save';
    saveBtn.disabled = false;
  }
}

// ---- Note Modal ----
function openNoteModal(singer) {
  const existing = document.getElementById('note-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'note-modal';
  modal.className = 'note-modal';
  modal.innerHTML = `
    <div class="note-modal-box">
      <div class="note-modal-header">
        <div class="note-modal-title">${escHtml(singer.firstname)} ${escHtml(singer.lastname)}</div>
        <button class="note-modal-close" aria-label="Close">×</button>
      </div>
      <textarea class="note-modal-textarea" id="note-modal-text" placeholder="No note yet…">${escHtml(singer.notes || '')}</textarea>
      <div class="note-modal-footer">
        <button class="note-modal-save" id="note-modal-save">Save</button>
      </div>
    </div>`;

  modal.querySelector('.note-modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#note-modal-save').addEventListener('click', () => saveNote(singer, modal));

  document.body.appendChild(modal);
  setTimeout(() => modal.querySelector('#note-modal-text').focus(), 50);
}

async function saveNote(singer, modal) {
  const pin  = sessionStorage.getItem(SESSION_PIN);
  const text = document.getElementById('note-modal-text').value.trim();
  const saveBtn = document.getElementById('note-modal-save');
  saveBtn.textContent = 'Saving…';
  saveBtn.disabled = true;

  try {
    const singerData = { ...singer, notes: text };
    const body = { action: 'updateSinger', pin, id: singer.id, singer: singerData };
    const res  = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const idx = allSingers.findIndex(s => s.id === singer.id);
    if (idx >= 0) allSingers[idx].notes = text;

    modal.remove();
    renderList();
  } catch(err) {
    alert('Save failed: ' + err.message);
    saveBtn.textContent = 'Save';
    saveBtn.disabled = false;
  }
}

// ---- Profile Screen ----
function openProfile(singer) {
  currentSinger = singer;
  const dates    = appConfig.dates || [];
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

  // Action buttons for cell
  if (singer.cellPhone) {
    const cell = encodeURIComponent(singer.cellPhone.trim());
    html += `<div class="contact-actions">
      <a class="contact-btn contact-btn-call" href="tel:${cell}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.69h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.08 6.08l1.28-1.28a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Call
      </a>
      <a class="contact-btn contact-btn-text" href="sms:${cell}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Text
      </a>
      ${singer.email ? `<a class="contact-btn contact-btn-email" href="mailto:${encodeURIComponent(singer.email.trim())}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        Email
      </a>` : ''}
    </div>`;
  }

  html += infoRow('Cell',  singer.cellPhone ? escHtml(singer.cellPhone) : '');
  html += infoRow('Home',  singer.homePhone ? phoneLink(singer.homePhone) : '');
  if (!singer.cellPhone) {
    html += infoRow('Email', singer.email ? `<a href="mailto:${escHtml(singer.email)}" style="color:var(--navy-light)">${escHtml(singer.email)}</a>` : '');
  } else if (singer.email) {
    html += infoRow('Email', `<a href="mailto:${escHtml(singer.email)}" style="color:var(--navy-light)">${escHtml(singer.email)}</a>`);
  } else {
    html += infoRow('Email', '');
  }
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
  html += infoRow('Notes',   escHtml(singer.notes));
  html += infoRow('Notes 2', escHtml(singer.notes2));
  html += `</div>`;

  // Attendance
  if (dates.length > 0) {
    const present = Object.values(singer.attendance).filter(v => v === 'X').length;
    const total   = dates.length;
    html += `<div class="info-section"><div class="info-section-title">Attendance — ${present}/${total} present</div>
      <div class="att-legend">
        <div class="att-legend-item"><div class="legend-dot legend-X"></div> Present</div>
        <div class="att-legend-item"><div class="legend-dot legend-O"></div> Absent</div>
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
  document.getElementById('edit-title').textContent = `Edit ${singer ? singer.lastname : ''}`;

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

async function saveSinger() {
  const pin = sessionStorage.getItem(SESSION_PIN);

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

  const seqNum = getSeqForPosition(singerData.position);
  singerData.seq = String(seqNum);

  const body = { action: 'updateSinger', pin, id: currentSinger.id, singer: singerData };

  const saveBtn = document.getElementById('btn-save');
  saveBtn.textContent = 'Saving…';
  saveBtn.disabled = true;

  try {
    const res  = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const idx = allSingers.findIndex(s => s.id === currentSinger.id);
    if (idx >= 0) {
      allSingers[idx] = { ...allSingers[idx], ...singerData };
      currentSinger   = allSingers[idx];
    }

    saveLocalData();
    renderList();
    document.getElementById('btn-back-edit').click();
    openProfile(currentSinger);

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
  const filteredSingers = getFilteredSingers()
    .filter(s => String(s.seq) !== '90' && s.position !== 'HOLD' && s.section !== 'HOLD');
  const groupOrder = ['Soprano - 1st','Soprano - 2nd','Alto - 1st','Alto - 2nd','Tenor','Bass'];
  const groups = {};
  let html = '';

  filteredSingers.forEach(s => {
    const seq = parseInt(s.seq) || 0;
    let key;
    if      (seq === 10) key = 'Soprano - 1st';
    else if (seq === 20) key = 'Soprano - 2nd';
    else if (seq === 30) key = 'Alto - 1st';
    else if (seq === 40) key = 'Alto - 2nd';
    else if (seq === 50) key = 'Tenor';
    else if (seq === 60) key = 'Bass';
    else                 key = s.position || s.section || 'Other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ai = groupOrder.indexOf(a);
    const bi = groupOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  sortedKeys.forEach(key => {
    const singers = groups[key].sort((a, b) => a.lastname.localeCompare(b.lastname));
    if (singers.length === 0) return;

    html += `<div class="att-section-group"><div class="att-section-header">${escHtml(key)}</div>`;
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

  if (!html) {
    html = `<div class="empty-state"><p>No singers found for the current filters.</p></div>`;
  }

  document.getElementById('att-singer-rows').innerHTML = html;
  document.querySelectorAll('.att-btn').forEach(btn => {
    btn.addEventListener('click', () => markAttendance(btn.dataset.id, btn.dataset.val));
  });
}

async function markAttendance(id, value) {
  const pin = sessionStorage.getItem(SESSION_PIN);

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

  const withPhone   = sorted.filter(s => s.cellPhone && s.cellPhone.trim());
  const validEmails = sorted.filter(s => isValidEmail(s.email)).map(s => s.email.trim());

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

  shareContent.querySelectorAll('[data-copy-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById(btn.dataset.copyId);
      if (el) copyText(el.textContent, btn);
    });
  });

  const mailBtn = document.getElementById('btn-open-mail');
  if (mailBtn) {
    mailBtn.addEventListener('click', () => {
      const mailto = decodeURIComponent(mailBtn.dataset.mailto);
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

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(success).catch(() => fallbackCopy(text, success));
    return;
  }
  fallbackCopy(text, success);
}

function fallbackCopy(text, success) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '-9999px';
  ta.setAttribute('readonly', '');
  document.body.appendChild(ta);

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
  if (pinBuffer === '0127') {
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
  closeMenu();
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
