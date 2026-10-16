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
| 5 | Drop the two-approval requirement in the admin panel | owner's decision, sequenced after the above |

---

## 1 · The rest of the marketplace screens — *in progress*

Walked page by page, each compared against its block in
`design/Front-end Web.dc.html` and opened by clicking, not by reading.

**Done this session:** the SEO landing page (Wz), the order page (Wj), the
account home and its sections, earnings, the inspection report (Wd), the sell
wizard (Wh), auctions, search, identity (A18) and most admin screens. Findings
and fixes are in `docs/BACKLOG.md` § A and § C.

**Closed 2026-10-14 — the footer.** Measured while walking the remaining
screens: its eleven links were **dead text** (`<li>{link}</li>`, no `href`), and
it rendered on the **home page only — one of thirty-three**. So «الشروط
والأحكام» and «سياسة الخصوصية» could not be reached from any other page, which
they must be. The cause of the second was the first: the footer took its columns
as a prop, so every page that wanted it had to copy five lines — and only one
did. It now reads its own columns and lives in the `(site)` layout. Three labels
pointing at pages that do not exist («التمويل» · «دليل البائع» · «الباقات») were
removed until they are built — a link that opens a 404 is worse than no link.
Guarded by `tests/footer-links.test.ts`, which resolves every href against the
route tree.

**Closed 2026-10-14 — the help centre (Wn).** Walked by clicking, and five
things were wrong with a page that reads fine:

- **Four of nine topic counters lied.** `helpCategories` counted every active
  FAQ while the list showed only those placed on the `help_center` surface, so
  «المزادات ٥ مقالات» opened three. One filter now serves both, and
  `tests/help-centre.test.ts` asserts the *relation* (each counter equals the
  length of what it opens) rather than a number an editor would break.
- **After the first topic click, no answer was open.** `FaqAccordion` seeded its
  open row with `useState(rows[0]?.id)`; client navigation between `?topic=`
  URLs does not remount it, so the held id matched nothing in the new list. The
  design opens the first. **Gate 47** now refuses state seeded from a list prop —
  measured at four occurrences, all fixed, one of which (`RequestService`) would
  have ordered an inspection **for the previously viewed car**.
- **The heading lied after a search.** It still read «الأكثر سؤالًا» over search
  results, with no count and no way back. It now names the query, counts the
  results through `Quantity`, and offers «امسح البحث».
- **A fruitless search said «لا أسئلة في هذا الموضوع»** — the reader chose no
  topic. A search has its own empty state now, with two ways out.
- **No structured data** on the one page that is entirely questions, while the
  car page emits `FAQPage` from eight. Added, with `BreadcrumbList` and a
  visible breadcrumb.

Also: answers are now linkable (`?a=…#q-…`, rendered open by the server so the
link works without JS and the JSON-LD stays true), the hero carries the design's
«كيف نساعدك؟», the two hard-coded Arabic strings in the search box are
translated, and the intro no longer promises that contact is «أسفل الصفحة» when
it is in the sidebar.

**Still unwalked:**

**Closed 2026-10-14 — the landing pages.** `docs/frontend/seo.md`.

- **The model-level page showed no cars.** Its sibling, the brand page, had
  already been fixed for exactly this — heading, stat line, button, and whoever
  arrived from a search saw nothing. The model page is the *more specific* of
  the two, which is what a searcher types. It now has the grid, the sort chips
  and the breadcrumb.
- **It could not be opened in any development environment.** Measured: the
  biggest city × brand × model combination in seeded data was **two**, below the
  threshold of three — which is why the missing grid survived. The seed now pins
  the first three listings to one city and one trim. **What is not seeded is not
  seen.**
- **The car page's structured breadcrumb declared three 404s.**
  `/cars/{city}/{brand}` and `/cars/{city}/{brand}/{model}` are not routes; the
  landing page is. We were declaring pages we do not own — to a machine, so
  nothing surfaced it. `carTrail` is now a pure, tested function: the city node
  points at the filtered search, the brand and model nodes at the landing pages
  **when they clear the threshold**, and are dropped when they do not.
- **Neither landing level had structured data**, while the car page emits three
  blocks. Both now emit `BreadcrumbList` and an `ItemList` built from the cards
  actually rendered.
**Closed 2026-10-14 — the mobile re-measure.** Twelve public pages at 375 px:
**no horizontal overflow anywhere**, so the type-scale and header work held. What
the sweep did find was a different class the old measurement never looked at.

