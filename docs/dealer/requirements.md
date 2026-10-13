# Dealer panel — requirements, read against the code

The owner's brief (2026-10-13): the panel must carry **simplified accounting**
that replaces the showroom's accounting software, and it must compete with the
systems Saudi showrooms use today (Daftra, Mezan and the like). What follows is
that brief, each line checked against what this repository already has, so the
work is sized from facts rather than from a wish list.

Written now, built when the panel's turn comes — see `ADR 0003`.

---

## 1 · Government compliance

### 1.1 VAT on the profit margin — **the engine exists, its input does not**

Used-car showrooms may charge VAT on the **margin** (sale price − purchase
price) instead of on the full value. The owner calls this their biggest
accounting problem, and he is right that solving it is the hook.

What exists:

- `TaxableBase.MARGIN` is a value of the schema's enum, beside `FULL_VALUE`,
  `FEE_ONLY` and `OUT_OF_SCOPE`.
- `computeTax(base, amount, ratePct, marginAmount)` already taxes the margin
  rather than the price when the base says so.
- `taxFor` refuses a margin rule unless the seller is approved for the scheme —
  `MARGIN_NOT_APPROVED` — and `User.marginSchemeApproved` carries the approval,
  deliberately on the **tax registration** rather than on being a showroom.
- One margin rule is seeded (`DEALER_VAT → INDIVIDUAL`, vehicle, 15%), currently
  **inactive**, and no account is approved.

What is missing, and it is the whole of it:

> **No purchase price is recorded anywhere.** `Vehicle` has no cost field, and
> nothing in the product passes `marginAmount` to `computeTax`. The margin
> cannot be computed because its first operand does not exist.

`marginAmount ?? 0` meant a margin rule with no amount taxed **zero** — a
zero-VAT invoice on a sale that owes it. The rule being inactive is not a guard,
so `taxFor` now returns `MARGIN_AMOUNT_MISSING` instead, and the window between
activating the rule and building the cost field is closed.

**So the first dealer-accounting task is the vehicle's cost ledger**, not the
tax screen: purchase price, then the add-on costs below, then the margin falls
out of them.

### 1.2 ZATCA phase two — partly built

Invoices already carry the shape ZATCA asks for (`TaxInvoice`, `CreditNote`, QR,
UUID; the tax screen states «متوافق مع فاتورة · QR · UUID»). What is **not**
built is the clearance/reporting integration — the API handshake that phase two
requires. `InvoiceStatus.REPORTED` exists in the enum **with no writer**, which
is this repository's signature defect sitting exactly where it will be needed.

### 1.3 Tamm and Mojaz — rows exist, neither is connected

`mojaz` and `vin_lookup` (Tamm) are seeded integrations, both `INACTIVE`, both
without an adapter. The Lean adapter built on 2026-10-13 is the pattern they
would follow.

---

## 2 · Inventory — the separation is already right

- **VIN as the unit.** `Vehicle` carries `vin`, plate letters and numbers,
  colour, year and mileage, and is already separate from `Listing` — a rule
  `CLAUDE.md` enforces and `ADR 0003` makes load-bearing. A showroom's stock is
  `Vehicle` rows; listing one on CARZ is an optional state of it.
- **Add-on costs** (transport, inspection, maintenance, detailing, customs) have
  **no home**. They are what turns a purchase price into a true cost, and they
  are what feeds §1.1. A `VehicleCost` line table hanging off `Vehicle` is the
  shape, and it is the same table the margin reads.
- **Branches and yards** do not exist. `Vehicle` has no location beyond the
  listing's city.

## 3 · Daily operations

- **Deposits and reservations** — `Deposit` exists for auctions, held through
  the payment gateway. Reserving a showroom car for a walk-in customer, and
  turning that deposit into a down payment or releasing it, is a different flow
  on the same primitive.
- **Sale contracts** — `VehicleSaleAgreement` is generated on settlement today,
  so the document exists; what a showroom needs is to issue it at the point of
  sale, not only at the end of a marketplace order.
- **Payment methods and financing** — the platform collects card payments
  through its gateway. Cash, mada at a terminal, and **sales through a finance
  company** (invoice issued to the financier, delivery to the customer, the
  showroom's receivable tracked against the bank) have no model at all. This is
  the biggest single gap in §3.

## 4 · Accounting

- A **double-entry ledger** already exists with a single entry point
  (`postEntries`, guarded by gate 20) and revenue recognised on accrual. That is
  the hard half, and it is built.
- A **chart of accounts** shaped for showrooms (stock as an asset, financier
  receivables as a liability) does not — the current accounts are the
  platform's, not a tenant's.
- **General expenses** (rent, salaries, utilities) and a profit-and-loss view
  have no model.
- **Consignment** («التصريف» / «السيارات الأمانة») — selling someone else's car
  for a commission and tracking what is owed to its owner — has no model, and it
  is common enough in this trade to be a first-class case rather than an edge.

## 5 · Competitive features

- **A mobile app for salespeople and the owner** — nothing exists; `DeviceToken`
  is in the schema with no writer, waiting for it.
- **Salesperson commissions** — needs staff under a business, which `Dealer.members`
  anticipates (`ADR 0003` §3) but nothing uses yet.
- **Smart reports** (best sellers, average days in stock, net monthly profit) —
  `daysToSellMedian` already measures time-to-sell for the marketplace, so the
  measure exists at platform scale and would need to be scoped per dealer.

---

## What this changes about work happening now

1. **Nothing may add a reader to the `User` business columns** (`businessName`,
   `crNumber`, `address`) — `ADR 0003` §3 explains why, and this document is why
   it matters: those columns move to the organisation that will own the stock,
   the ledger and the staff.
2. **`Vehicle` must not grow a dependency on `Listing`.** The cost ledger, the
   branches and the consignment owner all hang off the vehicle.
3. **The margin guard stays.** When the cost ledger lands, `marginAmount` is
   passed and the guard stops firing on its own; until then it is what keeps a
   zero-VAT invoice from being issued.
