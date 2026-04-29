import { describe, expect, it } from "vitest";
import {
  firstName,
  formatCancelSms,
  formatConfirmationSms,
  formatReminderSms,
  formatRescheduleSms,
} from "../src/messaging/sms-formatter";

describe("sms-formatter", () => {
  describe("firstName", () => {
    it("returns the first whitespace-delimited token", () => {
      expect(firstName("Mira Castellanos")).toBe("Mira");
      expect(firstName("Mira P. Castellanos")).toBe("Mira");
      expect(firstName("Mira")).toBe("Mira");
    });

    it("returns a fallback for blank names", () => {
      expect(firstName("")).toBe("there");
      expect(firstName("   ")).toBe("there");
    });
  });

  describe("formatConfirmationSms", () => {
    const baseInput = {
      // Wed Apr 30 2026 1:00 PM in America/New_York → 17:00 UTC.
      startAt: new Date("2026-04-30T17:00:00Z"),
      staffFirstName: "Trina",
      serviceNames: ["Single-process color"],
      durationMinutes: 90,
      clientFirstName: "Mira",
      salonName: "Bella's Salon",
      salonTimezone: "America/New_York",
    };

    it("renders the salon-local date and time", () => {
      const body = formatConfirmationSms(baseInput);
      expect(body).toContain("Bella's Salon");
      expect(body).toContain("Mira");
      expect(body).toContain("Trina");
      expect(body).toContain("Single-process color");
      expect(body).toContain("90 min");
      expect(body).toContain("STOP");
      // Date/time rendered in America/New_York
      expect(body).toMatch(/Thu, Apr 30/);
      expect(body).toMatch(/1:00\s?PM/i);
    });

    it("renders the same instant in a different timezone differently", () => {
      const ny = formatConfirmationSms(baseInput);
      const la = formatConfirmationSms({
        ...baseInput,
        salonTimezone: "America/Los_Angeles",
      });
      // 17:00 UTC = 1:00 PM EDT = 10:00 AM PDT
      expect(ny).toMatch(/1:00\s?PM/i);
      expect(la).toMatch(/10:00\s?AM/i);
    });

    it("comma-joins multiple services", () => {
      const body = formatConfirmationSms({
        ...baseInput,
        serviceNames: ["Color refresh", "Blowout"],
      });
      expect(body).toContain("Color refresh, Blowout");
    });
  });

  describe("formatRescheduleSms", () => {
    it("renders both old and new times in the salon timezone", () => {
      const body = formatRescheduleSms({
        previousStartAt: new Date("2026-04-30T17:00:00Z"),
        newStartAt: new Date("2026-05-02T20:00:00Z"),
        staffFirstName: "Trina",
        clientFirstName: "Mira",
        salonName: "Bella's Salon",
        salonTimezone: "America/New_York",
      });
      expect(body).toContain("Bella's Salon");
      expect(body).toContain("Mira");
      expect(body).toContain("Trina");
      expect(body).toContain("STOP");
      // Old: Apr 30 1:00 PM EDT, New: May 2 4:00 PM EDT
      expect(body).toMatch(/Thu, Apr 30 at 1:00\s?PM/);
      expect(body).toMatch(/Sat, May 2 at 4:00\s?PM/);
    });
  });

  describe("formatCancelSms", () => {
    it("renders the cancelled appointment time in the salon timezone", () => {
      const body = formatCancelSms({
        startAt: new Date("2026-04-30T17:00:00Z"),
        staffFirstName: "Trina",
        clientFirstName: "Mira",
        salonName: "Bella's Salon",
        salonTimezone: "America/New_York",
      });
      expect(body).toContain("Bella's Salon");
      expect(body).toContain("cancelled");
      expect(body).toContain("Trina");
      expect(body).toMatch(/Thu, Apr 30 at 1:00\s?PM/);
      expect(body).toContain("STOP");
    });
  });

  describe("formatReminderSms", () => {
    it("renders a reminder body with the appointment time", () => {
      const body = formatReminderSms({
        startAt: new Date("2026-04-30T17:00:00Z"),
        staffFirstName: "Trina",
        clientFirstName: "Mira",
        salonName: "Bella's Salon",
        salonTimezone: "America/New_York",
      });
      expect(body).toContain("Bella's Salon");
      expect(body).toContain("Reminder");
      expect(body).toContain("Trina");
      expect(body).toMatch(/Thu, Apr 30 at 1:00\s?PM/);
      expect(body).toContain("STOP");
    });
  });
});
