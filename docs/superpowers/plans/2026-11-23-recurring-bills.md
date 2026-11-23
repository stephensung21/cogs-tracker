# Recurring Bills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bills can repeat (weekly/fortnightly/monthly/quarterly), roll over to a new period after each due date, match payments to the right period, and warn about periods that ended short.

**Architecture:** A bill row stays one period (spec approach A). New columns on `bills` link periods of one recurring bill via `series_id`. All date maths and period picking live in a new pure module `src/periods.ts` (unit-tested); `src/db.ts` gains rollover and series-aware matching that call it; views/routes get the new form fields and the warning banner.

**Tech Stack:** Cloudflare Workers, Hono JSX (server-rendered), D1 (SQLite), Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-23-recurring-bills-design.md`

## Global Constraints

- Frequencies exactly: `weekly` (7 days), `fortnightly` (14 days), `monthly` (1 month), `quarterly` (3 months).
- A period runs from the day after the previous due date up to and including its own due date.
- All "today" and transaction dates are **Australia/Sydney** calendar dates (`YYYY-MM-DD`); Workers run in UTC.
- Month-end due days clamp to the last day of shorter months, then return to the original day (anchor = day of the series' first due date).
- Clean slate: nothing is carried between periods.
- Existing bills become one-off (`frequency = NULL`) and behave exactly as today.
- Manual allocations are never changed by syncs, webhooks or rollover.
- Money stored as integer cents.

## Plan-level calls (deviations from the spec, flagged to the user)

- **No "this period / this and future" prompt.** Only one future-facing row exists (the current active period), and rollover copies name/code/icon/frequency/approximate/usual amount from it. So the edit form shows **Amount this period** and **Usual amount** separately; other edits on the active period carry forward automatically, edits on a past period stay on that period.
- **Extra column `amount_confirmed`** (per period): the spec's `approximate` is a series setting copied forward, so the "estimate" tag clears via `amount_confirmed = 1` when the admin changes this period's amount, without turning off "approximate" for future periods.
- Rollover also runs at the start of every sync/webhook, so a transfer arriving after a due date still finds its period.

## Review Focus

1. A transfer made on the due date itself (e.g. 15 Nov 9pm Sydney = 15 Nov 10:00Z) belongs to the period ending that day, not the next one.
2. A webhook arriving after the due date, before any page load or cron, still lands in the correct (old) period by date.
3. Monthly bill due 31 Jan → 28 Feb (29 in leap years) → 31 Mar → 30 Apr → 31 May.
4. Nobody opens the site for 3 months: every missed period is created and archived in order, none skipped, each short one appears in the banner.
5. Money out when every period of the series is already paid goes to the current active period.

---

### Task 1: Pure period maths (`src/periods.ts`)

**Files:**
- Create: `src/periods.ts`
- Create: `test/periods.test.ts`

**Interfaces:**
- Produces:
  - `type Frequency = "weekly" | "fortnightly" | "monthly" | "quarterly"`
  - `const FREQUENCIES: Frequency[]` and `isFrequency(v: unknown): v is Frequency`
  - `sydneyDate(isoOrDate: string | Date): string` — Sydney calendar date `YYYY-MM-DD`
  - `addDays(date: string, n: number): string`
  - `nextDue(due: string, freq: Frequency, anchorDay: number): string`
  - `periodStartFor(due: string, freq: Frequency, anchorDay: number): string` — previous due + 1 day
  - `missedPeriods(lastDue: string, freq: Frequency, anchorDay: number, today: string): { start: string; due: string }[]` — every period to create so the last one's due ≥ today (empty when `today <= lastDue`)
  - `interface SeriesPeriod { id: number; period_start: string | null; due_date: string; paid: boolean; archived: number }`
  - `pickPeriod(kind: "in" | "out", txnDate: string, periods: SeriesPeriod[]): number | null`
  - `isShort(b: { due_date: string | null; amount_due: number; collected: number; shortfall_dismissed_at: string | null }, today: string): boolean`

- [ ] **Step 1: Write the failing tests** in `test/periods.test.ts`:

```ts
describe("sydneyDate", () => {
  it("uses Sydney, not UTC", () => {
    expect(sydneyDate("2026-11-15T10:00:00Z")).toBe("2026-11-15"); // 9pm AEDT
    expect(sydneyDate("2026-11-15T13:30:00Z")).toBe("2026-11-16"); // 00:30 AEDT
    expect(sydneyDate("2026-11-15T21:00:00+11:00")).toBe("2026-11-15");
  });
});

