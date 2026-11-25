# The catalogue, the cities, and the demo data

_Last updated: 2026-11-25_

The owner's request on 2026-11-25: add every brand, model, trim, city and
vehicle spec field needed to run the platform, professionally and with logos —
and demo data realistic enough that opening the admin shows transactions in
their various states.

## 1 · What the catalogue was, and is

| | Before | After |
|---|---|---|
| Brands | 42 | **74** |
| Models | 303 | **383** |
| Trims | 360 | **1,042** |
| Cities | 26, hard-coded in `labels/cities.ts` | **60 in a table the operator edits** |

**The trim count was the real gap, not the brand count.** 261 of 303 models
carried exactly one trim. A trim is not decoration: the sell wizard takes the
vehicle's body type, transmission, fuel, drivetrain and seats *from it*, the
bulk importer requires it, and a buyer searches by it. A model with one trim
means a seller writes "C-Class" without being able to say which — and the price
between them doubles.

German and luxury ladders are engine-named (`320i`, `C 200`, `45 TFSI`) because
that is what is advertised and searched here. Chinese brands use the
`Comfort / Luxury / Flagship` ladder their Saudi agents use. **A new trim is
cloned from the model's existing one** — body, transmission, fuel, drivetrain
and seats are shared across a ladder; only power varies, and only where it
really does. Nothing is invented: a vehicle listed for sale with a fabricated
transmission reads as fact.

## 2 · Reference data reaches a live database by migration

A rule already written in this repository: the seeder runs once, on an empty
database. A row added to a JSON file reaches a **new** environment and never
reaches a **running** one.

So `npm run catalog:migration` generates the SQL from `brands.json` —
1,502 statements, `ON CONFLICT DO NOTHING`, with ids derived from the slug so
two environments agree. **It is generated, never hand-edited**: a thousand trims
written by hand drift from the file on the first change and nothing complains.

This required unique constraints that did not exist: `Model(brandId, nameEn)`
and `Trim(modelId, nameEn)`. Without them the catalogue could acquire two
"Camry"s under Toyota — splitting a brand's listings between them, with a
filter reaching only one. The seeder writes with `createMany` on an empty
database, so it never showed; the admin editor checks the brand exists and not
the name.

**Measured on a fresh database**: every migration applied, then 74 brands
(all with a logo), 383 models, 1,042 trims and 60 cities — with no seeder run.

## 3 · Cities became a managed list

`Vehicle.city` and `Listing.city` stay **text**, not a foreign key: converting
them would migrate every existing row, and this is a picker plus a slug source,
not a relation. `CITY_SLUG` remains as the fallback for rows written before the
table, and `cityNames()` falls back to it if the table is empty — an empty list
would make the city field unfillable, and the city is required.

The admin screen shows each city's listing count beside it, and **offers delete
only where it is allowed**: deleting a city with listings leaves them displayed
with no filter reaching them, which is worse than a foreign-key error. Changing
a city's Arabic name carries the same warning, for the same reason.

## 4 · The logos

**These are our own letter marks, not manufacturer logos** — those are
trademarks, and fabricating them would be forgery, not design. Each is a
rounded square in the brand's colour with its initials; the 32 new brands got
marks matching the 42 that existed.

The replacement path needs no code: the file is named after the slug, so
dropping the real asset in place shows it immediately, and the admin's brand
editor uploads one directly. `public/brand-logos/README.md` says so.

## 5 · The demo data, measured rather than assumed

`npm run seed:coverage` asks one question of every enum the product writes:
**which value has no row?** It is the measurable form of a rule this repository
learned the hard way — *what is not seeded is not seen* — after nine defects
lived in an order state no screen had ever opened.

First measurement: **29 values with no row.** After seeding: **every value the
product can produce**, with two declared and reasoned:

- `order.status.STALLED` — nothing in the product writes it (a `DESIGN-Q` in
  `admin-orders.ts` asks whether it should be operator-set or removed).
- `taxInvoice.status.CANCELLED` — an invoice is cancelled by a credit note
  referencing it, because the sequence is gapless. Writing the field directly
  would be a state the product cannot reach.

### What closing those 29 uncovered

**No dealer sale in any environment could be invoiced.** `sellerTypeFor` reads
the **selling user's** tax status. Seeded dealerships had no VAT number and
their members none either, so every dealer sale resolved to `DEALER_NO_VAT`,
whose rule is unapproved — `RULE_AWAITING_APPROVAL`, silently. Money settled,
no document came out. Fixed at the root: a verified dealership gets a VAT
number, and **every member inherits it** — the invoice is the company's
whichever employee listed the car.

