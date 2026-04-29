import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { getServerSession } from "@/lib/session";

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
  // directly — we rely on a header set by middleware (or fall back to "/").
  const hdrs = await headers();
  const activeHref = hdrs.get("x-pathname") ?? "/";

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar activeHref={activeHref} />
      <div className="pl-56">
        <Topbar
          salonName={`Acme Salon (${session.salonSlug})`}
          userEmail={session.email}
        />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
