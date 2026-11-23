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
