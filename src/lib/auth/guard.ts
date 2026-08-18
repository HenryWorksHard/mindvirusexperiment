import "server-only";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "./admin";
import { rateLimit } from "@/lib/rate-limit";

export async function isAdminRequest(): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  const jar = await cookies();
  return verifyAdminToken(secret, jar.get(ADMIN_COOKIE)?.value);
}

/** For route handlers: returns a 401 response if not admin, else null. */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdminRequest()) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/** Runner endpoint guard: shared secret via header or bearer. */
export async function requireRunnerSecret(req: Request): Promise<NextResponse | null> {
  const expected = process.env.RUNNER_SECRET ?? "";
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-runner-secret") ??
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("secret");
  if (!expected || !provided || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

/** Public API rate limit: returns 429 response when exceeded. */
export async function publicRateLimit(bucket: string, limit = 60, windowMs = 60_000): Promise<NextResponse | null> {
  const ip = await clientIp();
  const ok = rateLimit(`${bucket}:${ip}`, limit, windowMs);
  if (ok) return null;
  return NextResponse.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": "60" } });
}
