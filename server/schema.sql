CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE monitors (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  interval_seconds INT NOT NULL DEFAULT 300 CHECK (interval_seconds >= 60),
  timeout_ms INT NOT NULL DEFAULT 10000,
  expected_status INT NOT NULL DEFAULT 200,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'up', 'down')),
  consecutive_failures INT NOT NULL DEFAULT 0,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_monitors_user ON monitors (user_id);
CREATE INDEX idx_monitors_due ON monitors (next_check_at) WHERE NOT is_paused;

CREATE TABLE checks (
  id BIGSERIAL PRIMARY KEY,
  monitor_id INT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_code INT,
  response_time_ms INT,
  ok BOOLEAN NOT NULL,
  error TEXT
);

CREATE INDEX idx_checks_monitor_time ON checks (monitor_id, checked_at DESC);

CREATE TABLE incidents (
  id SERIAL PRIMARY KEY,
  monitor_id INT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  reason TEXT
);

CREATE INDEX idx_incidents_monitor ON incidents (monitor_id, started_at DESC);
ALTER TABLE monitors
  ADD COLUMN failure_threshold INT NOT NULL DEFAULT 3 CHECK (failure_threshold BETWEEN 1 AND 10),
  ADD COLUMN alerts_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX one_open_incident_per_monitor
  ON incidents (monitor_id) WHERE resolved_at IS NULL;
  CREATE TABLE status_pages (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE monitors
  ADD COLUMN show_on_status_page BOOLEAN NOT NULL DEFAULT false;