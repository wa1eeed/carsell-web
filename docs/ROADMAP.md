# The register — everything the owner asked for, in the order they set it

This file exists because the owner asked for one thing above all others: that
nothing they have asked for gets lost. A promise does not guarantee that; a
written list that is read at the start of every session does.

**Rule for this file:** when the owner asks for something, it is added here
**in the same session**, before any code is written for it. When it is done, the
row is marked and left in place — a register, not a wish list. Detail lives in
the file each row points to; this page is the index that must never be
incomplete.

Updated: 2026-10-14.

---

## The order the owner set

> «بقية الشاشات ثم نحسم المراحل ثم ننتقل لبناء لوحة المعرض» — 2026-10-13

Services and the Moyasar work arrived after that sentence and are sequenced
below against it, not instead of it.

| # | Stage | State |
| --- | --- | --- |
| 1 | The rest of the marketplace screens | **in progress** |
| 2 | Settle the order stages | not started — **needs the owner** |
| 3 | The services vertical and the two gateways | 1 of 8 steps done |
| 4 | The dealer panel | deferred by the owner, fully specified |

---

## 1 · The rest of the marketplace screens — *in progress*

Walked page by page, each compared against its block in
`design/Front-end Web.dc.html` and opened by clicking, not by reading.

**Done this session:** the SEO landing page (Wz), the order page (Wj), the
account home and its sections, earnings, the inspection report (Wd), the sell
wizard (Wh), auctions, search, identity (A18) and most admin screens. Findings
and fixes are in `docs/BACKLOG.md` § A and § C.

**Still unwalked:**

- [ ] The help / support pages.
- [ ] The remaining landing pages beyond the one walked.
- [ ] A re-measure of the mobile layout after the type-scale and header changes
      — `docs/BACKLOG.md` records that this measurement rots and must be redone
      after anything touching fonts, the header or the grids.

## 2 · Settle the order stages — *needs the owner*

**Not recorded anywhere until now, which is exactly the kind of loss this file
prevents.**

The product has **six** stages in `OrderStage`:

`REQUEST → APPROVED → INSPECTION → PAYMENT → TRANSFER → DONE`

The owner's dashboard mock-up shows **seven**: Pending · Accepted · Agreement ·
Ownership · Delivery · Completed · Rejected.

Three differences, and each is a business rule, not a label:

1. **«Agreement»** has no stage. Today the sale agreement is issued *at* `DONE`,
   not as a step of its own.
2. **«Delivery»** is separate from «Ownership» in the mock-up; the product
   treats transfer-of-ownership and handover as one stage (`TRANSFER`).
3. **«Rejected»** is drawn as a stage. In the product, cancellation is a
   **status**, not a stage — decision 17, and the reason it holds is that an
   order cancelled at payment must still read «أُلغي عند الدفع», which a stage
   cannot express. Gate 39 enforces it.

**What is needed:** whether the seven are the intended journey, or the mock-up
is a visual grouping of the six. This changes `OrderStage`, the stage tracker,
the ledger's event names and every screen that renders a stage.

## 3 · The services vertical and the two gateways

Rules and decisions: `docs/DESIGN-DECISIONS.md` (2026-10-14, two entries).
Measurement and build order: `docs/BACKLOG.md` § I.

- [x] **The platform fee is charged.** `Service.adminFeeMode` (`FIXED` |
      `PERCENT`), added on top of the provider's price. It had been configured
      in the admin panel and never collected.
- [ ] **Two gateway configurations** in `/admin/integrations`: «إعدادات الدفع
      الإلكتروني للمنصّة» (ordinary Moyasar merchant) and «إعدادات الدفع
      للمزوّدين» (Moyasar Platform API). Credentials entered there, encrypted,
      **never in the repo**. The Platform Key has not been supplied yet.
- [ ] **A Moyasar Platform adapter** — onboarding, account status, split
      payment, authorize & capture, release, balance.
- [ ] **The request lifecycle with the seller's consent step.** Nothing in the
      product currently moves a `ServiceRequest` off `NEW`.
- [ ] **City dispatch** — the request goes to the inspectors in the **car's**
      city; today `Service.providerId` binds one provider per service and the
      city comes from the requester's input.
- [ ] **A provider surface.** `src/app` holds `[locale]` and `admin` and nothing
      else, so "the seller's contact is revealed to the inspector" has nowhere
      to appear.
