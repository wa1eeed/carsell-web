# Dealer panel — the owner's concept, read against what exists

The owner shared a dashboard mockup on 2026-10-13. This file records what it
shows and, more usefully, **where it disagrees with the model we have**, so the
disagreements are settled before anything is built on either side.

See `ADR 0003` for why the panel is its own system rather than a view of CARZ.

## What the mockup shows

**Navigation:** New Listing · Home · My Showroom · Client Orders · Reviewing
Vehicles · My Auction · My Plate Auctions · Auction Requests · Wallet ·
Services · Mojaz Reports · History · Transactions Statement · Sales Analytics ·
Point of Sale · Log out. Top bar carries a title, an `العربية` switch and
notifications.

**Four counters:** Review Orders (Pending / In Process / Completed) · Inventory
(In Auction / In Showroom) · Sales (Sold / Under Process) · **Car Status**
(Registration Expired / Insurance Expired / Periodic Inspection Expired / Near
Expiry).

**Order by stage** — a donut over 100 orders: Pending · Accepted · Agreement ·
Ownership · Delivery · Completed · Rejected.

**Sales Analytics** — a line chart with a period selector.

**Pending orders** — a table: order type (Direct sale / Offer) with a timestamp,
vehicle ID, vehicle, plate number, amount, status, and a Details action.

## Where it already lands on something built

| Mockup | In the product |
| --- | --- |
| Wallet · Transactions Statement | `wallet.ts`, the ledger and `/account/wallet` |
| Services | the service catalogue and requests (A6) |
| Mojaz Reports | the `mojaz` integration row — seeded, `INACTIVE` |
| Reviewing Vehicles | the listing review queue |
| My Auction · Auction Requests | auctions, bids, deposits |
| Inventory (In Showroom / In Auction) | `Vehicle` ⟂ `Listing`, exactly as ADR 0003 requires |

## Where it disagrees with the model — needs a decision

### 1 · «Car Status» asks for dates the vehicle does not carry

Registration, insurance and periodic-inspection expiry are **not on `Vehicle`**.
The card is four counts of documents about to lapse, so the panel cannot show it
without those three dates and a rule for «near expiry».

They are worth more than the panel: the individual's «سياراتي» garage could warn
a seller that their insurance lapses in twelve days, which is the kind of thing
that brings someone back to an app. But a column nothing writes is this repo's
most-repeated defect, so they go in **with the screen that fills them**, not
before.

### 2 · The stages in the donut are not the stages in the system

| Mockup | `OrderStage` |
| --- | --- |
| Pending | `REQUEST` |
| Accepted | `APPROVED` |
| **Agreement** | — (a `VehicleSaleAgreement` is issued, but it is not a stage) |
| Ownership | `TRANSFER` |
| **Delivery** | — |
| Completed | `DONE` |
| Rejected | status `CANCELLED`, not a stage |
| — | `INSPECTION` |
| — | `PAYMENT` |

So the mockup adds **Agreement** and **Delivery** and drops **Inspection** and
**Payment**. This is a business rule, not a label: a stage carries a deadline, a
guard, a timeline entry and a money consequence. If the dealer panel draws seven
stages while the buyer's order screen walks six different ones, the two parties
to one deal read different pictures of it.

### 3 · Point of Sale has no counterpart at all

Nothing in the product sells a car in the showroom to a walk-in buyer. It is the
clearest example of the panel being an operations system rather than a CARZ view,
and it is the piece with no foundation yet.

### 4 · The panel's palette is not the marketplace's

The mockup is a teal sidebar on white, in English with an `العربية` switch. The
marketplace is cream and ink, Arabic-first. A separate product may well want its
own skin — but it needs its own tokens, because every component in
`src/components/ui/` reads the marketplace's.
