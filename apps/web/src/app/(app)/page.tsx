import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  dayWindow,
  formatTimeInTimezone,
  todayIsoInTimezone,
} from "@/lib/salon-time";

interface SettingsResponse {
  timezone: string;
}

interface DashboardAppointment {
  id: string;
  startAt: string;
  status: "SCHEDULED" | "CONFIRMED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  client: { id: string; displayName: string };
  staffMember: { id: string; displayName: string };
  services: { serviceNameSnapshot: string; durationSnapshotMinutes: number }[];
}

interface StaffRow {
  id: string;
  displayName: string;
  title: string | null;
  color: string | null;
  isActive: boolean;
}

const STATUS_PILL: Record<DashboardAppointment["status"], { cls: string; label: string }> = {
  SCHEDULED:    { cls: "is-pending",   label: "scheduled" },
  CONFIRMED:    { cls: "is-confirmed", label: "confirmed" },
  CHECKED_IN:   { cls: "is-checked",   label: "checked in" },
  IN_PROGRESS:  { cls: "is-progress",  label: "in progress" },
  COMPLETED:    { cls: "is-checked",   label: "completed" },
  CANCELLED:    { cls: "is-pending",   label: "cancelled" },
  NO_SHOW:      { cls: "is-pending",   label: "no-show" },
};

// Per-stylist gradient palette so the dashboard avatars match the schedule
// page's column headers.
const STAFF_GRADIENTS = [
  "linear-gradient(135deg, #1ec3d9, #0892a8)",
  "linear-gradient(135deg, #0892a8, #4a82b3)",
  "linear-gradient(135deg, #4a82b3, #1ec3d9)",
  "linear-gradient(135deg, #5cdcec, #0892a8)",
  "linear-gradient(135deg, #1ec3d9, #6fa6cc)",
];

