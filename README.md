# Cogs Bills

A small website that tracks a roommate's bill payments into an Up Bank Saver.

- The roommate transfers money into the bills Saver with a **reference code** (e.g. `ELEC`).
- Up sends a webhook to this app, which matches the reference to a bill and fills that bill's progress bar.
- When money goes **out** of the Saver with the same reference, the bill is marked **Paid**.
- Anything that doesn't match (typos, the owner's own top-ups) lands on the **Unmatched** page to assign by hand.

Runs on Cloudflare Workers (Hono) with a D1 (SQLite) database, all on the free plan.

## How matching works

| Transaction on the watched account | Result |
| --- | --- |
| Money in, reference contains a bill code as a word (`ELEC`, `elec dec`, `Bills: ELEC`) | Counts towards that bill |
| Money out with a bill code | Marks the bill Paid |
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
npx wrangler secret put APP_PASSWORD    # password for the dashboard
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
4. Change `APP_PASSWORD` if you want a password only you two know.

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
src/db.ts       D1 queries
src/views.tsx   HTML pages (server-rendered, no frontend framework)
src/auth.ts     password login with a signed cookie
migrations/     database schema
```
