import { matchBill, type BillCode } from "./matching";
import type { UpTransaction } from "./up";

export interface Env {
  DB: D1Database;
  UP_TOKEN: string;
  APP_PASSWORD: string;
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
  archived: number;
  created_at: string;
}

export interface BillWithTotals extends Bill {
  collected: number;
  paid_out: number;
  paid_at: string | null;
  payments: number;
}

const BILL_TOTALS_SQL = `
  SELECT b.*,
    COALESCE(SUM(CASE WHEN t.amount_cents > 0 THEN t.amount_cents END), 0)  AS collected,
    COALESCE(SUM(CASE WHEN t.amount_cents < 0 THEN -t.amount_cents END), 0) AS paid_out,
    MAX(CASE WHEN t.amount_cents < 0 THEN t.created_at END)                  AS paid_at,
    COUNT(CASE WHEN t.amount_cents > 0 THEN 1 END)                           AS payments
  FROM bills b
  LEFT JOIN transactions t ON t.bill_id = b.id
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

export async function createBill(
  db: D1Database,
  b: { name: string; code: string; amount_due: number; due_date: string | null },
): Promise<number> {
  const r = await db
    .prepare("INSERT INTO bills (name, code, amount_due, due_date) VALUES (?, ?, ?, ?) RETURNING id")
    .bind(b.name, b.code, b.amount_due, b.due_date)
    .first<{ id: number }>();
  return r!.id;
}

export async function updateBill(
  db: D1Database,
  id: number,
  b: { name: string; code: string; amount_due: number; due_date: string | null },
): Promise<void> {
  await db
    .prepare("UPDATE bills SET name = ?, code = ?, amount_due = ?, due_date = ? WHERE id = ?")
    .bind(b.name, b.code, b.amount_due, b.due_date, id)
    .run();
}

export async function setBillArchived(db: D1Database, id: number, archived: boolean): Promise<void> {
  await db.prepare("UPDATE bills SET archived = ? WHERE id = ?").bind(archived ? 1 : 0, id).run();
}

export async function deleteBill(db: D1Database, id: number): Promise<void> {
  await db.batch([
    db.prepare("UPDATE transactions SET bill_id = NULL, manual = 0 WHERE bill_id = ?").bind(id),
    db.prepare("DELETE FROM bills WHERE id = ?").bind(id),
  ]);
}

// ---------- transactions ----------

export interface Txn {
  id: string;
  account_id: string;
  amount_cents: number;
  message: string | null;
  description: string | null;
  raw_text: string | null;
  transfer_account_id: string | null;
  status: string | null;
  bill_id: number | null;
  manual: number;
  ignored: number;
  created_at: string;
}

export interface TxnWithBill extends Txn {
  bill_name: string | null;
  bill_code: string | null;
}

/**
 * Insert or refresh a transaction from Up. Safe to call any number of times for the same id.
 * An existing bill assignment (automatic or manual) is never changed by a later sync.
 */
export function upsertTransactionStmt(db: D1Database, t: UpTransaction, bills: BillCode[]): D1PreparedStatement {
  const a = t.attributes;
  const billId = matchBill({ message: a.message, rawText: a.rawText, description: a.description }, bills);
  return db
    .prepare(
      `INSERT INTO transactions
         (id, account_id, amount_cents, message, description, raw_text, transfer_account_id, status, bill_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         amount_cents = excluded.amount_cents,
         message      = excluded.message,
         description  = excluded.description,
         raw_text     = excluded.raw_text,
         status       = excluded.status,
         bill_id      = COALESCE(transactions.bill_id, CASE WHEN transactions.manual = 1 THEN NULL ELSE excluded.bill_id END),
         synced_at    = datetime('now')`,
    )
    .bind(
      t.id,
      t.relationships.account.data.id,
      a.amount.valueInBaseUnits,
      a.message,
      a.description,
      a.rawText,
      t.relationships.transferAccount?.data?.id ?? null,
      a.status,
      billId,
      a.createdAt,
    );
}

export async function upsertTransactions(db: D1Database, txns: UpTransaction[]): Promise<void> {
  if (txns.length === 0) return;
  const bills = await activeBillCodes(db);
  const stmts = txns.map((t) => upsertTransactionStmt(db, t, bills));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

export async function deleteTransaction(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM transactions WHERE id = ?").bind(id).run();
}

/** After a bill is added or its code changes, try to match payments that arrived before it existed. */
export async function rematchUnassigned(db: D1Database): Promise<number> {
  const bills = await activeBillCodes(db);
  if (bills.length === 0) return 0;
  const r = await db
    .prepare("SELECT * FROM transactions WHERE bill_id IS NULL AND manual = 0 AND ignored = 0")
    .all<Txn>();
  const stmts: D1PreparedStatement[] = [];
  for (const t of r.results) {
    const id = matchBill({ message: t.message, rawText: t.raw_text, description: t.description }, bills);
    if (id !== null) stmts.push(db.prepare("UPDATE transactions SET bill_id = ? WHERE id = ?").bind(id, t.id));
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return stmts.length;
}

export async function assignTransaction(db: D1Database, id: string, billId: number | null): Promise<void> {
  await db
    .prepare("UPDATE transactions SET bill_id = ?, manual = 1, ignored = 0 WHERE id = ?")
    .bind(billId, id)
    .run();
}

export async function setIgnored(db: D1Database, id: string, ignored: boolean): Promise<void> {
  await db.prepare("UPDATE transactions SET ignored = ? WHERE id = ?").bind(ignored ? 1 : 0, id).run();
}

export async function listTransactions(
  db: D1Database,
  filter: "unmatched" | "all" | { billId: number },
  limit = 200,
): Promise<TxnWithBill[]> {
  let where = "1 = 1";
  const binds: unknown[] = [];
  if (filter === "unmatched") where = "t.bill_id IS NULL AND t.ignored = 0";
  else if (typeof filter === "object") {
    where = "t.bill_id = ?";
    binds.push(filter.billId);
  }
  const r = await db
    .prepare(
      `SELECT t.*, b.name AS bill_name, b.code AS bill_code
       FROM transactions t LEFT JOIN bills b ON b.id = t.bill_id
       WHERE ${where} ORDER BY t.created_at DESC LIMIT ?`,
    )
    .bind(...binds, limit)
    .all<TxnWithBill>();
  return r.results;
}

export async function countUnmatched(db: D1Database): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM transactions WHERE bill_id IS NULL AND ignored = 0")
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/** Used when switching the watched account (e.g. from your test account to cogs's). */
export async function deleteTransactionsNotIn(db: D1Database, accountId: string): Promise<void> {
  await db.prepare("DELETE FROM transactions WHERE account_id != ?").bind(accountId).run();
}
