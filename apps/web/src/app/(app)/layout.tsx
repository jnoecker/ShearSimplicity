import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { getServerSession } from "@/lib/session";
import { serverEnv } from "@/lib/env";

function initialsFromEmail(email: string) {
  const handle = email.split("@")[0] ?? email;
  const parts = handle
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return handle.slice(0, 2).toUpperCase();
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  // Next 15 doesn't expose the current pathname inside server components
  // directly — we rely on a header set by middleware.
  const hdrs = await headers();
  const activeHref = hdrs.get("x-pathname") ?? "/";

  const userInitials = initialsFromEmail(session.email);
  const userName = session.email;
  const userRole = session.salonName ?? "Owner";

  return (
    <div className="ss-app">
      <div className="ss-orb ss-orb-magenta" />
      <div className="ss-orb ss-orb-cyan" />
      <div className="ss-orb ss-orb-violet" />

      <Sidebar
        activeHref={activeHref}
        userInitials={userInitials}
        userName={userName}
        userRole={userRole}
      />

      <main className="ss-main">
        <Topbar
          mode={serverEnv.authProvider}
          salonName={session.salonName}
          salonSlug={session.salonSlug}
          userEmail={session.email}
        />
        <div className="ss-content">{children}</div>
      </main>
    </div>
  );
}