- **Tap targets below the WCAG 2.2 AA minimum (24 px).** Seventeen on the home
  page alone: every footer link (20 px) and every «عرض الكل» rail entry (20 px),
  plus the legal sidebar's fifteen, the breadcrumbs, the report-listing link and
  the auth mode switch. Padding widens the hit area of an inline element without
  moving a line, and a negative margin returns what the padding took — so the
  design is untouched and the target is twice the size. `ActionLink`/`ActionButton`
  now own that rail-entry style, which had been copied into seven files.
- **Fifteen anchors wrapping buttons.** `<Link><Button>` is interactive content
  inside interactive content: invalid HTML, **two tab stops for one action**, and
  a screen reader announcing a link that contains a button. `LinkButton` wears
  `buttonShape` as a single `<a>`. **Gate 48** refuses the nesting in either
  direction, and the twelve pages serve no `<a><button>` any more.

The sweep itself: 375 px, `scrollWidth > innerWidth` for overflow and
`getBoundingClientRect().height < 24` for targets, per page. Redo it after
anything touching fonts, the header or the grids.

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
- [x] **Two gateway configurations** in `/admin/integrations`: «بوابة الدفع
      للمنصّة» (`payments`) and «بوابة الدفع للمزوّدين» (`moyasar_platform`),
      seeded and distinct on screen. Credential field names are now **declared
      per integration** instead of typed free-form, so a mistyped name can no
      longer store a secret nobody reads. **The test Platform Key arrived
      2026-10-14** and is stored through the real dual-approval path, encrypted,
      and left there as the test data the owner asked for.
- [x] **A Moyasar Platform adapter** — `src/lib/payments/provider-platform.ts`
      (the port, in our vocabulary) and
      `src/lib/payments/adapters/moyasar-platform.ts` (the only translating
      file). Opens an account, reads its state and balance, submits for review,
      and validates splits before they are sent. Documented in
      `docs/api/provider-payments.md`. **Reads verified against the sandbox**,
      which corrected two assumptions: the balance needs the *account's* own key
      (the platform key is refused), and the merchant list is paged, not a bare
      array. **Creating an account is now proven too** and corrected four more:
      `fees` is required and undocumented on the overview page; its rate is a
      **fraction, not a percentage** (`1.70` would have charged a partner a
      hundred times over); the response carries the account's secret keys
      **once**, and they are the only way to read its balance; and it lists the
      documents the account still needs. Submitting for review and sending
      splits remain unproven.
- [x] **«افحص الاتصال» actually calls now.** It used to ask whether a secret was
      stored and answer «untested», so whoever pressed it believed their key
      worked when nothing had tried it.
- [x] **The request lifecycle with the seller's consent step**, end to end:
      request (no money) → seller's decision → payment → the providers' queue,
      with the lapse job and the disclosure rule. Routes, both faces of
      `/account/reports/[ref]`, and the seller's entry point on the account
      home. Walked by clicking the whole way. `docs/workflows/service-request.md`.
- [x] **City dispatch** — the city comes from the **listing**, and the pool is
      every provider of the service's `providerType` covering that city with a
      usable payment account. `Service.providerId` stays the preferred one.
- [x] **Notifications for each step** — consent needed, granted, declined and
      lapsed, each to the party who did **not** act, each linking to the request
      and gated on being one of its two parties. Fixed `Dispute` in passing: it
      had been declared in `NotificationEntity` with **no destination resolver**,
      so three critical dispute notifications arrived with no link.
- [x] **A provider surface — one panel for every provider type** (owner's
      decision, 2026-10-14). `/provider`: its own identity
      (`ProviderUser` / `ProviderSession`), a queue, and a request page that is
      a fixed info card over a section whose buttons come from
      `stepsFor(type, status)`. Ownership transfer will be a row in that
      definition, not a second screen. `docs/workflows/provider-panel.md`.
- [x] **The fee matrix is set from the admin panel, for both gateways** (owner's
      instruction, 2026-10-14: «الرسوم تُضبط من لوحة الأدمن ولا نضعها داخل
      الكود»). The providers' matrix lives in `PlatformSetting` and is edited on
      `/admin/payments`; the platform gateway's `feePct`/`feeFixed` are edited
      inline on each gateway card. The constant `MOYASAR_CAPABILITIES` is gone —
      it was a **second source** that `expiryFrom` read while the screen read the
      row. The percentage→fraction conversion lives in one function with the
      field showing what will be sent, and **gate 46** refuses any non-zero fee
      literal under `src/`.
