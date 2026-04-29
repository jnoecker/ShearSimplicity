"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

// Client-only Clerk widgets used by the topbar in Clerk mode. Splitting
// these out keeps Topbar itself a server component.
export function TopbarOrgSwitcher() {
  return (
    <OrganizationSwitcher
      hidePersonal
      appearance={{
        elements: {
          rootBox: "flex items-center",
          organizationSwitcherTrigger:
            "rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50",
        },
      }}
    />
  );
}

export function TopbarUserButton() {
  return <UserButton afterSignOutUrl="/sign-in" />;
}
