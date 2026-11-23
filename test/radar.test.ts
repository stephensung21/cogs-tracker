import { describe, expect, it } from "vitest";
import { areaFromQuery, parseAircraft } from "../src/radar";

describe("parseAircraft", () => {
  it("turns adsb.lol aircraft into planes", () => {
    const planes = parseAircraft({
      now: 1795415322000,
      ac: [
        { hex: "7c1464", flight: "QFA97   ", r: "VH-EBA", t: "A332", alt_baro: 38000, gs: 481.5, track: 325.75, lat: -15.415587, lon: 145.040719 },
        { hex: "7c0001", flight: "", r: "VH-ABC", t: "B738", alt_baro: "ground", gs: 3.2, lat: -16.88, lon: 145.75 },
        { hex: "7c0002", alt_baro: 9000 }, // no position yet: skipped
      ],
    });
    expect(planes).toEqual([
      { id: "7c1464", callsign: "QFA97", reg: "VH-EBA", type: "A332", lat: -15.415587, lon: 145.040719, altFt: 38000, speedKt: 482, track: 326, onGround: false },
      { id: "7c0001", callsign: "", reg: "VH-ABC", type: "B738", lat: -16.88, lon: 145.75, altFt: null, speedKt: 3, track: null, onGround: true },
    ]);
  });
  it("copes with no aircraft", () => {
    expect(parseAircraft({ now: 1 })).toEqual([]);
  });
});

describe("areaFromQuery", () => {
  it("turns the visible map into a rounded centre and radius in nautical miles", () => {
    // About the starting view: centre -16.5, 147.4, ~4.5 deg tall x 9 deg wide.
    expect(areaFromQuery({ s: "-18.75", w: "142.9", n: "-14.25", e: "151.9" })).toEqual({ lat: -16.5, lon: 147.5, nm: 250 });
  });
  it("uses a smaller radius when zoomed in", () => {
    expect(areaFromQuery({ s: "-17", w: "145.5", n: "-16.6", e: "146" })).toEqual({ lat: -17, lon: 146, nm: 25 });
  });
  it("refuses areas wider than adsb.lol's 250 nm limit can usefully cover, and junk", () => {
    expect(areaFromQuery({ s: "-40", w: "110", n: "-10", e: "155" })).toBeNull();
    expect(areaFromQuery({ s: "x", w: "1", n: "2", e: "3" })).toBeNull();
  });
});
