import { describe, expect, it } from "vitest";
import { boxFromQuery, parseStates } from "../src/radar";

describe("parseStates", () => {
  it("turns OpenSky state vectors into planes with friendly units", () => {
    const planes = parseStates({
      time: 1795414840,
      states: [
        ["7c7806", "QFA711  ", "Australia", 1795414839, 1795414839, 147.5853, -19.6826, 11277.6, false, 218.61, 150.54, 0, null, 12001.5, null, false, 0],
        ["abc123", "", "Australia", null, 1795414830, null, null, null, true, 0, null, null, null, null, null, false, 0],
        ["7c1234", null, "Australia", 1795414839, 1795414839, 145.7, -16.9, null, true, 5.1, 90, null, null, null, null, false, 0],
      ],
    });
    expect(planes).toEqual([
      { id: "7c7806", callsign: "QFA711", country: "Australia", lat: -19.6826, lon: 147.5853, altFt: 37000, speedKt: 425, track: 151, onGround: false },
      { id: "7c1234", callsign: "", country: "Australia", lat: -16.9, lon: 145.7, altFt: null, speedKt: 10, track: 90, onGround: true },
    ]);
  });
  it("copes with no planes", () => {
    expect(parseStates({ time: 1, states: null })).toEqual([]);
  });
});

describe("boxFromQuery", () => {
  it("rounds the visible area outwards to whole degrees", () => {
    expect(boxFromQuery({ s: "-20.3", w: "143.6", n: "-12.7", e: "151.2" })).toEqual({ s: -21, w: 143, n: -12, e: 152 });
  });
  it("refuses areas too big to fetch cheaply (over 400 square degrees)", () => {
    expect(boxFromQuery({ s: "-40", w: "110", n: "-10", e: "155" })).toBeNull();
  });
  it("refuses junk and clamps to the globe", () => {
    expect(boxFromQuery({ s: "x", w: "1", n: "2", e: "3" })).toBeNull();
    expect(boxFromQuery({ s: "85.5", w: "-179.5", n: "95", e: "-170" })).toEqual({ s: 85, w: -180, n: 90, e: -170 });
  });
});
