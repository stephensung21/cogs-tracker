# cogs.bills

A small website that tracks a roommate's bill payments into an Up Bank Saver.

- The roommate transfers money into the bills Saver with a **reference code** (e.g. `ELEC`).
- Up sends a webhook to this app, which matches the reference to a bill and fills that bill's progress bar.
- When money goes **out** of the Saver with the same reference, the bill is marked **Paid**.
- Anything that doesn't match (typos, the owner's own top-ups) lands on the **Unmatched** page to assign by hand.

Runs on Cloudflare Workers (Hono) with a D1 (SQLite) database, all on the free plan.

## Logins

| | Admin (`ADMIN_PASSWORD`) | Viewer (`VIEWER_PASSWORD`) |
| --- | --- | --- |
| See bills, progress bars and payments | yes | yes |
| Copy a bill's reference code | yes | yes |
| Add / edit / archive / delete bills | yes | no |
| Unmatched payments, Sync, Setup | yes | no |
| Manual overrides (below) | yes | no |

The role is stored in a signed, http-only cookie (30 days) and checked on the server for every admin
route, so the viewer can't get around it by guessing URLs. Removing `VIEWER_PASSWORD` logs the viewer out.

## Admin overrides

Cogs can correct anything the automatic matching gets wrong:

- **Reassign** any payment to a different bill (current or past), or take it off a bill: Payments page dropdown.
- **Split** one payment across several bills (e.g. $150 → $100 Electricity + $50 Internet). Any leftover stays
  in Unmatched as "not assigned".
- **Switch** a payment between *towards the bill* and *bill payment* (marks the bill paid).
- **Manual entries** on a bill page: cash or payments from another account, with who / date / note. Deletable.
- **Mark as paid** by hand (e.g. paid by card from another account), and undo it.
- **Ignore** a payment, or **Reset to automatic** to throw away manual changes and match by reference again.

Anything set by hand shows a **MANUAL** tag (the roommate can see it) and is never changed by syncs or webhooks.
Under the hood each bill's total comes from the `allocations` table: one row per "this much of this payment
counts towards this bill", with manual entries being allocations that have no bank transaction.

## Recurring bills

Set a bill up once and it repeats: pick **Repeats** (weekly, fortnightly, monthly or quarterly) and a due date.

- Each **period** runs from the day after the previous due date up to and including its due date. The day after a
  due date, that period moves to Past bills and the next one starts with the same code, so the roommate keeps
  using `ELEC` forever. Missed periods (nobody opened the site for a while) are all created, none skipped.
- **Clean slate**: each period stands alone. Extra money shows as "$20 extra" on that period and isn't carried
  forward; a shortfall isn't carried forward either.
- **Approximate** amounts show as `~$180` with an *estimate* tag. When the real bill arrives, edit the period and
  change **Amount this period**: only that period changes and the tag goes away. **Usual amount** is what the
  next periods start with.
- A transfer counts towards the period it was **made in** (Sydney time), even if Up delivers it after rollover.
- Money **out** with the code marks the **oldest unpaid** period paid (cogs often pays after the next period started).
- A big **⚠️ Not fully paid** banner at the top of the Bills page lists finished periods that collected less than
  their amount. It clears when the period is made up (reassign a payment or add a manual entry) or the admin
  dismisses it.
- Archiving or deleting the current period stops the bill repeating.

Periods roll over on Bills page load, before every sync or webhook, and in the daily cron.

## How matching works

| Transaction on the watched account | Result |
| --- | --- |
| Money in, reference contains a bill code as a word (`ELEC`, `elec dec`, `Bills: ELEC`) | Counts towards that bill (for a repeating bill: the period the transfer was made in) |
| Money out with a bill code | Marks the bill Paid (for a repeating bill: the oldest unpaid period) |
| No code, unknown code, or two codes at once | Goes to Unmatched |

The reference is checked first, then Up's raw text, then the description. `ELECTRIC` does **not** match `ELEC`.
Each Up transaction is stored once by its id, so repeated webhooks or syncs never double-count. A bill
assignment, once made (automatically or by hand), is never changed by a later sync.
Creating a bill also matches any earlier unmatched payments that used its code.

## Set up (first time, with your own Up account for testing)

You need Node 20+ and a free Cloudflare account.

```bash
npm install
npx wrangler login

# 1. Create the database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create cogs-tracker
npm run db:migrate:remote

# 2. Secrets
npx wrangler secret put UP_TOKEN        # Personal Access Token from https://api.up.com.au
npx wrangler secret put ADMIN_PASSWORD  # cogs's password: full access
npx wrangler secret put VIEWER_PASSWORD # roommate's password: view only (optional)
npx wrangler secret put SESSION_SECRET  # any long random string, e.g. `openssl rand -hex 32`

# 3. Deploy
npm run deploy                          # prints https://cogs-tracker.<you>.workers.dev
```

Then open the site, log in, and go to **Setup**:

1. Check it says **Connected to Up**.
2. Pick the **Saver** to watch.
3. Click **Register webhook**, then **Send test ping**. "Last ping" should update after a refresh.
4. Click **Sync now** to pull past transactions.
5. Add a bill on the Bills page and send a $1 test transfer with its code as the reference.

A daily cron (see `wrangler.toml`) re-syncs the last 14 days in case a webhook was missed.

## Switching to cogs's account (handover)

1. Delete your test webhook on the Setup page (it belongs to your token).
2. Have cogs set his token himself: `npx wrangler secret put UP_TOKEN`, or paste it into the Cloudflare
   dashboard under Workers → cogs-tracker → Settings → Variables and secrets.
3. On Setup: pick his bills Saver (this deletes your test transactions; bills are kept), register the webhook,
   ping it, and sync.
4. Change `ADMIN_PASSWORD` so only cogs knows it, and set `VIEWER_PASSWORD` for the roommate.

The Up token can **read every account and transaction** cogs has. It only lives in Cloudflare secrets and is
never sent to the browser. Only transactions from the chosen Saver are stored.

## Local development

```bash
cp .dev.vars.example .dev.vars   # fill in values
npm run db:migrate:local
npm run dev                      # http://localhost:8787
npm test                         # unit tests
npm run typecheck
```

Up can't reach `localhost`, so webhooks only work on the deployed site. Locally, use **Sync now** instead.
`UP_API_BASE` can point at a fake Up server for testing.

## Layout

```
src/index.tsx   routes (pages, webhook endpoint, daily cron)
src/sync.ts     webhook handling and sync
src/up.ts       Up API client and signature check
src/matching.ts reference to bill matching, money helpers (pure, unit-tested)
src/periods.ts  recurring-bill date maths and period picking (pure, unit-tested)
src/db.ts       D1 queries
src/views.tsx   HTML pages and styles (server-rendered, no frontend framework)
src/art.tsx     logo, bill icons, illustrations, avatars (inline SVG)
src/auth.ts     admin / viewer password login with a signed cookie
migrations/     database schema
```
