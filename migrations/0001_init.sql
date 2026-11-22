-- Bills that roommates pay towards. `code` is what people type as the transfer reference.
CREATE TABLE bills (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  code        TEXT    NOT NULL,            -- stored upper-case, e.g. ELEC
  amount_due  INTEGER NOT NULL,            -- cents
  due_date    TEXT,                        -- YYYY-MM-DD, optional
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
-- A code can only belong to one active bill at a time.
CREATE UNIQUE INDEX bills_active_code ON bills(code) WHERE archived = 0;

-- Every transaction seen on the watched account. `id` is Up's transaction id,
-- so repeated webhooks / syncs can never double-count.
CREATE TABLE transactions (
  id                   TEXT    PRIMARY KEY,
  account_id           TEXT    NOT NULL,
  amount_cents         INTEGER NOT NULL,   -- positive = money in, negative = money out
  message              TEXT,               -- the transfer reference
  description          TEXT,
  raw_text             TEXT,
  transfer_account_id  TEXT,               -- set when it's a move between the owner's own Up accounts
  status               TEXT,               -- HELD / SETTLED
  bill_id              INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  manual               INTEGER NOT NULL DEFAULT 0, -- 1 = bill assigned by hand, sync won't override
  ignored              INTEGER NOT NULL DEFAULT 0, -- 1 = hidden from the unmatched list
  created_at           TEXT    NOT NULL,   -- from Up
  synced_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX transactions_bill ON transactions(bill_id);
CREATE INDEX transactions_created ON transactions(created_at);

-- Small key/value store: watched account id, webhook id + secret, last sync time.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
