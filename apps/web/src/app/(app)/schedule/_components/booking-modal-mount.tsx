"use client";

import { useRouter } from "next/navigation";
import {
  BookAppointmentModal,
  type BookClient,
  type BookService,
  type BookStaff,
} from "./book-appointment-modal";
import type { BookCalendarAppointment } from "./book-calendar";

interface Props {
  timezone: string;
  initialDate: string;
  initialStaffId: string | null;
  initialClientId: string | null;
  staff: BookStaff[];
  services: BookService[];
  clients: BookClient[];
  viewMonth: string;
  prevMonthIso: string;
  nextMonthIso: string;
  todayIso: string;
  monthAppointments: BookCalendarAppointment[];
  /** Where to land after closing — usually the schedule page on the same date. */
  closeHref: string;
}

// Thin client wrapper so the server-rendered schedule page can mount the
// modal without needing a `"use client"` boundary itself. Closing drops
// the `?book=1` query param via the router so back/forward and shareable
// URLs both behave.
export function BookingModalMount({ closeHref, ...modalProps }: Props) {
  const router = useRouter();
  return (
    <BookAppointmentModal
      {...modalProps}
      onClose={() => router.replace(closeHref)}
    />
  );
}
