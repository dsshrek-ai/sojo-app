<?php
require_once __DIR__ . '/config.php';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

// Never let a raw PHP error/notice leak through as HTML — every response
// this API sends must be JSON.
ini_set('display_errors', '0');
set_exception_handler(function ($e) {
  http_response_code(500);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
  exit;
});

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

function respond($data, int $status = 200): void {
  http_response_code($status);
  echo json_encode($data);
  exit;
}

function fail(string $message, int $status = 400): void {
  respond(['error' => $message], $status);
}

function db(): mysqli {
  static $conn = null;
  if ($conn === null) {
    try {
      $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
      $conn->set_charset('utf8mb4');
    } catch (mysqli_sql_exception $e) {
      fail('Database connection failed', 500);
    }
  }
  return $conn;
}

function jsonBody(): array {
  $raw = file_get_contents('php://input');
  $decoded = json_decode($raw, true);
  return is_array($decoded) ? $decoded : [];
}

// ---- Auth ----

function requireUser(): array {
  $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
    fail('Missing or invalid Authorization header', 401);
  }
  $token = $m[1];

  $stmt = db()->prepare(
    'SELECT u.id, u.username, u.display_name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > NOW()'
  );
  $stmt->bind_param('s', $token);
  $stmt->execute();
  $result = $stmt->get_result()->fetch_assoc();
  $stmt->close();

  if (!$result) {
    fail('Session expired or invalid — please log in again', 401);
  }
  return $result;
}

function requireSojoAccess(array $user): void {
  $stmt = db()->prepare(
    'SELECT 1 FROM app_access aa JOIN apps a ON a.id = aa.app_id
     WHERE aa.user_id = ? AND a.app_key = ?'
  );
  $appKey = 'sojo-membership';
  $stmt->bind_param('is', $user['id'], $appKey);
  $stmt->execute();
  $ok = $stmt->get_result()->fetch_row();
  $stmt->close();
  if (!$ok) {
    fail('Not authorized for the SOJO Directory', 403);
  }
}

// ---- Forwarding to the existing Apps Script backend ----

function forwardGet(string $action, array $params = []): array {
  $query = http_build_query(array_merge(['action' => $action], $params));
  $ch = curl_init(APPS_SCRIPT_URL . '?' . $query);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 30,
  ]);
  $raw = curl_exec($ch);
  if ($raw === false) {
    $err = curl_error($ch);
    curl_close($ch);
    fail('Could not reach the SOJO data backend: ' . $err, 502);
  }
  curl_close($ch);
  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) {
    fail('Unexpected response from the SOJO data backend', 502);
  }
  return $decoded;
}

// $payload must NOT include 'pin' — it's always injected here, never taken
// from the client, since the browser no longer knows it.
function forwardPost(array $payload): array {
  $payload['pin'] = ADMIN_PIN;
  $ch = curl_init(APPS_SCRIPT_URL);
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_HTTPHEADER => ['Content-Type: text/plain'],
    CURLOPT_RETURNTRANSFER => true,
    // Apps Script Web Apps answer a POST by running doPost() immediately,
    // then 302-redirecting to a googleusercontent.com URL that just serves
    // the already-computed response body -- that follow-up fetch is always
    // meant to be a GET, not a replayed POST. Forcing POST through it
    // (CURLOPT_POSTREDIR) hits a page that isn't JSON, which is exactly
    // what "Unexpected response" was catching. Default curl behavior
    // (downgrade to GET on redirect) is what Apps Script actually expects.
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 30,
  ]);
  $raw = curl_exec($ch);
  if ($raw === false) {
    $err = curl_error($ch);
    curl_close($ch);
    fail('Could not reach the SOJO data backend: ' . $err, 502);
  }
  curl_close($ch);
  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) {
    fail('Unexpected response from the SOJO data backend', 502);
  }
  return $decoded;
}

// ---- Router ----
// Every action requires login + access — unlike some other apps here, the
// whole directory (not just editing) used to sit behind the shared PIN, so
// SSO replaces the gate for reads and writes alike.

$method = $_SERVER['REQUEST_METHOD'];
$body = $method === 'POST' ? jsonBody() : [];
$action = $method === 'GET' ? ($_GET['action'] ?? '') : ($body['action'] ?? '');

switch ($action) {

  case 'login': {
    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if ($username === '' || $password === '') {
      fail('Username and password are required');
    }
    $stmt = db()->prepare('SELECT id, password_hash, display_name FROM users WHERE username = ?');
    $stmt->bind_param('s', $username);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$user || !password_verify($password, $user['password_hash'])) {
      fail('Invalid username or password', 401);
    }
    $token = bin2hex(random_bytes(32));
    $days = SESSION_LIFETIME_DAYS;
    $ins = db()->prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))');
    $ins->bind_param('sii', $token, $user['id'], $days);
    $ins->execute();
    $ins->close();
    respond(['token' => $token, 'displayName' => $user['display_name']]);
  }

  case 'logout': {
    $token = (string)($body['token'] ?? '');
    if ($token !== '') {
      $stmt = db()->prepare('DELETE FROM sessions WHERE token = ?');
      $stmt->bind_param('s', $token);
      $stmt->execute();
      $stmt->close();
    }
    respond(['ok' => true]);
  }

  case 'checkAccess': {
    $user = requireUser();
    requireSojoAccess($user);
    respond(['ok' => true, 'displayName' => $user['display_name']]);
  }

  case 'getConfig':
  case 'getSingers': {
    $user = requireUser();
    requireSojoAccess($user);
    respond(forwardGet($action));
  }

  case 'getSinger': {
    $user = requireUser();
    requireSojoAccess($user);
    respond(forwardGet($action, ['id' => (string)($_GET['id'] ?? '')]));
  }

  case 'updateSinger':
  case 'addSinger':
  case 'updateAttendance': {
    $user = requireUser();
    requireSojoAccess($user);
    $forward = $body;
    unset($forward['pin']);
    respond(forwardPost($forward));
  }

  default:
    respond(['error' => 'Unknown action: ' . $action], 404);
}
