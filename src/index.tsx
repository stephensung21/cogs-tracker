import { Hono } from "hono";
import { LOGO_SVG, isBillIcon } from "./art";
import { endSession, requireAdmin, requireLogin, roleForPassword, startSession, type AppEnv } from "./auth";
import {
  addManualEntry,
  codeInUse,
  countUnmatched,
  createBill,
  deleteBill,
  deleteManualEntry,
  deleteSetting,
  deleteTransactionsNotIn,
  dismissShortfall,
  getBill,
  getTransaction,
  kindForAmount,
  listAllBillsBrief,
  listBillEntries,
  getSetting,
  listBills,
  listTransactions,
  rematchUnassigned,
  rollOver,
  resetToAutomatic,
  setAllocations,
  setBillArchived,
  setIgnored,
  setMarkedPaid,
  setSetting,
  updateBill,
  type Env,
} from "./db";
import { normalizeCode, parseDollars, parseSplits } from "./matching";
import { isFrequency, sydneyDate } from "./periods";
import { handleUpWebhook, syncRecent, upClient } from "./sync";
import type { UpAccount, UpWebhook } from "./up";
import {
  ArchivedPage,
  BillDetail,
  BillForm,
  Dashboard,
  LoginPage,
  SetupPage,
  TransactionEdit,
  TransactionsPage,
} from "./views";

const app = new Hono<AppEnv>();

const WEBHOOK_PATH = "/webhooks/up";

// ---------- public routes ----------

// Up posts here. Authenticated by the HMAC signature, not the login cookie.
app.post(WEBHOOK_PATH, async (c) => {
  const raw = await c.req.text();
  try {
    const r = await handleUpWebhook(c.env, raw, c.req.header("X-Up-Authenticity-Signature") ?? null);
    return c.text(r.body, r.status);
  } catch (e) {
    console.error("webhook failed", e);
    return c.text("error", 500); // Up will retry
  }
});

app.get("/favicon.svg", (c) =>
  c.body(LOGO_SVG, 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" }),
);

app.get("/login", (c) => c.html(<LoginPage />));

app.post("/login", async (c) => {
  const form = await c.req.parseBody();
  const role = await roleForPassword(c.env, String(form.password ?? ""));
  if (role) {
    await startSession(c, role);
    return c.redirect("/");
  }
  return c.html(<LoginPage error />, 401);
});

app.post("/logout", (c) => {
  endSession(c);
  return c.redirect("/login");
});

// ---------- everything below needs login; admin-only areas need the admin role ----------

app.use("*", requireLogin);
for (const path of ["/sync", "/bills/new", "/bills/:id/edit", "/bills/:id/archive", "/bills/:id/delete", "/bills/:id/paid", "/bills/:id/entries", "/bills/:id/dismiss-shortfall", "/entries/*", "/transactions", "/transactions/*", "/setup", "/setup/*"]) {
  app.use(path, requireAdmin);
}
app.post("/bills", requireAdmin);
app.post("/bills/:id", requireAdmin);

const flash = (c: { req: { query: (k: string) => string | undefined } }) => c.req.query("msg") ?? null;
const withMsg = (path: string, msg: string) =>
  `${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`;

app.get("/", async (c) => {
  const [bills, unmatched, accountName, lastSync] = await Promise.all([
    listBills(c.env.DB),
    countUnmatched(c.env.DB),
    getSetting(c.env.DB, "account_name"),
    getSetting(c.env.DB, "last_sync"),
  ]);
  return c.html(
    <Dashboard role={c.get("role")} bills={bills} unmatched={unmatched} accountName={accountName} lastSync={lastSync} flash={flash(c)} />,
  );
});

app.post("/sync", async (c) => {
  const form = await c.req.parseBody();
  const days = Math.min(Math.max(Number(form.days) || 14, 1), 3650);
  const back = form.back === "/setup" ? "/setup" : "/";
  try {
    const { count } = await syncRecent(c.env, days);
    return c.redirect(withMsg(back, `Synced ${count} transaction${count === 1 ? "" : "s"} from the last ${days} days.`));
  } catch (e) {
    return c.redirect(withMsg(back, `Sync failed: ${(e as Error).message}`));
  }
});

// ---------- bills ----------

interface BillInput {
  name: string;
  code: string;
  amount: string;
  due_date: string;
  icon: string;
  frequency: string;
  approximate: boolean;
  usual_amount: string;
}

async function validateBill(env: Env, f: BillInput, exceptId?: number) {
  const name = f.name.trim();
  const code = normalizeCode(f.code);
  const amount_due = parseDollars(f.amount);
  const due_date = /^\d{4}-\d{2}-\d{2}$/.test(f.due_date) ? f.due_date : null;
  const frequency = isFrequency(f.frequency) ? f.frequency : null;
  if (!name) return { error: "Give the bill a name." };
  if (!code) return { error: "Reference code needs at least one letter or number." };
  if (amount_due === null) return { error: "Amount should look like 120 or 120.50." };
  if (frequency && !due_date) return { error: "A repeating bill needs a due date." };
  const usual_amount = f.usual_amount.trim() ? parseDollars(f.usual_amount) : amount_due;
  if (usual_amount === null) return { error: "Usual amount should look like 120 or 120.50." };
  if (await codeInUse(env.DB, code, exceptId))
    return { error: `Another active bill already uses ${code}. Archive it first or pick a different code.` };
  const icon = isBillIcon(f.icon) ? f.icon : null;
  return { value: { name, code, amount_due, due_date, icon, frequency, approximate: f.approximate, usual_amount } };
}

async function readBillForm(c: { req: { parseBody: () => Promise<Record<string, unknown>> } }): Promise<BillInput> {
  const f = await c.req.parseBody();
  return {
    name: String(f.name ?? ""),
    code: String(f.code ?? ""),
    amount: String(f.amount ?? ""),
    due_date: String(f.due_date ?? ""),
    icon: String(f.icon ?? ""),
    frequency: String(f.frequency ?? ""),
    approximate: f.approximate === "1",
    usual_amount: String(f.usual_amount ?? ""),
  };
}

app.get("/bills/new", (c) => c.html(<BillForm />));

app.post("/bills", async (c) => {
  const input = await readBillForm(c);
  const v = await validateBill(c.env, input);
  if (!v.value) return c.html(<BillForm bill={input} error={v.error} />, 400);
  await createBill(c.env.DB, v.value);
  const matched = await rematchUnassigned(c.env.DB);
  return c.redirect(
    withMsg("/", matched ? `Bill created and ${matched} earlier payment(s) matched to it.` : "Bill created."),
  );
});

app.get("/bills/archived", async (c) =>
  c.html(<ArchivedPage role={c.get("role")} bills={await listBills(c.env.DB, true)} />),
);

app.get("/bills/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await getBill(c.env.DB, id);
  if (!b) return c.notFound();
  const entries = await listBillEntries(c.env.DB, id);
  return c.html(<BillDetail role={c.get("role")} b={b} entries={entries} flash={flash(c)} />);
});

