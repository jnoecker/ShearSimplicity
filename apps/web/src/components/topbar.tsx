import Link from "next/link";
import { TopbarOrgSwitcher, TopbarUserButton } from "./topbar-clerk";

const SEARCH_ICON =
  "M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z";
const BELL_ICON =
  "M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16l-2-3ZM10 21a2 2 0 0 0 4 0";
const PLUS_ICON = "M12 5v14M5 12h14";

function StrokedIcon({ d, size = 17 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

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
  const orgInitial = (salonName ?? "S").trim().charAt(0).toUpperCase();
  void userEmail;
  return (
    <div className="ss-topbar">
      {mode === "clerk" ? (
        <TopbarOrgSwitcher />
      ) : (
        <div className="ss-org-pill">
          <div className="ss-org-mark">{orgInitial}</div>
          <span>{salonName ?? "—"}</span>
          {salonSlug ? <span className="ss-org-tag">· {salonSlug}</span> : null}
        </div>
      )}

      <div className="ss-search">
        <StrokedIcon d={SEARCH_ICON} size={15} />
        <input placeholder="Find a client, appointment, or service…" />
      </div>

      <div className="ss-topbar-spacer" />

      <button className="ss-icon-btn" aria-label="Notifications" type="button">
        <StrokedIcon d={BELL_ICON} />
        <span className="ss-dot" />
      </button>

      <Link
        href="/schedule/new"
        className="ss-icon-btn"
        aria-label="New appointment"
      >
        <StrokedIcon d={PLUS_ICON} />
      </Link>

      {mode === "clerk" ? (
        <TopbarUserButton />
      ) : (
        <form action="/api/dev-sign-out" method="post">
          <button
            type="submit"
            className="ss-btn ss-btn-ghost"
            style={{ marginLeft: 8 }}
          >
            Sign out
          </button>
        </form>
      )}
    </div>
  );
}
