// ============================================
// SOJO App — Google Apps Script API
// ============================================

const SHEET_NAME = 'SOJO Data';
const ADMIN_PIN  = '1234'; // Change before distributing

// ---- Column definitions (0-based index) ----
const COL = {
  SEQ:          0,
  SECTION:      1,
  POSITION:     2,
  LASTNAME:     3,
  FIRSTNAME:    4,
  COMBINED:     5,
  ADDRESS1:     6,
  CITY:         7,
  STATE:        8,
  ZIP:          9,
  EMAIL:        10,
  HOMEPHONE:    11,
  CELLPHONE:    12,
  NOTES2:       13,
  HEIGHT:       14,
  PIC:          15,
  VERIFIED:     16,
  NEW2026:      17,
  IPHONE:       18,
  FOLDER:       19,
  NOTES:        20,
  FIRST_DATE:   21  // Date columns start here (0-based = column 22 in sheets)
  // Last two columns after dates are iPhone2 and Missing Info — not dates
};

// SEQ values by position group
const SEQ_MAP = {
  10: 'Soprano - 1st',
  20: 'Soprano - 2nd',
  30: 'Alto - 1st',
  40: 'Alto - 2nd',
  50: 'Tenor',
  60: 'Bass'
};

// ---- Router ----
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'getConfig')   return getConfig();
    if (action === 'getSingers')  return getSingers();
    if (action === 'getSinger')   return getSinger(e.parameter.seq, e.parameter.lastname);
    return respond({ error: 'Unknown action: ' + action });
  } catch (err) {
    return respond({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.pin !== ADMIN_PIN) return respond({ error: 'Invalid PIN' });

    const action = body.action;
    if (action === 'updateSinger')     return updateSinger(body);
    if (action === 'addSinger')        return addSinger(body);
    if (action === 'updateAttendance') return updateAttendance(body);
    return respond({ error: 'Unknown action: ' + action });
  } catch (err) {
    return respond({ error: err.message });
  }
}

// ---- GET: Config ----
function getConfig() {
  const sheet   = getSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const dates   = [];

  for (let i = COL.FIRST_DATE; i < headers.length; i++) {
    const h = headers[i];
    if (h && isDateHeader(h)) {
      dates.push({ col: i, label: formatDateLabel(h) });
    }
  }

  return respond({
    sections:  ['Soprano', 'Alto', 'Tenor', 'Bass'],
    positions: [
      'Soprano - 1st', 'Soprano - 2nd',
      'Alto - 1st',    'Alto - 2nd',
      'Tenor - 1st',   'Tenor - 2nd',
      'Baritone',      'Bass'
    ],
    seqMap: SEQ_MAP,
    attendanceCodes: [
      { code: 'X', label: 'Present',      color: 'green'  },
      { code: 'O', label: 'Notified Out', color: 'yellow' },
      { code: '',  label: 'Unknown',      color: 'gray'   }
    ],
    dates:        dates,
    new2026Label: headers[COL.NEW2026] || 'New 2026'
  });
}

// ---- GET: All Singers ----
function getSingers() {
  const sheet   = getSheet();
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const singers = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[COL.LASTNAME] && !row[COL.FIRSTNAME]) continue;
    singers.push(rowToSinger(row, headers));
  }

  return respond({ singers });
}

// ---- GET: Single Singer ----
function getSinger(seq, lastname) {
  const sheet   = getSheet();
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const seqMatch      = seq      && String(row[COL.SEQ])      === String(seq);
    const lastnameMatch = lastname && String(row[COL.LASTNAME]).toLowerCase() === lastname.toLowerCase();
    if (seqMatch && lastnameMatch) {
      return respond({ singer: rowToSinger(row, headers) });
    }
  }
  return respond({ error: 'Singer not found' });
}

// ---- POST: Update Singer ----
function updateSinger(body) {
  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();
  const s     = body.singer;
  const seq   = String(body.seq);
  const ln    = String(body.lastname).toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[COL.SEQ]) === seq &&
        String(row[COL.LASTNAME]).toLowerCase() === ln) {
      const r = i + 1;
      sheet.getRange(r, COL.SECTION   + 1).setValue(s.section   || '');
      sheet.getRange(r, COL.POSITION  + 1).setValue(s.position  || '');
      sheet.getRange(r, COL.LASTNAME  + 1).setValue(s.lastname  || '');
      sheet.getRange(r, COL.FIRSTNAME + 1).setValue(s.firstname || '');
      sheet.getRange(r, COL.COMBINED  + 1).setValue(
        (s.lastname || '') + (s.firstname ? ', ' + s.firstname : '')
      );
      sheet.getRange(r, COL.ADDRESS1  + 1).setValue(s.address1  || '');
      sheet.getRange(r, COL.CITY      + 1).setValue(s.city      || '');
      sheet.getRange(r, COL.STATE     + 1).setValue(s.state     || '');
      sheet.getRange(r, COL.ZIP       + 1).setValue(s.zip       || '');
      sheet.getRange(r, COL.EMAIL     + 1).setValue(s.email     || '');
      sheet.getRange(r, COL.HOMEPHONE + 1).setValue(s.homePhone || '');
      sheet.getRange(r, COL.CELLPHONE + 1).setValue(s.cellPhone || '');
      sheet.getRange(r, COL.NOTES2    + 1).setValue(s.notes2    || '');
      sheet.getRange(r, COL.HEIGHT    + 1).setValue(s.height    || '');
      sheet.getRange(r, COL.PIC       + 1).setValue(s.pic       || '');
      sheet.getRange(r, COL.VERIFIED  + 1).setValue(s.verified  || '');
      sheet.getRange(r, COL.NEW2026   + 1).setValue(s.new2026   || '');
      sheet.getRange(r, COL.IPHONE    + 1).setValue(s.iphone    || '');
      sheet.getRange(r, COL.FOLDER    + 1).setValue(s.folder    || '');
      sheet.getRange(r, COL.NOTES     + 1).setValue(s.notes     || '');
      return respond({ success: true });
    }
  }
  return respond({ error: 'Singer not found' });
}