app.get("/bills/:id/edit", async (c) => {
  const b = await getBill(c.env.DB, Number(c.req.param("id")));
  if (!b) return c.notFound();
  return c.html(
    <BillForm
      bill={{
        id: b.id,
        name: b.name,
        code: b.code,
        amount: (b.amount_due / 100).toFixed(2),
        due_date: b.due_date ?? "",
        icon: b.icon,
        frequency: b.frequency ?? "",
        approximate: b.approximate === 1,
        usual_amount: ((b.usual_amount ?? b.amount_due) / 100).toFixed(2),
      }}
    />,
  );
});

app.post("/bills/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await getBill(c.env.DB, id))) return c.notFound();
  const input = await readBillForm(c);
  const v = await validateBill(c.env, input, id);
  if (!v.value) return c.html(<BillForm bill={{ ...input, id }} error={v.error} />, 400);
  await updateBill(c.env.DB, id, v.value);
  await rematchUnassigned(c.env.DB);
  return c.redirect(withMsg(`/bills/${id}`, "Saved."));
});

app.post("/bills/:id/archive", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await getBill(c.env.DB, id);
  if (!b) return c.notFound();
  const archive = (await c.req.parseBody()).archived === "1";
  if (!archive && (await codeInUse(c.env.DB, b.code, id))) {
    return c.redirect(withMsg(`/bills/${id}`, `Can't unarchive: another active bill uses ${b.code}.`));
  }
  await setBillArchived(c.env.DB, id, archive);
  return c.redirect(withMsg(archive ? "/" : `/bills/${id}`, archive ? `Archived ${b.name}.` : "Unarchived."));
});

app.post("/bills/:id/delete", async (c) => {
  await deleteBill(c.env.DB, Number(c.req.param("id")));
  return c.redirect(withMsg("/", "Bill deleted."));
});

// ---------- bill overrides (admin) ----------

app.post("/bills/:id/dismiss-shortfall", async (c) => {
  await dismissShortfall(c.env.DB, Number(c.req.param("id")));
  return c.redirect(withMsg("/", "Warning dismissed."));
});

