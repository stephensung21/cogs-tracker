import { matchBill, type BillCode } from "./matching";
import type { UpTransaction } from "./up";

export interface Env {
  DB: D1Database;
  UP_TOKEN: string;
  ADMIN_PASSWORD: string;
  VIEWER_PASSWORD?: string;
  SESSION_SECRET: string;
  UP_API_BASE?: string;
}

// ---------- settings ----------

export type SettingKey =
  | "account_id"
  | "account_name"
  | "webhook_id"
  | "webhook_secret"
  | "last_sync"
  | "last_webhook"
  | "last_ping";

export async function getSetting(db: D1Database, key: SettingKey): Promise<string | null> {
  const r = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return r?.value ?? null;
}

export async function setSetting(db: D1Database, key: SettingKey, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}

export async function deleteSetting(db: D1Database, ...keys: SettingKey[]): Promise<void> {
  for (const k of keys) await db.prepare("DELETE FROM settings WHERE key = ?").bind(k).run();
}

// ---------- bills ----------

export interface Bill {
  id: number;
  name: string;
  code: string;
  amount_due: number;
  due_date: string | null;
  icon: string | null;
  archived: number;
  created_at: string;
}

export interface BillWithTotals extends Bill {
  marked_paid_at: string | null;
  collected: number;
  paid_out: number;
  paid_at: string | null;
  payments: number;
  payers: string | null; // comma-separated names of people who paid in
}

const BILL_TOTALS_SQL = `
  SELECT b.*,
    COALESCE(SUM(CASE WHEN a.kind = 'in'  THEN a.amount_cents END), 0) AS collected,
    COALESCE(SUM(CASE WHEN a.kind = 'out' THEN a.amount_cents END), 0) AS paid_out,
    MAX(CASE WHEN a.kind = 'out' THEN a.created_at END)                AS paid_at,
    COUNT(CASE WHEN a.kind = 'in' THEN 1 END)                          AS payments,
    GROUP_CONCAT(DISTINCT CASE WHEN a.kind = 'in'
      THEN REPLACE(COALESCE(a.payer, t.description), ',', ' ') END)    AS payers
  FROM bills b
  LEFT JOIN allocations a ON a.bill_id = b.id
  LEFT JOIN transactions t ON t.id = a.txn_id
`;

export async function listBills(db: D1Database, archived = false): Promise<BillWithTotals[]> {
  const r = await db
    .prepare(
      `${BILL_TOTALS_SQL} WHERE b.archived = ? GROUP BY b.id
       ORDER BY b.due_date IS NULL, b.due_date, b.id`,
    )
    .bind(archived ? 1 : 0)
    .all<BillWithTotals>();
  return r.results;
}

export async function getBill(db: D1Database, id: number): Promise<BillWithTotals | null> {
  return db.prepare(`${BILL_TOTALS_SQL} WHERE b.id = ? GROUP BY b.id`).bind(id).first<BillWithTotals>();
}

/** Every bill (active first, then archived) for assignment dropdowns. */
export async function listAllBillsBrief(db: D1Database): Promise<Bill[]> {
  const r = await db.prepare("SELECT * FROM bills ORDER BY archived, due_date IS NULL, due_date DESC, id DESC").all<Bill>();
  return r.results;
}

export async function setMarkedPaid(db: D1Database, id: number, paid: boolean): Promise<void> {
  await db
    .prepare("UPDATE bills SET marked_paid_at = ? WHERE id = ?")
    .bind(paid ? new Date().toISOString() : null, id)
    .run();
}

export async function activeBillCodes(db: D1Database): Promise<BillCode[]> {
  const r = await db.prepare("SELECT id, code FROM bills WHERE archived = 0").all<BillCode>();
  return r.results;
}

export async function codeInUse(db: D1Database, code: string, exceptId?: number): Promise<boolean> {
  const r = await db
    .prepare("SELECT id FROM bills WHERE code = ? AND archived = 0 AND id != ?")
    .bind(code, exceptId ?? -1)
    .first();
  return r !== null;
}

