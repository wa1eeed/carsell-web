# Models the product never edits

_Last updated: 2026-10-19_

**Generated-adjacent: the list is derived from the code, the reasons are not.**
Gate 63 reads `scripts/model-writers.mjs`, classifies every model in the schema,
and requires that each one the product neither creates nor edits appears below
with a reason. A model that gains an editor must be removed from this file; one
that loses it must be added. Neither drifts silently.

## Why this register exists

Documentation rots in two ways. A path that no longer resolves is cheap to
guard — gate 62 does it. The expensive one is a sentence that was **never
true**: «the operator sets it from the panel», written while planning, read a
month later as description. Three such claims were wrong in a single session on
2026-10-19, and one of them — a trust mark's registration number — had no panel
at all.

Matching phrases in prose cannot catch that. Measured on the same day: 39 lines
in these documents promise an operator capability, and most are quotations of
the owner's request, journal entries, or *descriptions of the bug itself*. A
gate on words would have raised an alarm on all of them.

So the register does not check the prose. It checks the thing the prose is
about: **can anybody change this row without a deploy?**

## The register

| Model | Why it is not editable |
|---|---|
| `LegalDocument` | **Deliberate** — «نسخ موقّتة لا تحرير حيّ». Whoever accepted the terms accepted a *specific version*, so editing in place would make their consent apply to text they never read. Each change is a new version with an effective date. **But the publishing path does not exist either**: a new version still needs a deploy. ROADMAP «Also open». |
| `Invoice` | **Legacy, superseded.** The real one is `TaxInvoice`, written by `issueInvoice` in `tax.ts` with ZATCA numbering, a rule snapshot and a QR. This table keeps six seeded rows and nothing reads it for tax. Removing it is a destructive migration on a table with `User` and `Order` relations, so it waits for a deliberate cleanup. |
| `FinanceProvider` | **A real gap.** Financing partners are seeded. Adding or removing one needs a deploy. |
| `Entitlement` | Plan entitlements are seeded with their plan. `Plan` itself is editable from `/admin/plans`; what each plan *grants* is not. Six entitlements already have no reader at all — recorded in `docs/NOTES.md`. |
| `Subscription` | Nothing subscribes: there is one free plan at zero commission and no paid tier yet. The table waits for the dealer panel, which the owner deferred. |
| `DeviceToken` | **Not seeded either** — nothing creates one. Push tokens come from a mobile app that does not exist; the only code touching the table deletes rows on account closure. |

## The second register: models nothing reads

Gate 64 is the reader half. A row nobody can read is worse than a row nobody
can edit, and the writer check cannot see it: `SeoTemplate` passed as «seeded»
for months while **no query in `src/` touched the table**.

A model counts as read when some `db.<model>.find*`/`count`/`aggregate`/`groupBy`
reaches it, **or** when a parent's relation field is selected in a query —
`TaxInvoiceLine` is read through `taxInvoice.include: { lines: true }` and never
by name. Measured across 97 models on 2026-10-19: eight had no direct reader,
six of them read through a parent. Counting only the direct form would have
cried wolf six times out of eight, and a check that cries wolf is read less
than no check at all.

| Model | Why nothing reads it |
|---|---|
_Empty: every model has a reader._

## Removed from the register

`PriceStat` and `VehicleHistoryItem` were here on 2026-10-19 and are not any
more: both got writers the same day, and gate 63 refused the file until they
were taken out. A register that keeps a model after its screen exists lies as
surely as one that omits a model without one.

- `PriceStat` is recomputed from **completed orders** by the `recomputePriceStats`
  job, at the four tiers the reader falls back through.
- `VehicleHistoryItem` is written at the three moments the platform witnesses:
  an inspection published, a sale completed, a service done.
- `WebhookEvent` is read at `/admin/webhooks` and, where the question actually
  arises, on the order's own payments tab. Building the reader exposed three
  defects the missing screen had been hiding: `signatureOk` was never `false`
  (a rejected callback returned 401 *before* the store), `applyState`'s refusal
  was thrown away so a late webhook was recorded as processed, and a retry left
  no trace at all. All three are now recorded per event, and the seed plants
  every shape — the table had zero rows, so the screen would have shipped as an
  empty state nobody could fill.
- `SeoTemplate` is edited at `/admin/seo`, and — the part the register was
  describing wrongly — it is **read** at last: the title and description of both
  landing pages and of unfiltered `/cars` come from it, with `src/messages`
  kept as the fallback so an emptied title never leaves a page without one. The
  register said its intro and outro were «printed on public landing pages»;
  they were not printed anywhere, because the pages had no such paragraphs.
- `FinanceSetting` is edited at `/admin/financing`, which shows the instalment
  its numbers produce on three sample prices **before** the save — «نسبة الربح
  ٦٪» does not say what «٢٬١٤٠ شهريا» says, and the figure it publishes sits
  under every car on the platform.

## What this does not claim

A model absent from this table has *some* code path that writes it. That is not
the same as having a screen an operator can use: `ApiKey` is written only by a
`lastUsedAt` stamp on every read, so nobody can issue a key. The measurement is
textual and cannot read intent — `npm run dead-ends` prints that caveat under
its own output, and certainty still comes from opening the screen.
