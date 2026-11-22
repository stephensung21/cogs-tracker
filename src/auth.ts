import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { Env } from "./db";
import { hmacHex } from "./up";

/**
 * Two roles, each with its own password:
 *   admin  (ADMIN_PASSWORD)  - cogs: everything
 *   viewer (VIEWER_PASSWORD) - roommate: can see bills and payments, can't change anything
 * The role is stored in a signed cookie and checked on the server for every admin route.
 */
export type Role = "admin" | "viewer";
export type AppEnv = { Bindings: Env; Variables: { role: Role } };

const COOKIE = "cogs_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function same(env: Env, a: string, b: string | undefined): Promise<boolean> {
  if (!b) return false;
  // Compare HMACs so the comparison doesn't leak anything via timing.
  const key = env.SESSION_SECRET || "x";
  return (await hmacHex(key, a)) === (await hmacHex(key, b));
}

export async function roleForPassword(env: Env, attempt: string): Promise<Role | null> {
  if (!attempt) return null;
  if (await same(env, attempt, env.ADMIN_PASSWORD)) return "admin";
  if (await same(env, attempt, env.VIEWER_PASSWORD)) return "viewer";
  return null;
}

export async function startSession(c: Context<AppEnv>, role: Role): Promise<void> {
  await setSignedCookie(c, COOKIE, `${role}.${Date.now()}`, c.env.SESSION_SECRET, {
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

export const requireLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.env.SESSION_SECRET || !c.env.ADMIN_PASSWORD) {
    return c.text("ADMIN_PASSWORD and SESSION_SECRET secrets must be set. See README.", 500);
  }
  const v = await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE);
  const [role, issuedStr] = (v || "").split(".");
  const issued = Number(issuedStr);
  if ((role !== "admin" && role !== "viewer") || !Number.isFinite(issued) || Date.now() - issued > MAX_AGE * 1000) {
    return c.redirect("/login");
  }
  // If the viewer password is removed, existing viewer sessions stop working.
  if (role === "viewer" && !c.env.VIEWER_PASSWORD) return c.redirect("/login");
  c.set("role", role);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("role") !== "admin") {
    if (c.req.method === "GET") return c.redirect("/");
    return c.text("Only the admin can do that.", 403);
  }
  await next();
};
