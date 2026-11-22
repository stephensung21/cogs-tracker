import { deleteTransaction, getSetting, setSetting, upsertTransactions, type Env } from "./db";
import { UpClient, verifyUpSignature, type UpWebhookEvent } from "./up";

export function upClient(env: Env): UpClient {
  if (!env.UP_TOKEN) throw new Error("UP_TOKEN secret is not set");
  return new UpClient(env.UP_TOKEN, env.UP_API_BASE || undefined);
}

/** Pull recent transactions for the watched account. Used by the daily cron and the "Sync" button. */
export async function syncRecent(env: Env, days: number): Promise<{ count: number }> {
  const accountId = await getSetting(env.DB, "account_id");
  if (!accountId) throw new Error("No account selected yet - pick one on the Setup page");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const txns = await upClient(env).listAccountTransactions(accountId, since);
  await upsertTransactions(env.DB, txns);
  await setSetting(env.DB, "last_sync", new Date().toISOString());
  return { count: txns.length };
}

export type WebhookResult =
  | { status: 401; body: string }
  | { status: 200; body: string };

/** Handle one delivery from Up. Returns the HTTP status to send back (non-2xx makes Up retry). */
export async function handleUpWebhook(
  env: Env,
  rawBody: string,
  signature: string | null,
): Promise<WebhookResult> {
  const secret = await getSetting(env.DB, "webhook_secret");
  if (!secret || !(await verifyUpSignature(rawBody, signature, secret))) {
    return { status: 401, body: "bad signature" };
  }

  const event = JSON.parse(rawBody) as UpWebhookEvent;
  const type = event.data.attributes.eventType;
  await setSetting(env.DB, "last_webhook", `${new Date().toISOString()} ${type}`);

  if (type === "PING") {
    await setSetting(env.DB, "last_ping", new Date().toISOString());
    return { status: 200, body: "pong" };
  }

  const txnId = event.data.relationships.transaction?.data.id;
  if (!txnId) return { status: 200, body: "no transaction" };

  if (type === "TRANSACTION_DELETED") {
    await deleteTransaction(env.DB, txnId);
    return { status: 200, body: "deleted" };
  }

  // TRANSACTION_CREATED / TRANSACTION_SETTLED: the event only has the id, so fetch the details.
  const txn = await upClient(env).getTransaction(txnId);
  if (!txn) return { status: 200, body: "transaction not found" };

  const watched = await getSetting(env.DB, "account_id");
  if (txn.relationships.account.data.id !== watched) {
    return { status: 200, body: "ignored: different account" };
  }

  await upsertTransactions(env.DB, [txn]);
  return { status: 200, body: "ok" };
}