describe("nextDue", () => {
  it("adds 7 / 14 days", () => {
    expect(nextDue("2026-12-29", "weekly", 29)).toBe("2027-01-05");
    expect(nextDue("2026-12-29", "fortnightly", 29)).toBe("2027-01-12");
  });
  it("clamps month ends and returns to the anchor day", () => {
    expect(nextDue("2027-01-31", "monthly", 31)).toBe("2027-02-28");
    expect(nextDue("2027-02-28", "monthly", 31)).toBe("2027-03-31");
    expect(nextDue("2027-03-31", "monthly", 31)).toBe("2027-04-30");
    expect(nextDue("2028-01-31", "monthly", 31)).toBe("2028-02-29");
    expect(nextDue("2026-11-30", "quarterly", 30)).toBe("2027-02-28");
  });
});

describe("periodStartFor", () => {
  it("is the day after the previous due date", () => {
    expect(periodStartFor("2026-12-15", "monthly", 15)).toBe("2026-11-16");
    expect(periodStartFor("2027-03-31", "monthly", 31)).toBe("2027-03-01");
    expect(periodStartFor("2027-01-05", "weekly", 5)).toBe("2026-12-30");
  });
});

describe("missedPeriods", () => {
  it("is empty until the due date has passed", () => {
    expect(missedPeriods("2026-11-15", "monthly", 15, "2026-11-15")).toEqual([]);
  });
  it("creates the next period the day after the due date", () => {
    expect(missedPeriods("2026-11-15", "monthly", 15, "2026-11-16")).toEqual([
      { start: "2026-11-16", due: "2026-12-15" },
    ]);
  });
  it("creates every missed period in order", () => {
    expect(missedPeriods("2026-08-15", "monthly", 15, "2026-11-20")).toEqual([
      { start: "2026-08-16", due: "2026-09-15" },
      { start: "2026-09-16", due: "2026-10-15" },
      { start: "2026-10-16", due: "2026-11-15" },
      { start: "2026-11-16", due: "2026-12-15" },
    ]);
  });
});

describe("pickPeriod", () => {
  const ps = [
    { id: 1, period_start: "2026-09-16", due_date: "2026-10-15", paid: true, archived: 1 },
    { id: 2, period_start: "2026-10-16", due_date: "2026-11-15", paid: false, archived: 1 },
    { id: 3, period_start: "2026-11-16", due_date: "2026-12-15", paid: false, archived: 0 },
  ];
  it("money in goes to the period containing the date, including the due date", () => {
    expect(pickPeriod("in", "2026-11-15", ps)).toBe(2);
    expect(pickPeriod("in", "2026-11-16", ps)).toBe(3);
    expect(pickPeriod("in", "2026-10-01", ps)).toBe(1);
  });
  it("money in outside every period goes to the active one", () => {
    expect(pickPeriod("in", "2026-01-01", ps)).toBe(3);
  });
  it("money out marks the oldest unpaid period", () => {
    expect(pickPeriod("out", "2026-11-20", ps)).toBe(2);
  });
  it("money out with everything paid goes to the active period", () => {
    expect(pickPeriod("out", "2026-11-20", ps.map((p) => ({ ...p, paid: true })))).toBe(3);
  });
  it("returns null for an empty series", () => {
    expect(pickPeriod("in", "2026-11-20", [])).toBeNull();
  });
});