app.post("/bills/:id/paid", async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await getBill(c.env.DB, id))) return c.notFound();
  const paid = (await c.req.parseBody()).paid === "1";
  await setMarkedPaid(c.env.DB, id, paid);
  return c.redirect(withMsg(`/bills/${id}`, paid ? "Marked as paid." : "No longer marked as paid."));
});

app.post("/bills/:id/entries", async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await getBill(c.env.DB, id))) return c.notFound();
  const f = await c.req.parseBody();
  const amount = parseDollars(String(f.amount ?? ""));
  if (amount === null) return c.redirect(withMsg(`/bills/${id}`, "That amount didn't look right. Try something like 50 or 50.00."));
  const dateStr = String(f.date ?? "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T12:00:00.000Z` : new Date().toISOString();
  const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;
  await addManualEntry(c.env.DB, {
    bill_id: id,
    amount_cents: amount,
    kind: f.kind === "out" ? "out" : "in",
    payer: clean(f.payer, 60),
    note: clean(f.note, 140),
    date,
  });
  return c.redirect(withMsg(`/bills/${id}`, "Manual entry added."));
});

app.post("/entries/:id/delete", async (c) => {
  const billId = await deleteManualEntry(c.env.DB, Number(c.req.param("id")));
  return c.redirect(billId ? withMsg(`/bills/${billId}`, "Entry deleted.") : "/");
});

// ---------- transactions (admin) ----------

app.get("/transactions", async (c) => {
  const view = c.req.query("view") === "all" ? "all" : "unmatched";
  const [txns, bills] = await Promise.all([listTransactions(c.env.DB, view), listAllBillsBrief(c.env.DB)]);
  return c.html(<TransactionsPage txns={txns} bills={bills} view={view} flash={flash(c)} />);
});

app.get("/transactions/:id", async (c) => {
  const t = await getTransaction(c.env.DB, c.req.param("id"));
  if (!t) return c.notFound();
  return c.html(<TransactionEdit t={t} bills={await listAllBillsBrief(c.env.DB)} flash={flash(c)} />);
});

/** Quick assign from the list: the whole payment to one bill (or none). */
app.post("/transactions/:id/assign", async (c) => {
  const t = await getTransaction(c.env.DB, c.req.param("id"));
  if (!t) return c.notFound();
  const f = await c.req.parseBody();
  const back = f.back === "all" ? "/transactions?view=all" : "/transactions";
  const billId = f.bill_id ? Number(f.bill_id) : null;
  const splits = billId
    ? [{ bill_id: billId, amount_cents: Math.abs(t.amount_cents), kind: kindForAmount(t.amount_cents) }]
    : [];
  await setAllocations(c.env.DB, t, splits, null);
  return c.redirect(withMsg(back, billId ? "Assigned." : "Removed from its bill."));
});

/** Full override: split across bills and/or switch between money-in and bill payment. */
app.post("/transactions/:id/split", async (c) => {
  const t = await getTransaction(c.env.DB, c.req.param("id"));
  if (!t) return c.notFound();
  const f = await c.req.parseBody({ all: true });
  const list = (v: unknown) => (Array.isArray(v) ? v : v === undefined ? [] : [v]).map((x) => String(x));
  const bills = list(f.bill), amounts = list(f.amount), kinds = list(f.kind);
  const rows = bills.map((bill, i) => ({ bill, amount: amounts[i] ?? "", kind: kinds[i] ?? "in" }));
  const parsed = parseSplits(rows, Math.abs(t.amount_cents));
  if ("error" in parsed) {
    return c.html(<TransactionEdit t={t} bills={await listAllBillsBrief(c.env.DB)} error={parsed.error} />, 400);
  }
  const note = String(Array.isArray(f.note) ? f.note[0] : f.note ?? "").trim().slice(0, 140) || null;
  await setAllocations(c.env.DB, t, parsed.splits, note);
  return c.redirect(withMsg(`/transactions/${encodeURIComponent(t.id)}`, "Saved. This payment is now set by hand."));
});

app.post("/transactions/:id/reset", async (c) => {
  const id = c.req.param("id");
  await resetToAutomatic(c.env.DB, id);
  return c.redirect(withMsg(`/transactions/${encodeURIComponent(id)}`, "Back to automatic matching."));
});

app.post("/transactions/:id/ignore", async (c) => {
  const id = c.req.param("id");
  const ignored = (await c.req.parseBody()).ignored === "1";
  await setIgnored(c.env.DB, id, ignored);
  if (!ignored) await resetToAutomatic(c.env.DB, id);
  return c.redirect(withMsg(ignored ? "/transactions" : `/transactions/${encodeURIComponent(id)}`, ignored ? "Ignored." : "No longer ignored."));
});

