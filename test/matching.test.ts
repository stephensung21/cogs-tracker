import { describe, expect, it } from "vitest";
import { billStatus, formatCents, matchBill, normalizeCode, parseDollars, percent, tokens } from "../src/matching";
import { hmacHex, verifyUpSignature } from "../src/up";

const bills = [
  { id: 1, code: "ELEC" },
  { id: 2, code: "WIFI" },
  { id: 3, code: "RENT-DEC" },
];

describe("matchBill", () => {
  it("matches an exact reference, ignoring case", () => {
    expect(matchBill({ message: "elec" }, bills)).toBe(1);
  });

  it("matches the code as a word inside a longer reference", () => {
    expect(matchBill({ message: "Bills: ELEC dec" }, bills)).toBe(1);
    expect(matchBill({ message: "wifi!!" }, bills)).toBe(2);
    expect(matchBill({ message: "rent-dec" }, bills)).toBe(3);
  });

  it("does not match a code that is only part of a word", () => {
    expect(matchBill({ message: "ELECTRIC" }, bills)).toBeNull();
    expect(matchBill({ message: "RENT" }, bills)).toBeNull();
  });

  it("treats a reference naming two bills as ambiguous", () => {
    expect(matchBill({ message: "ELEC WIFI" }, bills)).toBeNull();
  });

  it("falls back to raw text, then description", () => {
    expect(matchBill({ message: null, rawText: "TRANSFER WIFI 123" }, bills)).toBe(2);
    expect(matchBill({ message: "", rawText: null, description: "Transfer ELEC" }, bills)).toBe(1);
  });

  it("prefers the reference over the description", () => {
    expect(matchBill({ message: "WIFI", description: "ELEC Pty Ltd" }, bills)).toBe(2);
  });

  it("returns null with no bills or no text", () => {
    expect(matchBill({ message: "ELEC" }, [])).toBeNull();
    expect(matchBill({}, bills)).toBeNull();
  });
});

describe("helpers", () => {
  it("normalizes codes", () => {
    expect(normalizeCode(" elec ")).toBe("ELEC");
    expect(normalizeCode("rent dec!")).toBe("RENTDEC");
    expect(normalizeCode("rent-dec")).toBe("RENT-DEC");
  });

  it("tokenizes", () => {
    expect(tokens("hi - ELEC, -wifi-")).toEqual(["HI", "ELEC", "WIFI"]);
  });

  it("parses dollars to cents", () => {
    expect(parseDollars("120")).toBe(12000);
    expect(parseDollars("$1,200.5")).toBe(120050);
    expect(parseDollars("0.01")).toBe(1);
    expect(parseDollars("0")).toBeNull();
    expect(parseDollars("abc")).toBeNull();
    expect(parseDollars("1.234")).toBeNull();
  });

  it("formats cents", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(-500)).toBe("-$5.00");
  });

  it("works out status and percent", () => {
    expect(billStatus(5000, 10000, 0)).toBe("open");
    expect(billStatus(10000, 10000, 0)).toBe("funded");
    expect(billStatus(10000, 10000, 10000)).toBe("paid");
    expect(percent(5000, 10000)).toBe(50);
    expect(percent(15000, 10000)).toBe(100);
  });
});

describe("verifyUpSignature", () => {
  it("accepts a correct signature and rejects others", async () => {
    const body = '{"data":{"type":"webhook-events"}}';
    const sig = await hmacHex("s3cret", body);
    expect(await verifyUpSignature(body, sig, "s3cret")).toBe(true);
    expect(await verifyUpSignature(body, sig.toUpperCase(), "s3cret")).toBe(true);
    expect(await verifyUpSignature(body + " ", sig, "s3cret")).toBe(false);
    expect(await verifyUpSignature(body, sig, "other")).toBe(false);
    expect(await verifyUpSignature(body, null, "s3cret")).toBe(false);
  });
});
