// Server-only. Mirrors the cookie format used by apps/api's DevAuthProvider
// so the same DEV_AUTH_SECRET works on both sides. If you change the
// signing scheme here, update apps/api/src/auth/dev-auth.provider.ts to match.

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const DEV_SESSION_COOKIE = "__shearsimp_dev_session";

export interface DevSessionPayload {
  userId: string;
  email: string;
  salonId: string;
  salonSlug: string;
  iat: number;
}

export function signDevSession(
  payload: Omit<DevSessionPayload, "iat">,
  secret: string,
): string {
  const full: DevSessionPayload = { ...payload, iat: Date.now() };
  const body = base64UrlEncode(Buffer.from(JSON.stringify(full)));
  const sig = base64UrlEncode(hmac(body, secret));
  return `${body}.${sig}`;
}

export function verifyDevSession(
  cookie: string,
  secret: string,
): DevSessionPayload | null {
  const parts = cookie.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];

  const expected = base64UrlEncode(hmac(body, secret));
  if (!constantTimeEqual(sig, expected)) return null;

  try {
    const json = Buffer.from(base64UrlDecode(body)).toString("utf8");
    const parsed = JSON.parse(json) as DevSessionPayload;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.salonId !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function hmac(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLen), "base64");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
