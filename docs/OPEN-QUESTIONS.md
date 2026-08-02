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

---

## 13 · Finance-input keys are a closed list in code

**Assumed:** salaries · paid marketing · referral incentives · content and SEO ·
infrastructure · other · cash balance. The three marked `inCac` are what CAC
divides by new customers.

**If wrong:** an expense line that does not fit any of them gets filed under
"other" and disappears from every derived figure. Adding a key is a deploy.

**Implemented:** `FINANCE_INPUT_KEYS` in `src/lib/domain/admin-finance.ts`. A
free-text key was rejected deliberately — it produces "marketing", "mktg" and
"تسويق" across three months and CAC then sums a subset of itself.

---

## 14 · LTV counts platform commission only

**Assumed:** lifetime value is commission per paying customer. Service revenue,
sponsored ads and shipping are not attributed back to the buyer who generated
them.

**If wrong:** LTV is understated, possibly badly — right now commission is
disabled, so LTV reads zero while the platform does earn from services. That
makes LTV/CAC useless exactly when it is being used to decide whether to enable
commission.

**Implemented:** commission only. Attributing service revenue to a customer
needs `ServiceRequest.userId` joined through to orders, which is a reporting
decision, not a rendering one.

---

## 15 · SMS cost is 0.04 SAR per segment, hard-coded

**Assumed:** a placeholder until a provider is contracted. Displayed as an
estimate, and labelled as one on screen.

**If wrong:** it is a money figure on an admin screen, and a wrong one shapes
decisions about which templates use SMS. The real rate varies by provider and by
destination network.

**Implemented:** `SMS_COST_PER_SEGMENT` in `src/lib/domain/notification-text.ts`,
overridable per call. It belongs in `PlatformSetting` once a provider exists.

---

## 16 · A1 has two cards with no source

**Assumed:** `المستخدم النشط` (DAU/WAU/MAU) and `مصدر التسجيل` are deferred, not
dropped. The first needs an activity log the schema does not have; the second
needs a `source` column on `User` captured at registration.

**If wrong:** these are the two cards that answer "is the product working" and
"where do people come from" — arguably the most important on the screen. A
growth dashboard without them measures inventory, not growth.

**Implemented:** both omitted, with a line on the screen saying why. Showing
estimated numbers would have made them believed. `source` is one nullable column
and one write at registration; activity tracking is a larger decision.

---

## 17 · Integrations have one environment, not two

**Assumed:** `Integration` holds one configuration per key. A11's markup shows a
`بيئة الاختبار` / `إنتاج` toggle and separate keys for each.

**If wrong:** an operator testing a payment flow has to overwrite the production
key to do it — which is the exact accident the two-approver rule exists to
prevent, made routine.

**Implemented:** one configuration. Two environments means either two rows per
integration (`payments:test`, `payments:live`) or a second secrets column — a
schema decision, and one that touches how every integration is read at runtime.

---

## 18 · Rotation approval expires after 48 hours

**Assumed:** same window as a dispute. A rotation nobody seconds within two days
is one nobody wanted.

**If wrong:** rotations often happen under pressure — a leaked key at midnight
Thursday, no second approver until Sunday. Expiry then forces the whole request
to be re-entered, secret and all, by someone already anxious.

**Implemented:** `ROTATION_WINDOW_HOURS = 48`, and expiry marks the request
`EXPIRED` rather than executing late.

---

## 19 · Marketing cap is 4/month with a 72-hour cooldown

**Assumed:** both numbers, taken from A9's markup.

**If wrong:** they are the difference between a marketing programme and a
complaint rate. Four a month is aggressive for a purchase people make once every
few years; a 72-hour cooldown means a well-timed price-drop alert can be
suppressed by an unrelated promotion two days earlier.

**Implemented:** `MARKETING_CAP_PER_MONTH = 4`, `COOLDOWN_HOURS = 72`, both
enforced at send time and both shown on screen. They belong in `PlatformSetting`
once someone owns the number.

---

## 20 · Marketing consent defaults to false for existing users

**Assumed:** nobody is opted in without asking. The migration adds
`marketingConsent BOOLEAN NOT NULL DEFAULT false`, so every existing user starts
opted out.

**If wrong:** it is the only defensible default, but it means the first campaign
reaches almost nobody until consent is collected — and there is currently no
screen that asks for it.

**Implemented:** default false, with `marketingConsentAt` recording when it was
given. The asking is the app's job and is not built.

---

## 21 · Two channels are critical, and the admin cannot change that

**Assumed:** auctions the user participates in, and orders/payment — exactly the
two A10's markup marks «لا — حرِجة».

**If wrong:** an operator facing a complaint spike has no lever. The only way to
make a critical channel mutable is a migration.

**Implemented:** `PushChannel.userControllable`, deliberately excluded from
`updateChannel`. Making it editable from the console would let a product decision
happen by button-press in a meeting.
