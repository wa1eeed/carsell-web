# How a service request reaches a provider

_Last updated: 2026-11-28_

> Asked by the owner on 2026-11-28: «كيف آلية الإسناد؟ وكيف يُحدَّد أيُّ
> المزوّدين وفي أيّ مدينة؟» — this file is the measured answer, and the engine
> it describes was built the same day because the measurement found a promise
> the product did not keep.

## 1 · Two doors, and until today nothing between them

A service request is born with `providerId = null`, `status = NEW`, the
customer's `city`, and a `Service` that carries a `providerType`.

**Door one — the provider claims it.** `providerQueue` shows a provider every
unclaimed `NEW` request where `service.providerType === provider.type` **and**
the request's city is in `provider.cities` (an empty `cities` means every city).
The first provider to press «اقبل» takes it.

**Door two — the operator assigns it.** `assignServiceRequest` applies the same
three conditions — active, matching type, covered city — and refuses with a
named reason otherwise. Bulk assignment is a loop over the single call, never an
`updateMany`: one audit row per request, and one failure does not stop the rest.

That was the whole mechanism: **first come, first served among the eligible**.
No load balancing, no turn-taking, no account of who keeps their deadlines.

**And the providers screen already promised otherwise**: «تجاوز الالتزام مرّتين
في شهر يُسقط المزوّد من **الإسناد الآليّ** حتى مراجعته». There was no automatic
assignment anywhere in the product, and nothing read
`SLA_BREACHES_BEFORE_SUSPENSION`. A constant with a reader that only displays
it is not a rule — it is a sentence.

## 2 · The engine: eligibility is a gate, the rest is an order

`src/lib/domain/assignment.ts`. `candidatesFor(ref)` returns **every** provider
of the request's type — eligible or not — each with the numbers behind the
verdict, because an operator who sees "nobody" must know whether the city is
uncovered, the providers are inactive, or they are all suspended. Those are
three different decisions.

A provider is **blocked** (not merely ranked lower) when it is inactive, is the
wrong type, does not cover the city, or has reached the breach threshold in the
last 30 days.

The eligible are then ordered by:

1. **Fewest breaches** — keeping deadlines is rewarded.
2. **Fewest open requests** — two in hand and ten in hand are not the same, and
   spreading the work is what prevents the next delay.
3. **Longest since last assigned** — a turn, so the alphabetically-first
   provider does not take everything.
4. Name, so the list does not reshuffle between two loads.

A breach is a request whose `dueAt` has passed and which is either unfinished or
was finished late. Counting only finished-late rewards a provider who leaves a
request open forever.

**Suspension is computed, not stored.** It lifts when the overdue requests are
closed or age out of the 30-day window; there is no flag to forget to clear.

## 3 · «مجموعة الإسناد» is derived, never stored

An assignment group is, in practice, **(service type × city)**: who covers this
city for this kind of work. A table holding that would be a second copy of each
provider's own `cities`, and the two drift the first time somebody edits
coverage — a provider adds a city, nobody adds it to the group, and it silently
stays out. `coverageGaps()` computes it on demand, and the providers screen
shows **only the cells with nobody eligible**: the full grid is hundreds of rows
an operator reads and does nothing with; the gaps are what can be acted on.

Measured the day it shipped: ownership transfer had **one** provider for Riyadh
and Jeddah and it was suspended for breaches, and no provider at all in the
other cities. Every transfer request in those cities would have waited until its
deadline expired, and the operator would have seen them one at a time and never
seen the pattern.

## 4 · What differs by provider type — and what does not

By the owner's decision (2026-10-14): **one unified provider panel whatever the
service**; the difference lives in the request's own screen, in the section
under the information card.

- The **steps** are shared: accept → start → finish. Any assigned work has that
  shape.
- The **finish form** is per type, from `completion-schema.ts`: shipping asks
  for carrier, tracking number, pickup and delivery dates, who received it;
  insurance asks for insurer, policy number, coverage, premium — and the
  deductible only for comprehensive; ownership transfer asks for the channel
  (Absher / Tam / the traffic department) and its reference.
- **Inspection is the exception**: it has no field list, it opens the inspection
  template — the categories and items the operator edits, with the critical
  items that cap the grade.

So a new provider type is a row in the completion schema, not a new screen. Two
twin screens drift at the first edit to one of them.

## 5 · What is still open

- **Auto-assign is operator-triggered, not automatic on arrival.** The button
  assigns the selected requests; nothing yet assigns a request the moment it is
  created. Whether a request should be pushed immediately, or left for providers
  to claim for a grace period first, is a product decision and not ours to make.
- **No capacity per provider** — only a count of what it currently holds. A
  provider that can take three a day and one that can take thirty rank the same
  at equal load.
- **No working hours**: a request created at midnight ranks providers the same
  as one at noon.
