-- Allocations: "this much money counts towards this bill".
-- A bank transaction can be split across several bills, and manual entries (cash etc)
-- are allocations with no transaction. Bill totals are calculated from this table only.
CREATE TABLE allocations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  txn_id        TEXT    REFERENCES transactions(id) ON DELETE CASCADE, -- NULL = manual entry
  bill_id       INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  kind          TEXT    NOT NULL CHECK (kind IN ('in', 'out')),   -- in = towards the bill, out = paying the bill
  source        TEXT    NOT NULL CHECK (source IN ('auto', 'manual')),
  payer         TEXT,    -- for manual entries (falls back to the transaction description)
  note          TEXT,
  created_at    TEXT    NOT NULL
);
CREATE INDEX allocations_bill ON allocations(bill_id);
CREATE INDEX allocations_txn ON allocations(txn_id);

-- Move existing single-bill assignments across.
INSERT INTO allocations (txn_id, bill_id, amount_cents, kind, source, created_at)
SELECT id, bill_id, ABS(amount_cents),
       CASE WHEN amount_cents > 0 THEN 'in' ELSE 'out' END,
       CASE WHEN manual = 1 THEN 'manual' ELSE 'auto' END,
       created_at
FROM transactions
WHERE bill_id IS NOT NULL AND amount_cents != 0;

-- transactions.bill_id is no longer used (kept because SQLite can't drop a foreign-key column).
UPDATE transactions SET bill_id = NULL;

-- Admin can mark a bill paid by hand (e.g. paid from another account).
ALTER TABLE bills ADD COLUMN marked_paid_at TEXT;
