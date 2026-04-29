"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/form";
import { instantAtMinutes } from "@/lib/salon-time";
import {
  createAppointmentAction,
  searchClientsAction,
} from "../_actions";
import {
  BookCalendar,
  type BookCalendarAppointment,
} from "./book-calendar";

export interface BookStaff {
  id: string;
  displayName: string;
  title: string | null;
  color: string | null;
  isActive: boolean;
}

export interface BookService {
  id: string;
  name: string;
  defaultDurationMinutes: number;
  defaultPriceCents: number;
  currency: string;
  isActive: boolean;
  category: { id: string; name: string } | null;
}

export interface BookClient {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
}

interface Props {
  timezone: string;
  initialDate: string;
  initialStaffId: string | null;
  initialClientId: string | null;
  staff: BookStaff[];
  services: BookService[];
  clients: BookClient[];
  /** "YYYY-MM" of the calendar's currently-loaded month. */
  viewMonth: string;
  prevMonthIso: string;
  nextMonthIso: string;
  todayIso: string;
  /** Appointments overlapping `viewMonth`, fed to the calendar. */
  monthAppointments: BookCalendarAppointment[];
}

const STAFF_GRADIENTS = [
  "linear-gradient(135deg, #1ec3d9, #0892a8)",
  "linear-gradient(135deg, #0892a8, #4a82b3)",
  "linear-gradient(135deg, #4a82b3, #1ec3d9)",
  "linear-gradient(135deg, #5cdcec, #0892a8)",
  "linear-gradient(135deg, #1ec3d9, #6fa6cc)",
];