**The seed completed orders without issuing their documents.** It now calls
`issueSettlementDocuments` — the same writer `applyState` calls — so the tax
tables, `A25` and `D7` open with real rows instead of an emptiness that hides
whether the screen works. Blocked supplies are **counted and printed**: a
private individual selling a car genuinely gets no VAT invoice, and the number
says how often that happened.

**All orders were `DIRECT`.** The loop took the first thirteen listings and the
list is ordered by type, so `OrderSource.OFFER` and `AUCTION` had no row, and
the source breakdown in `A14` and `D11` read "direct 100%" for a market that
sells mostly by negotiation. The loop now interleaves the three types.

## 6 · What was *not* made editable, and why

The request named «حقول مواصفات السيارة … مثل الفئة ونوع المحرك» among the
settings. Three of the four are already rows the operator edits; the fourth
cannot be, and silently skipping it would be the dishonest answer.

| Field | Where it lives | Why |
|---|---|---|
| **Trim** (الفئة) | `Trim` rows — admin screen | Operator-editable, now 1,042 of them |
| **Brand / model** | `Brand` / `Model` rows — admin screen | Operator-editable |
| **Body type** (نوع الهيكل) | `BodyTypeMeta` rows — admin screen | Image and ordering are editable |
| **Fuel · transmission · drivetrain** | Prisma enums → `ALL_SPECS` | **Structural, not data** |

The last row is the one worth explaining. `FuelType` is not a label the sell
wizard prints — it **branches on it**: choosing `PLUGIN_HYBRID` opens battery
capacity, range and charge port; `ELECTRIC` hides engine size and cylinders.
A row added from the panel would appear in the dropdown and open nothing,
because no code knows what fields it implies. The same holds for drivetrain in
the filters and transmission in the search lexicon.

`ALL_SPECS` derives from the enum rather than copying it, for a reason recorded
in this repository: the hand-written copy once carried `WAGON` and `FOURWD`,
which do not exist, while missing `PLUGIN_HYBRID`, which does — so a seller
could pick a value the server rejected, and could not pick one the form was
built to support.

**What this means in practice:** a new trim, brand, model, body type or city
needs no deploy. A new *fuel type* does — and it needs code anyway, because
something has to decide what a new kind of engine is measured by.

## 7 · What the demo seeding itself uncovered

Seeding the 29 missing states did not just fill rows — it ran the states into
invariants the repository already guards, and three held against me.

**A seeded state must be one the product can reach.** `escrow.status.PENDING`
has no writer: `applyState` only ever *creates* an escrow as `HELD`, while a
branch in `payments.ts` reads `PENDING` — a dormant branch for a state nothing
produces. Seeding it on a payment-stage order broke two tests, both right: an
escrow there hides the pay button, and an escrow without a payment empties the
settlements screen. Declared, with that reason.

`listing.status.EXPIRED` likewise: nothing expires a listing — no cron, no
route. A tab for it would read zero forever.

**`listing.status.PAUSED` is the opposite case, and a real gap.**
`pauseListing` writes it when a seller pauses their own listing, and the
**admin's all-listings screen had no tab for it**. A paused listing is invisible
to buyers *and* to the operator: it dropped out of the tab sum and could not be
opened from anywhere. The tab now exists. The screen's own guard — tab counts
must sum to the total — is what caught it, and only because the state finally
had a row.

**One test was too broad, and the rule says to ask which was wrong.**
"No escrow on a payment-stage order" flagged `ORD-2026-1012:REFUNDED`. Reading
`cancelOrder` settles it: cancelling writes `Payment: CANCELLED`,
`Escrow: REFUNDED`, and **leaves the order at the stage it died at** — so a
cancel during payment produces exactly that, correctly. The test's stated
purpose is that the pay button must show, and a cancelled order shows none. It
now scopes to live orders. A gate that fires on correct behaviour gets disabled
within a day.

**And a shape that bit three times in one sitting:** a filter narrower than the
number of cases it must produce drops them silently. Dispute states needed three
orders and the filter found two; account states needed five users and found
three; invoice states needed three VAT sales and the search covered one seller
who had one spare listing. Each time the missing rows simply did not appear, and
the measure — not the code — is what said so.