- [x] **And the button that uses it.** `openAccount` was proven against the
      sandbox and **had no caller**: `accountStatus` had no writer outside the
      seed, so a provider added from the panel could never be dispatched a
      request. The provider's page now carries the registration file, opening,
      state sync and submit-for-review. Walked on screen against the sandbox:
      `201`, both identifiers, the three required documents, and
      `mada 0.01700 · card 0.02700` from the percentages typed into the panel.
- [ ] **The inspection form** behind `complete` — **its fields come from the
      owner after the current tasks**, so the step completes without a form
      today rather than inventing fields that would be replaced.
- [x] **Each provider step tells whoever paid.** `applyStep` wrote the status and
      said nothing — the person who paid learned neither that a centre took the
      work, nor that it finished, nor that it failed. Three notifications
      (`service.assigned` · `service.completed` · `service.failed`), and `start`
      is deliberately silent because it changes nothing the requester can do.
      `service.completed` had been declared silent under gate 45 because "nothing
      finishes a service request" — true when written, false once the provider
      panel shipped.
- [x] **Every domain writer has a door — measured to zero.** The class had hit
      thirteen times, and the automatic measurement in `docs/NOTES.md` listed
      fifteen functions nothing could reach. The last one left needed deleting,
      not wiring: `purchaseService` was a complete purchase path (gateway, VAT,
      platform fee, a reference reserved in a transaction) with no caller, **and
      it enforced a rule the owner had replaced** — that only a vehicle's owner
      may request its inspection. Wired back, it would have bypassed the seller's
      consent step the whole journey is built on. **Gate 50** holds the count at
      zero.
- [ ] **Out-of-band alerts to the provider.** `Notification` is keyed to a
      marketplace user and a provider is a third identity, so nothing reaches a
      centre that is not looking at its panel — and the channels that would carry
      it are behind flags for everyone. The panel used to promise one anyway;
      the text now says what is true.
- [ ] **Contact disclosure with an audit trail**, as A18 logs every ID reveal.
- [x] **The provider detail page** — counters that open their lists, the
      requests received, who signs in on their behalf, the payment account with
      what its state means, and the value of completed work. The gateway
      **balance** waits for the adapter: it is read from the provider, never
      computed here. Split, capture and release come with the money work below.
- [x] **A paid service reaches the ledger.** It wrote **nothing at all**: the
      customer paid, the money was held, and no line recorded it — no revenue
      waiting, no debt to the provider, no VAT accrued. Measured: `ledgerEntry`
      had no account that concerned services. Two moments now — `service.paid`
      (collected, not earned) and `service.earned` + `service.provider_due` (the
      work was delivered) — and the VAT is snapshotted on the request beside the
      fee, because deriving it later follows the rate current when it is *read*.
      `docs/LEDGER.md` § 5.5. One question recorded for the owner: principal or
      agent (`docs/OPEN-QUESTIONS.md`) — built on the tax rule's answer.
- [x] **A completed service issues its own tax invoice.**

      *(The line that stood here yesterday — "no invoice is issued for anything"
      — was **wrong**, and measured the wrong model. `Invoice` is a legacy table
      the seed alone writes; the real one is `TaxInvoice`, and `issueInvoice` in
      `tax.ts` has issued order invoices with ZATCA numbering, a rule snapshot
      and a QR since it was built.)*

      What was true: **services were never invoiced**. Order settlement lists
      them as blocked with the reason `INVOICED_WITH_ITS_OWN_PAYMENT` —
      "invoiced with their own payment" — and nothing issued that invoice. So
      money was collected and VAT accrued in the ledger with no document going
      to whoever paid.

      Issued at **completion**, not at payment: the service is short, and a
      failure before completion then means no invoice was ever issued and no
      credit note is needed — *the error is asymmetric: a gap can be filled, a
      document that went out cannot be unsent.* Recorded for the owner, since
      the KSA tax point is the earliest of supply, invoice or payment.
      `serviceRequestId` is unique, so a second issue fails on a database
      constraint rather than on a check that precedes it.
- [x] **A failed service refunds the money.** The critical notification promised
      «وما دُفع يُردّ» and nothing refunded: `REFUNDED` sat in the enum with no
      writer while the money stayed held. The hold is now cancelled at the
      gateway and `service.refunded` is posted — money first, books second, so a
      refused cancellation leaves a state a retry can find. **The request stays
      `FAILED`**: `REFUNDED` is in the same enum and writing it would erase why
      the work stopped (decision 17 — the state of the money is not the state of
      the work), so the money's state lives on the `Payment`. `REFUNDED`
      deliberately keeps no writer. Automatic, with the question recorded.
