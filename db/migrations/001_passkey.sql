CREATE SCHEMA IF NOT EXISTS a08;
REVOKE ALL ON SCHEMA a08 FROM PUBLIC;

CREATE TABLE a08.users (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, handle TEXT UNIQUE NOT NULL
);
CREATE TABLE a08.credentials (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES a08.users(id) ON DELETE CASCADE,
  public_key BYTEA NOT NULL, counter BIGINT NOT NULL CHECK (counter >= 0), transports JSONB NOT NULL,
  name TEXT NOT NULL, provider TEXT NOT NULL, created_at BIGINT NOT NULL,
  device_type TEXT NOT NULL, backed_up BOOLEAN NOT NULL
);
CREATE INDEX credentials_user ON a08.credentials(user_id);
CREATE TABLE a08.sessions (
  hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES a08.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL REFERENCES a08.credentials(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL
);
CREATE INDEX sessions_credential ON a08.sessions(credential_id);
CREATE INDEX sessions_expiry ON a08.sessions(expires_at);
CREATE TABLE a08.bootstrap_tokens (
  hash TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
  handle TEXT NOT NULL, expires_at BIGINT NOT NULL
);
CREATE TABLE a08.enrollments (
  hash TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
  handle TEXT NOT NULL, expires_at BIGINT NOT NULL
);
CREATE TABLE a08.challenges (
  id UUID PRIMARY KEY, value TEXT UNIQUE NOT NULL, purpose TEXT NOT NULL CHECK (purpose IN ('registration','authentication')),
  flow_hash TEXT UNIQUE NOT NULL, actor_hash TEXT, user_id TEXT, expires_at BIGINT NOT NULL
);
CREATE INDEX challenges_actor ON a08.challenges(actor_hash);
CREATE INDEX challenges_expiry ON a08.challenges(expires_at);
CREATE TABLE a08.private_items (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES a08.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL
);
CREATE INDEX items_owner ON a08.private_items(owner_id);
REVOKE ALL ON ALL TABLES IN SCHEMA a08 FROM PUBLIC;
