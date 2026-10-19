# Models the product never edits

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
| `SeoTemplate` | **A real gap.** The intro and outro printed on public landing pages — read by search engines before anybody else — cannot be changed without a deploy. |
| `FinanceProvider` | **A real gap.** Financing partners are seeded. Adding or removing one needs a deploy. |
| `Entitlement` | Plan entitlements are seeded with their plan. `Plan` itself is editable from `/admin/plans`; what each plan *grants* is not. Six entitlements already have no reader at all — recorded in `docs/NOTES.md`. |
| `Subscription` | Nothing subscribes: there is one free plan at zero commission and no paid tier yet. The table waits for the dealer panel, which the owner deferred. |
| `DeviceToken` | **Not seeded either** — nothing creates one. Push tokens come from a mobile app that does not exist; the only code touching the table deletes rows on account closure. |

## Removed from the register

`PriceStat` and `VehicleHistoryItem` were here on 2026-10-19 and are not any
more: both got writers the same day, and gate 63 refused the file until they
were taken out. A register that keeps a model after its screen exists lies as
surely as one that omits a model without one.

- `PriceStat` is recomputed from **completed orders** by the `recomputePriceStats`
  job, at the four tiers the reader falls back through.
- `VehicleHistoryItem` is written at the three moments the platform witnesses:
  an inspection published, a sale completed, a service done.
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