export default async function DashboardPage() {
  const settings = await apiFetch<SettingsResponse>("/settings");
  const tz = settings.timezone;
  const isoDate = todayIsoInTimezone(tz);
  const window = dayWindow(isoDate, tz);

  const [appointments, staff] = await Promise.all([
    apiFetch<DashboardAppointment[]>("/appointments", {
      query: {
        from: window.fromUtc.toISOString(),
        to: window.toUtc.toISOString(),
      },
    }),
    apiFetch<StaffRow[]>("/staff"),
  ]);

  const visibleAppts = appointments
    .filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW")
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const activeStaff = staff.filter((s) => s.isActive);
  const awaitingConfirmation = visibleAppts.filter(
    (a) => a.status === "SCHEDULED",
  ).length;
  const firstAppt = visibleAppts[0];

  const dateLine = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: tz,
  }).format(new Date());

  return (
    <>
      <header className="ss-page-head">
        <div className="ss-page-eyebrow">{dateLine}</div>
        <h2 className="ss-page-title">Today</h2>
        <p className="ss-page-sub">
          {visibleAppts.length === 0
            ? "No appointments on the books today."
            : `${visibleAppts.length} appointment${visibleAppts.length === 1 ? "" : "s"} today` +
              (awaitingConfirmation > 0
                ? `, ${awaitingConfirmation} awaiting confirmation`
                : "") +
              (firstAppt
                ? `. First in at ${formatTimeInTimezone(new Date(firstAppt.startAt), tz)}.`
                : ".")}
        </p>
      </header>

      <div className="ss-stats-grid">
        <div className="ss-stat is-magenta">
          <div className="ss-stat-eyebrow">Today</div>
          <div className="ss-stat-value">
            <span>{visibleAppts.length}</span>
            <span className="ss-unit">appointments</span>
          </div>
          <div className="ss-stat-foot">
            {awaitingConfirmation > 0
              ? `${awaitingConfirmation} awaiting confirmation`
              : "All confirmed"}
          </div>
        </div>
        <div className="ss-stat is-cyan">
          <div className="ss-stat-eyebrow">Staff</div>
          <div className="ss-stat-value">
            <span>{activeStaff.length}</span>
            <span className="ss-unit">stylists on the roster</span>
          </div>
          <div className="ss-stat-foot">
            <Link href="/staff" className="ss-link">
              Manage staff →
            </Link>
          </div>
        </div>
        <div className="ss-stat is-violet">
          <div className="ss-stat-eyebrow">Quick action</div>
          <div className="ss-stat-value">
            <span style={{ fontFamily: "var(--font-cormorant), serif", fontSize: 28 }}>
              Book
            </span>
          </div>
          <div className="ss-stat-foot">
            <Link href="/schedule" className="ss-link">
              Open the schedule →
            </Link>
          </div>
        </div>
      </div>

      <div className="ss-grid">
        <div className="ss-card">
          <div className="ss-card-head">
            <h3 className="ss-card-title">Today's schedule</h3>
            <span className="ss-card-meta">
              {visibleAppts.length} appointment{visibleAppts.length === 1 ? "" : "s"}
            </span>
          </div>
          {visibleAppts.length === 0 ? (
            <p className="ss-empty">
              Nothing booked yet. Open the{" "}
              <Link href="/schedule" className="ss-link">
                schedule
              </Link>{" "}
              to add an appointment.
            </p>
          ) : (
            <div className="ss-timeline">
              {visibleAppts.map((a) => {
                const start = new Date(a.startAt);
                const hour = formatTimeInTimezone(start, tz);
                const [h, m] = hour.split(":");
                const meridiem = m.split(" ")[1] ?? "";
                const minutes = m.split(" ")[0] ?? "00";
                const totalMin = a.services.reduce(
                  (acc, s) => acc + s.durationSnapshotMinutes,
                  0,
                );
                const pill = STATUS_PILL[a.status];
                const services = a.services
                  .map((s) => s.serviceNameSnapshot)
                  .join(" · ");
                return (
                  <Link
                    key={a.id}
                    href={`/schedule?date=${isoDate}`}
                    className="ss-timeline-row"
                  >
                    <div className="ss-timeline-time">
                      <span className="ss-time-h">{h}</span>
                      <span className="ss-time-m">
                        {minutes === "00" ? meridiem : minutes}
                      </span>
                    </div>
                    <div className="ss-appt is-cyan">
                      <div className="ss-appt-avatar">
                        {initialsOf(a.client.displayName)}
                      </div>
                      <div className="ss-appt-body">
                        <div className="ss-appt-row1">
                          <div className="ss-appt-name">
                            {a.client.displayName}
                          </div>
                          <span className="ss-appt-dur">{totalMin} min</span>
                        </div>
                        <div className="ss-appt-row2">
                          <span className="ss-appt-service">{services}</span>
                          <span className="ss-appt-divider" />
                          <span className="ss-appt-stylist">
                            with {a.staffMember.displayName.split(" ")[0]}
                          </span>
                          <span style={{ flex: 1 }} />
                          <span className={`ss-status-pill ${pill.cls}`}>
                            {pill.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="ss-card ss-side-block">
            <div className="ss-card-head">
              <h3 className="ss-card-title">Quick actions</h3>
              <span className="ss-card-meta">Shortcuts</span>
            </div>
            <div className="ss-quick-actions">
              <Link className="ss-action" href="/schedule">
                <span className="ss-action-title">Schedule</span>
              </Link>
              <Link className="ss-action" href="/clients">
                <span className="ss-action-title">Clients</span>
              </Link>
              <Link className="ss-action" href="/staff">
                <span className="ss-action-title">Staff</span>
              </Link>
              <Link className="ss-action" href="/services">
                <span className="ss-action-title">Services</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {activeStaff.length > 0 && (
        <>
          <div className="ss-divider">
            <div className="ss-divider-line" />
            <span className="ss-divider-label">Staff</span>
            <div className="ss-divider-line" />
          </div>
          <div className="ss-chair-strip">
            {activeStaff.map((s, i) => {
              const booked = visibleAppts.filter(
                (a) => a.staffMember.id === s.id,
              ).length;
              const total = Math.max(visibleAppts.length, 1);
              const pct = Math.round((booked / total) * 100);
              return (
                <div key={s.id} className="ss-chair">
                  <div className="ss-chair-head">
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
                    <div>
                      <div className="ss-chair-name">{s.displayName}</div>
                      {s.title && (
                        <div className="ss-chair-role">{s.title}</div>
                      )}
                    </div>
                  </div>
                  <div className="ss-chair-bar">
                    <div
                      className="ss-chair-bar-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="ss-chair-stat">
                    <span>{booked} of today's appts</span>
                    <strong>{pct}%</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}
