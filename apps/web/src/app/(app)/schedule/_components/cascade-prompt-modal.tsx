"use client";

import { useEffect } from "react";

// Two-button confirm: "just this one" or "this and all future". Shown after
// a drag-to-reschedule on a series occurrence so the operator's intent is
// explicit — the alternative is a silent default that's wrong half the
// time. Generic over reschedule + cancel so the wording can be tuned.
export interface CascadePromptCopy {
  title: string;
  body: string;
  oneLabel: string;
  followingLabel: string;
}

export function CascadePromptModal({
  copy,
  onPick,
  onCancel,
  isPending,
}: {
  copy: CascadePromptCopy;
  onPick: (scope: "one" | "following") => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  // Esc cancels. Same pattern as the booking modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <>
      <div className="bk-backdrop" onClick={onCancel} aria-hidden />
      <div
        className="bk-modal bk-modal-classic ss-cascade-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ss-cascade-title"
      >
        <div className="bk-head">
          <div>
            <div className="bk-kicker">Recurring appointment</div>
            <h2 className="bk-title" id="ss-cascade-title">
              {copy.title}
            </h2>
          </div>
          <button
            type="button"
            className="bk-close"
            onClick={onCancel}
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
          <p className="ss-cascade-body">{copy.body}</p>
          <div className="ss-cascade-actions">
            <button
              type="button"
              className="ss-btn ss-btn-ghost"
              onClick={() => onPick("one")}
              disabled={isPending}
            >
              {copy.oneLabel}
            </button>
            <button
              type="button"
              className="ss-btn ss-btn-primary"
              onClick={() => onPick("following")}
              disabled={isPending}
            >
              {copy.followingLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