describe("isShort", () => {
  const b = { due_date: "2026-11-15", amount_due: 18000, collected: 14000, shortfall_dismissed_at: null };
  it("is short once the due date has passed with money missing", () => {
    expect(isShort(b, "2026-11-16")).toBe(true);
    expect(isShort(b, "2026-11-15")).toBe(false);
  });
  it("is not short when fully collected, dismissed, or undated", () => {
    expect(isShort({ ...b, collected: 18000 }, "2026-12-01")).toBe(false);
    expect(isShort({ ...b, shortfall_dismissed_at: "2026-11-20" }, "2026-12-01")).toBe(false);
    expect(isShort({ ...b, due_date: null }, "2026-12-01")).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/periods.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/periods.ts`.** Do date maths on `YYYY-MM-DD` strings via `Date.UTC` (no local-time Dates). `sydneyDate` uses `Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" })`. `nextDue` for months: add 1 or 3 months to year/month, day = `min(anchorDay, daysInMonth)`. `periodStartFor`: step back one frequency with the same clamping, then `addDays(…, 1)`. `pickPeriod("out")`: lowest `due_date` with `paid === false`, else the `archived === 0` period, else `null`.

- [ ] **Step 4: Run** `npx vitest run` — Expected: all tests PASS (existing 18 + new).

- [ ] **Step 5: Commit** — `git add src/periods.ts test/periods.test.ts && git commit -m "Add period date maths for recurring bills"`

---

### Task 2: Schema, rollover and series-aware matching (`src/db.ts`)

**Files:**
- Create: `migrations/0004_recurring.sql`
- Modify: `src/db.ts` (Bill types, `BillFields`, `createBill`, `updateBill`, `upsertTransactions`, `rematchUnassigned`, new functions)
- Modify: `src/sync.ts:10-15, 61` (call rollover before upserting)

**Interfaces:**
- Consumes: everything from Task 1.
- Produces:
  - `Bill` gains `frequency: Frequency | null; approximate: number; amount_confirmed: number; series_id: number | null; period_start: string | null; usual_amount: number | null; shortfall_dismissed_at: string | null`
  - `BillFields` gains `frequency: Frequency | null; approximate: boolean; usual_amount: number; amount_confirmed?: boolean`
  - `createBill(db, b: BillFields): Promise<number>` — for recurring bills also sets `series_id = id`, `period_start = periodStartFor(due, freq, day(due))`
  - `updateBill(db, id, b: BillFields): Promise<void>` — sets `amount_confirmed = 1` when `amount_due` changed; turning a one-off into recurring sets `series_id`/`period_start` as in create
  - `rollOver(db: D1Database, today: string): Promise<number>` — returns periods created
  - `listShortPeriods(db: D1Database, today: string): Promise<BillWithTotals[]>`
  - `dismissShortfall(db: D1Database, id: number): Promise<void>`

- [ ] **Step 1: Write `migrations/0004_recurring.sql`:** seven `ALTER TABLE bills ADD COLUMN` statements: `frequency TEXT`, `approximate INTEGER NOT NULL DEFAULT 0`, `amount_confirmed INTEGER NOT NULL DEFAULT 0`, `series_id INTEGER`, `period_start TEXT`, `usual_amount INTEGER`, `shortfall_dismissed_at TEXT`; plus `CREATE INDEX bills_series ON bills(series_id);`. Header comment explains each column (copy the spec table).

- [ ] **Step 2: Apply locally** — `npm run db:migrate:local`. Expected: `0004_recurring.sql ✅`.

- [ ] **Step 3: Implement `rollOver`.** For each `archived = 0 AND frequency IS NOT NULL` bill with `due_date < today`: anchor day = day of the series' first period's `due_date` (`SELECT due_date FROM bills WHERE id = series_id`); for each entry from `missedPeriods`, archive the current row and insert the next (copy name, code, icon, frequency, approximate, series_id, usual_amount; `amount_due = usual_amount`, `amount_confirmed = 0`, `period_start`, `due_date`). Do each bill's archive+inserts in one `db.batch` so a crash can't leave two active rows (the unique active-code index would reject that anyway). Missed intermediate periods are inserted already archived; only the last stays active.

- [ ] **Step 4: Series-aware matching.** Add a private helper `resolvePeriod(db, activeBillId, kind, createdAt): Promise<number>`: if the matched active bill has a `series_id`, load the series as `SeriesPeriod[]` (`paid` = has an `out` allocation or `marked_paid_at` set) and return `pickPeriod(kind, sydneyDate(createdAt), periods) ?? activeBillId`; otherwise return `activeBillId`. Use it in `upsertTransactions` and `rematchUnassigned` right after `matchBill`. Cache series per call so a sync of many transactions doesn't query per transaction.

- [ ] **Step 5: Call rollover before matching.** In `syncRecent` and `handleUpWebhook` (`src/sync.ts`), `await rollOver(env.DB, sydneyDate(new Date()))` before `upsertTransactions`.

- [ ] **Step 6: Implement `listShortPeriods`** (`BILL_TOTALS_SQL` + `WHERE b.due_date < ? AND b.shortfall_dismissed_at IS NULL GROUP BY b.id`, then filter with `isShort`, ordered by `due_date`) and `dismissShortfall` (sets `shortfall_dismissed_at` to now).

- [ ] **Step 7: Verify** — `npm run typecheck` and `npm test` pass. Then a local smoke test against the local D1:

```bash
npx wrangler d1 execute cogs-tracker --local --command "INSERT INTO bills (name, code, amount_due, due_date, frequency, usual_amount, series_id, period_start) VALUES ('Electricity','ELEC',18000,'2026-08-15','monthly',18000,NULL,'2026-07-16'); UPDATE bills SET series_id = id WHERE code='ELEC';"
```
Run `npm run dev`, open http://localhost:8787 (Task 4 wires rollover into page load; until then call it from a sync). Expected after one sync: 4 ELEC rows, only the `2026-12-15` one has `archived = 0`:
`npx wrangler d1 execute cogs-tracker --local --command "SELECT id, period_start, due_date, archived FROM bills WHERE code='ELEC'"`

- [ ] **Step 8: Commit** — `git add migrations/0004_recurring.sql src/db.ts src/sync.ts && git commit -m "Add recurring bill rollover and period matching"`

---

### Task 3: Bill form and routes (`src/index.tsx`, `src/views.tsx` BillForm)

**Files:**
- Modify: `src/index.tsx` (`BillInput`, `validateBill`, `readBillForm`, `/bills/:id/edit`, archive/delete, new dismiss route, cron)
- Modify: `src/views.tsx` (`BillForm`, archive/delete confirm text)

**Interfaces:**
- Consumes: `BillFields`, `createBill`, `updateBill`, `rollOver`, `dismissShortfall` (Task 2); `isFrequency`, `FREQUENCIES` (Task 1).
- Produces: route `POST /bills/:id/dismiss-shortfall` (admin only; redirects to `/` with message "Warning dismissed."); `BillForm` props gain `frequency`, `approximate`, `usual_amount`.

- [ ] **Step 1: Form fields** in `BillForm`, after the code field:
  - **Repeats**: `<select name="frequency">` with options `""` "Doesn't repeat", `weekly` "Weekly", `fortnightly` "Fortnightly", `monthly` "Monthly", `quarterly` "Quarterly".
  - **Amount is**: radios `approximate` = `0` "Exact" (default) / `1` "Approximate (estimate)".
  - New bill: one **Amount** field (sets both `amount_due` and `usual_amount`). Editing a recurring bill: **Amount this period** (`amount`) and **Usual amount** (`usual_amount`, hint: "Used for next periods").
  - Due date label: "Due date" with hint "Required if the bill repeats; next periods are worked out from it".

- [ ] **Step 2: Validation** in `validateBill`: `frequency` via `isFrequency` else `null`; if `frequency` and no `due_date` → error `"A repeating bill needs a due date."`; `usual_amount` parsed with `parseDollars`, falling back to `amount_due` when the field is absent or blank; invalid → `"Usual amount should look like 120 or 120.50."`.

- [ ] **Step 3: Routes.** Pass new fields through create/edit. Register `"/bills/:id/dismiss-shortfall"` in the `requireAdmin` path list. Archive and delete confirmations on a recurring active period read: `"This stops Electricity repeating. Continue?"` (use the bill's name).

- [ ] **Step 4: Cron.** In `scheduled`, run `rollOver(env.DB, sydneyDate(new Date()))` before `syncRecent`, even if no account is connected yet.

- [ ] **Step 5: Verify** — `npm run typecheck`, `npm test`; in `npm run dev` create a monthly bill due yesterday and confirm a second period appears after a sync; create one with Repeats set and no due date and confirm the error.

- [ ] **Step 6: Commit** — `git commit -am "Add repeat and estimate options to the bill form"`

---

### Task 4: Bills page banner and recurring display (`src/views.tsx`, `src/index.tsx` GET `/`)

**Files:**
- Modify: `src/index.tsx` (GET `/`, GET `/bills/:id`)
- Modify: `src/views.tsx` (`Dashboard`, bill card, `BillDetail`, styles)

**Interfaces:**
- Consumes: `rollOver`, `listShortPeriods` (Task 2), `sydneyDate` (Task 1).
- Produces: `Dashboard` prop `short: BillWithTotals[]`.

- [ ] **Step 1: GET `/`** runs `await rollOver(db, sydneyDate(new Date()))` first, then loads `listShortPeriods` alongside the existing queries.

- [ ] **Step 2: Banner** at the very top of `Dashboard` (above the existing notices) when `short.length > 0`, visible to both roles: a large ⚠️ (≥ 40px), heading "Not fully paid", one row per period: `{name} ({period range or due date})  {collected} of {amount} · {short} short`, each row linking to the bill; admin sees a **Dismiss** button per row posting to `/bills/:id/dismiss-shortfall`. Style with the existing `--danger` colour and the app's card look.

- [ ] **Step 3: Recurring details.** On bill cards and the bill page: a chip "Repeats monthly" (etc.); amounts shown as `~$180` with an "estimate" tag when `approximate = 1 AND amount_confirmed = 0`; the bill page shows the period range (`16 Nov – 15 Dec`); a period with `collected > amount_due` shows "$20 extra".

- [ ] **Step 4: Verify** in `npm run dev`: with the Task 2 smoke data (all periods $0 collected), the banner lists 3 short ELEC periods; Dismiss removes one; logging in as viewer shows the banner without Dismiss buttons. `npm run typecheck` and `npm test` pass.

- [ ] **Step 5: Commit** — `git commit -am "Show not-fully-paid warning and recurring bill details"`

---

### Task 5: Docs and release

**Files:**
- Modify: `README.md` ("How matching works" + new "Recurring bills" section)

- [ ] **Step 1: README.** Add a "Recurring bills" section: set up once, periods from the due date, clean slate, per-period amount override vs usual amount, estimate tag, late transfers go to the period they were made in, money out marks the oldest unpaid period, the warning banner, archiving/deleting stops the series.

- [ ] **Step 2: Full check** — `npm run typecheck && npm test`. Expected: both pass.

- [ ] **Step 3: Commit** — `git commit -am "Document recurring bills"`

- [ ] **Step 4: Release (only with the user's go-ahead)** — `npm run db:migrate:remote` **before** `npm run deploy` (the new code reads the new columns).
