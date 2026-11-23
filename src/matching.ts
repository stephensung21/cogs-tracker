// Pure logic for turning a transfer reference into a bill. No I/O here so it's easy to test.

export interface BillCode {
  id: number;
  code: string; // upper-case
}

/** Upper-case a code and strip anything that isn't a letter, digit or hyphen. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

/** Split free text into upper-case tokens ("elec dec!" -> ["ELEC", "DEC"]). */
export function tokens(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toUpperCase()
    .split(/[^A-Z0-9-]+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter(Boolean);
}

/**
 * Find the bill a transaction belongs to.
 *
 * The reference (`message`) is checked first, then Up's raw text, then the description.
 * A bill matches when its code appears as a whole word, so "ELEC", "elec dec" and
 * "Bills: ELEC" all match ELEC, but "ELECTRIC" does not. If a field mentions two
 * different bills it's ambiguous and we move on, leaving it for manual assignment.
 */
export function matchBill(
  fields: { message?: string | null; rawText?: string | null; description?: string | null },
  bills: BillCode[],
): number | null {
  const byCode = new Map(bills.map((b) => [normalizeCode(b.code), b.id]));
  for (const field of [fields.message, fields.rawText, fields.description]) {
    const hits = new Set<number>();
    for (const t of tokens(field)) {
      const id = byCode.get(t);
      if (id !== undefined) hits.add(id);
    }
    if (hits.size === 1) return [...hits][0];
  }
  return null;
}

export type BillStatus = "open" | "funded" | "paid";

export function billStatus(
  collected: number,
  due: number,
  paidOut: number,
  markedPaid: string | null | boolean = null,
): BillStatus {
  if (paidOut > 0 || markedPaid) return "paid";
  if (collected >= due && due > 0) return "funded";
  return "open";
}

export function percent(collected: number, due: number): number {
  if (due <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((collected / due) * 100)));
}

/** "12.50" / "$1,200" / "80" -> cents. Returns null if not a valid positive amount. */
export function parseDollars(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return cents > 0 ? cents : null;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface SplitRow {
  bill_id: number;
  amount_cents: number;
  kind: "in" | "out";
}

/**
 * Turn the rows of the "split / classify" form into allocations.
 * Blank rows are skipped. Amounts can't add up to more than the transaction.
 * A single row with a blank amount means "the whole transaction".
 */
export function parseSplits(
  rows: { bill: string; amount: string; kind: string }[],
  txnAbsCents: number,
): { splits: SplitRow[] } | { error: string } {
  const filled = rows.filter((r) => r.bill.trim() !== "");
  const splits: SplitRow[] = [];
  for (const r of filled) {
    const bill_id = Number(r.bill);
    if (!Number.isInteger(bill_id) || bill_id <= 0) return { error: "Pick a bill for each row." };
    const kind = r.kind === "out" ? "out" : "in";
    let amount_cents: number | null;
    if (r.amount.trim() === "" && filled.length === 1) amount_cents = txnAbsCents;
    else amount_cents = parseDollars(r.amount);
    if (amount_cents === null) return { error: `"${r.amount}" isn't a valid amount.` };
    splits.push({ bill_id, amount_cents, kind });
  }
  const total = splits.reduce((s, x) => s + x.amount_cents, 0);
  if (total > txnAbsCents) {
    return { error: `That adds up to ${formatCents(total)}, but the payment was only ${formatCents(txnAbsCents)}.` };
  }
  return { splits };
}
