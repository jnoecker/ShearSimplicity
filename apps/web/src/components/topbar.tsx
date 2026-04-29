import { TopbarOrgSwitcher, TopbarUserButton } from "./topbar-clerk";

export function Topbar({
  mode,
  salonName,
  salonSlug,
  userEmail,
}: {
  mode: "dev" | "clerk";
  salonName: string | null;
  salonSlug: string | null;
  userEmail: string;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        {mode === "clerk" ? (
          <TopbarOrgSwitcher />
        ) : (
          <span className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm">
            {salonName ?? "—"}
            {salonSlug ? (
              <span className="text-zinc-400">({salonSlug})</span>
            ) : null}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-500">{userEmail}</span>
        {mode === "clerk" ? (
          <TopbarUserButton />
        ) : (
          <form action="/api/dev-sign-out" method="post">
            <button
              type="submit"
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Sign out
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
