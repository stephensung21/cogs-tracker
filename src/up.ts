// Minimal client for the Up Bank API (https://developer.up.com.au).

export interface UpMoney {
  currencyCode: string;
  value: string;
  valueInBaseUnits: number;
}

export interface UpTransaction {
  type: "transactions";
  id: string;
  attributes: {
    status: "HELD" | "SETTLED";
    rawText: string | null;
    description: string;
    message: string | null;
    amount: UpMoney;
    createdAt: string;
    settledAt?: string | null;
  };
  relationships: {
    account: { data: { type: "accounts"; id: string } };
    transferAccount?: { data: { type: "accounts"; id: string } | null };
  };
}

export interface UpAccount {
  type: "accounts";
  id: string;
  attributes: {
    displayName: string;
    accountType: "SAVER" | "TRANSACTIONAL" | "HOME_LOAN";
    ownershipType: "INDIVIDUAL" | "JOINT";
    balance: UpMoney;
  };
}

export interface UpWebhook {
  type: "webhooks";
  id: string;
  attributes: { url: string; description: string | null; secretKey?: string; createdAt: string };
}

export interface UpWebhookEvent {
  data: {
    type: "webhook-events";
    id: string;
    attributes: {
      eventType: "TRANSACTION_CREATED" | "TRANSACTION_SETTLED" | "TRANSACTION_DELETED" | "PING";
      createdAt: string;
    };
    relationships: {
      webhook: { data: { type: "webhooks"; id: string } };
      transaction?: { data: { type: "transactions"; id: string } };
    };
  };
}

export class UpApiError extends Error {
  constructor(public status: number, body: string) {
    super(`Up API ${status}: ${body.slice(0, 300)}`);
  }
}

export class UpClient {
  constructor(private token: string, private base = "https://api.up.com.au/api/v1") {}

  private async request<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : this.base + pathOrUrl;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    if (!res.ok) throw new UpApiError(res.status, text);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async ping(): Promise<boolean> {
    await this.request("/util/ping");
    return true;
  }

  async listAccounts(): Promise<UpAccount[]> {
    return this.paginate<UpAccount>("/accounts?page[size]=100");
  }

  async getTransaction(id: string): Promise<UpTransaction | null> {
    try {
      const r = await this.request<{ data: UpTransaction }>(`/transactions/${encodeURIComponent(id)}`);
      return r.data;
    } catch (e) {
      if (e instanceof UpApiError && e.status === 404) return null;
      throw e;
    }
  }

  async listAccountTransactions(accountId: string, since?: Date): Promise<UpTransaction[]> {
    const params = new URLSearchParams({ "page[size]": "100" });
    if (since) params.set("filter[since]", since.toISOString());
    return this.paginate<UpTransaction>(
      `/accounts/${encodeURIComponent(accountId)}/transactions?${params}`,
    );
  }

  async listWebhooks(): Promise<UpWebhook[]> {
    return this.paginate<UpWebhook>("/webhooks?page[size]=50");
  }

  async createWebhook(url: string, description: string): Promise<UpWebhook> {
    const r = await this.request<{ data: UpWebhook }>("/webhooks", {
      method: "POST",
      body: JSON.stringify({ data: { attributes: { url, description } } }),
    });
    return r.data;
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.request(`/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async pingWebhook(id: string): Promise<void> {
    await this.request(`/webhooks/${encodeURIComponent(id)}/ping`, { method: "POST" });
  }

  private async paginate<T>(first: string, maxPages = 50): Promise<T[]> {
    const out: T[] = [];
    let next: string | null = first;
    for (let i = 0; next && i < maxPages; i++) {
      const page: { data: T[]; links?: { next: string | null } } = await this.request(next);
      out.push(...page.data);
      next = page.links?.next ?? null;
    }
    return out;
  }
}

/** Up signs each webhook delivery: hex(HMAC-SHA256(secretKey, rawBody)). */
export async function verifyUpSignature(
  rawBody: string,
  signature: string | null | undefined,
  secretKey: string,
): Promise<boolean> {
  if (!signature || !secretKey) return false;
  const expected = await hmacHex(secretKey, rawBody);
  return timingSafeEqual(expected, signature.trim().toLowerCase());
}

export async function hmacHex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