export function BookAppointmentForm({
  timezone,
  initialDate,
  initialStaffId,
  initialClientId,
  staff,
  services,
  clients,
  viewMonth,
  prevMonthIso,
  nextMonthIso,
  todayIso,
  monthAppointments,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [clientId, setClientId] = useState<string>(initialClientId ?? "");
  const [clientQuery, setClientQuery] = useState("");
  // The displayed roster is server-driven so salons with more than the API's
  // 200-row cap can still find clients beyond the first page via search.
  // `clients` (the prop) seeds the initial list before any query is typed.
  const [clientResults, setClientResults] = useState<BookClient[]>(clients);
  const [, startClientSearch] = useTransition();
  const [staffId, setStaffId] = useState<string>(initialStaffId ?? "");
  const [serviceIds, setServiceIds] = useState<Set<string>>(new Set());
  const [date, setDate] = useState<string>(initialDate);
  // Null until the user picks an open slot — keeps the slot grid free of a
  // pre-selected highlight on first arrival.
  const [minutes, setMinutes] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Debounce typing so we don't fire a server action on every keystroke.
  // 220 ms is short enough to feel live and long enough to coalesce a
  // full word's typing into one round-trip.
  useEffect(() => {
    const handle = setTimeout(() => {
      startClientSearch(async () => {
        const hits = await searchClientsAction(clientQuery);
        setClientResults(hits);
      });
    }, 220);
    return () => clearTimeout(handle);
  }, [clientQuery]);

  // The selected client may sit outside the current result page when a
  // long-tail search trims the list — keep them visible at the top so the
  // current selection is never silently dropped from the UI.
  const displayClients = useMemo(() => {
    if (!clientId) return clientResults;
    if (clientResults.some((c) => c.id === clientId)) return clientResults;
    const selected = clients.find((c) => c.id === clientId);
    return selected ? [selected, ...clientResults] : clientResults;
  }, [clientId, clientResults, clients]);

  const groupedServices = useMemo(() => groupByCategory(services), [services]);

  const totalDuration = useMemo(
    () =>
      services
        .filter((s) => serviceIds.has(s.id))
        .reduce((acc, s) => acc + s.defaultDurationMinutes, 0),
    [serviceIds, services],
  );
  const totalCents = useMemo(
    () =>
      services
        .filter((s) => serviceIds.has(s.id))
        .reduce((acc, s) => acc + s.defaultPriceCents, 0),
    [serviceIds, services],
  );
  const currency =
    services.find((s) => serviceIds.has(s.id))?.currency ?? "USD";

  const canSubmit =
    !!clientId &&
    !!staffId &&
    serviceIds.size > 0 &&
    minutes !== null &&
    !isPending;

  function toggleService(id: string) {
    setServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || minutes === null) return;
    setErrorMsg(null);
    const startAtIso = instantAtMinutes(minutes, date, timezone).toISOString();
    startTransition(async () => {
      const result = await createAppointmentAction({
        clientId,
        staffMemberId: staffId,
        serviceIds: Array.from(serviceIds),
        startAtIso,
        notes: notes.trim() || undefined,
        internalNotes: internalNotes.trim() || undefined,
      });
      if (!result.ok) {
        setErrorMsg(result.message ?? "Could not book appointment");
        return;
      }
      router.push(`/schedule?date=${date}`);
      router.refresh();
    });
  }

  return (
    <form className="ss-book-grid" onSubmit={onSubmit}>
      <div className="ss-book-main">
        <Card title="Client" meta={clientId ? clientName(displayClients, clientId) : "Required"}>
          <input
            type="search"
            className="ss-book-search"
            placeholder="Search by name, phone, or email…"
            value={clientQuery}
            onChange={(e) => setClientQuery(e.target.value)}
          />
          <div className="ss-book-client-list">
            {displayClients.length === 0 ? (
              <p className="ss-empty" style={{ padding: 12 }}>
                {clientQuery
                  ? `No clients match "${clientQuery}".`
                  : "No clients yet."}
              </p>
            ) : (
              displayClients.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`ss-book-client-row${c.id === clientId ? " is-selected" : ""}`}
                  onClick={() => setClientId(c.id)}
                >
                  <span className="ss-book-client-name">{c.displayName}</span>
                  <span className="ss-book-client-meta">
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </span>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card title="Services" meta={`${serviceIds.size} selected`}>
          {groupedServices.map((group) => (
            <div key={group.name} className="ss-book-svc-group">
              <div className="ss-book-svc-group-name">{group.name}</div>
              {group.services.map((s) => {
                const checked = serviceIds.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={`ss-book-svc-row${checked ? " is-selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleService(s.id)}
                    />
                    <span className="ss-book-svc-name">{s.name}</span>
                    <span className="ss-book-svc-meta">
                      {s.defaultDurationMinutes} min ·{" "}
                      {formatPrice(s.defaultPriceCents, s.currency)}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </Card>

        <Card title="Stylist" meta={staffId ? staffName(staff, staffId) : "Required"}>
          <div className="ss-book-staff-grid">
            {staff.map((s, i) => {
              const selected = staffId === s.id;
              return (
                <button
                  type="button"
                  key={s.id}
                  className={`ss-book-staff-card${selected ? " is-selected" : ""}`}
                  onClick={() => setStaffId(s.id)}
                >
                  <div
                    className="ss-chair-avatar"
                    style={{
                      background: s.color
                        ? `linear-gradient(135deg, ${s.color}, ${s.color})`
                        : STAFF_GRADIENTS[i % STAFF_GRADIENTS.length],
                    }}
                  >
                    {initialsOf(s.displayName)}
                  </div>
                  <div className="ss-book-staff-name">
                    {s.displayName.split(" ")[0]}
                  </div>
                  {s.title && (
                    <div className="ss-book-staff-role">{s.title}</div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card
          title="When"
          meta={
            minutes !== null
              ? `${formatDateLabel(date)} · ${minutesToLabel(minutes)}`
              : "Pick a day, then a slot"
          }
        >
          <BookCalendar
            timezone={timezone}
            selectedDate={date}
            todayIso={todayIso}
            selectedMinutes={minutes}
            viewMonth={viewMonth}
            prevMonthIso={prevMonthIso}
            nextMonthIso={nextMonthIso}
            monthAppointments={monthAppointments}
            staff={staff}
            selectedStaffId={staffId || null}
            services={services}
            selectedDurationMin={totalDuration}
            onSelectDate={(iso) => {
              setDate(iso);
              setMinutes(null);
            }}
            onPickSlot={(iso, m, sId) => {
              setDate(iso);
              setMinutes(m);
              if (!staffId) setStaffId(sId);
            }}
            onSelectStaff={(sId) => setStaffId(sId)}
            onMonthChange={(yearMonth) => {
              // Re-fetch via the URL so the server can hand us a new
              // monthAppointments slice.
              router.push(`/schedule/new?month=${yearMonth}&date=${date}`);
            }}
          />
          {totalDuration > 0 && minutes !== null && (
            <p className="ss-book-end-hint">
              Ends at {minutesToLabel(minutes + totalDuration)} ·{" "}
              {totalDuration} min total
            </p>
          )}
        </Card>

        <Card title="Notes" meta="Optional">
          <div className="ss-field">
            <label htmlFor="book-notes">Visible to the client</label>
            <textarea
              id="book-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={4000}
            />
          </div>
          <div className="ss-field">
            <label htmlFor="book-internal">Internal only</label>
            <textarea
              id="book-internal"
              rows={2}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              maxLength={4000}
            />
          </div>
        </Card>
      </div>

      <aside className="ss-book-aside">
        <Card title="Summary" meta="Review">
          <SummaryRow label="Client">
            {clientId ? clientName(displayClients, clientId) : "—"}
          </SummaryRow>
          <SummaryRow label="Stylist">
            {staffId ? staffName(staff, staffId) : "—"}
          </SummaryRow>
          <SummaryRow label="Services">
            {serviceIds.size === 0
              ? "—"
              : services
                  .filter((s) => serviceIds.has(s.id))
                  .map((s) => s.name)
                  .join(", ")}
          </SummaryRow>
          <SummaryRow label="When">
            {minutes !== null
              ? `${formatDateLabel(date)} · ${minutesToLabel(minutes)}`
              : formatDateLabel(date)}
          </SummaryRow>
          <SummaryRow label="Duration">
            {totalDuration > 0 ? `${totalDuration} min` : "—"}
          </SummaryRow>
          <SummaryRow label="Price">
            {totalCents > 0 ? formatPrice(totalCents, currency) : "—"}
          </SummaryRow>

          {errorMsg && <div className="ss-form-error" style={{ marginTop: 14 }}>{errorMsg}</div>}

          <div className="ss-form-actions" style={{ marginTop: 18 }}>
            <Button type="submit" disabled={!canSubmit}>
              {isPending ? "Booking…" : "Book appointment"}
            </Button>
          </div>
        </Card>
      </aside>
    </form>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ss-book-summary-row">
      <span className="ss-book-summary-label">{label}</span>
      <span className="ss-book-summary-value">{children}</span>
    </div>
  );
}

function groupByCategory(services: BookService[]) {
  const map = new Map<string, { name: string; services: BookService[] }>();
  for (const s of services) {
    const name = s.category?.name ?? "Other";
    const existing = map.get(name) ?? { name, services: [] };
    existing.services.push(s);
    map.set(name, existing);
  }
  return [...map.values()].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
}

function clientName(clients: BookClient[], id: string): string {
  return clients.find((c) => c.id === id)?.displayName ?? "—";
}

function staffName(staff: BookStaff[], id: string): string {
  return staff.find((s) => s.id === id)?.displayName ?? "—";
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function minutesToLabel(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const meridiem = h < 12 ? "AM" : "PM";
  const display = ((h + 11) % 12) + 1;
  const mm = min === 0 ? "" : `:${String(min).padStart(2, "0")}`;
  return `${display}${mm} ${meridiem}`;
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDateLabel(iso: string): string {
  // The HTML5 date input gives us YYYY-MM-DD with no timezone — formatting
  // with the device locale is fine here since the actual UTC instant is
  // computed via instantAtMinutes() at submit time.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
