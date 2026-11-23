import { describe, expect, it } from "vitest";
import { checkReceipt } from "../src/receipts";

describe("checkReceipt", () => {
  it("accepts a shrunk screenshot", () => {
    expect(checkReceipt("image/webp", 150_000)).toBeNull();
    expect(checkReceipt("image/jpeg", 1_000_000)).toBeNull();
  });
  it("rejects empty, too big and non-image files", () => {
    expect(checkReceipt("image/png", 0)).toBe("That file is empty.");
    expect(checkReceipt("image/webp", 1_000_001)).toBe("Screenshot is too big (max 1 MB).");
    expect(checkReceipt("application/pdf", 50_000)).toBe("Upload a screenshot (an image).");
  });
});
