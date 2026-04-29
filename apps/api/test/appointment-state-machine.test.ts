import { describe, expect, it } from "vitest";
import { AppointmentStatus } from "@prisma/client";
import {
  BLOCKING_STATUSES,
  allowedTransitions,
  canCancel,
  canReschedule,
  canTransition,
  isTerminal,
} from "../src/appointments/state-machine";

describe("appointment state machine", () => {
  it("allows the happy-path forward chain", () => {
    expect(canTransition("SCHEDULED", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "CHECKED_IN")).toBe(true);
    expect(canTransition("CHECKED_IN", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
  });

  it("forbids backwards transitions", () => {
    expect(canTransition("CONFIRMED", "SCHEDULED")).toBe(false);
    expect(canTransition("CHECKED_IN", "CONFIRMED")).toBe(false);
    expect(canTransition("IN_PROGRESS", "CHECKED_IN")).toBe(false);
    expect(canTransition("COMPLETED", "IN_PROGRESS")).toBe(false);
  });

  it("treats COMPLETED, CANCELLED, NO_SHOW as terminal", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("NO_SHOW")).toBe(true);
    expect(allowedTransitions("COMPLETED")).toEqual([]);
    expect(allowedTransitions("CANCELLED")).toEqual([]);
    expect(allowedTransitions("NO_SHOW")).toEqual([]);
  });

  it("allows fast-forward to NO_SHOW from any pre-arrival state", () => {
    expect(canTransition("SCHEDULED", "NO_SHOW")).toBe(true);
    expect(canTransition("CONFIRMED", "NO_SHOW")).toBe(true);
  });

  it("does not allow NO_SHOW once the visit has started", () => {
    expect(canTransition("CHECKED_IN", "NO_SHOW")).toBe(false);
    expect(canTransition("IN_PROGRESS", "NO_SHOW")).toBe(false);
  });

  it("allows reschedule only before IN_PROGRESS", () => {
    expect(canReschedule("SCHEDULED")).toBe(true);
    expect(canReschedule("CONFIRMED")).toBe(true);
    expect(canReschedule("CHECKED_IN")).toBe(true);
    expect(canReschedule("IN_PROGRESS")).toBe(false);
    expect(canReschedule("COMPLETED")).toBe(false);
    expect(canReschedule("CANCELLED")).toBe(false);
  });

  it("allows cancel from every non-terminal state", () => {
    const everyStatus: AppointmentStatus[] = [
      "SCHEDULED",
      "CONFIRMED",
      "CHECKED_IN",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "NO_SHOW",
    ];
    for (const s of everyStatus) {
      expect(canCancel(s)).toBe(!isTerminal(s));
    }
  });

  it("counts COMPLETED as a stylist-blocking status", () => {
    // Important: a completed appointment still occupies the time slot it ran
    // in. Otherwise overlap checks would incorrectly let a new booking sit on
    // top of a finished one.
    expect(BLOCKING_STATUSES).toContain("COMPLETED");
  });

  it("does not block on CANCELLED or NO_SHOW", () => {
    expect(BLOCKING_STATUSES).not.toContain("CANCELLED");
    expect(BLOCKING_STATUSES).not.toContain("NO_SHOW");
  });
});
