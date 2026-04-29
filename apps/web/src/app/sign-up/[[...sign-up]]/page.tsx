import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { getServerSession } from "@/lib/session";
import { serverEnv } from "@/lib/env";

// Sign-up only exists in Clerk mode. Dev mode has a single fixed identity,
// so we redirect to /sign-in.
export default async function SignUpPage() {
  if (serverEnv.authProvider !== "clerk") {
    redirect("/sign-in");
  }
  const session = await getServerSession();
  if (session) redirect("/");

  return (
    <div className="ss-signin" data-screen-label="signup">
      <div className="ss-orb ss-orb-magenta" />
      <div className="ss-orb ss-orb-cyan" />
      <div className="ss-orb ss-orb-violet" />
      <div className="ss-signin-card">
        <div className="ss-signin-mark">
          <h1 className="ss-brand-script">Shear</h1>
          <p className="ss-brand-sub">Simplicity</p>
        </div>
        <h2>Open a studio</h2>
        <p className="ss-signin-sub">Create your salon and invite your team.</p>
        <SignUp routing="path" path="/sign-up" />
      </div>
    </div>
  );
}
