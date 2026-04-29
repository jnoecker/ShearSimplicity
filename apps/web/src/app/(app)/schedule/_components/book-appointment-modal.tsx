"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { categoryKind, type CategoryKind } from "@/lib/service-categories";
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
  monthAppointments: BookCalendarAppointment[];
  onClose: () => void;
}

const STAFF_GRADIENTS = [
  "linear-gradient(135deg, #1ec3d9, #0892a8)",
  "linear-gradient(135deg, #0892a8, #4a82b3)",
  "linear-gradient(135deg, #4a82b3, #1ec3d9)",
  "linear-gradient(135deg, #5cdcec, #0892a8)",
  "linear-gradient(135deg, #1ec3d9, #6fa6cc)",
];

// Map from CategoryKind → the tag/dot variant in the dropdown trigger.
// "block" is never produced from a service so we don't need a case for it.
function tagVariant(k: CategoryKind): "color" | "cut" | "treat" | "style" | "bridal" {
  if (k === "styling") return "style";
  if (k === "block") return "cut";
  return k;
}

export function BookAppointmentModal({
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
  onClose,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [clientId, setClientId] = useState<string>(initialClientId ?? "");
  const [clientSearchOpen, setClientSearchOpen] = useState<boolean>(
    !initialClientId,
  );
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<BookClient[]>(clients);
  const [, startClientSearch] = useTransition();
  const [staffId, setStaffId] = useState<string>(initialStaffId ?? "");
  const [serviceIds, setServiceIds] = useState<Set<string>>(new Set());
  const [date, setDate] = useState<string>(initialDate);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Lock body scroll while the modal is open, restore on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Esc closes. Stop here rather than at the backdrop click handler so the
  // shortcut works even when focus is inside an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Debounced server-side client search so the picker stays correct beyond the
  // prefetched roster (API caps /clients at 200 rows).
  useEffect(() => {
    const handle = setTimeout(() => {
      startClientSearch(async () => {
        const hits = await searchClientsAction(clientQuery);
        setClientResults(hits);
      });
    }, 220);
    return () => clearTimeout(handle);
  }, [clientQuery]);

  const displayClients = useMemo(() => {
    if (!clientId) return clientResults;
    if (clientResults.some((c) => c.id === clientId)) return clientResults;
    const selected = clients.find((c) => c.id === clientId);
    return selected ? [selected, ...clientResults] : clientResults;
  }, [clientId, clientResults, clients]);

  const selectedClient = useMemo(
    () =>
      displayClients.find((c) => c.id === clientId) ??
      clients.find((c) => c.id === clientId) ??
      null,
    [displayClients, clients, clientId],
  );

  const selectedServices = useMemo(
    () => services.filter((s) => serviceIds.has(s.id)),
    [services, serviceIds],
  );

  const totalDuration = selectedServices.reduce(
    (acc, s) => acc + s.defaultDurationMinutes,
    0,
  );
  const totalCents = selectedServices.reduce(
    (acc, s) => acc + s.defaultPriceCents,
    0,
  );
  const currency = selectedServices[0]?.currency ?? "USD";
  const selectedStaff = staff.find((s) => s.id === staffId) ?? null;

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

  function pickClient(id: string) {
    setClientId(id);
    setClientSearchOpen(false);
    setClientQuery("");
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

  const dateLabel = formatDateLabel(date);
  const footerMeta = [
    totalDuration > 0 ? `${totalDuration} min` : null,
    totalCents > 0 ? formatPrice(totalCents, currency) : null,
    selectedStaff ? selectedStaff.displayName.split(" ")[0] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="bk-backdrop" onClick={onClose} aria-hidden />
      <div
        className="bk-modal bk-modal-classic"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bk-title"
      >
        <div className="bk-head">
          <div>
            <div className="bk-kicker">New appointment</div>
            <h2 className="bk-title" id="bk-title">
              Book a client
            </h2>
            <p className="bk-sub">{dateLabel} · staff view</p>
          </div>
          <button
            type="button"
            className="bk-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path
                d="M2 2 L12 12 M12 2 L2 12"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="bk-modal-body">
          <form
            id="bk-form"
            className="bk-modal-form"
            onSubmit={onSubmit}
          >
            <ClientField
              selected={selectedClient}
              searchOpen={clientSearchOpen}
              query={clientQuery}
              results={displayClients}
              clientId={clientId}
              onChangeQuery={setClientQuery}
              onPick={pickClient}
              onOpenSearch={() => setClientSearchOpen(true)}
            />

            <ServicesField
              services={services}
              selectedIds={serviceIds}
              totalDuration={totalDuration}
              totalCents={totalCents}
              currency={currency}
              onToggle={toggleService}
            />

            <StaffField
              staff={staff}
              selectedId={staffId}
              onSelect={setStaffId}
            />

            <div className="bk-field bk-field-cal">
              <label className="bk-label">Date &amp; time</label>
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
                  // Re-fetch via the URL so the server hands us a new
                  // monthAppointments slice. ?book=1 keeps the modal open.
                  router.push(
                    `/schedule?book=1&month=${yearMonth}&date=${date}`,
                  );
                }}
              />
              {totalDuration > 0 && minutes !== null && (
                <p className="bk-end-hint">
                  Ends at {minutesToLabel(minutes + totalDuration)} ·{" "}
                  {totalDuration} min total
                </p>
              )}
            </div>

            <div className="bk-field">
              <label className="bk-label" htmlFor="bk-notes">
                Notes (visible to client)
              </label>
              <textarea
                id="bk-notes"
                className="bk-textarea"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={4000}
                placeholder="Anything the client should see…"
              />
            </div>

            <div className="bk-field">
              <label className="bk-label" htmlFor="bk-internal">
                Notes for the team
              </label>
              <textarea
                id="bk-internal"
                className="bk-textarea"
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                maxLength={4000}
                placeholder="Anything the team should know…"
              />
            </div>
          </form>
        </div>

        <div className="bk-footer">
          {errorMsg ? (
            <p className="bk-footer-error">{errorMsg}</p>
          ) : (
            <span className="bk-footer-meta">{footerMeta || "—"}</span>
          )}
          <div className="bk-footer-actions">
            <button
              type="button"
              className="ss-btn ss-btn-ghost"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="bk-form"
              className="ss-btn ss-btn-primary"
              disabled={!canSubmit}
            >
              {isPending ? "Booking…" : "Book appointment"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- Client field ----------

function ClientField({
  selected,
  searchOpen,
  query,
  results,
  clientId,
  onChangeQuery,
  onPick,
  onOpenSearch,
}: {
  selected: BookClient | null;
  searchOpen: boolean;
  query: string;
  results: BookClient[];
  clientId: string;
  onChangeQuery: (q: string) => void;
  onPick: (id: string) => void;
  onOpenSearch: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // When the search opens, focus the input so the user can start typing
  // straight away — same instinct as Cmd-K palettes.
  useEffect(() => {
    if (searchOpen && inputRef.current) inputRef.current.focus();
  }, [searchOpen]);

  return (
    <div className="bk-field">
      <label className="bk-label">Client</label>
      {selected ? (
        <div className="bk-client-pick">
          <div className="bk-client-pick-avatar">
            {initialsOf(selected.displayName)}
          </div>
          <div className="bk-client-pick-info">
            <div className="bk-client-pick-name">{selected.displayName}</div>
            <div className="bk-client-pick-meta">
              {[selected.phone, selected.email].filter(Boolean).join(" · ") ||
                "No contact info"}
            </div>
          </div>
          <button type="button" className="bk-link" onClick={onOpenSearch}>
            Change
          </button>
        </div>
      ) : (
        <div className="bk-client-pick">
          <div className="bk-client-pick-avatar" aria-hidden>
            ?
          </div>
          <div className="bk-client-pick-empty">Pick a client below</div>
        </div>
      )}

      {searchOpen && (
        <div className="bk-client-search">
          <input
            ref={inputRef}
            type="search"
            className="bk-client-search-input"
            placeholder="Search by name, phone, or email…"
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
          />
          <div className="bk-client-search-list">
            {results.length === 0 ? (
              <div className="bk-client-search-empty">
                {query
                  ? `No clients match "${query}".`
                  : "No clients yet."}
              </div>
            ) : (
              results.slice(0, 50).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`bk-client-search-row${
                    c.id === clientId ? " is-selected" : ""
                  }`}
                  onClick={() => onPick(c.id)}
                >
                  <span className="bk-client-search-name">
                    {c.displayName}
                  </span>
                  <span className="bk-client-search-meta">
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Services field (single-trigger dropdown popover) ----------

function ServicesField({
  services,
  selectedIds,
  totalDuration,
  totalCents,
  currency,
  onToggle,
}: {
  services: BookService[];
  selectedIds: Set<string>;
  totalDuration: number;
  totalCents: number;
  currency: string;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Close on outside click. We listen on mousedown so a click inside the
  // popover (a service row) flips selection without immediately closing.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current && !popRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selectedServices = services.filter((s) => selectedIds.has(s.id));

  // Group by category (live-filtered by query). Group order follows first
  // appearance in the services list so the salon's preferred order persists.
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, BookService[]>();
    for (const s of services) {
      if (
        query &&
        !s.name.toLowerCase().includes(query.toLowerCase()) &&
        !(s.category?.name ?? "").toLowerCase().includes(query.toLowerCase())
      ) {
        continue;
      }
      const cat = s.category?.name ?? "Other";
      if (!map.has(cat)) {
        order.push(cat);
        map.set(cat, []);
      }
      map.get(cat)!.push(s);
    }
    return order.map((cat) => ({ name: cat, items: map.get(cat)! }));
  }, [services, query]);

  return (
    <div className="bk-field bk-svc-field">
      <label className="bk-label">Services</label>
      <div className={`bk-svc-combo${open ? " is-open" : ""}`} ref={popRef}>
        {/* Trigger is a div, not a button. The selected-service tags inside
            need their own × <button> for removal, and <button> nested inside
            <button> is invalid HTML — Next strict-mode reports it as a
            hydration error. role="button" + Enter/Space/Esc keyboard
            handlers preserve the same a11y affordance. */}
        <div
          role="button"
          tabIndex={0}
          className="bk-svc-trigger"
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((o) => !o);
            } else if (e.key === "Escape" && open) {
              setOpen(false);
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {selectedServices.length === 0 ? (
            <span className="bk-svc-trigger-placeholder">Add services…</span>
          ) : (
            <span className="bk-svc-trigger-tags">
              {selectedServices.map((s) => {
                const v = tagVariant(
                  categoryKind({
                    categoryName: s.category?.name ?? null,
                    serviceName: s.name,
                  }),
                );
                return (
                  <span key={s.id} className={`bk-svc-tag is-${v}`}>
                    <span className="bk-svc-tag-name">{s.name}</span>
                    <span className="bk-svc-tag-meta">
                      {s.defaultDurationMinutes}m
                    </span>
                    <button
                      type="button"
                      className="bk-svc-tag-x"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(s.id);
                      }}
                      aria-label={`Remove ${s.name}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </span>
          )}
          <span className="bk-svc-trigger-meta">
            {selectedServices.length > 0 && (
              <span className="bk-svc-trigger-tot">
                {totalDuration}m · {formatPrice(totalCents, currency)}
              </span>
            )}
            <span className="bk-svc-caret" aria-hidden>
              ▾
            </span>
          </span>
        </div>

        {open && (
          <div className="bk-svc-pop" role="listbox">
            <div className="bk-svc-pop-search">
              <span className="bk-svc-pop-search-icon" aria-hidden>
                ⌕
              </span>
              <input
                ref={inputRef}
                type="text"
                placeholder="Search services…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                }}
              />
            </div>
            <div className="bk-svc-pop-body">
              {groups.length === 0 && (
                <div className="bk-svc-pop-empty">
                  {query ? `No services match "${query}".` : "No services yet."}
                </div>
              )}
              {groups.map((g) => (
                <div key={g.name} className="bk-svc-pop-group">
                  <div className="bk-svc-pop-cat">
                    <span
                      className={`bk-svc-dot is-${tagVariant(
                        categoryKind({ categoryName: g.name, serviceName: null }),
                      )}`}
                    />
                    {g.name}
                    <span className="bk-svc-pop-cat-count">{g.items.length}</span>
                  </div>
                  {g.items.map((s) => {
                    const on = selectedIds.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`bk-svc-pop-item${on ? " is-on" : ""}`}
                        onClick={() => onToggle(s.id)}
                        role="option"
                        aria-selected={on}
                      >
                        <span
                          className={`bk-svc-check${on ? " is-on" : ""}`}
                          aria-hidden
                        >
                          {on && (
                            <svg width="10" height="10" viewBox="0 0 10 10">
                              <path
                                d="M1.5 5.2 L4 7.5 L8.5 2.5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <span className="bk-svc-pop-name">{s.name}</span>
                        <span className="bk-svc-pop-dur">
                          {s.defaultDurationMinutes}m
                        </span>
                        <span className="bk-svc-pop-price">
                          {formatPrice(s.defaultPriceCents, s.currency)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="bk-svc-pop-foot">
              <span className="bk-svc-pop-foot-meta">
                {selectedServices.length > 0
                  ? `${selectedServices.length} selected · ${totalDuration}m · ${formatPrice(
                      totalCents,
                      currency,
                    )}`
                  : "None selected"}
              </span>
              <button
                type="button"
                className="ss-btn ss-btn-primary bk-svc-pop-done"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Stylist field ----------

function StaffField({
  staff,
  selectedId,
  onSelect,
}: {
  staff: BookStaff[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bk-field">
      <label className="bk-label">Stylist</label>
      <div className="bk-staff-row">
        {staff.map((s, i) => {
          const isOn = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              className={`bk-staff${isOn ? " is-on" : ""}`}
              aria-pressed={isOn}
              title={isOn ? "Click to clear" : undefined}
              onClick={() => onSelect(isOn ? "" : s.id)}
            >
              <span
                className="bk-staff-avatar"
                style={{
                  background: s.color
                    ? `linear-gradient(135deg, ${s.color}, ${s.color})`
                    : STAFF_GRADIENTS[i % STAFF_GRADIENTS.length],
                }}
              >
                {initialsOf(s.displayName)}
              </span>
              <span className="bk-staff-name">
                {s.displayName.split(" ")[0]}
              </span>
              {s.title && <span className="bk-staff-role">{s.title}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- helpers ----------

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
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
