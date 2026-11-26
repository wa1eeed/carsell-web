# Dealer panel — the foundation

_Last updated: 2026-11-26_

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

## 5 · Membership is one predicate

`src/lib/domain/dealer-membership.ts` answers "is this person a member of an
approved dealership?" — and it is the **only** place that answers it. The
account page's panel button, `/dealer/enter`, and `openDealerSession` all read
it.

They did not, until 2026-11-26. The account page checked `User.dealerId` alone;
the other two checked `User.dealerRole`. A row with `dealerId` set and
`dealerRole` NULL therefore **showed a "Dealer panel" button and was then told
"you are not a member of any dealership"**. The comment above the button claimed
the two conditions were identical.

Both columns are read together, and neither alone:

- `dealerRole` NULL → `NOT_A_MEMBER`, whatever `dealerId` says.
- dealer not `ACTIVE` → `DEALER_NOT_ACTIVE`, named so the screen can say
  "awaiting approval" instead of "not a member".

The module holds **no Prisma import**, so the client component `EnterPanel` can
import its type without dragging `db` into the browser bundle.

### The legacy row, and the migration that repairs it

`User.dealerId` has existed since task-1; `dealerRole` arrived with this panel
(`7f77cd7`). Every environment seeded before that holds dealer owners with
`dealerId` set and `dealerRole` NULL — the seeder runs once on an empty
database, so re-seeding does not reach them, and the migration that added the
column left it empty.

`prisma/migrations/20261126090000_dealer_role_backfill` fills it, and is
deliberately narrow: **one** user per dealership is promoted to `OWNER`, and
only where that dealership has no member with any role at all. Any further
legacy row keeps NULL and gets the honest answer — a migration must not grant a
role to a row nobody reviewed.

### Registration — built 2026-11-26

Measured that day: `src/` contained **no writer for the `Dealer` model**. The
onboarding screen verified the phone, fetched the commercial register, and
PATCHed the *user's* profile — it never created the dealership, so nobody could
become a dealer except by a row written by hand.

`registerDealer` (`src/lib/domain/dealer-register.ts`) now creates it and makes
the applicant its `OWNER` in one transaction, with an `AuditLog` row. The route
`POST /api/v1/dealer/register` sets the panel cookie in the same response, so
the owner's instruction — «المعرض يسجل و يدخل للوحة تحكمه مباشره» — holds with
no intermediate screen. `/dealer/enter` remains for a returning member whose
12-hour panel session has lapsed, and it opens the panel without a click.

The dealership is created `ACTIVE` with `verified: false`: `status` answers "can
it operate?", `verified` answers "have we checked its register?", and the
"تاجر موثّق" badge reads the second. A CR number is required at creation, since
`decideDealer` refuses to verify without one — a dealership created without it
could never leave the queue.

### Prepare now, publish on approval

The owner's answer (2026-11-26) to "may a showroom sell before its commercial
register is reviewed?" was the middle option: it enters the panel immediately
and prepares its stock and prices, but **nothing of its reaches the public
market until an admin verifies the register**.

- `status: ACTIVE` at creation — it operates.
- `verified: false` until `decideDealer` VERIFY — no "تاجر موثّق" badge.
- `createListing` refuses with `DEALER_NOT_VERIFIED` while unverified. It is the
  product's only publish entry (the bulk import writes vehicles, not listings),
  and the guard sits **after** the draft branch, so drafts, vehicles and prices
  save normally.
- `DealerShell` carries the state on every panel screen: "سجلك التجاري قيد
  المراجعة. جهز مخزونك وأسعارك الآن". Finding out at the publish button, after
  photographing ten cars, is the worst possible moment.

`DealerActor.verified` and `dealerMembership().verified` read the same column,
so the screen and the guard cannot drift.
