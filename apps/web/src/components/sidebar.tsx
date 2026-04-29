import Link from "next/link";

interface NavItem {
  href: string;
  label: string;
  iconPath: string;
}

// Lucide-style stroked icons inlined as SVG paths. Using inline SVG keeps the
// design CSS in control of size/stroke and avoids a runtime icon library.
const NAV: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    iconPath: "M3 13h7V3H3v10Zm0 8h7v-6H3v6Zm11 0h7V11h-7v10Zm0-18v6h7V3h-7Z",
  },
  {
    href: "/schedule",
    label: "Schedule",
    iconPath:
      "M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  },
  {
    href: "/clients",
    label: "Clients",
    iconPath:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  },
  {
    href: "/staff",
    label: "Staff",
    iconPath:
      "M20 21v-2a4 4 0 0 0-3-3.87M4 21v-2a4 4 0 0 1 3-3.87M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 0c2 0 4 1 4 4v5H8v-5c0-3 2-4 4-4Z",
  },
  {
    href: "/services",
    label: "Services",
    iconPath:
      "M14.121 14.121 20 20M5.636 18.364a3 3 0 1 1 4.243-4.243 3 3 0 0 1-4.243 4.243Zm0-12.728a3 3 0 1 1 4.243 4.243 3 3 0 0 1-4.243-4.243Zm6.364 6.364L20 4",
  },
  {
    href: "/messages",
    label: "Messages",
    iconPath: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z",
  },
];

const SETTINGS_ICON =
  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.13-1.41l2.11-1.65-2-3.46-2.49 1a7.45 7.45 0 0 0-2.44-1.41L14 2h-4l-.46 2.6a7.45 7.45 0 0 0-2.44 1.41l-2.49-1-2 3.46L4.73 10.59A7.4 7.4 0 0 0 4.6 12c0 .48.05.95.13 1.41l-2.11 1.65 2 3.46 2.49-1a7.45 7.45 0 0 0 2.44 1.41L10 22h4l.46-2.6a7.45 7.45 0 0 0 2.44-1.41l2.49 1 2-3.46-2.11-1.65A7.4 7.4 0 0 0 19.4 12Z";

function NavIcon({ d }: { d: string }) {
  return (
    <svg
      className="ss-nav-icon"
      width={18}
      height={18}
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

function isActive(activeHref: string, itemHref: string) {
  if (itemHref === "/") return activeHref === "/";
  return activeHref === itemHref || activeHref.startsWith(itemHref + "/");
}

export function Sidebar({
  activeHref,
  userInitials,
  userName,
  userRole,
}: {
  activeHref: string;
  userInitials: string;
  userName: string;
  userRole: string;
}) {
  return (
    <aside className="ss-sidebar">
      <div className="ss-brand">
        <h1 className="ss-brand-script">Shear</h1>
        <p className="ss-brand-sub">Simplicity</p>
        <div className="ss-brand-flourish">
          <svg width={12} height={12} viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 0 L7 5 L12 6 L7 7 L6 12 L5 7 L0 6 L5 5 Z" />
          </svg>
        </div>
      </div>

      <ul className="ss-nav">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              className={`ss-nav-item ${isActive(activeHref, n.href) ? "is-active" : ""}`}
            >
              <NavIcon d={n.iconPath} />
              <span>{n.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="ss-nav-section">Studio</div>
      <ul className="ss-nav">
        <li>
          <Link
            href="/settings"
            className={`ss-nav-item ${isActive(activeHref, "/settings") ? "is-active" : ""}`}
          >
            <NavIcon d={SETTINGS_ICON} />
            <span>Settings</span>
          </Link>
        </li>
      </ul>

      <div className="ss-sidebar-footer">
        <div className="ss-avatar">{userInitials}</div>
        <div className="ss-user-meta">
          <div className="ss-user-name">{userName}</div>
          <div className="ss-user-role">{userRole}</div>
        </div>
      </div>
    </aside>
  );
}