// ---------- setup ----------

app.get("/setup", async (c) => {
  const db = c.env.DB;
  const [accountId, webhookId, lastPing, lastWebhook, lastSync] = await Promise.all([
    getSetting(db, "account_id"),
    getSetting(db, "webhook_id"),
    getSetting(db, "last_ping"),
    getSetting(db, "last_webhook"),
    getSetting(db, "last_sync"),
  ]);
  let accounts: UpAccount[] = [];
  let webhooks: UpWebhook[] = [];
  let tokenError: string | null = null;
  if (c.env.UP_TOKEN) {
    try {
      const up = upClient(c.env);
      [accounts, webhooks] = await Promise.all([up.listAccounts(), up.listWebhooks()]);
    } catch (e) {
      tokenError = (e as Error).message;
    }
  }
  return c.html(
    <SetupPage
      tokenSet={!!c.env.UP_TOKEN}
      viewerSet={!!c.env.VIEWER_PASSWORD}
      tokenError={tokenError}
      accounts={accounts}
      accountId={accountId}
      webhooks={webhooks}
      webhookId={webhookId}
      webhookUrl={new URL(WEBHOOK_PATH, c.req.url).toString()}
      lastPing={lastPing}
      lastWebhook={lastWebhook}
      lastSync={lastSync}
      flash={flash(c)}
    />,
  );
});

app.post("/setup/account", async (c) => {
  const id = String((await c.req.parseBody()).account_id ?? "");
  const accounts = await upClient(c.env).listAccounts();
  const acct = accounts.find((a) => a.id === id);
  if (!acct) return c.redirect(withMsg("/setup", "That account wasn't found on this token."));
  const previous = await getSetting(c.env.DB, "account_id");
  await setSetting(c.env.DB, "account_id", acct.id);
  await setSetting(c.env.DB, "account_name", acct.attributes.displayName);
  if (previous && previous !== acct.id) {
    await deleteTransactionsNotIn(c.env.DB, acct.id);
    await deleteSetting(c.env.DB, "last_sync");
  }
  return c.redirect(withMsg("/setup", `Now watching ${acct.attributes.displayName}. Run a backfill to pull its history.`));
});

app.post("/setup/webhook", async (c) => {
  const url = new URL(WEBHOOK_PATH, c.req.url).toString();
  if (!url.startsWith("https://")) {
    return c.redirect(withMsg("/setup", "Up needs a public https URL. Deploy first, then register from the live site."));
  }
  try {
    const wh = await upClient(c.env).createWebhook(url, "cogs-tracker bills");
    if (!wh.attributes.secretKey) throw new Error("Up didn't return a secret key");
    await setSetting(c.env.DB, "webhook_id", wh.id);
    await setSetting(c.env.DB, "webhook_secret", wh.attributes.secretKey);
    return c.redirect(withMsg("/setup", "Webhook registered. Send a test ping to check it works."));
  } catch (e) {
    return c.redirect(withMsg("/setup", `Couldn't register webhook: ${(e as Error).message}`));
  }
});

app.post("/setup/webhook/ping", async (c) => {
  const id = await getSetting(c.env.DB, "webhook_id");
  if (!id) return c.redirect("/setup");
  try {
    await upClient(c.env).pingWebhook(id);
    return c.redirect(withMsg("/setup", "Ping sent. Refresh in a few seconds; 'Last ping' should update."));
  } catch (e) {
    return c.redirect(withMsg("/setup", `Ping failed: ${(e as Error).message}`));
  }
});

app.post("/setup/webhook/:id/delete", async (c) => {
  const id = c.req.param("id");
  try {
    await upClient(c.env).deleteWebhook(id);
  } catch (e) {
    return c.redirect(withMsg("/setup", `Couldn't delete: ${(e as Error).message}`));
  }
  if ((await getSetting(c.env.DB, "webhook_id")) === id) {
    await deleteSetting(c.env.DB, "webhook_id", "webhook_secret", "last_ping");
  }
  return c.redirect(withMsg("/setup", "Webhook deleted."));
});

export default {
  fetch: app.fetch,
  // Daily safety net in case a webhook delivery was missed.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        try {
          const n = await rollOver(env.DB, sydneyDate(new Date()));
          if (n) console.log(`cron rollover: ${n} new period(s)`);
        } catch (e) {
          console.error("cron rollover failed", e);
        }
        if (!(await getSetting(env.DB, "account_id"))) return;
        try {
          const r = await syncRecent(env, 14);
          console.log(`cron sync: ${r.count} transactions`);
        } catch (e) {
          console.error("cron sync failed", e);
        }
      })(),
    );
  },
};

export { app };
