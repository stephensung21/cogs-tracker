# Receipt check before Paid — design (short)

Date: 2026-11-23 · Status: approved in conversation

## Intent
Cogs (admin) wants "Paid" to mean he has checked the receipt, not just that money left the Saver. The roommate
sees the confirmation. No files are stored.

## Approaches
- **Checkbox only (chosen).** Marking paid needs a ticked "Receipt has been checked and paid". No storage.
- Checkbox + optional upload to Cloudflare R2 (~5 MB/month, free tier, but needs a card on the Cloudflare account
  and keeps copies of bills). Rejected: user doesn't want to store files.

## Design
- Statuses: **Collecting** (open) → **Ready to pay** (funded) → **Used** (new: money out with the bill's code) →
  **Paid** (only when admin marks it paid). Money out no longer means Paid.
- Collected totals never change on money out (already true: totals count money in only).
- Used bills show "$180 taken out on 20 Nov"; the bill page adds "Waiting for cogs to check the receipt."
- Mark as paid (admin, bill page): a required checkbox "Receipt has been checked and paid", then the button.
  The server refuses without the tick. Afterwards everyone sees "✓ Receipt checked and paid · 21 Nov".
  Undo stays. Marking paid with no money out still works (paid from another account).
- Recurring bills: money out still goes to the oldest period with no money out and not marked paid; that period
  becomes Used. Marking paid is per period.
- Unchanged: matching, totals, the "Not fully paid" banner (about money collected), splits/overrides.

## Builder's calls
- The bills pot on the home page counts only Collecting and Ready bills (a Used bill's money has left the pot).
- Used gets its own badge and bar colour.

## Addendum: payment screenshots and a Past bills tab (approved in conversation)

- Optional payment screenshot per bill/period, stored in D1 (`receipts` table, one row per bill, BLOB).
  Browser shrinks it first: max 1200px wide, WebP 0.8 (JPEG 0.8 where WebP encoding isn't supported).
  Server accepts image/webp, image/jpeg, image/png up to 1 MB. Google Drive and R2 were rejected
  (setup/token upkeep; card required).
- Attach on the Mark as paid form; once paid, admin can add, replace or remove it. Undo keeps it.
- Served only to logged-in users at `GET /bills/:id/receipt`; thumbnail on the bill page for both roles.
- **Past bills** becomes its own tab (header nav and phone tab bar) for both admin and viewer, newest first,
  each past bill linking to its screenshot when there is one.
- Builder's calls: viewer gets a nav (Bills, Past bills) so they can reach the tab; the footer link stays.