- [x] **A completed service captures its hold.** The admin screen showed it:
      `SRV-2026-3106` was `DONE`, carried invoice `INV-2026-000001`, had its
      revenue and VAT in the ledger — and its payment read **«محجوز لدى
      البوّابة»**. Nothing captured. Moyasar voids an uncaptured hold after seven
      days, so the card would be released after we delivered the work and issued
      a document for it. `captureServicePayment` now runs from `applyStep` on
      `DONE`, right after the invoice, and posts `service.captured`
      (`PLATFORM_CASH` ← `ESCROW_AT_PROVIDER`) — a treasury movement, not a
      second recognition of revenue. A gateway that fails or answers `PENDING`
      leaves the payment `HELD` and writes **no** entry; `captureDoneServices`,
      the thirteenth scheduler job, retries it. `docs/LEDGER.md` § 5.5.3.
- [x] **`settleRef` is written on every path that settles.** Found while
      building the capture: the fix recorded in `payments.ts` covered order
      settlement and the manual one and **left the webhook** — the path a real
      gateway actually uses. `payment_captured` reached `SETTLED` with no
      reference, so `reconcileYesterday` matched on the hold ref and the daily
      report showed a difference with no cause. Gate 52 now refuses both shapes,
      and a test asserts no settled payment in the database lacks one.
- [x] **Money is shown exactly where it is reconciled.** Four screens contradicted
      themselves: the service-request detail read «المبلغ ٥١٨» above «المدفوع
      ٥١٧٫٥٠»; the ledger's cards read «لدى مزوّد الدفع ٣٦٢٬٤٤٣» above its own
      balance «٣٦٢٬٤٤٢٫٥٠»; the ledger's entry table rounded a 517.50 debit to
      518 against credits of 450 and 68, so the double entry **balanced by luck
      of rounding**; and the seller's earnings page promised «جاهز للصرف ٤٨٣»
      above a breakdown of «٤٨٢٫٦٣» — gateway fees are 1.70% + 1 SAR, so halalas
      are the rule, not the exception. `Money` defaults to no decimals; every
      figure a person reconciles now passes `decimals={2}`.
- [x] **A forfeited deposit says whose it was.** The entry was written with the
      constant `note: 'deposit.forfeited'` and no `orderId` and no `userId`: five
      thousand riyals entered revenue and the book did not say **whose deposit**
      or on which auction — the first question asked when the bidder objects. It
      now carries the auction's listing ref, the bidder, the payment and the
      order. *(And the anonymity had a second effect: the shared test restore
      collects ledger transactions by `orderId`, so a transaction without one
      escaped it — 5,000 leaked into the development ledger and inflated platform
      revenue six-fold. Found by reading the screen after a verify run.)*
- [ ] **A vehicle order never writes `PLATFORM_CASH`.** `service.captured` and
      `deposit.forfeited` are the only entries that touch it. Orders settle
      through `settleOnTransferConfirmed` — the gateway really is captured — and
      no cash line is posted; our own commission and VAT never leave
      `ESCROW_AT_PROVIDER` at all, so the card that reads «التزامٌ تجاه الأطراف،
      لا مالٌ لنا» today carries our money too. **A money rule, so asked not
      decided**: `docs/OPEN-QUESTIONS.md`, "متى يصير مالُ بيع المركبة نقدًا".
- [x] **Every ledger line opens on what it concerns.** The «الطلب» column came
      from `orderId` alone, so every service entry read «—»: an auditor looking
      at 517.50 could not tell which service it was. The column is «المرجع» now,
      resolved from the order or — for services — from the note **matched against
      a real `ServiceRequest.ref`**, so a payout's `payout … · bankRef` note is
      never displayed as a reference. Both link to their screen.
- [ ] **A ledger line cannot be traced to its service.** The «الطلب» column shows
      «—» for every service entry: the order link comes from `orderId`, and a
      service's reference lives in `note`. A finance operator reading a 517.50
      line cannot tell which service it is.
- [x] **The whole surface walked, not sampled.** `npm run walk:surface` signs in
      as an admin and as a user, requests **every** `page.tsx` with real ids from
      the database, then requests **every internal link** on every page that
      answered 200. First measurement: 90 defined routes, 614 URLs, **602 at
      200**, and **not one link leading to a broken page**. The rest are
      destinations that belong to someone else (another buyer's order is a 404 by
      right) and permission redirects to sign-in. `docs/NOTES.md`.
