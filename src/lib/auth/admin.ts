/**
 * Admin session: HMAC-SHA256 signed token in an HttpOnly cookie.
 * Web Crypto only, so it works in both Node route handlers and the proxy.
 */
export const ADMIN_COOKIE = "mv_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function createAdminToken(secret: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const payload = `${exp}.${nonce}`;
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifyAdminToken(secret: string, token: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = await hmac(secret, `${expStr}.${nonce}`);
  return timingSafeEqual(expected, sig);
}

export function sessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}

/** Constant-time password compare (server only). */
export function passwordMatches(input: string, expected: string): boolean {
  if (!expected) return false;
  // Pad to same length to reduce timing leakage of length.
  const max = Math.max(input.length, expected.length);
  return timingSafeEqual(input.padEnd(max, "\0"), expected.padEnd(max, "\0")) && input.length === expected.length;
}
