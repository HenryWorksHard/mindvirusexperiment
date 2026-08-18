import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE, createAdminToken, passwordMatches, sessionTtlSeconds } from "@/lib/auth/admin";
import { clientIp } from "@/lib/auth/guard";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({ password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const ip = await clientIp();
  if (!rateLimit(`login:${ip}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: "too many attempts, try later" }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const expected = process.env.ADMIN_PASSWORD ?? "";
  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  if (!expected || !secret || expected.length < 8) {
    return NextResponse.json({ error: "admin not configured (ADMIN_PASSWORD / ADMIN_SESSION_SECRET)" }, { status: 500 });
  }
  // constant-ish time
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 250));
  if (!passwordMatches(parsed.data.password, expected)) {
    return NextResponse.json({ error: "invalid password" }, { status: 401 });
  }
  const token = await createAdminToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSeconds(),
  });
  return res;
}
