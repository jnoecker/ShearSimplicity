import { redirect } from "next/navigation";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { getServerSession } from "@/lib/session";
import { serverEnv } from "@/lib/env";

// Catchall so Clerk's <SignIn routing="path"> can own /sign-in/* substates
// (factor-one, sso-callback, verify, etc.). In dev mode we render the
// signed-cookie form here directly.
export default async function SignInPage() {
  const session = await getServerSession();
  if (session) redirect("/");

  return (
    <div className="ss-signin" data-screen-label="signin">
      <div className="ss-orb ss-orb-magenta" />
      <div className="ss-orb ss-orb-cyan" />
      <div className="ss-orb ss-orb-violet" />
      <div className="ss-motes">
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            className="ss-mote"
            style={{
              left: `${10 + i * 11}%`,
              bottom: 0,
              animationDelay: `${i * 1.1}s`,
              color: i % 2 ? "var(--ss-cyan)" : "var(--ss-magenta)",
            }}
          />
        ))}
      </div>

      <div className="ss-signin-card">
        <div className="ss-signin-mark">
          <h1 className="ss-brand-script">Shear</h1>
          <p className="ss-brand-sub">Simplicity</p>
        </div>

        {serverEnv.authProvider === "clerk" ? (
          <ClerkPanel />
        ) : (
          <DevPanel
            email={serverEnv.devUserEmail}
            slug={serverEnv.devSalonSlug}
          />
        )}
      </div>
    </div>
  );
}

function ClerkPanel() {
  return (
    <>
      <h2>Welcome back</h2>
      <p className="ss-signin-sub">Sign in to your studio.</p>
      {/* Clerk provides its own form chrome; the surrounding card supplies the
          dreamy frame. */}
      <SignIn routing="path" path="/sign-in" />
    </>
  );
}

function DevPanel({ email, slug }: { email: string; slug: string }) {
  return (
    <>
      <h2>Welcome back</h2>
      <p className="ss-signin-sub">
        Open the studio with the seeded developer identity.
      </p>

      <div className="ss-dev-pill">
        <Sparkle /> Dev mode
      </div>

      <form action="/api/dev-sign-in" method="post" className="ss-signin-dev-form">
        <div className="ss-signin-dev-info">
          <div>
            <span className="ss-signin-dev-label">Studio</span>
            <span>{slug}</span>
          </div>
          <div>
            <span className="ss-signin-dev-label">User</span>
            <span>{email}</span>
          </div>
        </div>
        <button
          type="submit"
          className="ss-btn ss-btn-primary ss-signin-btn"
        >
          Open the studio →
        </button>
      </form>

      <p className="ss-signin-foot">
        Set <code className="ss-signin-code">AUTH_PROVIDER=clerk</code> to use
        Clerk Organizations instead.{" "}
        <Link href="/sign-up">Open a studio →</Link>
      </p>
    </>
  );
}

function Sparkle() {
  return (
    <svg width={9} height={9} viewBox="0 0 12 12" fill="currentColor">
      <path d="M6 0 L7 5 L12 6 L7 7 L6 12 L5 7 L0 6 L5 5 Z" />
    </svg>
  );
}
