import { Injectable, Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { env } from "../env";
import type { AuthIdentity } from "../context/request-context";
import type { AuthProvider } from "./auth-provider.interface";

export const DEV_SESSION_COOKIE = "__shearsimp_dev_session";

interface DevSessionPayload {
  userId: string;
  email: string;
  salonId: string;
  salonSlug: string;
  iat: number;
}

/**
 * Local-development identity provider. The web app's `/api/dev-sign-in` route
 * writes a signed cookie; this provider verifies it.
 *
 * Format: `<base64url(json)>.<base64url(hmac-sha256)>`. Symmetric — both web
 * and api sign with DEV_AUTH_SECRET.
 *
 * Not safe for production. Refuses to run when NODE_ENV=production.
 */
@Injectable()
export class DevAuthProvider implements AuthProvider {
  private readonly logger = new Logger(DevAuthProvider.name);

  async authenticate(req: Request): Promise<AuthIdentity | null> {
    if (env.NODE_ENV === "production") {
      throw new Error("DevAuthProvider must not run in production");
    }

    const raw = req.cookies?.[DEV_SESSION_COOKIE];
    if (typeof raw !== "string" || raw.length === 0) {
      return null;
    }

    const payload = verifyDevSession(raw, env.DEV_AUTH_SECRET);
    if (!payload) {
      this.logger.warn("Rejected malformed dev session cookie");
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email ?? null,
      salonHint: { salonId: payload.salonId, slug: payload.salonSlug },
    };
  }
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
