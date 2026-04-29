import "server-only";
import { cookies } from "next/headers";
import { serverEnv } from "./env";

/**
 * Server-side fetch helper for the API. Forwards browser cookies so both auth
 * providers work without branching here:
 *  - Dev mode: the signed `__shearsimp_dev_session` cookie reaches the api,
 *    where DevAuthProvider verifies it.
 *  - Clerk mode: the `__session` cookie reaches the api, where
 *    ClerkAuthProvider passes it to `@clerk/backend`'s authenticateRequest.
 *
 * Pass `data` to send a JSON body. Throws ApiError on non-2xx so callers can
 * surface validation issues to the form. Server-only — never bundle this into
 * a client component.
 */
export async function apiFetch<T>(
  path: string,
  init: { method?: string; data?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const url = new URL(path, serverEnv.apiInternalUrl);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }

  const cookieHeader = await buildCookieHeader();
  const headers: Record<string, string> = { cookie: cookieHeader };
  let body: string | undefined;
  if (init.data !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.data);
  }

  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      payload = await res.text();
    }
    throw new ApiError(res.status, payload);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

async function buildCookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  constructor(status: number, payload: unknown) {
    super(`API ${status}`);
    this.status = status;
    this.payload = payload;
  }

  // Helper for surfacing Zod-style validation errors back to a form.
  fieldMessages(): Record<string, string> | null {
    const p = this.payload as
      | { issues?: Array<{ path?: string; message?: string }> }
      | undefined;
    if (!p?.issues) return null;
    const map: Record<string, string> = {};
    for (const issue of p.issues) {
      if (issue.path && issue.message) {
        map[issue.path] = issue.message;
      }
    }
    return map;
  }

  topMessage(): string {
    const p = this.payload as
      | { message?: string; error?: string }
      | undefined;
    return p?.message ?? p?.error ?? `Request failed (${this.status})`;
  }
}
