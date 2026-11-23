// Date maths for recurring bills. Pure functions, unit-tested.
// Dates are Sydney calendar dates as "YYYY-MM-DD" strings. Arithmetic goes through Date.UTC so the
// machine's time zone (UTC on Workers) never shifts a day.

export type Frequency = "weekly" | "fortnightly" | "monthly" | "quarterly";

export const FREQUENCIES: Frequency[] = ["weekly", "fortnightly", "monthly", "quarterly"];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

export function isFrequency(v: unknown): v is Frequency {
  return typeof v === "string" && (FREQUENCIES as string[]).includes(v);
}

const sydneyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Sydney calendar date of an instant, as YYYY-MM-DD. */
export function sydneyDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return sydneyFmt.format(d);
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  return fmt(Date.UTC(y, m - 1, d + n));
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based; day 0 of next month
}

/** Shift by whole months, putting the day on anchorDay clamped to the month's length. */
function addMonths(date: string, n: number, anchorDay: number): string {
  const [y, m] = parts(date);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const day = Math.min(anchorDay, daysInMonth(ny, nm));
  return fmt(Date.UTC(ny, nm - 1, day));
}

function step(due: string, freq: Frequency, anchorDay: number, dir: 1 | -1): string {
  switch (freq) {
    case "weekly":
      return addDays(due, 7 * dir);
    case "fortnightly":
      return addDays(due, 14 * dir);
    case "monthly":
      return addMonths(due, dir, anchorDay);
    case "quarterly":
      return addMonths(due, 3 * dir, anchorDay);
  }
}

/** The due date one period after `due`. */
export function nextDue(due: string, freq: Frequency, anchorDay: number): string {
  return step(due, freq, anchorDay, 1);
}

/** First day of the period ending on `due`: the day after the previous due date. */
export function periodStartFor(due: string, freq: Frequency, anchorDay: number): string {
  return addDays(step(due, freq, anchorDay, -1), 1);
}

/** Every period to create after `lastDue` so that the newest one's due date is today or later. */
export function missedPeriods(
  lastDue: string,
  freq: Frequency,
  anchorDay: number,
  today: string,
): { start: string; due: string }[] {
  const out: { start: string; due: string }[] = [];
  let due = lastDue;
  while (due < today) {
    const start = addDays(due, 1);
    due = nextDue(due, freq, anchorDay);
    out.push({ start, due });
  }
  return out;
}

export interface SeriesPeriod {
  id: number;
  period_start: string | null;
  due_date: string;
  paid: boolean;
  archived: number;
}

/**
 * Which period of a recurring bill a payment belongs to.
 * Money in: the period whose dates contain the transaction date, else the active period.
 * Money out (paying the bill): the oldest unpaid period, else the active period.
 */
export function pickPeriod(kind: "in" | "out", txnDate: string, periods: SeriesPeriod[]): number | null {
  const active = periods.find((p) => p.archived === 0) ?? null;
  if (kind === "in") {
    const hit = periods.find((p) => p.period_start !== null && p.period_start <= txnDate && txnDate <= p.due_date);
    return (hit ?? active)?.id ?? null;
  }
  const unpaid = periods.filter((p) => !p.paid).sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  return (unpaid[0] ?? active)?.id ?? null;
}

/** A finished period that didn't collect its full amount and hasn't been dismissed. */
export function isShort(
  b: { due_date: string | null; amount_due: number; collected: number; shortfall_dismissed_at: string | null },
  today: string,
): boolean {
  return b.due_date !== null && b.due_date < today && b.collected < b.amount_due && !b.shortfall_dismissed_at;
}

/**
 * The day of month a repeating bill falls on, after an edit. Changing the due date moves it to the new
 * day; otherwise it stays (so a bill on the 31st that's currently on 28 Feb goes back to the 31st).
 */
export function anchorAfterEdit(prevAnchor: number | null, oldDue: string | null, newDue: string): number {
  const day = Number(newDue.slice(8, 10));
  if (prevAnchor === null || oldDue !== newDue) return day;
  return prevAnchor;
}
