"use client";

import { useEffect, useState } from "react";

// Cancel-confirmation modal. Replaces the old `window.prompt()` because we
// now need a scope choice ("just this visit" vs "end the whole series")
// for series occurrences, and a native prompt can't render a radio.
export function CancelAppointmentModal({
  clientName,
  isSeries,
  isPending,
  onConfirm,
  onClose,
}: {
  clientName: string;
  /** When true, surface the "End the whole series" radio. */
  isSeries: boolean;
  isPending: boolean;
  onConfirm: (input: { reason: string; scope: "one" | "following" }) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"one" | "following">("one");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="bk-backdrop" onClick={onClose} aria-hidden />
      <div
        className="bk-modal bk-modal-classic ss-cancel-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ss-cancel-title"
      >
        <div className="bk-head">
          <div>
            <div className="bk-kicker">Cancel appointment</div>
            <h2 className="bk-title" id="ss-cancel-title">
              {clientName}
            </h2>
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
          {isSeries && (
            <fieldset className="ss-scope-radio">
              <legend className="bk-label">Cancel</legend>
              <label className={`ss-scope-row${scope === "one" ? " is-on" : ""}`}>
                <input
                  type="radio"
                  name="cancel-scope"
                  value="one"
                  checked={scope === "one"}
                  onChange={() => setScope("one")}
                />
                <span>
                  <strong>Just this visit</strong>
                  <span className="ss-scope-sub">
                    The series keeps running on its normal cadence.
                  </span>
                </span>
              </label>
              <label
                className={`ss-scope-row${scope === "following" ? " is-on" : ""}`}
              >
                <input
                  type="radio"
                  name="cancel-scope"
                  value="following"
                  checked={scope === "following"}
                  onChange={() => setScope("following")}
                />
                <span>
                  <strong>End the whole series</strong>
                  <span className="ss-scope-sub">
                    Cancels every future occurrence and stops top-offs.
                  </span>
                </span>
              </label>
            </fieldset>
          )}
          <div className="bk-field">
            <label className="bk-label" htmlFor="ss-cancel-reason">
              Reason (optional)
            </label>
            <textarea
              id="ss-cancel-reason"
              className="bk-textarea"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Why is this being cancelled?"
            />
          </div>
        </div>
        <div className="bk-footer">
          <span className="bk-footer-meta" />
          <div className="bk-footer-actions">
            <button
              type="button"
              className="ss-btn ss-btn-ghost"
              onClick={onClose}
              disabled={isPending}
            >
              Keep it
            </button>
            <button
              type="button"
              className="ss-btn ss-btn-primary"
              onClick={() => onConfirm({ reason: reason.trim(), scope })}
              disabled={isPending}
            >
              {isPending
                ? "Cancelling…"
                : scope === "following"
                  ? "End series"
                  : "Cancel appointment"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
