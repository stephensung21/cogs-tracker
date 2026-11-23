# Recurring bills — design

Date: 2026-11-23 · Status: draft, awaiting approval

## Intent

Cogs pays fixed household bills (electricity, internet, gas, ...) that come around on a schedule. The admin sets
each bill up **once** with a usual amount and how often it repeats. Each period, the roommate's transfers with the
bill's reference code fill that period's progress bar automatically. When a real bill differs from the estimate
(gas, electricity), the admin overrides that one period's amount. Nobody should have to create a new bill every month.

## Goals

- Set up a bill once: name, code, icon, usual amount, **approximate or exact**, frequency, first due date.
- Periods roll over on their own after each due date; the roommate keeps using the same code forever.
- Per-period amount override by the admin, without changing the usual amount.
- **Clean slate**: each period stands alone. Extra money is not carried forward; shortfalls are not carried forward.
- A **large warning banner** at the top of the Bills page for any finished period that wasn't fully paid up.
- Past periods stay visible (Past bills) with their payments.

## Non-goals

- Carry-over / running balances between periods.
- Calendar-based periods (1st of month, Monday-Sunday).
- Reminders, emails or push notifications.
- Splitting a bill between several roommates.

## Anti-goals

- Breaking anything already built: matching, splits, manual entries, mark paid, reassign, reset, ignore.
- A payment silently landing in the wrong period with no way to move it.

## Approaches considered

- **A. A bill row = one period, plus a repeat setting (chosen).** Recurring bills carry a frequency; when a period's
  due date passes, the app archives it and creates the next row with the same code. Reuses every existing query,
  page and override. Trade-off: category settings are copied onto each period, so editing them needs an
  "also update future periods" step.
- **B. Separate categories and periods tables.** Cleaner model, but rewires every bill query, page and override:
  roughly 3x the work and more risk to what's already tested. Rejected.
- **C. Compute periods from dates on the fly.** Can't store per-period amount overrides. Rejected.

## Decided with the user

- Approach A.
- Clean slate between periods.
- Periods are anchored to the **due date** with a frequency: weekly, fortnightly, monthly, quarterly. A period runs
  from the day after the previous due date up to and including its own due date.
- Big ⚠️ warning at the top of the Bills page for periods that ended short.

## Design

### Data (one new migration)

Add to `bills`:

| column | meaning |
| --- | --- |
| `frequency` | `NULL` = one-off (today's behaviour), else `weekly` / `fortnightly` / `monthly` / `quarterly` |
| `approximate` | 1 = the amount is an estimate, shown as `~$180` with an "estimate" tag |
| `series_id` | id of the first period in the chain; all periods of one recurring bill share it |
| `period_start` | first day of this period (YYYY-MM-DD) |
| `usual_amount` | amount copied into the next period when it's created |
| `shortfall_dismissed_at` | admin dismissed this period's warning |

Existing bills become one-off bills (`frequency = NULL`), so nothing changes for them.

### Bill form

New fields: **Repeats** (Doesn't repeat / Weekly / Fortnightly / Monthly / Quarterly), **Amount is**
(Exact / Approximate), and the due date becomes required when the bill repeats. Editing a recurring period asks
whether changes to name, icon, code, usual amount, frequency or approximate apply to **this period only** or
**this and future periods**. Changing just this period's amount is the override; it also clears the "estimate" tag
for that period (the real bill has arrived).

### Rollover

- When today (Australia/Sydney) is past a recurring period's due date, archive it and create the next period:
  same name/code/icon/frequency/approximate/series, `amount_due = usual_amount`, `period_start = old due + 1 day`,
  `due_date = old due + 1 frequency`. If several periods were missed, create each in turn so none are skipped.
- Monthly/quarterly on the 29th-31st clamp to the last day of shorter months, then go back to the original day.
- Runs in the daily cron **and** on Bills page load, so it's current even if the cron hasn't fired yet. Idempotent.
- Archiving or deleting a recurring period by hand stops the series (asks to confirm).

### Matching

- **Money in** with a code goes to the period of that code's series whose `period_start..due_date` contains the
  transaction date (Sydney time). This handles a late sync or webhook for a transfer made before rollover. If no
  period contains it (before the first period), it goes to the current active period.
- **Money out** with a code marks the **oldest unpaid** period of that series paid, since cogs often pays on or
  after the due date when the next period has already started.
- One-off bills keep today's rule (active bills only). Manual assignments are still never changed by syncs.

### Shortfall warning

Shown at the top of the Bills page to admin and viewer:

```
⚠️  Not fully paid
    Electricity (16 Oct – 15 Nov)   $140 of $180 · $40 short
    Gas (1 – 30 Sep)                $60 of $90  · $30 short     [Dismiss] (admin only)
```

A period shows here when its due date has passed and money collected is less than its amount. It goes away when
it's made up (payment reassigned to it, or a manual entry) or when the admin dismisses it. Extra money on a period
is shown on that period ("$20 extra") but not carried anywhere.

## Left to the builder

- Exact placement and styling of the new form fields and the banner, matching the existing playful style.
- Sydney date handling (Workers run in UTC).
- Tests: date maths (rollover, month-end clamping, missed periods), period matching by date, oldest-unpaid rule.
