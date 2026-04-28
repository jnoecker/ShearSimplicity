import Link from "next/link";

interface NavItem {
  href: string;
  label: string;
}

const items: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/schedule", label: "Schedule" },
  { href: "/clients", label: "Clients" },
  { href: "/staff", label: "Staff" },
  { href: "/services", label: "Services" },
  { href: "/messages", label: "Messages" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar({ activeHref }: { activeHref: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 flex w-56 flex-col border-r border-zinc-200 bg-white">
      <div className="flex h-14 items-center border-b border-zinc-200 px-5">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-900"
        >
          ShearSimplicity
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {items.map((item) => {
            const active =
              item.href === "/"
                ? activeHref === "/"
                : activeHref.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    "block rounded-md px-3 py-2 text-sm font-medium transition-colors " +
                    (active
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900")
                  }
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-400">
        Phase 1 · Foundation
      </div>
    </aside>
  );
}
