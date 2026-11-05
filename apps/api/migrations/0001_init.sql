-- GT: GET THIS — schema v1
-- Source of truth for accounts, chips, challenges and ratings.
-- Rules: the ledger is append-only (enforced by triggers); balances can never
-- go negative except the mint (enforced by CHECK); every state change on a
-- challenge takes the next sequence number (enforced by the primary key),
-- which makes concurrent actions on one challenge safe.

CREATE TABLE users (
  id               TEXT PRIMARY KEY,
  username         TEXT NOT NULL,
  username_key     TEXT NOT NULL UNIQUE,          -- lowercase, for case-insensitive uniqueness
  recovery_hash    TEXT NOT NULL,                 -- HMAC-SHA256 of the recovery key
  plan             TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'coder', 'host', 'studio')),
  plan_until       INTEGER,                       -- epoch ms; NULL = no expiry
  decoder_rating   INTEGER NOT NULL DEFAULT 1200,
  decoder_games    INTEGER NOT NULL DEFAULT 0,
  coder_rating     INTEGER NOT NULL DEFAULT 1200,
  coder_games      INTEGER NOT NULL DEFAULT 0,
  solved           INTEGER NOT NULL DEFAULT 0,
  failed           INTEGER NOT NULL DEFAULT 0,
  streak           INTEGER NOT NULL DEFAULT 0,
  best_streak      INTEGER NOT NULL DEFAULT 0,
  level_sum_solved INTEGER NOT NULL DEFAULT 0,
  chips_won        INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  last_active_at   INTEGER NOT NULL
);
CREATE INDEX users_decoder_rating ON users (decoder_games, decoder_rating);
CREATE INDEX users_coder_rating ON users (coder_games, coder_rating);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,                  -- SHA-256 of the bearer token
  user_id      TEXT NOT NULL REFERENCES users (id),
  label        TEXT,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- Double-entry chip accounts. SUM(balance) over all accounts is always 0.
CREATE TABLE accounts (
  id      TEXT PRIMARY KEY,                       -- user:<id> | escrow:<challengeId> | house | mint
  kind    TEXT NOT NULL CHECK (kind IN ('user', 'escrow', 'house', 'mint')),
  balance INTEGER NOT NULL DEFAULT 0,
  CHECK (kind = 'mint' OR balance >= 0)
);

CREATE TABLE ledger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_id        TEXT NOT NULL,
  account_id   TEXT NOT NULL REFERENCES accounts (id),
  delta        INTEGER NOT NULL,
  kind         TEXT NOT NULL,
  challenge_id TEXT,
  external_ref TEXT,                              -- reserved: on-chain transaction hash (Phase 3)
  created_at   INTEGER NOT NULL
);
CREATE INDEX ledger_account ON ledger (account_id, id);
CREATE INDEX ledger_tx ON ledger (tx_id);
CREATE TRIGGER ledger_append_only_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER ledger_append_only_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;

-- One row per day a user claimed the daily grant (prevents double claims).
CREATE TABLE daily_claims (
  user_id TEXT NOT NULL REFERENCES users (id),
  day     TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE challenges (
  id                   TEXT PRIMARY KEY,
  coder_id             TEXT NOT NULL REFERENCES users (id),
  recipient_id         TEXT REFERENCES users (id),          -- NULL = open lobby challenge
  decoder_id           TEXT REFERENCES users (id),
  level                INTEGER NOT NULL CHECK (level BETWEEN 1 AND 6),
  status               TEXT NOT NULL CHECK (status IN ('open', 'active', 'solved', 'failed', 'forfeited', 'expired', 'withdrawn')),
  pot                  INTEGER NOT NULL CHECK (pot >= 0),
  guess_cost           INTEGER NOT NULL CHECK (guess_cost >= 0),
  lives                INTEGER NOT NULL CHECK (lives > 0),
  secret               TEXT NOT NULL,                       -- AES-GCM: { message, key, voices }
  shape                TEXT NOT NULL,                       -- JSON letters-per-word
  letter_count         INTEGER NOT NULL,
  seq                  INTEGER NOT NULL DEFAULT 0,
  revealed             TEXT NOT NULL DEFAULT '',
  missed               TEXT NOT NULL DEFAULT '',
  wrong                INTEGER NOT NULL DEFAULT 0,
  actions              INTEGER NOT NULL DEFAULT 0,
  fees_paid            INTEGER NOT NULL DEFAULT 0,
  decoder_rating_delta INTEGER,
  coder_rating_delta   INTEGER,
  coder_seen           INTEGER NOT NULL DEFAULT 1,
  recipient_seen       INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL,
  accepted_at          INTEGER,
  last_action_at       INTEGER NOT NULL,
  resolved_at          INTEGER
);
CREATE INDEX challenges_status ON challenges (status, created_at);
CREATE INDEX challenges_coder ON challenges (coder_id, created_at);
CREATE INDEX challenges_recipient ON challenges (recipient_id, created_at);
CREATE INDEX challenges_decoder ON challenges (decoder_id, created_at);
CREATE INDEX challenges_resolved ON challenges (status, level, resolved_at);

-- Append-only event log per challenge. (challenge_id, seq) is the concurrency guard.
CREATE TABLE challenge_events (
  challenge_id TEXT NOT NULL REFERENCES challenges (id),
  seq          INTEGER NOT NULL,
  kind         TEXT NOT NULL,
  actor_id     TEXT,
  data         TEXT,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, seq)
);
CREATE TRIGGER events_append_only_update BEFORE UPDATE ON challenge_events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER events_append_only_delete BEFORE DELETE ON challenge_events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

INSERT INTO accounts (id, kind, balance) VALUES ('house', 'house', 0), ('mint', 'mint', 0);
