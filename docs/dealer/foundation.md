# Dealer panel — the foundation

_Last updated: 2026-11-25_

> The screens built on this foundation are documented in
> [`desk.md`](./desk.md) (`D5`, `D6`), [`money.md`](./money.md) (`D7`, `D8`),
> [`team.md`](./team.md) (`D9`) and [`operations.md`](./operations.md)
> (`D3`, `D4`, `D10`, `D11`, customers, subscription, replies).

The owner's instruction on 2026-11-25 was «**ابدأ بالأساس**». This page
records what the foundation is, why these three pieces and not screens, and
what each one refuses to do.

`Dealer.dc.html` draws eleven screens. Three things they all stand on did not
exist:

| Missing | What it blocks |
|---|---|
| **A purchase price** | `D1`'s «الهامش» card, margin VAT, and every profit figure in `D11`. `Vehicle` had no cost field at all. |
| **Branches** | «٣ فروع» in the header, the branch column in `D2`, and the whole of `D9`. |
| **Roles inside the dealer** | «وليد · مدير», and the permission matrix `D9` draws. |

## 1 · The cost ledger is one table, not two

`VehicleCost` holds the purchase **and** everything spent after it — transport,
inspection, maintenance, detailing, customs. One table, because the margin and
the reports both read it.

> Putting the purchase price in a `Vehicle` column and the add-ons in a separate
> table makes **two sources for one number**. The margin would be computed from
> one of them and would lie.

**One purchase per vehicle, enforced by a partial unique index** — not by a
check in the function. Two purchase rows double the cost, produce a negative
margin, and **tax is computed on it**. A guard at one entrance is not a guard;
this repository has that written down from the times it was learned.

**Costs are always positive.** A negative line "correcting" an earlier one makes
the ledger read as addition and subtraction at once, and **the margin becomes
adjustable with a single row**. A mistake is corrected by deleting its line.

**The ledger hangs off `Vehicle`, never off `Listing`** (`ADR 0003`). A
showroom's stock is vehicles; listing one on CARZ is an optional state of it. A
car bought and not yet listed still has a cost, a branch and a purchase date —
and it is exactly the car the owner needs to see: capital standing still.

### What it unblocks

`taxFor` returns `MARGIN_AMOUNT_MISSING` because the input did not exist.
`vehicleMargin` now reads the ledger and returns it — **and returns `null` for a
vehicle whose purchase was never recorded**, so that guard stays alive rather
than becoming a dead branch. The caller passes `taxable`, not `margin`: a sale
at a loss does not produce refundable VAT.

## 2 · Branches are disabled, never deleted

Cars were sold from them, orders completed in them, reports read a year later.
Deleting the row leaves that history with no place. A disabled branch takes no
new assignments and stays in the reports.

**And a branch holding vehicles cannot be disabled.** A car in a disabled branch
disappears from every branch filter and appears in none — capital nobody can
see. Move the cars first.

## 3 · Roles are the design's, not an invention

`D9` draws the matrix, so it is implemented as drawn:

| | مدير | مبيعات | محاسب |
|---|---|---|---|
| المخزون | الكل | **فرعه** | قراءة |
| الأسعار | تعديل | تعديل | — |
| العروض | الكل | **فرعه** | — |
| الفواتير | الكل | — | الكل |
| الفريق | تعديل | — | — |
| الاشتراك | **المالك فقط** | — | — |

**`DealerRole` is not `AdminRole`.** One is the platform's staff, the other is
one showroom's. Mixing them would let a showroom manager inherit a permission in
the platform console.

**And the matrix is enforced on the server, not in the sidebar.** The nav hides
what a role cannot reach, and every route checks the same thing again — a guard
in the screen is a suggestion.

## 4 · A third session, not a third identity

Recorded in `DESIGN-DECISIONS.md` (2026-11-25) after the owner's «المعرض ليس
كمثل المستخدم العادي».

- **The credential stays one**: the person's phone and OTP. No showroom password
  passed between staff — it cannot be revoked per person, it leaks, and **it
  erases who did what**.
- **The session is separate**: `carsell_dealer`, `path=/dealer`, 12 hours.
  Suspending a team member must not sign them out of their personal account, and
  suspending the dealer must not stop its owner buying a car as an individual.
- **The membership is read on every request**, not at sign-in: someone removed
  from the team, re-roled, or whose dealer was suspended holds a cookie that is
  still valid in time.

## What is built, and what is next

Built: the ledger, branches, roles, the session, `/dealer/enter`, `D1`'s five
cards from real data, `D2`'s stock table with the cost drawer, `D9`'s branches.

Next, in this order: team invitations (`D9`), then `D5`/`D6` (offers and orders
read what CARZ already has), then `D7`/`D8` (invoices and settlements, which the
ledger now makes possible), then `D3`, `D4`, `D10`, `D11`.
