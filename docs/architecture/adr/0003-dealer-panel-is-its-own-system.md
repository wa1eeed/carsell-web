# ADR 0003 — The dealer panel is its own system, not a view of CARZ

**Status:** accepted · 2026-10-13
**Applies from:** the next dealer-facing task onward.

## Context

The owner's direction, given while dealer registration was being built:

> لوحة تحكم المعرض منفصلة — لوحة تحكم وداشبورد وإدارة طلبات وPOS وكل شيء يخص
> المعرض، وتغنيه عن استخدام أنظمة إدارة تشغيل المعرض. سنزوّدها بمميزات وإمكانيات
> لا تنحصر على عرض السيارات في كارز وإنما إدارة نشاطه بشكل كامل.

So it is a **dealer management system** that happens to be able to list into the
CARZ marketplace — not a marketplace account with extra screens. A showroom
should be able to run its day on it whether or not a single car is listed with
us: stock in and out, sales, point of sale, invoices, customers, staff.

This is a larger surface than anything else in the product, and it is deferred
until the marketplace itself is solid. What this record fixes is the handful of
decisions that are **cheap now and expensive later**.

## Decision

### 1 · A separate route tree, like `/admin`

`/dealer/*` gets its own layout, its own navigation and its own guard. It is not
a section under `/[locale]/(site)/account`, and it is not part of `/admin` — a
showroom's staff are not our staff, and the permission model is theirs.

### 2 · Inventory is `Vehicle`, listing is `Listing`

This repo has separated the two from its first schema, and a rule in `CLAUDE.md`
forbids conflating them. That separation is exactly what makes a DMS possible: a
dealer's stock is a set of `Vehicle` rows the business owns, and publishing one
to CARZ is an optional state of it, not its reason to exist. **Nothing may make
`Vehicle` depend on `Listing`.** The individual's «سياراتي» garage is the same
idea at one-car scale, and it is already built this way.

### 3 · The business is `Dealer`; a person is a `User` who belongs to it

`Dealer` already has `members User[]`, and `User.dealerId` already exists. A DMS
has several people under one business — a manager, a salesperson, an accountant —
so the business profile belongs on the organisation, not on a person.

**Today it is on the person**, and deliberately: dealer registration (2026-10-13)
writes `accountType`, `businessName`, `crNumber`, `address` onto `User`, because
there is exactly one person per business and the `Dealer` row is not created at
sign-up. That is correct for what exists and **wrong for what is coming**, so it
is written down here rather than left to be discovered:

> When the dealer panel is built, those four columns move to `Dealer`, the
> registering user becomes its first member (`dealerId`), and `profileCompletion`
> reads the organisation for a business account. The migration is mechanical as
> long as nothing else starts reading the `User` copies — so no new reader may be
> added to them.

### 4 · Registry data is evidence, not just form filling

The Lean lookup (`src/lib/integrations/lean.ts`) returns the commercial register,
the articles of association and the authorised managers. Today it only fills the
onboarding fields. A DMS needs the full payload kept as **review evidence** —
who was authorised, on what date, by which register — and that store belongs to
the organisation too.

## Consequences

- Dealer work is planned as its own product line, not as screens bolted onto the
  account. Estimates and sequencing follow from that.
- The `Vehicle` / `Listing` rule becomes load-bearing rather than tidy, and the
  gate that guards it is worth keeping strict.
- The four `User` columns above are a known, time-boxed debt with a written exit.
  A reader added to them without moving them turns a mechanical migration into a
  search.
