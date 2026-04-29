import { redirect } from "next/navigation";

// The booking flow is now a modal mounted on /schedule when ?book=1 is set.
// This route stays around so any in-flight bookmarks or handoffs from older
// sessions still work — we just forward the relevant query params and let
// the modal pick them up.
export default async function NewBookingRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    staff?: string;
    client?: string;
    month?: string;
  }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams({ book: "1" });
  if (params.date) qs.set("date", params.date);
  if (params.staff) qs.set("staff", params.staff);
  if (params.client) qs.set("client", params.client);
  if (params.month) qs.set("month", params.month);
  redirect(`/schedule?${qs.toString()}`);
}
