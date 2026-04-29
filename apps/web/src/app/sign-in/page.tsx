import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { serverEnv } from "@/lib/env";

export default async function SignInPage() {
  const session = await getServerSession();
  if (session) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Phase 1 ships with a development identity provider. Clerk
          Organizations replaces this in Phase 1.5.
        </p>
        <form action="/api/dev-sign-in" method="post" className="mt-6">
          <div className="rounded-md bg-zinc-50 px-4 py-3 text-xs leading-relaxed text-zinc-600 ring-1 ring-zinc-200">
            <div>
              <span className="font-medium text-zinc-700">Dev user:</span>{" "}
              {serverEnv.devUserEmail}
            </div>
            <div>
              <span className="font-medium text-zinc-700">Dev salon:</span>{" "}
              {serverEnv.devSalonSlug}
            </div>
          </div>
          <button
            type="submit"
            className="mt-4 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
          >
            Sign in as dev user
          </button>
        </form>
        <p className="mt-4 text-xs text-zinc-400">
          AUTH_PROVIDER={serverEnv.authProvider}
        </p>
      </div>
    </main>
  );
}
