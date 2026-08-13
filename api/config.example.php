<?php
// Copy this file to config.php, fill in the real values, and upload config.php via FTP/File Manager.
// config.php is gitignored — it should never be committed.

define('DB_HOST', 'localhost');
define('DB_NAME', 'PUT_YOUR_ACCOUNT_PREFIX_HERE_MyDataWorld');
define('DB_USER', 'PUT_YOUR_DB_USERNAME_HERE');
define('DB_PASS', 'PUT_YOUR_DB_PASSWORD_HERE');

// How long a login session stays valid.
define('SESSION_LIFETIME_DAYS', 30);

// The existing SOJO Data Google Apps Script Web App — same URL as
// API_URL in ../app.js used to point at directly.
define('APPS_SCRIPT_URL', 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE');

// The current value of Code.gs's ADMIN_PIN constant. This file is the ONLY
// place that needs to know it now — the browser never sees it again. Keep
// them in sync if you ever change one (or move away from the PIN check in
// Code.gs entirely).
define('ADMIN_PIN', 'PASTE_THE_CURRENT_ADMIN_PIN_HERE');