export interface BillFields {
  name: string;
  code: string;
  amount_due: number;
  due_date: string | null;
  icon: string | null;
}

export async function createBill(
  db: D1Database,
  b: BillFields,
): Promise<number> {
  const r = await db
    .prepare("INSERT INTO bills (name, code, amount_due, due_date, icon) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(b.name, b.code, b.amount_due, b.due_date, b.icon)
    .first<{ id: number }>();
  return r!.id;
}

export async function updateBill(
  db: D1Database,
  id: number,
  b: BillFields,
): Promise<void> {
  await db
    .prepare("UPDATE bills SET name = ?, code = ?, amount_due = ?, due_date = ?, icon = ? WHERE id = ?")
    .bind(b.name, b.code, b.amount_due, b.due_date, b.icon, id)
    .run();
}

export async function setBillArchived(db: D1Database, id: number, archived: boolean): Promise<void> {
  await db.prepare("UPDATE bills SET archived = ? WHERE id = ?").bind(archived ? 1 : 0, id).run();
}

export async function deleteBill(db: D1Database, id: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM allocations WHERE bill_id = ?").bind(id),
    // Payments with nothing left allocated go back to automatic matching.
    db.prepare("UPDATE transactions SET manual = 0 WHERE manual = 1 AND id NOT IN (SELECT txn_id FROM allocations WHERE txn_id IS NOT NULL)"),
    db.prepare("DELETE FROM bills WHERE id = ?").bind(id),
  ]);
}

// ---------- transactions & allocations ----------

export interface Txn {
  id: string;
  account_id: string;
  amount_cents: number;
  message: string | null;
  description: string | null;
  raw_text: string | null;
  transfer_account_id: string | null;
  status: string | null;
  manual: number;
  ignored: number;
  created_at: string;
}

export type Kind = "in" | "out";

export interface Allocation {
  id: number;
  txn_id: string | null;
  bill_id: number;
  amount_cents: number;
  kind: Kind;
  source: "auto" | "manual";
  payer: string | null;
  note: string | null;
  created_at: string;
}

export interface AllocationWithBill extends Allocation {
  bill_name: string;
  bill_code: string;
}

export interface TxnWithAllocations extends Txn {
  allocations: AllocationWithBill[];
  allocated: number; // cents allocated so far
}

/** A line on a bill's page: an allocation plus the bank transaction it came from (if any). */
export interface BillEntry extends Allocation {
  txn_amount: number | null;
  description: string | null;
  message: string | null;
}

export function kindForAmount(cents: number): Kind {
  return cents >= 0 ? "in" : "out";
}

/**
 * Insert or refresh transactions from Up. Safe to repeat for the same id.
 * New transactions are matched to a bill automatically. Once a transaction has allocations,
 * a later sync only refreshes the amount on an automatic one; it never moves it to another bill.
 * Transactions an admin has edited by hand (manual = 1) or ignored are left alone.
 */
export async function upsertTransactions(db: D1Database, txns: UpTransaction[]): Promise<void> {
  if (txns.length === 0) return;
  const bills = await activeBillCodes(db);
  const stmts: D1PreparedStatement[] = [];
  for (const t of txns) {
    const a = t.attributes;
    const cents = a.amount.valueInBaseUnits;
    stmts.push(
      db
        .prepare(
          `INSERT INTO transactions
             (id, account_id, amount_cents, message, description, raw_text, transfer_account_id, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             amount_cents = excluded.amount_cents,
             message      = excluded.message,
             description  = excluded.description,
             raw_text     = excluded.raw_text,
             status       = excluded.status,
             synced_at    = datetime('now')`,
        )
        .bind(
          t.id,
          t.relationships.account.data.id,
          cents,
          a.message,
          a.description,
          a.rawText,
          t.relationships.transferAccount?.data?.id ?? null,
          a.status,
          a.createdAt,
        ),
    );
    if (cents === 0) continue;
    stmts.push(
      db
        .prepare(
          `UPDATE allocations SET amount_cents = ?, kind = ?
           WHERE txn_id = ? AND source = 'auto'
             AND (SELECT manual FROM transactions WHERE id = ?) = 0`,
        )
        .bind(Math.abs(cents), kindForAmount(cents), t.id, t.id),
    );
    const billId = matchBill({ message: a.message, rawText: a.rawText, description: a.description }, bills);
    if (billId !== null) stmts.push(autoAllocateStmt(db, t.id, billId, cents, a.createdAt));
  }
  for (let i = 0; i < stmts.length; i += 60) await db.batch(stmts.slice(i, i + 60));
}

