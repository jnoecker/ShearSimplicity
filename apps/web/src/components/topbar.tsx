export function Topbar({
  salonName,
  userEmail,
}: {
  salonName: string;
  userEmail: string;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
          disabled
          title="Org switcher — Phase 1.5 (Clerk Organizations)"
        >
          {salonName}
          <svg
            viewBox="0 0 20 20"
            className="h-3.5 w-3.5 text-zinc-400"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-500">{userEmail}</span>
        <form action="/api/dev-sign-out" method="post">
          <button
            type="submit"
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
