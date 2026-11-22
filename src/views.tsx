import type { Child, FC } from "hono/jsx";
import type { BillWithTotals, TxnWithBill } from "./db";
import { billStatus, formatCents, percent } from "./matching";
import type { UpAccount, UpWebhook } from "./up";

const CSS = `
:root{--bg:#f6f5f2;--card:#fff;--text:#1d1d1b;--muted:#6b6a66;--line:#e4e2dc;--accent:#ff7a59;
--accent-ink:#fff;--ok:#2f9e62;--funded:#2f7de1;--bar:#ecebe6;--warn-bg:#fff4dc;--warn:#8a5a00;--danger:#c2412b}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1e1e1c;--text:#f0efea;--muted:#a3a19a;
--line:#33322f;--bar:#2c2b28;--warn-bg:#3a2f15;--warn:#f2c25b;--danger:#ff8c75}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:inherit}
header{display:flex;align-items:center;gap:14px;padding:14px 16px;border-bottom:1px solid var(--line)}
header .brand{font-weight:700;text-decoration:none;font-size:16px;white-space:nowrap}
header nav{display:flex;gap:12px;flex:1;min-width:0;overflow-x:auto;white-space:nowrap}
@media (max-width:420px){header .brand{display:none}}
header nav a{text-decoration:none;color:var(--muted)}
header nav a.on{color:var(--text);font-weight:600}
main{max-width:760px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:22px;margin:0 0 16px}
h2{font-size:17px;margin:28px 0 10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:12px}
.bill-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.bill-name{font-weight:650;font-size:16px;text-decoration:none}
.code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:var(--bar);padding:2px 7px;border-radius:6px;letter-spacing:.04em}
.bar{height:12px;border-radius:99px;background:var(--bar);overflow:hidden;margin:10px 0 6px}
.bar>span{display:block;height:100%;background:var(--accent);border-radius:99px;transition:width .4s}
.bar.funded>span{background:var(--funded)}.bar.paid>span{background:var(--ok)}
.meta{display:flex;justify-content:space-between;color:var(--muted);font-size:13px;gap:8px;flex-wrap:wrap}
.amount{font-variant-numeric:tabular-nums}
.badge{font-size:12px;font-weight:600;padding:2px 8px;border-radius:99px;background:var(--bar);color:var(--muted);white-space:nowrap}
.badge.funded{background:color-mix(in srgb,var(--funded) 18%,transparent);color:var(--funded)}
.badge.paid{background:color-mix(in srgb,var(--ok) 18%,transparent);color:var(--ok)}
.notice{background:var(--warn-bg);color:var(--warn);border-radius:10px;padding:10px 14px;margin-bottom:14px}
.flash{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:10px;padding:10px 14px;margin-bottom:14px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.spacer{flex:1}
button,.btn{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--text);padding:8px 14px;border-radius:10px;cursor:pointer;text-decoration:none;display:inline-block}
button.primary,.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600}
button.danger{color:var(--danger)}
button.link{border:none;background:none;padding:0;color:var(--muted);text-decoration:underline}
form.inline{display:inline}
label{display:block;font-weight:600;font-size:13px;margin:12px 0 4px}
input,select{font:inherit;width:100%;padding:9px 11px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text)}
.hint{color:var(--muted);font-size:13px;margin:4px 0 0}
table{width:100%;border-collapse:collapse;font-size:14px}
td,th{padding:9px 6px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.in{color:var(--ok)}.out{color:var(--danger)}
.muted{color:var(--muted)}
.empty{text-align:center;color:var(--muted);padding:30px 10px}
.txn-list .card{padding:12px 14px}
.txn-head{display:flex;justify-content:space-between;gap:10px}
.txn-sub{color:var(--muted);font-size:13px;word-break:break-word}
.assign{display:flex;gap:6px;margin-top:8px}
.assign select{flex:1}
`;

export const Layout: FC<{ title: string; nav?: string; children?: Child; flash?: string | null }> = (p) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light dark" />
      <title>{p.title} · Cogs Bills</title>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </head>
    <body>
      {p.nav !== undefined && (
        <header>
          <a class="brand" href="/">Cogs Bills</a>
          <nav>
            <a href="/" class={p.nav === "home" ? "on" : ""}>Bills</a>
            <a href="/transactions" class={p.nav === "txns" ? "on" : ""}>Transactions</a>
            <a href="/setup" class={p.nav === "setup" ? "on" : ""}>Setup</a>
          </nav>
          <form class="inline" method="post" action="/logout">
            <button class="link">Log out</button>
          </form>
        </header>
      )}
      <main>
        {p.flash && <div class="flash">{p.flash}</div>}
        {p.children}
      </main>
    </body>
  </html>
);