- [x] **Two links in the header carried no locale.** `/sell` and `/auth` are
      rendered by `LinkButton` — a plain `next/link`, unlike `Link` from
      `@/i18n/navigation` — so the middleware answered 307 on **every click, in
      the header of 79 pages out of 80**. A link redirected on every click is not
      a correct link that is slow; it tells a search engine our addresses are not
      final. Gate 53 refuses a literal absolute href on anything but `<Link>`
      inside the localized tree.
- [x] **The profile card told a complete profile it was incomplete.** With email,
      identity and IBAN present, `canBuy` and `canSell` are both true and what is
      left is city, tax status and bank name — **none of which blocks anything**.
      The card still read «أكمل ملفك قبل أول معاملة» and «هذه الحقول مطلوبة قبل
      الشراء أو البيع» to a seller with a published listing and a live auction.
      The blocked wording is kept for the blocked states; the rest now says what
      is true.
- [x] **A provider's name opened the list of all providers.** The service-request
      card linked to `/admin/providers?q=<name>` and that page **reads no `q` and
      has no search box**, so the operator landed on all six and searched by eye —
      while `providerId` was in hand in the same condition. It opens the provider.
- [ ] **Commission is seeded at zero, so take rate reads 0.0%.** Both
      `CommissionRule` rows are `pct: 0` — deliberate, and `/admin/plans` can set
      them — but a deployment that goes live without the owner's number earns
      nothing on a vehicle sale and the dashboard says so in one figure. Needs the
      owner's rate, not a code change.
- [ ] **The report builder.** `InspectionReport` is written only by the seed.
- [x] **Report ownership** (owner's decision 4). `InspectionReport.publishedAt`:
      the seller's report is public on the listing, a buyer's is private to
      whoever paid. It had been **any report to any visitor** — a buyer who paid
      450 SAR published what they bought to the seller and to everyone bidding
      against them. And the leak was wider than the screen: the row rode into the
      **RSC payload** of a public page through the detail include, drawn by
      nothing and readable by anyone who looked at the source. Eight public reads
      carried it; **gate 49** now refuses an `inspectionReports` query without
      the publication condition. The seed writes a buyer-paid report too — the
      private case had never been rendered, which is why nothing caught it.
      `docs/workflows/service-request.md`.
- [ ] **Sharing or selling a private report to the seller** — the decision says
      publishing comes later, and that a published report is never retracted.

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

## 5 · Drop the two-approval requirement in the admin panel — *owner's decision*

> «موافقة العضوين يجب أن نعمل على إزالة هذا القيد من لوحة الأدمن، حيث الأدمن
> يملك صلاحية مطلقة. أضف هذه المهمة في جدول المهام… وسنصل إليها عند إنجاز باقي
> المهام التي تسبقها» — 2026-10-14

Dual approval guards four things today, enforced by **gate 19** in
`scripts/check-tokens.mjs`: key rotation, environment switch, payouts, and
dispute resolution. Removing it is a business decision the owner has made; the
work is not a one-line deletion:

- [ ] Remove the requirement from the flows that enforce it
      (`requiredApprovals`, `approveRotation` and its siblings).
- [ ] **Retire or re-aim gate 19.** It exists because half-built quorums shipped
      three times — an approver with no function, a function with no button, a
      check on a weaker permission. Deleting the rule without deleting the gate
      leaves a gate guarding a rule nobody follows.
- [ ] Decide what replaces it for **money movements**. An absolute admin still
      leaves a record: every such action already writes `AuditLog`, and that
      becomes the only control. Worth confirming that is the intent for payouts
      specifically.

Sequenced after the current work, as the owner asked.

### Needed from the owner

| What | Why it blocks |
| --- | --- |
| ~~The fee matrix~~ | **Answered 2026-10-14: it is configured from the admin panel, never in code** — for both gateways. **Built the same day** (§ 3), and gate 46 keeps fees out of the code. |
| **The inspection form fields** | Still with the owner, after the current tasks. A reference was given (`halacarly.com`, inspection tab) and the standard set: match the best car sites, work on web and phone. The form is therefore built so the **point list is data** it reads — swapping the list does not rebuild the form. |
| **The order stages** — six or seven | Stage 2 of the owner's own ordering; see above. |

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
