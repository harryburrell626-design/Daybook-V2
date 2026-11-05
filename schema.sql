-- Daybook schema. Applied by scripts/setup-db.js as the owner role (daybook_owner).
-- Three database roles:
--   daybook_owner : owns the tables, runs migrations. The web app never connects as this role.
--   daybook_auth  : can only touch users / sessions / password_resets (login, signup, reset).
--   daybook_app   : serves all user data. NOT a superuser, does NOT bypass RLS, and every
--                   table is FORCE ROW LEVEL SECURITY, so rows are only visible when the
--                   request transaction has set app.user_id to the signed-in user's id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────── helper: current user for RLS ─────────────
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ───────────── auth tables (daybook_auth only) ─────────────
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

-- ───────────── user data tables (RLS) ─────────────
CREATE TABLE IF NOT EXISTS settings (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name     text NOT NULL DEFAULT '',
  currency         text NOT NULL DEFAULT '£',
  starting_balance numeric(14,2) NOT NULL DEFAULT 0,
  has_demo         boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        date NOT NULL,
  type        text NOT NULL CHECK (type IN ('income','expense')),
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  category    text NOT NULL,
  description text NOT NULL DEFAULT '',
  notes       text NOT NULL DEFAULT '',
  demo        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tx_user_date ON transactions(user_id, date DESC);

CREATE TABLE IF NOT EXISTS pots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  target          numeric(14,2) NOT NULL DEFAULT 0 CHECK (target >= 0),
  opening_balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  demo            boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

-- Deposits (+) and withdrawals (-). Pot balance = opening_balance + sum(amount).
-- A deposit moves money out of the available balance; a withdrawal moves it back.
CREATE TABLE IF NOT EXISTS pot_moves (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pot_id  uuid NOT NULL,
  date    date NOT NULL,
  amount  numeric(14,2) NOT NULL CHECK (amount <> 0),
  note    text NOT NULL DEFAULT '',
  demo    boolean NOT NULL DEFAULT false,
  FOREIGN KEY (user_id, pot_id) REFERENCES pots(user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS holdings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side       text NOT NULL CHECK (side IN ('asset','debt')),
  kind       text NOT NULL,
  name       text NOT NULL,
  value      numeric(14,2) NOT NULL CHECK (value >= 0),
  notes      text NOT NULL DEFAULT '',
  demo       boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budgets (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount   numeric(14,2) NOT NULL CHECK (amount > 0),
  demo     boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, category)
);

CREATE TABLE IF NOT EXISTS photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime       text NOT NULL,
  data       bytea NOT NULL,
  demo       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE TABLE IF NOT EXISTS daily_logs (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         date NOT NULL,
  reflection   text  NOT NULL DEFAULT '',
  prompts      jsonb NOT NULL DEFAULT '{}',   -- {best, did, interesting, remember, differently}
  ratings      jsonb NOT NULL DEFAULT '{}',   -- {happiness, productivity, satisfaction, energy, social, stress, enjoyment}  1..10
  sleep        jsonb NOT NULL DEFAULT '{}',   -- {bed:'23:10', wake:'07:00', minutes, quality:1..5, notes}
  screen       jsonb NOT NULL DEFAULT '{}',   -- {total, phone, computer (minutes), comments}
  activities   jsonb NOT NULL DEFAULT '[]',   -- [{type, label, desc, duration, distance}]
  culture      jsonb NOT NULL DEFAULT '{}',   -- {song, artist, film, show, book, quote, moment}
  photo_id     uuid,
  completed    boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  demo         boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id, photo_id) REFERENCES photos(user_id, id) ON DELETE SET NULL (photo_id)
);

-- Recurring rules: fixed income (salary, pension...) and regular bills (rent, car insurance...).
-- The server posts a real transaction each time one falls due; `generated` counts how many have been posted.
CREATE TABLE IF NOT EXISTS recurring (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('income','expense')),
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  category    text NOT NULL,
  description text NOT NULL DEFAULT '',
  notes       text NOT NULL DEFAULT '',
  frequency   text NOT NULL CHECK (frequency IN ('weekly','fortnightly','four_weekly','monthly','quarterly','yearly')),
  start_date  date NOT NULL,
  end_date    date,
  generated   integer NOT NULL DEFAULT 0 CHECK (generated >= 0),
  active      boolean NOT NULL DEFAULT true,
  demo        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tx_recurring_fk') THEN
    ALTER TABLE transactions ADD CONSTRAINT tx_recurring_fk FOREIGN KEY (user_id, recurring_id) REFERENCES recurring(user_id, id) ON DELETE SET NULL (recurring_id);
  END IF;
END $$;

-- ───────────── row level security ─────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['settings','transactions','recurring','pots','pot_moves','holdings','budgets','photos','daily_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS own_rows ON %I', t);
    EXECUTE format('CREATE POLICY own_rows ON %I FOR ALL TO daybook_app USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id())', t);
  END LOOP;
END $$;

-- ───────────── privileges ─────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO daybook_app, daybook_auth;
GRANT EXECUTE ON FUNCTION app_user_id() TO daybook_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, password_resets TO daybook_auth;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  settings, transactions, recurring, pots, pot_moves, holdings, budgets, photos, daily_logs
TO daybook_app;
-- daybook_app has no access whatsoever to users / sessions / password_resets.

-- ───────────── defence in depth ─────────────
-- Auth tables also get row security, with a policy for the auth role only.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','sessions','password_resets'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_only ON %I', t);
    EXECUTE format('CREATE POLICY auth_only ON %I FOR ALL TO daybook_auth USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Hosts like Supabase expose the public schema through a REST API using the roles anon / authenticated.
-- Those roles must never be able to touch Daybook's tables.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
    END IF;
  END LOOP;
END $$;
