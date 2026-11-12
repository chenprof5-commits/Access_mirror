CREATE TABLE admins (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  disabled_at TEXT
);

CREATE TABLE admin_sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  admin_id INTEGER NOT NULL REFERENCES admins(id),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE clients (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  internal_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE invitations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  first_started_at TEXT,
  trial_expires_at TEXT,
  bound_session_hash TEXT,
  revoked_at TEXT
);

CREATE TABLE client_sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id INTEGER NOT NULL REFERENCES invitations(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE payments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id INTEGER NOT NULL REFERENCES invitations(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  amount INTEGER,
  currency TEXT,
  confirmed_at TEXT,
  confirmed_by INTEGER REFERENCES admins(id),
  note TEXT
);

CREATE TABLE activation_codes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id INTEGER NOT NULL REFERENCES invitations(id),
  code_hash TEXT NOT NULL UNIQUE,
  plan_duration_seconds INTEGER,
  is_permanent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  redeemed_at TEXT,
  redeemed_session_id INTEGER,
  revoked_at TEXT
);

CREATE TABLE licenses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id INTEGER NOT NULL REFERENCES invitations(id),
  activation_code_id INTEGER REFERENCES activation_codes(id),
  activated_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT
);

CREATE TABLE audit_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  timestamp_utc TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE rate_limits (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT
);

CREATE INDEX idx_inv_client ON invitations(client_id);
CREATE INDEX idx_sessions_inv ON client_sessions(invitation_id);
CREATE INDEX idx_licenses_inv ON licenses(invitation_id);
CREATE INDEX idx_audit_time ON audit_logs(timestamp_utc);
