// Payment screenshots. The browser shrinks them before upload; this is the server's safety net.

/** D1 rows max out at 2 MB; shrunk screenshots are ~80-150 KB, so 1 MB leaves plenty of room. */
export const MAX_RECEIPT_BYTES = 1_000_000;

export const RECEIPT_TYPES = ["image/webp", "image/jpeg", "image/png"];

/** An error message to show, or null if the file is fine to store. */
export function checkReceipt(type: string, size: number): string | null {
  if (!RECEIPT_TYPES.includes(type)) return "Upload a screenshot (an image).";
  if (size <= 0) return "That file is empty.";
  if (size > MAX_RECEIPT_BYTES) return "Screenshot is too big (max 1 MB).";
  return null;
}