// ---- POST: Add Singer ----
function addSinger(body) {
  const sheet = getSheet();
  const s     = body.singer;

  const newRow = new Array(COL.FIRST_DATE + 2).fill('');
  newRow[COL.SEQ]       = body.seq      || '';
  newRow[COL.SECTION]   = s.section     || '';
  newRow[COL.POSITION]  = s.position    || '';
  newRow[COL.LASTNAME]  = s.lastname    || '';
  newRow[COL.FIRSTNAME] = s.firstname   || '';
  newRow[COL.COMBINED]  = (s.lastname || '') + (s.firstname ? ', ' + s.firstname : '');
  newRow[COL.ADDRESS1]  = s.address1    || '';
  newRow[COL.CITY]      = s.city        || '';
  newRow[COL.STATE]     = s.state       || '';
  newRow[COL.ZIP]       = s.zip         || '';
  newRow[COL.EMAIL]     = s.email       || '';
  newRow[COL.HOMEPHONE] = s.homePhone   || '';
  newRow[COL.CELLPHONE] = s.cellPhone   || '';
  newRow[COL.NOTES2]    = s.notes2      || '';
  newRow[COL.HEIGHT]    = s.height      || '';
  newRow[COL.PIC]       = s.pic         || '';
  newRow[COL.VERIFIED]  = s.verified    || '';
  newRow[COL.NEW2026]   = s.new2026     || '';
  newRow[COL.IPHONE]    = s.iphone      || '';
  newRow[COL.FOLDER]    = s.folder      || '';
  newRow[COL.NOTES]     = s.notes       || '';

  sheet.appendRow(newRow);
  return respond({ success: true });
}

// ---- POST: Update Attendance ----
function updateAttendance(body) {
  const sheet  = getSheet();
  const data   = sheet.getDataRange().getValues();
  const seq    = String(body.seq);
  const ln     = String(body.lastname).toLowerCase();
  const colIdx = parseInt(body.col);
  const value  = body.value; // 'X', 'O', or ''

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[COL.SEQ]) === seq &&
        String(row[COL.LASTNAME]).toLowerCase() === ln) {
      sheet.getRange(i + 1, colIdx + 1).setValue(value);
      return respond({ success: true });
    }
  }
  return respond({ error: 'Singer not found' });
}

// ---- Helpers ----
function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function rowToSinger(row, headers) {
  const singer = {
    seq:       String(row[COL.SEQ] || ''),
    section:   String(row[COL.SECTION]   || ''),
    position:  String(row[COL.POSITION]  || ''),
    lastname:  String(row[COL.LASTNAME]  || ''),
    firstname: String(row[COL.FIRSTNAME] || ''),
    combined:  String(row[COL.COMBINED]  || ''),
    address1:  String(row[COL.ADDRESS1]  || ''),
    city:      String(row[COL.CITY]      || ''),
    state:     String(row[COL.STATE]     || ''),
    zip:       String(row[COL.ZIP]       || ''),
    email:     String(row[COL.EMAIL]     || ''),
    homePhone: String(row[COL.HOMEPHONE] || ''),
    cellPhone: String(row[COL.CELLPHONE] || ''),
    notes2:    String(row[COL.NOTES2]    || ''),
    height:    String(row[COL.HEIGHT]    || ''),
    pic:       String(row[COL.PIC]       || ''),
    verified:  String(row[COL.VERIFIED]  || ''),
    new2026:   String(row[COL.NEW2026]   || ''),
    iphone:    String(row[COL.IPHONE]    || ''),
    folder:    String(row[COL.FOLDER]    || ''),
    notes:     String(row[COL.NOTES]     || ''),
    attendance: {}
  };

  // Dynamic date columns only
  for (let i = COL.FIRST_DATE; i < headers.length; i++) {
    const h = headers[i];
    if (h && isDateHeader(h)) {
      singer.attendance[i] = String(row[i] !== undefined ? row[i] : '').trim();
    }
  }

  return singer;
}

function isDateHeader(val) {
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(val).trim()) ||
         val instanceof Date;
}

function formatDateLabel(val) {
  if (val instanceof Date) {
    return (val.getMonth() + 1) + '/' + val.getDate() + '/' + val.getFullYear();
  }
  return String(val).trim();
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
