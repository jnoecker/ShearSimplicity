// Read-only SMS thread on the client profile. Outbound bubbles render on
// the right (us → them), inbound on the left, and a kind pill rides on
// each outbound bubble so a receptionist can scan the column for what
// kind of automated message went out without reading the body.
//
// Bubbles render newest-first to match the API; flip the array on render
// so the timeline reads top-to-bottom oldest → newest, which is how chat
// threads conventionally read.

export type MessageDirection = "OUTBOUND" | "INBOUND";
export type MessageStatus =
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "RECEIVED";

export interface MessageRow {
  id: string;
  direction: MessageDirection;
  status: MessageStatus;
  body: string;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  // Server-derived label key. See clients.service.ts → deriveMessageKind.
  kind:
    | "confirmation"
    | "reschedule"
    | "cancellation"
    | "reminder"
    | "outbound"
    | "confirmed"
    | "opt_out"
    | "reply";
}

interface KindStyle {
  label: string;
  cls: string;
}

const KIND_STYLES: Record<MessageRow["kind"], KindStyle> = {
  confirmation: { label: "Confirmation sent", cls: "is-confirmed" },
  reschedule: { label: "Reschedule sent", cls: "is-progress" },
  cancellation: { label: "Cancellation sent", cls: "is-cancelled" },
  reminder: { label: "Reminder sent", cls: "is-pending" },
  outbound: { label: "Sent", cls: "is-pending" },
  confirmed: { label: "Confirmed by client", cls: "is-confirmed" },
  opt_out: { label: "Opted out", cls: "is-cancelled" },
  reply: { label: "Reply received", cls: "is-checked" },
};

export function MessageHistory({ messages }: { messages: MessageRow[] }) {
  if (messages.length === 0) {
    return <p className="ss-empty">No SMS sent or received yet.</p>;
  }

  // The API returns newest-first; render oldest-first so the column reads
  // chronologically. Day dividers separate runs of messages on the same
  // calendar day — same convention as the design's Messages screen.
  const ordered = [...messages].reverse();

  const items: Array<
    | { kind: "divider"; key: string; label: string }
    | { kind: "bubble"; key: string; row: MessageRow }
  > = [];
  let lastDay: string | null = null;
  for (const row of ordered) {
    const day = dayKey(row.createdAt);
    if (day !== lastDay) {
      items.push({ kind: "divider", key: `d-${day}`, label: dayLabel(row.createdAt) });
      lastDay = day;
    }
    items.push({ kind: "bubble", key: row.id, row });
  }

  return (
    <div className="ss-thread-body" style={{ padding: 0 }}>
      {items.map((item) => {
        if (item.kind === "divider") {
          return (
            <div key={item.key} className="ss-day-divider">
              {item.label}
            </div>
          );
        }
        return <Bubble key={item.key} row={item.row} />;
      })}
    </div>
  );
}

function Bubble({ row }: { row: MessageRow }) {
  const isOut = row.direction === "OUTBOUND";
  const pill = KIND_STYLES[row.kind];
  const failed = row.status === "FAILED";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isOut ? "flex-end" : "flex-start",
        gap: 4,
      }}
    >
      <span
        className={`ss-status-pill ${pill.cls}`}
        style={{ fontSize: 9.5 }}
      >
        {failed ? "Send failed" : pill.label}
      </span>
      <div
        className={isOut ? "ss-bubble ss-bubble-us" : "ss-bubble ss-bubble-them"}
        style={failed ? { opacity: 0.6 } : undefined}
      >
        {row.body}
      </div>
      <div className="ss-bubble-time">{timeLabel(row.createdAt)}</div>
    </div>
  );
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
