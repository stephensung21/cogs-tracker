import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { Env } from "./db";
import { hmacHex } from "./up";

const COOKIE = "cogs_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function checkPassword(env: Env, attempt: string): Promise<boolean> {
  if (!env.APP_PASSWORD) return false;
  // Compare HMACs so the comparison doesn't leak the password length/content via timing.
  const key = env.SESSION_SECRET || "x";
  return (await hmacHex(key, attempt)) === (await hmacHex(key, env.APP_PASSWORD));
}

export async function startSession(c: Context<{ Bindings: Env }>): Promise<void> {
  await setSignedCookie(c, COOKIE, String(Date.now()), c.env.SESSION_SECRET, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function endSession(c: Context): void {
  deleteCookie(c, COOKIE, { path: "/" });
}

export const requireLogin: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (!c.env.SESSION_SECRET || !c.env.APP_PASSWORD) {
    return c.text("APP_PASSWORD and SESSION_SECRET secrets must be set. See README.", 500);
  }
  const v = await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE);
  const issued = v ? Number(v) : NaN;
  if (!Number.isFinite(issued) || Date.now() - issued > MAX_AGE * 1000) {
    return c.redirect("/login");
  }
  await next();
};
