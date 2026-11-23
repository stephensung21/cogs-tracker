import { describe, expect, it } from "vitest";
import { isShort, missedPeriods, nextDue, periodStartFor, pickPeriod, sydneyDate } from "../src/periods";

describe("sydneyDate", () => {
  it("uses Sydney, not UTC", () => {
    expect(sydneyDate("2026-11-15T10:00:00Z")).toBe("2026-11-15"); // 9pm AEDT
    expect(sydneyDate("2026-11-15T13:30:00Z")).toBe("2026-11-16"); // 00:30 AEDT
    expect(sydneyDate("2026-11-15T21:00:00+11:00")).toBe("2026-11-15");
  });
});

describe("nextDue", () => {
  it("adds 7 / 14 days", () => {
    expect(nextDue("2026-12-29", "weekly", 29)).toBe("2027-01-05");
    expect(nextDue("2026-12-29", "fortnightly", 29)).toBe("2027-01-12");
  });
  it("clamps month ends and returns to the anchor day", () => {
    expect(nextDue("2027-01-31", "monthly", 31)).toBe("2027-02-28");
    expect(nextDue("2027-02-28", "monthly", 31)).toBe("2027-03-31");
    expect(nextDue("2027-03-31", "monthly", 31)).toBe("2027-04-30");
    expect(nextDue("2028-01-31", "monthly", 31)).toBe("2028-02-29");
    expect(nextDue("2026-11-30", "quarterly", 30)).toBe("2027-02-28");
  });
});

describe("periodStartFor", () => {
  it("is the day after the previous due date", () => {
    expect(periodStartFor("2026-12-15", "monthly", 15)).toBe("2026-11-16");
    expect(periodStartFor("2027-03-31", "monthly", 31)).toBe("2027-03-01");
    expect(periodStartFor("2027-01-05", "weekly", 5)).toBe("2026-12-30");
  });
});

describe("missedPeriods", () => {
  it("is empty until the due date has passed", () => {
    expect(missedPeriods("2026-11-15", "monthly", 15, "2026-11-15")).toEqual([]);
  });
  it("creates the next period the day after the due date", () => {
    expect(missedPeriods("2026-11-15", "monthly", 15, "2026-11-16")).toEqual([
      { start: "2026-11-16", due: "2026-12-15" },
    ]);
  });
  it("creates every missed period in order", () => {
    expect(missedPeriods("2026-08-15", "monthly", 15, "2026-11-20")).toEqual([
      { start: "2026-08-16", due: "2026-09-15" },
      { start: "2026-09-16", due: "2026-10-15" },
      { start: "2026-10-16", due: "2026-11-15" },
      { start: "2026-11-16", due: "2026-12-15" },
    ]);
  });
});

describe("pickPeriod", () => {
  const ps = [
    { id: 1, period_start: "2026-09-16", due_date: "2026-10-15", paid: true, archived: 1 },
    { id: 2, period_start: "2026-10-16", due_date: "2026-11-15", paid: false, archived: 1 },
    { id: 3, period_start: "2026-11-16", due_date: "2026-12-15", paid: false, archived: 0 },
  ];
  it("money in goes to the period containing the date, including the due date", () => {
    expect(pickPeriod("in", "2026-11-15", ps)).toBe(2);
    expect(pickPeriod("in", "2026-11-16", ps)).toBe(3);
    expect(pickPeriod("in", "2026-10-01", ps)).toBe(1);
  });
  it("money in outside every period goes to the active one", () => {
    expect(pickPeriod("in", "2026-01-01", ps)).toBe(3);
  });
  it("money out marks the oldest unpaid period", () => {
    expect(pickPeriod("out", "2026-11-20", ps)).toBe(2);
  });
  it("money out with everything paid goes to the active period", () => {
    expect(pickPeriod("out", "2026-11-20", ps.map((p) => ({ ...p, paid: true })))).toBe(3);
  });
  it("returns null for an empty series", () => {
    expect(pickPeriod("in", "2026-11-20", [])).toBeNull();
  });
});

describe("isShort", () => {
  const b = { due_date: "2026-11-15", amount_due: 18000, collected: 14000, shortfall_dismissed_at: null };
  it("is short once the due date has passed with money missing", () => {
    expect(isShort(b, "2026-11-16")).toBe(true);
    expect(isShort(b, "2026-11-15")).toBe(false);
  });
  it("is not short when fully collected, dismissed, or undated", () => {
    expect(isShort({ ...b, collected: 18000 }, "2026-12-01")).toBe(false);
    expect(isShort({ ...b, shortfall_dismissed_at: "2026-11-20" }, "2026-12-01")).toBe(false);
    expect(isShort({ ...b, due_date: null }, "2026-12-01")).toBe(false);
  });
});
