# Open questions

Assumptions taken **without asking** in tasks 18–22, re-read with a second eye.
The question here is not "was this reasonable" but **"what breaks if the
assumption is wrong"** — an assumption that looked obvious is exactly the kind
that never surfaces as a question.

Each is implemented as described, marked `// DESIGN-Q` in the code.

Money and permissions questions are **not** deferred here — those stop the work
and are asked directly. Three below touch money and are flagged as such; they are
listed because the assumption is already in production code, not because they can
wait.

---

## 1 · A dispute resolution ends the order — it never resumes

**Assumed:** every resolution closes the order. Full refund and partial
settlement cancel it; release to seller completes it.

**If wrong:** a partial settlement is arguably a *continuation* — the buyer keeps
the car at a reduced price, so the order should proceed to `TRANSFER`, not
cancel. As built, a partial settlement cancels the order and the vehicle never
transfers, which contradicts the settlement itself.

**Touches money.** This is the one I would most want answered.

**Implemented:** partial settlement → `PARTIAL_REFUND` + order `CANCELLED`.
`src/lib/domain/disputes.ts`

---

## 2 · Who may open a dispute, and until when

**Assumed:** either party, at any stage before the order completes or cancels.

**If wrong:** a seller opening a dispute at `REQUEST` — before any money moved —
freezes a listing indefinitely with no cost. That is a denial tool. A rule like
"buyer only, and only after payment" would close it.

**Implemented:** both parties, any active stage. `openDispute`

---

## 3 · A dispute freezes the payment window permanently

**Assumed:** while frozen, the 24-hour payment window does not run — and it does
not resume afterwards either, because the resolution closes the order.

**If wrong:** if a resolution could return an order to its path (see #1), the
payment window would need to resume with its remaining time, not restart. As
built there is no remaining-time arithmetic at all.

**Touches money.** `timeoutUnpaidOrders` skips `DISPUTED`.

---

## 4 · Deposits settle at auction close, including on an unmet reserve

**Assumed:** reserve unmet → no winner → every deposit returned.

**If wrong:** if the seller may accept the highest bid after an unmet-reserve
close, returning deposits immediately destroys the mechanism — the winning bidder
has already been released and has no obligation. A short window before settling
would be needed.

**Touches money.** `closeEndedAuctions` settles in the same operation.

---

## 5 · The extension cap is 10, and it is per auction not per bidder

**Assumed:** `MAX_EXTENSIONS = 10`, shared.

**If wrong:** a shared cap lets one bidder exhaust it early with cheap bids and
then win in silence. A per-bidder cap, or a cap on total added time, behaves
differently at the end.

**Implemented:** 10 shared, published in the public object.

---

## 6 · Bidder aliases number by order of first appearance

**Assumed:** "bidder 1" is whoever bid first.

**If wrong:** the number leaks arrival order, which combined with public
timestamps can identify someone who is known to have been present early. Random
per-auction numbering would not.

**Implemented:** `aliasMap` in `src/lib/domain/auctions.ts`

---

## 7 · A report puts a listing into review immediately, on the first report

**Assumed:** one report is enough.

**If wrong:** a competitor removes any listing from search with a single click.
A threshold (two reports, or one from a verified buyer) changes the economics
entirely.

**Implemented:** first report → `PENDING_REVIEW`. Decision 33 says a report
triggers review; it does not say how many. `fileReport`

---

## 8 · Stage targets are fixed constants in code

**Assumed:** 24 / 24 / 72 / 24 / 120 hours.

**If wrong:** these are operational SLAs that will change with volume and with
partner performance, and changing them means a deploy. They arguably belong in
`PlatformSetting` where operations can tune them.

**Implemented:** `STAGE_TARGET_HOURS` in `src/lib/domain/admin-orders.ts`

---

## 9 · "Contenders" excludes auto-rejected bidders

**Assumed:** someone whose offer was below the hidden floor chose to leave, so a
relist notice would be noise.

**If wrong:** they did not choose anything — they were rejected by a threshold
they cannot see. On a relist the seller may well have lowered it, and they are
precisely the audience.

**Implemented:** `timeoutUnpaidOrders` notifies only `autoRejected: false`.

---

## 10 · Identity access is logged but nobody is alerted

**Assumed:** writing to `AuditLog` is sufficient.

**If wrong:** a log nobody reads is a log nobody reads. If access is meant to be
exceptional, the customer — or a supervisor — should be notified when it happens,
not only be able to find it later.

**Implemented:** logged, not notified. `viewIdentity`
