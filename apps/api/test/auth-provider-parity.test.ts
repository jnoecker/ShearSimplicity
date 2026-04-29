import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";

import {
  DEV_SESSION_COOKIE,
  DevAuthProvider,
  signDevSession,
} from "../src/auth/dev-auth.provider";
import { env } from "../src/env";

// Clerk's createClerkClient is mocked at the module boundary so the test
// never reaches the network. We test the provider's translation logic only.
vi.mock("@clerk/backend", () => {
  return {
    createClerkClient: vi.fn(),
  };
});

const USER_ID = "11111111-1111-1111-1111-111111111111";
const SALON_ID = "22222222-2222-2222-2222-222222222222";

function fakeRequest(overrides: Partial<Request> = {}): Request {
  return {
    cookies: {},
    headers: { host: "localhost:3001" },
    method: "GET",
    originalUrl: "/health",
    protocol: "http",
    get: (h: string) => (h.toLowerCase() === "host" ? "localhost:3001" : undefined),
    header: (h: string) =>
      (h.toLowerCase() === "host" ? "localhost:3001" : undefined),
    ...overrides,
  } as unknown as Request;
}

describe("AuthProvider parity", () => {
  it("DevAuthProvider returns an AuthIdentity from a valid signed cookie", async () => {
    const provider = new DevAuthProvider();
    const cookie = signDevSession(
      {
        userId: USER_ID,
        email: "owner@example.com",
        salonId: SALON_ID,
        salonSlug: "test-salon",
      },
      env.DEV_AUTH_SECRET,
    );
    const req = fakeRequest({ cookies: { [DEV_SESSION_COOKIE]: cookie } });

    const identity = await provider.authenticate(req);

    expect(identity).toEqual({
      userId: USER_ID,
      email: "owner@example.com",
      salonHint: { salonId: SALON_ID, slug: "test-salon" },
    });
  });

  it("DevAuthProvider returns null when the cookie is missing", async () => {
    const provider = new DevAuthProvider();
    const identity = await provider.authenticate(fakeRequest());
    expect(identity).toBeNull();
  });

  it("DevAuthProvider rejects a tampered cookie", async () => {
    const provider = new DevAuthProvider();
    const cookie = signDevSession(
      {
        userId: USER_ID,
        email: "owner@example.com",
        salonId: SALON_ID,
        salonSlug: "test-salon",
      },
      "wrong-secret",
    );
    const req = fakeRequest({ cookies: { [DEV_SESSION_COOKIE]: cookie } });
    const identity = await provider.authenticate(req);
    expect(identity).toBeNull();
  });

  it("ClerkAuthProvider produces an AuthIdentity with the same shape as DevAuthProvider", async () => {
    // We import lazily so the mocked createClerkClient is in place before
    // the provider constructs its client. Force AUTH_PROVIDER=clerk for the
    // constructor branch that initialises the Clerk client.
    process.env.AUTH_PROVIDER = "clerk";
    process.env.CLERK_SECRET_KEY = "sk_test_fake";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_fake";
    process.env.CLERK_WEBHOOK_SECRET = "whsec_fake";

    const { createClerkClient } = await import("@clerk/backend");
    const authenticateRequest = vi.fn().mockResolvedValue({
      isSignedIn: true,
      toAuth: () => ({
        userId: "user_clerk_abc",
        orgId: "org_clerk_xyz",
        orgRole: "org:admin",
      }),
    });
    (createClerkClient as ReturnType<typeof vi.fn>).mockReturnValue({
      authenticateRequest,
      users: {
        getUser: vi.fn().mockResolvedValue({
          primaryEmailAddress: { emailAddress: "owner@example.com" },
          firstName: "Owner",
          lastName: "Example",
        }),
      },
      organizations: {
        getOrganization: vi.fn().mockResolvedValue({
          name: "Acme",
          slug: "acme",
        }),
      },
    });

    // Re-import after AUTH_PROVIDER flip so the constructor takes the
    // clerk branch.
    vi.resetModules();
    const { ClerkAuthProvider } = await import(
      "../src/auth/clerk-auth.provider"
    );

    const prismaMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: USER_ID,
          email: "owner@example.com",
        }),
      },
      salon: {
        findUnique: vi.fn().mockResolvedValue({
          id: SALON_ID,
          slug: "acme",
          isActive: true,
        }),
      },
      salonMembership: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    const provider = new ClerkAuthProvider(prismaMock as never);
    const identity = await provider.authenticate(fakeRequest());

    expect(identity).toEqual({
      userId: USER_ID,
      email: "owner@example.com",
      salonHint: { salonId: SALON_ID, slug: "acme" },
    });

    // Both providers produce values that satisfy the same AuthIdentity
    // contract — the AuthGuard and TenantGuard don't need to know which
    // one ran.
    expect(Object.keys(identity!).sort()).toEqual(
      ["email", "salonHint", "userId"].sort(),
    );
  });

  it("ClerkAuthProvider returns null when the request is not signed in", async () => {
    process.env.AUTH_PROVIDER = "clerk";
    process.env.CLERK_SECRET_KEY = "sk_test_fake";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_fake";
    process.env.CLERK_WEBHOOK_SECRET = "whsec_fake";

    const { createClerkClient } = await import("@clerk/backend");
    (createClerkClient as ReturnType<typeof vi.fn>).mockReturnValue({
      authenticateRequest: vi
        .fn()
        .mockResolvedValue({ isSignedIn: false, toAuth: () => ({}) }),
    });

    vi.resetModules();
    const { ClerkAuthProvider } = await import(
      "../src/auth/clerk-auth.provider"
    );
    const provider = new ClerkAuthProvider({} as never);
    const identity = await provider.authenticate(fakeRequest());
    expect(identity).toBeNull();
  });
});
