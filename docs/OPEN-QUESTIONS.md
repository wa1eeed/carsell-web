# Open questions

Assumptions taken **without asking** in tasks 18–22, re-read with a second eye.
The question here is not "was this reasonable" but **"what breaks if the
assumption is wrong"** — an assumption that looked obvious is exactly the kind
that never surfaces as a question.

**All ten were answered on 2026-08-02.** What follows is the record: the
assumption as built, what would have broken, and the ruling. Kept because the
reasoning is the durable part — a future change to any of these needs to know
why it is the way it is.

Three touched money. The first was **inverted** — see its ruling.

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


> **RULED:** A settlement **completes the sale**. The buyer keeps the vehicle,
> the order moves to `TRANSFER`, ownership transfers. The difference is refunded
> to the buyer's **wallet** from escrow; the remainder is released to the seller.
>
> A settlement means both sides agreed a price that accounts for the defect.
> Cancelling means returning the car — and that is a *full refund*, not a
> settlement. `Order.settlementAmount` holds the settled price; `agreedPrice`
> keeps the original. The invoice uses the settled price; an audit needs both.

---

## 2 · Who may open a dispute, and until when

**Assumed:** either party, at any stage before the order completes or cancels.

**If wrong:** a seller opening a dispute at `REQUEST` — before any money moved —
freezes a listing indefinitely with no cost. That is a denial tool. A rule like
"buyer only, and only after payment" would close it.

**Implemented:** both parties, any active stage. `openDispute`


> **RULED:** **Buyer only, and only once the order has reached payment** — when
> money is in escrow. No dispute on a live listing, none before payment.
>
> The seller has no dispute; they have cancel-with-reason, and report.

---

## 3 · A dispute freezes the payment window permanently

**Assumed:** while frozen, the 24-hour payment window does not run — and it does
not resume afterwards either, because the resolution closes the order.

**If wrong:** if a resolution could return an order to its path (see #1), the
payment window would need to resume with its remaining time, not restart. As
built there is no remaining-time arithmetic at all.

**Touches money.** `timeoutUnpaidOrders` skips `DISPUTED`.


> **RULED:** The window **pauses and resumes**. The dispute stops the clock and
> stores the remainder (`paymentPausedRemainingMs`); resolution resumes it from
> where it stopped. If under 6 hours remain, 6 hours are granted — someone who
> has just been through a dispute is not asked to pay within half an hour.

---

## 4 · Deposits settle at auction close, including on an unmet reserve

**Assumed:** reserve unmet → no winner → every deposit returned.

**If wrong:** if the seller may accept the highest bid after an unmet-reserve
close, returning deposits immediately destroys the mechanism — the winning bidder
has already been released and has no obligation. A short window before settling
would be needed.

**Touches money.** `closeEndedAuctions` settles in the same operation.


> **RULED:** Both concerns were right. The fix distinguishes the top bidder:
> their deposit stays **held for 24 hours** — the seller's window to accept or
> decline. Accepted → applied. Declined or expired → refunded immediately.
> Everyone else is refunded at close.
>
> An expired window is a **refund, not a forfeit**: the bidder honoured their
> bid; it was the seller who did not decide.

---

## 5 · The extension cap is 10, and it is per auction not per bidder

**Assumed:** `MAX_EXTENSIONS = 10`, shared.

**If wrong:** a shared cap lets one bidder exhaust it early with cheap bids and
then win in silence. A per-bidder cap, or a cap on total added time, behaves
differently at the end.

**Implemented:** 10 shared, published in the public object.


> **RULED:** One report does **not** trigger review. The listing stays published.
> Review is triggered by two independent reports, by one report from a buyer with
> an order on that listing, or at admin discretion. A single report appears in the
> queue with no effect on the listing.
>
> One click to remove a competitor's listing is cheaper than any paid ad.

---

## 6 · Bidder aliases number by order of first appearance

**Assumed:** "bidder 1" is whoever bid first.

**If wrong:** the number leaks arrival order, which combined with public
timestamps can identify someone who is known to have been present early. Random
per-auction numbering would not.

**Implemented:** `aliasMap` in `src/lib/domain/auctions.ts`


> **RULED:** **Random per auction**, not derived from the id. Order of appearance
> reveals who was there early; a stable number is traceable across auctions.

---

## 7 · A report puts a listing into review immediately, on the first report

**Assumed:** one report is enough.

**If wrong:** a competitor removes any listing from search with a single click.
A threshold (two reports, or one from a verified buyer) changes the economics
entirely.

**Implemented:** first report → `PENDING_REVIEW`. Decision 33 says a report
triggers review; it does not say how many. `fileReport`


> **RULED:** Weekly summary to `SUPER_ADMIN` with each member's access count, and
> an immediate alert when a member exceeds **twice their own weekly average** —
> compared against themselves, not the team: whoever handles disputes reads ten
> times what a catalogue editor does.

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

---

## 11 · Services have no image, and the design shows one per row

**Assumed:** the `الصورة` column in A7 is deferred, not dropped. `Service` has no
image field, and the design shows a thumbnail in every row plus "image and icon"
in the list of what an admin controls per service.

**If wrong:** the services directory the customer sees is a wall of text. A
service is a thing you recognise before you read — the same argument that put
silhouettes on `BodyTypeStrip`.

**Implemented:** column omitted; the row leads with the name and the key.
Adding it later means one `imageUrl` column and a reuse of `ImageUploader` —
cheap, which is why it was not guessed at now.

---

## 12 · Per-service settings the schema cannot hold yet

**Assumed:** the editor covers what `Service` has — names, descriptions, price,
SLA, placements, visibility. The design also lists provider shares, available
cities, display conditions (inspected / auction / dealer), fields the requester
fills, and a cancellation and refund policy.

**If wrong:** "cancellation and refund policy" is a money rule, and money rules
are not the developer's to invent. It is left unbuilt rather than guessed.

**Implemented:** the six schema-backed groups only. The rest needs both columns
and a ruling — the refund policy above all.
