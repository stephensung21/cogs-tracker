# Receipt Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Money out marks a bill Used; only an admin's ticked "Receipt has been checked and paid" makes it Paid.
**Architecture:** New `"used"` value in `BillStatus` (`src/matching.ts`), views render it, the mark-paid form gets a
required checkbox checked again on the server. No schema change.
**Tech Stack:** Hono JSX, D1, Vitest. **Spec:** `docs/superpowers/specs/2026-11-23-receipt-check-design.md`

## Global Constraints
- Checkbox copy exactly: "Receipt has been checked and paid". Paid line: "✓ Receipt checked and paid · {date}".
- No file storage. No migration.

## Review Focus
1. A bill with money out AND marked paid shows Paid, not Used.
2. Posting `/bills/:id/paid` with `paid=1` but no tick is refused (form `required` can be bypassed).
3. Undo mark-as-paid on a bill with money out returns it to Used, not Collecting.

### Task 1: Status model
**Files:** Modify `src/matching.ts:47-58`, `test/matching.test.ts:70-76`
- [ ] Step 1: Change the billStatus test: `billStatus(10000, 10000, 10000)` → `"used"`; add
  `billStatus(10000, 10000, 10000, "2026-11-23T00:00:00Z")` → `"paid"`; keep the others.
- [ ] Step 2: `npx vitest run` — Expected: FAIL (`"paid"` received for the used case).
- [ ] Step 3: `type BillStatus = "open" | "funded" | "used" | "paid"`; order: markedPaid → paid, paidOut > 0 → used, then funded/open.
- [ ] Step 4: `npx vitest run` — Expected: PASS.

### Task 2: Views and route
**Files:** Modify `src/views.tsx` (StatusBadge, BillCard, Hero, BillDetail, CSS), `src/index.tsx` (`POST /bills/:id/paid`), `README.md`
- [ ] Step 1: Badge label "Used" (`.badge.used`, `.bar.used` in a muted/peach tint); card sub-line "Taken out {date}" for used, "Paid {marked date}" for paid.
- [ ] Step 2: Hero counts only `open`/`funded` bills in the pot.
- [ ] Step 3: BillDetail: used → hint "{paid_out} taken out on {date}. Waiting for cogs to check the receipt."; paid → "✓ Receipt checked and paid · {date}"; mark-paid form gets `<input type="checkbox" name="checked" value="1" required>` with the exact copy; undo form unchanged.
- [ ] Step 4: Route: when `paid=1` and `checked !== "1"`, redirect back with "Tick “Receipt has been checked and paid” first." and change nothing.
- [ ] Step 5: README matching table: money out → "Marks the bill Used; cogs marks it Paid after checking the receipt".
- [ ] Step 6: Verify: `npm run typecheck`, `npm test`; local dev: POST paid=1 without tick → refused; with tick → Paid; screenshot bill page Used and Paid.
- [ ] Step 7: Commit.

## Part 2: screenshots + Past bills tab

### Task 3: Receipt validation (pure)
**Files:** Create `src/receipts.ts`, `test/receipts.test.ts`
- Produces: `MAX_RECEIPT_BYTES = 1_000_000`, `RECEIPT_TYPES = ["image/webp","image/jpeg","image/png"]`,
  `checkReceipt(type: string, size: number): string | null` (error message or null).
- [ ] Test: webp 150 KB → null; 0 bytes → "That file is empty."; 1_000_001 bytes → "Screenshot is too big (max 1 MB)."; application/pdf → "Upload a screenshot (an image)."
- [ ] RED, implement, GREEN, commit.

### Task 4: Storage, routes, views
**Files:** Create `migrations/0005_receipts.sql`; modify `src/db.ts`, `src/index.tsx`, `src/views.tsx`, `src/art.tsx`, `README.md`
- Migration: `receipts(bill_id INTEGER PRIMARY KEY REFERENCES bills(id) ON DELETE CASCADE, mime TEXT NOT NULL, data BLOB NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`.
- db: `saveReceipt(db, billId, mime, bytes: ArrayBuffer)`, `getReceipt(db, billId): {mime, data: Uint8Array} | null`, `deleteReceipt(db, billId)`; `deleteBill` also deletes the receipt; `BILL_TOTALS_SQL` adds `has_receipt`.
- Routes: `POST /bills/:id/paid` (multipart, optional `receipt`), `POST /bills/:id/receipt` and `POST /bills/:id/receipt/delete` (admin), `GET /bills/:id/receipt` (any logged-in role, `Cache-Control: private`).
- Views: file input with client-side shrink script; thumbnail + admin replace/remove on paid bills; `Nav` gains `"past"`; nav + tab bar for both roles; Past bills page newest first with "View payment screenshot" links.
- [ ] Verify: typecheck, tests, local upload/serve/remove, viewer can view image but can't upload (403/redirect), screenshots of bill page and Past bills tab (desktop + phone width). Commit.
