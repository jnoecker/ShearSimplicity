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
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <SignUp routing="path" path="/sign-up" />
    </main>
  );
}
