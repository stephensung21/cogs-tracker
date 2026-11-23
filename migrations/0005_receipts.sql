-- Optional payment screenshot for a bill (one per bill / period). Shrunk in the browser to ~80-150 KB.
CREATE TABLE receipts (
  bill_id    INTEGER PRIMARY KEY REFERENCES bills(id) ON DELETE CASCADE,
  mime       TEXT    NOT NULL,             -- image/webp, image/jpeg or image/png
  data       BLOB    NOT NULL,
  size       INTEGER NOT NULL,             -- bytes
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