- [ ] **Contact disclosure with an audit trail**, as A18 logs every ID reveal.
- [ ] **The provider detail page** — balance, received requests, dues, payout
      state, split, capture, release, account-opening status. The owner's words:
      «كل شيء كل شي».
- [ ] **The report builder.** `InspectionReport` is written only by the seed.
- [ ] **Report ownership.** `findReportByListingRef` shows any report on the
      vehicle to everyone; a buyer-paid report must stay private until shared or
      bought.

## 4 · The dealer panel — *deferred by the owner, fully specified*

> «لوحة تحكم المعرض ستكون لوحة تحكم متقدمة… لذلك اقترح تأجيله الى ان تكتمل
> المنصه بشكل محكم» — and later «يجب ان تكون لوحة تحكم المعرض منفصله».

It is **its own system** under `/dealer`, not a section of the account.
Architecture: `docs/architecture/adr/0003-dealer-panel-is-its-own-system.md`.
Concept: `docs/dealer/panel-concept.md`. Requirements:
`docs/dealer/requirements.md`.

Everything the owner listed is captured there — the margin-VAT engine and the
vehicle cost ledger it needs, ZATCA phase two, VIN inventory, add-on costs,
branches, deposits and reservations, sale contracts, financing sales, the chart
of accounts, expenses, consignment, the mobile app, salesperson commissions and
smart reports.

**Open against it, from the same conversation:**

- [ ] **Commission settings for dealers** — whether the platform's commission
      applies to a showroom's sales, and how it is configured.
- [ ] **How a showroom's sale proceeds are collected** — the owner expects this
      to need flexible settings.
- [ ] **The vehicle cost ledger** is the first accounting task: the margin-VAT
      engine exists and its input (purchase price + add-on costs) does not.

---

## Also open, outside the four stages

These were asked for or decided earlier and are not part of the sequence above.
Each links to where it is specified.

| Item | Where | State |
| --- | --- | --- |
| KYC / KYB registration for individuals and businesses | `docs/BACKLOG.md` § KYC/KYB | built; refinements listed there |
| Lean Technologies registry lookup on the dealer CR step | `docs/BACKLOG.md` § Dealer registration | built behind a flag; credentials entered in `/admin/integrations` |
| Nafath | deferred by the owner — a contract with the provider is pending | not started |
| Plates as a sellable item | `docs/BACKLOG.md` § F — and the garage's one open row in § B | **decided: after launch** |
| `cn` does not merge Tailwind classes, while its comment says the last one wins | `docs/BACKLOG.md` § E | risk recorded, awaiting a decision: `tailwind-merge` (a dependency) or an audit of each component |
| My cars (the garage) | `docs/BACKLOG.md` § B | **usable end to end**; its only open row is the plate, which follows § F |
| English UI strings | `docs/BACKLOG.md` § D | deferred by the owner |
| `home_story` ad slot has no design | `docs/DESIGN-DECISIONS.md` | question pending |
| Notification templates still silent | `docs/BACKLOG.md` § G | 7 remain, all declared with a reason, guarded by gate 45 |
| Production build barrier | `CLAUDE.md` | diagnosed: `NODE_ENV=development` during `next build`; run `npm run build:check` before any release |

---

## The audit that produced this file

Asked on 2026-10-14 whether anything had been forgotten, the answer was not a
reassurance but a measurement: every request in the conversation was grepped
against the repository, and every open `- [ ]` in `docs/BACKLOG.md` was checked
for a path leading to it from this index.

It found two that nothing pointed at — § B's open row and § E — now listed
above. Everything else was already recorded: the fourteen dealer-panel items,
the registration and Lean details, the Moyasar decisions, the KYB documents
question and the `User`-versus-`Dealer` question.

**Repeat that check when this file changes:** an open item in any document that
no row here reaches is an item on its way to being forgotten.

## How this file stays true

- It is read at the start of a session, with `CLAUDE.md` and
  `docs/DESIGN-DECISIONS.md`.
- A new request from the owner is written here **before** the work starts, in
  the same session it arrives.
- A finished item keeps its row, marked, so the list reads as a record.
- When a row's detail outgrows one line, it moves to its own file and the row
  becomes a pointer. The index never shrinks.