function autoAllocateStmt(db: D1Database, txnId: string, billId: number, cents: number, createdAt: string) {
  return db
    .prepare(
      `INSERT INTO allocations (txn_id, bill_id, amount_cents, kind, source, created_at)
       SELECT ?, ?, ?, ?, 'auto', ?
       WHERE NOT EXISTS (SELECT 1 FROM allocations WHERE txn_id = ?)
         AND EXISTS (SELECT 1 FROM transactions WHERE id = ? AND manual = 0 AND ignored = 0)`,
    )
    .bind(txnId, billId, Math.abs(cents), kindForAmount(cents), createdAt, txnId, txnId);
}

export async function deleteTransaction(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM allocations WHERE txn_id = ?").bind(id),
    db.prepare("DELETE FROM transactions WHERE id = ?").bind(id),
  ]);
}

/** After a bill is added or its code changes, try to match payments that arrived before it existed. */
export async function rematchUnassigned(db: D1Database): Promise<number> {
  const bills = await activeBillCodes(db);
  if (bills.length === 0) return 0;
  const r = await db
    .prepare(
      `SELECT * FROM transactions t
       WHERE manual = 0 AND ignored = 0 AND amount_cents != 0
         AND NOT EXISTS (SELECT 1 FROM allocations a WHERE a.txn_id = t.id)`,
    )
    .all<Txn>();
  const stmts: D1PreparedStatement[] = [];
  for (const t of r.results) {
    const id = matchBill({ message: t.message, rawText: t.raw_text, description: t.description }, bills);
    if (id !== null) stmts.push(autoAllocateStmt(db, t.id, id, t.amount_cents, t.created_at));
  }
  for (let i = 0; i < stmts.length; i += 60) await db.batch(stmts.slice(i, i + 60));
  return stmts.length;
}

export async function getTransaction(db: D1Database, id: string): Promise<TxnWithAllocations | null> {
  const t = await db.prepare("SELECT * FROM transactions WHERE id = ?").bind(id).first<Txn>();
  if (!t) return null;
  const [withAllocs] = await attachAllocations(db, [t]);
  return withAllocs;
}

export interface Split {
  bill_id: number;
  amount_cents: number;
  kind: Kind;
}

/** Admin override: replace a transaction's allocations with exactly these. Empty = no bill. */
export async function setAllocations(db: D1Database, txn: Txn, splits: Split[], note: string | null): Promise<void> {
  const stmts = [
    db.prepare("DELETE FROM allocations WHERE txn_id = ?").bind(txn.id),
    db.prepare("UPDATE transactions SET manual = 1, ignored = 0 WHERE id = ?").bind(txn.id),
  ];
  for (const s of splits) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO allocations (txn_id, bill_id, amount_cents, kind, source, note, created_at)
           VALUES (?, ?, ?, ?, 'manual', ?, ?)`,
        )
        .bind(txn.id, s.bill_id, s.amount_cents, s.kind, note, txn.created_at),
    );
  }
  await db.batch(stmts);
}

/** Undo any override: drop allocations, un-ignore, and let automatic matching try again. */
export async function resetToAutomatic(db: D1Database, txnId: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM allocations WHERE txn_id = ?").bind(txnId),
    db.prepare("UPDATE transactions SET manual = 0, ignored = 0 WHERE id = ?").bind(txnId),
  ]);
  await rematchUnassigned(db);
}

export async function setIgnored(db: D1Database, id: string, ignored: boolean): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM allocations WHERE txn_id = ?").bind(id),
    db.prepare("UPDATE transactions SET ignored = ?, manual = 1 WHERE id = ?").bind(ignored ? 1 : 0, id),
  ]);
}

/** Manual entry with no bank transaction (cash, paid from another account, etc). */
export async function addManualEntry(
  db: D1Database,
  e: { bill_id: number; amount_cents: number; kind: Kind; payer: string | null; note: string | null; date: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO allocations (txn_id, bill_id, amount_cents, kind, source, payer, note, created_at)
       VALUES (NULL, ?, ?, ?, 'manual', ?, ?, ?)`,
    )
    .bind(e.bill_id, e.amount_cents, e.kind, e.payer, e.note, e.date)
    .run();
}

