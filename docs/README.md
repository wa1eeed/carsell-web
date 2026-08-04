# CarSell — documentation

A Saudi car marketplace: listings, negotiation, auctions, escrowed payment,
ownership transfer, and ZATCA-compliant invoicing. Next.js App Router,
PostgreSQL via Prisma, Arabic-first with English alongside.

## Read in this order

**1 · What the system is**

- [`architecture/erd.md`](architecture/erd.md) — the 77 models and their
  relationships. **Generated** from `prisma/schema.prisma`; `npm run verify`
  fails if it is stale.
- [`workflows/state-machines.md`](workflows/state-machines.md) — the five paths
  a transaction takes. Every state named there is checked against the schema
  enums, so the diagram cannot drift into naming states that do not exist.

**2 · How to talk to it**

- [`api/openapi.json`](api/openapi.json) — all 44 routes, **generated** from the
  route tree and each route's Zod schema. A route whose schema cannot be parsed
  is reported, never silently omitted.
- [`api/conventions.md`](api/conventions.md) — envelope, errors, pagination.
- Per-area API notes live beside it: `orders.md`, `payments.md`, `auctions.md`,
  `offers.md`, and the rest.

**3 · The money**

- [`tax-model.md`](tax-model.md) — the tax engine, the three documents that are
  never merged, the disbursement/fee split, and **twelve open questions for the
  tax adviser**. Read § 5 before touching anything here.
- [`api/payments.md`](api/payments.md) — the escrow-vocabulary gateway
  interface, declared capabilities, and per-purpose routing.
- [`operations/reconciliation.md`](operations/reconciliation.md) — daily
  comparison against gateway settlement.

**4 · Running it**

- [`SETUP.md`](SETUP.md) — local setup.
- [`RUNBOOK.md`](RUNBOOK.md) — backup, restore, and incident steps.
- [`operations/integrations.md`](operations/integrations.md) — every external
  dependency and what happens when it is down.

**5 · Why things are the way they are**

- [`DESIGN-DECISIONS.md`](DESIGN-DECISIONS.md) — the binding decisions, in order,
  with the reasoning. **This file outranks the specification on any conflict.**
- [`DESIGN-DEVIATIONS.md`](DESIGN-DEVIATIONS.md) — where the build departs from
  the design files, and why.
- [`NOTES.md`](NOTES.md) — what must happen before production.
- [`TASKS.md`](TASKS.md) — the build contract and what remains.

## Things that will surprise you

**Money is `Decimal`, never `Float`.** A gate fails the build on `Float` in a
money column.

**Numbers are stored Latin and displayed Arabic-Indic.** Everything passes
through `<ArabicNumber>`, which also keeps a minus sign on the left — inside an
RTL run a bare sign lands on the wrong side and `-892` renders as `892-`.

**Arabic has six plural forms.** No count is ever concatenated with a noun by
hand; `<Quantity unit count>` does it through ICU. Two gates enforce this, one
for JSX and one for template strings.

**The domain returns data, not sentences.** `src/lib/domain/` may not contain
Arabic outside comments — it does not know the locale and cannot form a plural,
so a sentence built there produces "6 يومًا". Wording lives in
`src/lib/labels/` and in the screens.

**Snapshots do not move.** Commission, transfer fee, service price, tax rule,
processing fee — each is copied onto the row at creation. Editing the setting
afterwards changes nothing already issued, and that is structural: no query
reads the live setting back.

**Anything that needs a guard is built guarded.** Release to the seller, tax rule
edits, key rotation, and integration environment switches all require two
approvers, and the quorum was written with the feature rather than after it —
between building and guarding there is a window, and one release in that window
is enough.

## Verifying

```
npm run verify
```

Types, lint, eighteen repository gates, generated-documentation freshness, and
the test suite. It stops at the first failure — do not read the tail of a chained
command instead, because the tail shows the last command that ran, not the first
that failed.

Every gate in `scripts/check-tokens.mjs` and `eslint-rules/` was born from a
mistake that happened **twice**. Add to them rather than fixing the same class of
error a third time.
- [LEDGER.md](LEDGER.md) — the double-entry ledger: accounts, the four money moments, and why a ledger is not a wallet.
- [DEPLOY-STAGING.md](DEPLOY-STAGING.md) — deploying staging to a VPS with Coolify.
