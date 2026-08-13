-- SOJO Directory — schema for MyDataWorld
-- Run this in phpMyAdmin's SQL tab against the MyDataWorld database, AFTER
-- My Apps Hub's own api/schema.sql has been run at least once (this relies
-- on the shared apps/app_access tables already existing, including a
-- 'sojo-membership' row).
--
-- No new tables of its own -- this app doesn't store any data in
-- MyDataWorld. The roster itself stays on the existing Google Sheet via
-- Code.gs, unchanged; this only replaces the shared 4-digit PIN with a
-- real login + app_access check in front of it. Listed here only so the
-- shared platform tables exist if this were ever set up standalone.

CREATE TABLE IF NOT EXISTS users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  display_name   VARCHAR(100) NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token       CHAR(64) PRIMARY KEY,
  user_id     INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Grant yourself (and any section leaders) access once you've signed up
-- through My Apps Hub -- otherwise nobody can get in.
-- INSERT INTO app_access (user_id, app_id)
-- SELECT u.id, a.id FROM users u, apps a
-- WHERE u.username = 'you@example.com' AND a.app_key = 'sojo-membership';