/** Only manual entries (no bank transaction) can be deleted directly. */
export async function deleteManualEntry(db: D1Database, id: number): Promise<number | null> {
  const r = await db
    .prepare("DELETE FROM allocations WHERE id = ? AND txn_id IS NULL RETURNING bill_id")
    .bind(id)
    .first<{ bill_id: number }>();
  return r?.bill_id ?? null;
}

export async function listBillEntries(db: D1Database, billId: number): Promise<BillEntry[]> {
  const r = await db
    .prepare(
      `SELECT a.*, t.amount_cents AS txn_amount, t.description, t.message
       FROM allocations a LEFT JOIN transactions t ON t.id = a.txn_id
       WHERE a.bill_id = ? ORDER BY a.created_at DESC, a.id DESC`,
    )
    .bind(billId)
    .all<BillEntry>();
  return r.results;
}

const UNMATCHED_WHERE = `t.ignored = 0 AND t.amount_cents != 0 AND
  COALESCE((SELECT SUM(a.amount_cents) FROM allocations a WHERE a.txn_id = t.id), 0) < ABS(t.amount_cents)`;

export async function listTransactions(
  db: D1Database,
  filter: "unmatched" | "all",
  limit = 200,
): Promise<TxnWithAllocations[]> {
  const where = filter === "unmatched" ? UNMATCHED_WHERE : "1 = 1";
  const r = await db
    .prepare(`SELECT t.* FROM transactions t WHERE ${where} ORDER BY t.created_at DESC LIMIT ?`)
    .bind(limit)
    .all<Txn>();
  return attachAllocations(db, r.results);
}

async function attachAllocations(db: D1Database, txns: Txn[]): Promise<TxnWithAllocations[]> {
  if (txns.length === 0) return [];
  const byTxn = new Map<string, AllocationWithBill[]>();
  // D1 limits bound parameters per query, so look them up in chunks.
  for (let i = 0; i < txns.length; i += 90) {
    const ids = txns.slice(i, i + 90).map((t) => t.id);
    const r = await db
      .prepare(
        `SELECT a.*, b.name AS bill_name, b.code AS bill_code
         FROM allocations a JOIN bills b ON b.id = a.bill_id
         WHERE a.txn_id IN (${ids.map(() => "?").join(",")}) ORDER BY a.id`,
      )
      .bind(...ids)
      .all<AllocationWithBill>();
    for (const a of r.results) {
      const list = byTxn.get(a.txn_id!) ?? [];
      list.push(a);
      byTxn.set(a.txn_id!, list);
    }
  }
  return txns.map((t) => {
    const allocations = byTxn.get(t.id) ?? [];
    return { ...t, allocations, allocated: allocations.reduce((s, a) => s + a.amount_cents, 0) };
  });
}

export async function countUnmatched(db: D1Database): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM transactions t WHERE ${UNMATCHED_WHERE}`)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/** Used when switching the watched account (e.g. from your test account to cogs's). */
export async function deleteTransactionsNotIn(db: D1Database, accountId: string): Promise<void> {
  await db.batch([
    db.prepare(
      "DELETE FROM allocations WHERE txn_id IN (SELECT id FROM transactions WHERE account_id != ?)",
    ).bind(accountId),
    db.prepare("DELETE FROM transactions WHERE account_id != ?").bind(accountId),
  ]);
}