export const LoginPage: FC<{ error?: boolean }> = ({ error }) => (
  <Layout title="Log in">
    <div class="card" style="max-width:360px;margin:60px auto">
      <h1>Cogs Bills</h1>
      {error && <div class="notice">Wrong password.</div>}
      <form method="post" action="/login">
        <label for="pw">Password</label>
        <input id="pw" type="password" name="password" autofocus required autocomplete="current-password" />
        <div style="margin-top:14px">
          <button class="primary" type="submit">Log in</button>
        </div>
      </form>
    </div>
  </Layout>
);

const StatusBadge: FC<{ b: BillWithTotals }> = ({ b }) => {
  const s = billStatus(b.collected, b.amount_due, b.paid_out);
  const label = s === "paid" ? "Paid" : s === "funded" ? "Ready to pay" : "Collecting";
  return <span class={`badge ${s}`}>{label}</span>;
};

export const BillCard: FC<{ b: BillWithTotals }> = ({ b }) => {
  const s = billStatus(b.collected, b.amount_due, b.paid_out);
  const pct = s === "paid" ? 100 : percent(b.collected, b.amount_due);
  return (
    <div class="card">
      <div class="bill-top">
        <div>
          <a class="bill-name" href={`/bills/${b.id}`}>{b.name}</a>{" "}
          <span class="code">{b.code}</span>
        </div>
        <StatusBadge b={b} />
      </div>
      <div class={`bar ${s}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={`width:${pct}%`} />
      </div>
      <div class="meta">
        <span class="amount">
          <strong style="color:var(--text)">{formatCents(b.collected)}</strong> of {formatCents(b.amount_due)}
          {b.collected < b.amount_due && s !== "paid" && <> · {formatCents(b.amount_due - b.collected)} to go</>}
        </span>
        <span>
          {s === "paid" && b.paid_at ? `Paid ${fmtDate(b.paid_at)}` : b.due_date ? `Due ${fmtDate(b.due_date)}` : ""}
        </span>
      </div>
    </div>
  );
};

export const Dashboard: FC<{
  bills: BillWithTotals[];
  unmatched: number;
  accountName: string | null;
  lastSync: string | null;
  flash?: string | null;
}> = (p) => (
  <Layout title="Bills" nav="home" flash={p.flash}>
    {!p.accountName && (
      <div class="notice">
        No Up account connected yet. <a href="/setup">Go to Setup</a>.
      </div>
    )}
    {p.unmatched > 0 && (
      <div class="notice">
        {p.unmatched} payment{p.unmatched === 1 ? "" : "s"} didn't match a bill.{" "}
        <a href="/transactions">Sort them out</a>.
      </div>
    )}
    <div class="row" style="margin-bottom:14px">
      <h1 style="margin:0">Bills</h1>
      <span class="spacer" />
      <form class="inline" method="post" action="/sync">
        <button type="submit">Sync</button>
      </form>
      <a class="btn primary" href="/bills/new">+ New bill</a>
    </div>
    {p.bills.length === 0 ? (
      <div class="card empty">
        No bills yet. Add one, then ask your roommate to put its code in the transfer reference.
      </div>
    ) : (
      p.bills.map((b) => <BillCard b={b} />)
    )}
    <p class="hint">
      {p.accountName ? <>Watching <strong>{p.accountName}</strong>. </> : null}
      {p.lastSync ? `Last full sync ${fmtDateTime(p.lastSync)}.` : ""}{" "}
      <a href="/bills/archived">Archived bills</a>
    </p>
  </Layout>
);

export const ArchivedPage: FC<{ bills: BillWithTotals[] }> = ({ bills }) => (
  <Layout title="Archived bills" nav="home">
    <h1>Archived bills</h1>
    {bills.length === 0 ? <div class="card empty">Nothing archived.</div> : bills.map((b) => <BillCard b={b} />)}
  </Layout>
);

export const BillForm: FC<{
  bill?: { id?: number; name: string; code: string; amount: string; due_date: string };
  error?: string | null;
}> = ({ bill, error }) => {
  const editing = bill?.id !== undefined;
  return (
    <Layout title={editing ? "Edit bill" : "New bill"} nav="home">
      <h1>{editing ? "Edit bill" : "New bill"}</h1>
      {error && <div class="notice">{error}</div>}
      <form class="card" method="post" action={editing ? `/bills/${bill!.id}` : "/bills"}>
        <label for="name">Name</label>
        <input id="name" name="name" required maxlength={80} value={bill?.name ?? ""} placeholder="Electricity – December" />
        <label for="code">Reference code</label>
        <input id="code" name="code" required maxlength={18} value={bill?.code ?? ""} placeholder="ELEC" style="text-transform:uppercase" />
        <p class="hint">
          What goes in the bank transfer reference. Letters, numbers and hyphens. Keep it short, e.g. ELEC, WIFI,
          RENT-DEC.
        </p>
        <label for="amount">Amount to collect ($)</label>
        <input id="amount" name="amount" required inputmode="decimal" value={bill?.amount ?? ""} placeholder="200.00" />
        <label for="due">Due date (optional)</label>
        <input id="due" name="due_date" type="date" value={bill?.due_date ?? ""} />
        <div class="row" style="margin-top:16px">
          <button class="primary" type="submit">{editing ? "Save" : "Create bill"}</button>
          <a class="btn" href={editing ? `/bills/${bill!.id}` : "/"}>Cancel</a>
        </div>
      </form>
    </Layout>
  );
};

export const BillDetail: FC<{ b: BillWithTotals; txns: TxnWithBill[]; flash?: string | null }> = ({ b, txns, flash }) => (
  <Layout title={b.name} nav="home" flash={flash}>
    <BillCard b={b} />
    <div class="row">
      <a class="btn" href={`/bills/${b.id}/edit`}>Edit</a>
      <form class="inline" method="post" action={`/bills/${b.id}/archive`}>
        <input type="hidden" name="archived" value={b.archived ? "0" : "1"} />
        <button type="submit">{b.archived ? "Unarchive" : "Archive"}</button>
      </form>
      <span class="spacer" />
      <form class="inline" method="post" action={`/bills/${b.id}/delete`}
        onsubmit="return confirm('Delete this bill? Its payments will go back to Unmatched.')">
        <button class="danger" type="submit">Delete</button>
      </form>
    </div>
    <h2>Payments</h2>
    {txns.length === 0 ? (
      <div class="card empty">
        Nothing yet. Transfers with <span class="code">{b.code}</span> in the reference will show up here.
      </div>
    ) : (
      <div class="card" style="padding:4px 12px">
        <table>
          <thead><tr><th>Date</th><th>From / to</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            {txns.map((t) => (
              <tr>
                <td class="muted">{fmtDate(t.created_at)}</td>
                <td>
                  {t.description}
                  {t.message && <div class="txn-sub">“{t.message}”{t.manual ? " · assigned by hand" : ""}</div>}
                  {t.amount_cents < 0 && <div class="txn-sub">Bill payment</div>}
                </td>
                <td class={`num ${t.amount_cents > 0 ? "in" : "out"}`}>{formatCents(t.amount_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Layout>
);

export const TransactionsPage: FC<{
  txns: TxnWithBill[];
  bills: BillWithTotals[];
  view: "unmatched" | "all";
  flash?: string | null;
}> = ({ txns, bills, view, flash }) => (
  <Layout title="Transactions" nav="txns" flash={flash}>
    <div class="row" style="margin-bottom:14px">
      <h1 style="margin:0">{view === "unmatched" ? "Unmatched" : "All transactions"}</h1>
      <span class="spacer" />
      <a class="btn" href={view === "unmatched" ? "/transactions?view=all" : "/transactions"}>
        {view === "unmatched" ? "Show all" : "Show unmatched"}
      </a>
    </div>
    {view === "unmatched" && (
      <p class="hint" style="margin-bottom:14px">
        Payments whose reference didn't match a bill code (typos, cogs's own top-ups, etc). Pick the bill they belong to,
        or ignore them.
      </p>
    )}
    {txns.length === 0 ? (
      <div class="card empty">{view === "unmatched" ? "All sorted 🎉" : "No transactions yet. Try Sync on the Bills page."}</div>
    ) : (
      <div class="txn-list">
        {txns.map((t) => (
          <div class="card">
            <div class="txn-head">
              <div>
                <strong>{t.description}</strong>
                <div class="txn-sub">
                  {fmtDateTime(t.created_at)}
                  {t.message ? <> · ref “{t.message}”</> : " · no reference"}
                  {t.transfer_account_id ? " · from owner's own account" : ""}
                  {t.status === "HELD" ? " · pending" : ""}
                </div>
                {t.bill_name && (
                  <div class="txn-sub">
                    → {t.bill_name} <span class="code">{t.bill_code}</span>
                    {t.manual ? " (by hand)" : ""}
                  </div>
                )}
              </div>
              <div class={`num amount ${t.amount_cents > 0 ? "in" : "out"}`} style="white-space:nowrap;font-weight:600">
                {formatCents(t.amount_cents)}
              </div>
            </div>
            <form class="assign" method="post" action={`/transactions/${encodeURIComponent(t.id)}/assign`}>
              <input type="hidden" name="back" value={view} />
              <select name="bill_id" aria-label="Assign to bill">
                <option value="">— No bill —</option>
                {bills.map((b) => (
                  <option value={String(b.id)} selected={t.bill_id === b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
              <button type="submit">Save</button>
              {view === "unmatched" && (
                <button type="submit" name="ignore" value="1" class="link" style="padding:0 6px">Ignore</button>
              )}
            </form>
          </div>
        ))}
      </div>
    )}
  </Layout>
);

export const SetupPage: FC<{
  tokenSet: boolean;
  tokenError: string | null;
  accounts: UpAccount[];
  accountId: string | null;
  webhooks: UpWebhook[];
  webhookId: string | null;
  webhookUrl: string;
  lastPing: string | null;
  lastWebhook: string | null;
  lastSync: string | null;
  flash?: string | null;
}> = (p) => (
  <Layout title="Setup" nav="setup" flash={p.flash}>
    <h1>Setup</h1>

    <h2>1. Up token</h2>
    <div class="card">
      {!p.tokenSet ? (
        <p>
          <strong>Not set.</strong> Run <code>npx wrangler secret put UP_TOKEN</code> with the Personal Access Token from{" "}
          <a href="https://api.up.com.au" target="_blank" rel="noreferrer">api.up.com.au</a>.
        </p>
      ) : p.tokenError ? (
        <p class="out">Token is set but Up rejected it: {p.tokenError}</p>
      ) : (
        <p>✅ Connected to Up.</p>
      )}
    </div>

    <h2>2. Account to watch</h2>
    <div class="card">
      {p.accounts.length === 0 ? (
        <p class="muted">Connect a token first.</p>
      ) : (
        <form method="post" action="/setup/account">
          <label for="acct">Bills account (the Saver your roommate pays into)</label>
          <select id="acct" name="account_id">
            {p.accounts.map((a) => (
              <option value={a.id} selected={a.id === p.accountId}>
                {a.attributes.displayName} · {a.attributes.accountType.toLowerCase()} · {formatCents(a.attributes.balance.valueInBaseUnits)}
              </option>
            ))}
          </select>
          <p class="hint">Changing this deletes stored transactions from the previous account (bills are kept).</p>
          <div style="margin-top:12px"><button class="primary" type="submit">Use this account</button></div>
        </form>
      )}
    </div>

    <h2>3. Webhook</h2>
    <div class="card">
      <p class="hint" style="margin-top:0">
        Up will POST new transactions to <code>{p.webhookUrl}</code>
      </p>
      {p.webhookId ? (
        <>
          <p>✅ Registered (<code>{p.webhookId}</code>).</p>
          <p class="hint">
            Last ping: {p.lastPing ? fmtDateTime(p.lastPing) : "never"} · Last event: {p.lastWebhook ?? "none yet"}
          </p>
          <div class="row" style="margin-top:10px">
            <form class="inline" method="post" action="/setup/webhook/ping"><button>Send test ping</button></form>
          </div>
        </>
      ) : (
        <form method="post" action="/setup/webhook">
          <button class="primary" type="submit" disabled={!p.tokenSet || !p.accountId}>Register webhook</button>
          {!p.accountId && <p class="hint">Pick an account first.</p>}
        </form>
      )}
      {p.webhooks.length > 0 && (
        <>
          <h2 style="margin-top:18px">Webhooks on this Up token</h2>
          <table>
            <tbody>
              {p.webhooks.map((w) => (
                <tr>
                  <td>
                    <code style="word-break:break-all">{w.attributes.url}</code>
                    {w.id === p.webhookId && <span class="badge paid" style="margin-left:6px">this app</span>}
                  </td>
                  <td class="num">
                    <form class="inline" method="post" action={`/setup/webhook/${encodeURIComponent(w.id)}/delete`}
                      onsubmit="return confirm('Delete this webhook from Up?')">
                      <button class="danger">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="hint">Up allows a limited number of webhooks per token. Delete ones you no longer use.</p>
        </>
      )}
    </div>

    <h2>4. Backfill</h2>
    <div class="card">
      <p class="hint" style="margin-top:0">
        Pull past transactions (also runs daily for the last 14 days in case a webhook was missed).
        {p.lastSync ? ` Last sync ${fmtDateTime(p.lastSync)}.` : ""}
      </p>
      <form class="row" method="post" action="/sync">
        <select name="days" style="width:auto">
          <option value="14">Last 14 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
        </select>
        <input type="hidden" name="back" value="/setup" />
        <button type="submit" disabled={!p.accountId}>Sync now</button>
      </form>
    </div>
  </Layout>
);

function fmtDate(s: string): string {
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
}

function fmtDateTime(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("en-AU", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney",
  });
}
