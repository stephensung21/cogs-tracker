import { Hono } from "hono";
import { checkPassword, endSession, requireLogin, startSession } from "./auth";
import {
  assignTransaction,
  codeInUse,
  countUnmatched,
  createBill,
  deleteBill,
  deleteSetting,
  deleteTransactionsNotIn,
  getBill,
  getSetting,
  listBills,
  listTransactions,
  rematchUnassigned,
  setBillArchived,
  setIgnored,
  setSetting,
  updateBill,
  type Env,
} from "./db";
import { normalizeCode, parseDollars } from "./matching";
import { handleUpWebhook, syncRecent, upClient } from "./sync";
import type { UpAccount, UpWebhook } from "./up";
import {
  ArchivedPage,
  BillDetail,
  BillForm,
  Dashboard,
  LoginPage,
  SetupPage,
  TransactionsPage,
} from "./views";

const app = new Hono<{ Bindings: Env }>();

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

app.get("/login", (c) => c.html(<LoginPage />));

app.post("/login", async (c) => {
  const form = await c.req.parseBody();
  if (await checkPassword(c.env, String(form.password ?? ""))) {
    await startSession(c);
    return c.redirect("/");
  }
  return c.html(<LoginPage error />, 401);
});

app.post("/logout", (c) => {
  endSession(c);
  return c.redirect("/login");
});

// ---------- everything below needs login ----------

app.use("*", requireLogin);

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
    <Dashboard bills={bills} unmatched={unmatched} accountName={accountName} lastSync={lastSync} flash={flash(c)} />,
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
}

async function validateBill(env: Env, f: BillInput, exceptId?: number) {
  const name = f.name.trim();
  const code = normalizeCode(f.code);
  const amount_due = parseDollars(f.amount);
  const due_date = /^\d{4}-\d{2}-\d{2}$/.test(f.due_date) ? f.due_date : null;
  if (!name) return { error: "Give the bill a name." };
  if (!code) return { error: "Reference code needs at least one letter or number." };
  if (amount_due === null) return { error: "Amount should look like 120 or 120.50." };
  if (await codeInUse(env.DB, code, exceptId))
    return { error: `Another active bill already uses ${code}. Archive it first or pick a different code.` };
  return { value: { name, code, amount_due, due_date } };
}

async function readBillForm(c: { req: { parseBody: () => Promise<Record<string, unknown>> } }): Promise<BillInput> {
  const f = await c.req.parseBody();
  return {
    name: String(f.name ?? ""),
    code: String(f.code ?? ""),
    amount: String(f.amount ?? ""),
    due_date: String(f.due_date ?? ""),
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

app.get("/bills/archived", async (c) => c.html(<ArchivedPage bills={await listBills(c.env.DB, true)} />));

app.get("/bills/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await getBill(c.env.DB, id);
  if (!b) return c.notFound();
  const txns = await listTransactions(c.env.DB, { billId: id });
  return c.html(<BillDetail b={b} txns={txns} flash={flash(c)} />);
});

app.get("/bills/:id/edit", async (c) => {
  const b = await getBill(c.env.DB, Number(c.req.param("id")));
  if (!b) return c.notFound();
  return c.html(
    <BillForm
      bill={{ id: b.id, name: b.name, code: b.code, amount: (b.amount_due / 100).toFixed(2), due_date: b.due_date ?? "" }}
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

// ---------- transactions ----------

app.get("/transactions", async (c) => {
  const view = c.req.query("view") === "all" ? "all" : "unmatched";
  const [txns, bills] = await Promise.all([listTransactions(c.env.DB, view), listBills(c.env.DB)]);
  return c.html(<TransactionsPage txns={txns} bills={bills} view={view} flash={flash(c)} />);
});

app.post("/transactions/:id/assign", async (c) => {
  const id = c.req.param("id");
  const f = await c.req.parseBody();
  const back = f.back === "all" ? "/transactions?view=all" : "/transactions";
  if (f.ignore === "1") {
    await setIgnored(c.env.DB, id, true);
    return c.redirect(withMsg(back, "Ignored."));
  }
  const billId = f.bill_id ? Number(f.bill_id) : null;
  await assignTransaction(c.env.DB, id, billId);
  return c.redirect(withMsg(back, billId ? "Assigned." : "Removed from bill."));
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
