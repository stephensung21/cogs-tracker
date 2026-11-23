# Transfers out — design (short)

Date: 2026-11-23 · Status: approved in conversation (option A)

Money leaving the Saver without a bill code (e.g. cogs moving money to the account he pays bills from, an Up
account or another bank) is not an "unmatched" problem. It's filed automatically as **Transfer out**:

- Not on the Unmatched list or in its count. Still on All payments, tagged "Transfer out".
- Rule: money out (amount < 0) with **no** allocations, whether or not it's been edited by hand. Partly split
  money out still shows its unassigned leftover in Unmatched, as before.
- Cogs can still assign it to a bill, split it or ignore it.
- Money in without a code still goes to Unmatched.
- Option B (only transfers to cogs's own Up accounts) was rejected: the paying account may be another bank.
- Also fix the label: money out to one of the owner's Up accounts reads "to your own account", not "from".
