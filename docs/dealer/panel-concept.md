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

## A second batch of screens (2026-10-13)

The owner sent a strip of panel screens — «نريد مثلها وأفضل منها». Read at the
resolution supplied, they cover:

- **My Showroom** — a listing grid with filters above a table.
- **Add / edit a vehicle** — a long modal form over the showroom.
- **Client Orders** — tabbed table with a per-row action button, plus two small
  confirmation dialogs.
- **Dashboard** — the counters, donut and line chart already recorded above.
- **Mojaz report** — a branded dialog for ordering/reading the report.
- **A statement view** — three figures over a transactions table.
- **Wallet** — balance card beside a transactions list.
- **Settings / Point of Sale** — a form-heavy page.
- **Services** — three service cards (Mojaz report among them).
- **Vehicle detail** — specs page.
- **A three-option chooser** modal.
- **Auction screens** — a score ring beside the car, bidding, and a browse grid.

These are listed so nothing is lost. **They are not read in detail here** — the
resolution does not carry the field names, and a list written from a squint is
the kind of document this repo refuses (`الوثيقة تُولَّد أو تُفحَص`). Each screen
is read against its own image when its task starts.

## Commission and collection — the owner's note

> رحلة البيع والشراء مشابهة، ولكن ربما إعدادات العمولة وتطبيقها على المعرض من
> عدمه، وآلية تحصيل قيم البيع لسيارات المعرض، تحتاج إعدادات نتحكم بها ونقرر من
> خلالها بكل مرونة.

So the dealer's journey reuses the buyer/seller flow, and what differs is
**policy, not mechanics**:

1. **Does the platform commission apply to a dealer's sale, and at what rate?**
   `CommissionRule` already carries `scope` and `scopeId` beside `global`, so a
   per-dealer or per-segment rule has a home without a schema change. The screen
   that writes it does not exist.
2. **How is a dealer's sale collected?** A marketplace sale is held in escrow and
   released on transfer. A showroom sale through the panel's point of sale may be
   collected by the dealer directly, with only our fee owed to us — which is a
   different money path, not a different label.

Both are settings, and both are the owner's to decide. They are listed here so
the panel is not built with either assumed.
