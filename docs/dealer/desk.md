# Dealer panel — the desk: offers (`D5`), orders (`D6`)

_Last updated: 2026-11-26_

These two screens are, by design, **readers**. Offers and orders already exist
in CARZ with their own rules; what did not exist was a way to see them **as a
showroom** — across the dealer's vehicles, narrowed to the member's branch.

## 1 · Branch scoping is in the query, never after the fetch

`scope(dealerId, branchId)` goes inside the `where`. Filtering after the fetch
serializes another branch's rows into the browser — the same path
`reservePrice` leaks by: *what never enters the object cannot leak out of it*.

A `branchId` of `null` means "every branch" and belongs to an owner or a
manager. A `SALES` member always carries one (enforced at invite time), so the
null case is never a hole.

## 2 · A chip's count equals the length of what it opens

One `where` builder, `bucketWhere(bucket, now)`, is read by **both** the counter
and the list. A chip that says seven and opens five is the defect this guards.

`REQUEST` folds in `APPROVED`. The encoding draws five chips for six stages; if
`APPROVED` had no chip, a live order would show under «الجارية» and open from
no chip at all — a live row with no door to it.

`TROUBLED` is a **cross-cut, not a partition member**. It overlaps «الجارية» by
right: an order past its deadline is both live and troubled. Only the stage
chips sum to the live count.

## 3 · «متعثّرة» is derived, because the stored state has no writer

`OrderStatus.STALLED` is in the schema and **nothing in the product writes it**
(recorded in `admin-orders.ts`). A chip reading it says zero forever while the
showroom is staring at an order stuck for a week.

So trouble is what its owner can see: an open dispute, a lapsed payment
deadline, or a lapsed transfer ceiling — **state and elapsed time together**,
never state alone.

## 4 · Five escrow states, not a boolean

`escrowHeld: escrow?.status === 'HELD'` reads everything-not-held as
"released". `PARTIAL_REFUND` is **part refunded with the rest still held by
right**; `REFUNDED` is fully returned; `PENDING` was never collected. Three
states would each tell the dealer «أفرج عن مالك» about money that never
arrived. `ESCROW_STATUS_AR` is a `Record<EscrowStatus, …>`, so gate 59 forces a
label when a sixth state appears.

## 5 · The money card uses the release guard itself

«المستحق لك» splits held from ready with `canSettle` — the same function the
release route, the settlement queue and the cron read — and nets with
`netToSeller` from `money.ts`. A second copy here would produce a card promising
«جاهز للتحويل» over money the guard refuses.

Amounts are shown **to the halala**. Gateway fees are 1.70% + 1 SAR, so
fractions are the rule, not the exception, wherever a figure is reconciled
against an outside party.

The platform commission reads the **current** `CommissionRule` for the seller
side, not the «٠٪ حاليًا» written into the encoding. It is zero today; the card
says what it becomes.

## 6 · The buttons reach something

- **تصدير** → `GET /api/v1/dealer/orders/export`, built in the same commit.
  Its cap is higher than the table's, which is what the line under the table
  promises.
- **مواعيد النقل** → `#transfers`, the card on the same screen.
- Each row's ref → `/dealer/orders/{ref}`, also built in the same commit.
  Before it existed the table linked to a 404.

## 7 · The order page is the shop's screen, mounted in the panel

`OrderScreen` carries stages, money, documents and appointments. A second copy
would drift, and the same order would say different things in the panel and in
the account. Two props make it portable:

- `trail` — the breadcrumb. Fixed to «حسابي» it walked a dealer out of the
  panel while they thought they were moving inside it.
- `mayCancel` — `cancelOrder` checks `actorId` is a party to the order. A team
  member is not, so the button they saw was one the server would refuse.

Authorisation differs from the shop's deliberately: the shop asks "are you a
party?", the panel asks "**is this order on a vehicle your showroom owns, in
your branch?**" — then reads the order as its seller. `null`, never "forbidden":
the existence of an order is itself information.

## 8 · What clicking found, that no test did

- A resolved dispute rendered as «نزاع مفتوح · الطلب متوقف» **forever**, to
  buyer and seller both, on the shop. `getOrder` takes the latest dispute
  regardless of status. It now reports `open` and `resolution`.
- `deskCounts` counted completions as `status: ACTIVE, stage: DONE`, but
  `advanceStage` writes `COMPLETED` — so the header said "none completed this
  month" to a showroom that had closed ten.
- The shop had **no link to `/dealer` anywhere** (measured: zero). A dealer
  signed in and found no door to their own panel.

## 7 · Who may answer an offer is a **side**, not a person (2026-11-26)

CARZ's negotiation rules were built for an individual seller: `Listing.sellerId`
is one column, and `acceptOffer` compared it to the actor id. Then a showroom
got a team — and the comparison stayed personal. `deskOffers` gathers the
**dealership's** offers, the sidebar shows this screen to `SALES` and `MANAGER`,
and the server answered every one of them `NOT_SELLER`.

So the button was shown to people who could not press it: measured by clicking,
as a `SALES` member, after the panel session fix below.

`src/lib/domain/offer-authority.ts` answers it once — a pure function, no `db`,
read by accept, counter and decline alike:

- the **buyer side** is one person, matched by id;
- the **seller side** is `sellerId` **or** an `OWNER`/`MANAGER`/`SALES` member
  of the dealership that owns the listing's vehicle. `ACCOUNTANT` is excluded,
  which is the same role list the screen itself redirects — if the two lists
  drifted, one of them would show a button the other refuses.

`PATCH /api/v1/offers/{id}` now reads **both** identities. The panel's session
cookie is `carsell_dealer`; the route authenticated only with `carsell_session`.
A membership is attached **only when the panel session belongs to the acting
user** — two sessions for two people in one browser is the ordinary case on a
showroom's shared computer, and attaching without that check would let one
employee act with another's role.

`Offer.respondedById` is written beside `respondedAt`, for three reasons: the
row says who carried the reply (so two salespeople do not counter the same buyer
with two numbers), per-salesperson sales have a source at last, and an automatic
rejection stays authorless — the system replied, not a person.

## 8 · The sender does not answer their own offer (2026-11-26)

A counter is an offer awaiting the **buyer**. Two rows therefore carry no reply
for the dealer: the parent now marked `COUNTERED`, and the dealer's own counter
sitting `PENDING` with a parent. The table showed اقبل / مقابل / ارفض on both,
and the server refused all six presses. `DeskOffer.canAnswer` decides it, and
those rows read «بانتظار رد المشتري» instead.

The same mistake was in the count: «واحد ينتظر ردك» over an offer the dealer
had itself sent. `AWAITING_SELLER` is now one filter — `PENDING` with no parent
— read by `deskCounts` and by the dashboard card «عروض تحتاج ردا», which is the
recorded rule that *a count equals the length of what it opens*.
