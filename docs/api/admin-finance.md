# Admin: finance and notifications (task 24)

Screens `A3` (finance) and `A8` (notifications and templates) in
`design/CarSell Admin.dc.html`. Domain: `src/lib/domain/admin-finance.ts`,
`src/lib/domain/admin-notifications.ts`, `src/lib/domain/notification-text.ts`,
`src/lib/domain/money.ts`.

## A3 · VAT is included, not added

The acceptance criterion. A displayed price already contains its VAT, so the tax
component is `total × 15/115`, never `total × 15/100`.

The difference is not a rounding detail. On 115,000 SAR the included VAT is
15,000 and the added VAT is 17,250 — **2,250 SAR of difference in one
transaction**, which somebody pays out of pocket.

`vatIncluded` and `netOfVat` are complements: for every amount tested,
`vatIncluded + netOfVat === total` exactly, with no lost halalas — which is the
property that matters when these figures reach an invoice.

### The rule now lives in one place

It was written inline in `offers.ts` as a float expression. When A3 needed it,
the choice was to copy it or extract it. Two copies of a tax rule diverge the
first time the rate changes, so it moved to `src/lib/domain/money.ts` and both
callers use it. `Prisma.Decimal` throughout — money is never a float.

`money.ts` also holds `sum` (a `reduce` with `+` over `Decimal` produces a
concatenated *string*, silently) and `pct` (dividing by zero **throws** in
`Decimal`, and a first month with no transactions has a zero denominator — that
is an expected state, not an error).

## A3 · GMV is not revenue

The first is the value of goods that moved; the second is what the platform took
from it. A screen that blends them lets a company believe it earns 14 million
when it earns 84 thousand. They are two separate cards here, with the **take
rate** between them saying how much of the first became the second.

Every figure is summed from its rows at request time. There is no
`total_sales` column and no cache. Such a column lies the first time an order is
cancelled or an amount refunded — and the lie is not discovered until someone
reconciles against the bank.

### Escrow: frozen is subtracted, not added

Money frozen by a dispute is *already* held. Adding it to "currently held"
counts it twice and inflates the cash an investor believes is in the account.
So `held` is reported net of `frozen`, and `total = held + frozen + deposits`.

### Manual inputs are the honest exception

Salaries, marketing spend, and the bank balance are not things the database
knows. They are entered per month, per key, with who entered them
(`FinanceInput`). The key list is **closed**: a free-text key produces
"marketing", "mktg" and "تسويق" across three months, and CAC then sums a subset
of itself.

What is *derived* from them — CAC, LTV, payback, runway — is computed, never
entered. A hand-written derived figure stays correct until the thing underneath
it changes, and then lies without anyone noticing.

A key never entered shows zero **with a blank date**, not as though someone
entered zero.

### Nulls that mean "unknown", not "zero"

`ltvOverCac`, `paybackMonths` and `runwayMonths` return `null` when their
denominator is zero. Zero would read as an alarm — a runway of "0 months" means
the money is gone; a runway of `null` means the company is profitable and has no
runway to measure. The screen says «لا حرق» for that case.

Runway **floors** to whole months: 9.2 months of safety is 9 months, and
rounding up adds a month of life that does not exist. (Arabic plurals also do
not inflect fractions — 9.2 falls into the `other` category and would render
«٩ شهر».)

### The commission simulator writes nothing

"Change without publishing" in the design markup. It is a pure function; every
scenario is computed server-side and sent together, so choosing a percentage is
a display, not a request. A test asserts `CommissionRule` is byte-identical
before and after running it — the number that decides whether to charge the
whole market must be seen before it happens, not tried on the market.

At 1% on 14.2M GMV: 142,000 commission, 226,300 total revenue, 1.59% take rate —
matching the design's annotation exactly.

## A8 · An undeclared variable blocks saving

The acceptance criterion. A template body contains `{amount}`; the sender fills
only the variables it knows about. So `{frist_name}` reaches the user **exactly
as typed**. Declaring variables is not documentation — it is what the text is
measured against.

Checked against all six texts (subject, body, SMS × Arabic, English), because
the typo lands in whichever language the editor proofreads less.

### The check runs on the merged text, not the submitted fields

Editing *only* the variable list can invalidate a body saved months earlier.
Validating just the submitted fields would let that through and leave the
template broken without its text ever being touched.

### Both sides check, for different reasons

The browser checks **while typing**: the unknown variable appears as a
one-click "add it" chip the moment it is written, and the save button disables.
The server checks again because the client check is a display, not a guard — and
the server names each rejected variable in `error.fields`, so the editor fixes
one typo instead of re-reading the whole text.

Verified live: sending `{frist_name}` straight to the API (bypassing the UI
entirely) returns 422 with `{"frist_name": "UNDECLARED"}`, the template is
unchanged, and no audit entry is written.

### SMS is measured while typing

Arabic sends as UCS-2: 70 characters per segment, 67 once it spans several
(three go to the concatenation header). Latin is 160 and 153. Confusing the two
makes a message estimated at one segment billed as three. A single Arabic
character anywhere flips the whole message to the Arabic limit.

Cost is shown to two decimals — segment cost is in halalas, and rounding to
riyals makes every message read "0 SAR" when it is not free.

### Groups come from the key prefix

`auth.otp` → `auth`. No column needed. Every prefix present in the data is
named: two unnamed prefixes become two adjacent filter chips both reading
«أخرى», which looks like one chip duplicated. An unknown prefix now falls back
to the **raw prefix**, so a new group appears under its own name and gets
noticed.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/v1/admin/finance/inputs` | One accounting input for one month |
| `PATCH` | `/api/v1/admin/notifications/{key}` | Template text and variables |

`PUT`, not `POST`, for finance inputs: the key is `(month, item)` and the value
replaces its predecessor. Repeating the request produces neither a second row
nor a second audit entry.

Rejected with 422: an unknown input key, a malformed month, a negative value,
and any undeclared template variable.

## A gate, from an error that happened twice

`TemplatesTable` is a `'use client'` component and imported its helpers from
`admin-notifications.ts`, which imports `db` — dragging Prisma into the browser
bundle and breaking the build. **The same defect as `CategoryFilter` in task
14.** The error message talks about `node:process`, never about the import that
caused it.

The second occurrence gets a gate, not a third fix: `checkClientDbImports` in
`scripts/check-tokens.mjs` follows `@/…` imports transitively from every
`'use client'` file and fails if any path reaches `@/lib/db` or the generated
client. `import type` is skipped — it is erased at compile time and never
reaches the bundle. The message prints the whole chain, because the chain is the
part that is hard to find.

Gate 12 does not catch this: it checks types and rows crossing the boundary, and
this is an import with no type involved.

The pure helpers now live in `src/lib/domain/notification-text.ts`, which the
browser and the server both import, and which has no database access at all.

## Deviations from the design

- **No 12-month GMV chart, revenue mix donut, or monthly expense card.** The
  first two need a charting approach not yet chosen anywhere in the admin; the
  expense card is a rendering of `FinanceInput` values that the inputs table
  already shows.
- **No delivery-rate figures** (email 98.4%, SMS 96.1% in the markup). They come
  from a provider that does not exist yet. SMS cost is shown but labelled an
  estimate — a real number would be an invented one.
- **No "test send" or "delivery log"** buttons — both need the provider.
- **No "+ new notification"** — templates are keyed to code that emits them, so
  a template with no emitter is a text nobody sends.
