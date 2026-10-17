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
| 6 | **A provider's 360° profile — same context as a customer and a dealer** | requested 2026-10-17, see below |
| 7 | **The provider panel: one panel, per-type completion fields** | requested 2026-10-17, see below |

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
- [x] **Contact disclosure with an audit trail**, as A18 logs every ID reveal.
      The provider panel printed **both phone numbers in full on page load** — the
      customer's and the vehicle keeper's — with no line recording who looked. A
      provider is a third identity: an outside inspection centre on its own
      login, seeing two people's numbers before it has dealt with either. The
      numbers no longer enter the page object at all (only the last four digits),
      a click reveals one, and the reveal writes an `AuditLog` row — actor, which
      party, when, IP. **No reason is asked**: the identity reveal demands one
      because it is an exception; a phone number is the provider's working tool,
      and demanding a sentence each time is hostile to someone doing their job.
      The click is the intent and the log is the accounting. **And the number is
      never copied into the log** — a log that carries it is the leak.
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
- [x] **A ledger line could not be traced to its service.** *(Closed the same day
      it was logged — see «Every ledger line opens on what it concerns» below.)*
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
- [x] **The buyer journey walked by clicking, end to end.** Browse → car → buy →
      tax dialog → order → pay → confirm receipt → escrow released. Every step
      worked: `/api/v1/orders` answered 428 and opened the tax dialog, saving it
      retried the purchase automatically, the payment card took a sandbox card,
      and confirming receipt released 83,350 to the seller. `ORD-2026-1013` is
      the resulting order and is kept as demo data.
- [x] **«تعذّر إصدار الفاتورة» read as a failure on a sale that succeeded.** The
      vehicle tax rules for individual sellers are deliberately inactive —
      «AWAITING RULING», pending the deemed-supplier classification — so **every**
      completed sale writes `invoice.blocked`. The buyer's timeline showed the
      bare phrase with no reason and no remedy, right under a transfer that had
      gone through. The reason travels with the event now and the line reads
      «الفاتورة مؤجَّلة — قاعدة الضريبة لهذه الصفقة تنتظر الإقرار». *An expected
      state is not an error; turning one into an error tells the reader they did
      something wrong when they did not.*
- [x] **A test judged the whole table instead of its own row.** `blocked-invoices`
      asserted `blockedInvoices()` was completely empty — and since every
      completed sale legitimately blocks an invoice, **the first real purchase
      broke it**. It now asserts its own order left the list. (The failure was the
      test's, not the code's.)
- [x] **The market band claimed a city that was not in the number.** `priceStatFor`
      widens its search — trim+city, then city, then trim, then the general row —
      and every seeded row is `city: '*'`, `trimId: '*'`. The screens built the
      caption from the **vehicle** instead of the matched row, so a Yukon in
      Jeddah read «مبنيّ على ١٧ صفقة · يوكن ٢٠٢٢ · جدة» with no Jeddah anywhere in
      those 17. A buyer lowers an offer on that. The statistic now carries
      `scopedToCity` / `scopedToTrim` and the caption says only what the number
      covers. *(Same shape as the badge computed from the exact figure instead of
      the displayed one.)*
- [ ] **`PriceStat` has no writer outside the seed, by design — and nothing says
      so.** The seed's own comment is explicit: the real market median comes from
      a **data provider**, not from our own asking prices, because deriving it
      from our listings is circular — one listing per model-year makes the median
      equal that listing. So the table is a fixture awaiting an integration that
      does not exist: 49 rows, 31 of 73 models, all computed on one day, every
      one `city: '*'`. Two consequences the owner should weigh: 42 models show no
      market band at all, and the figures never move as the market does. The
      vendor choice is theirs; what is ours is that nothing anywhere records the
      dependency — now it does.
- [ ] **The sell page promises a suggested price the wizard does not give.** The
      hero reads «ونقترح عليك سعرًا مبنيًا على صفقات حقيقية لمثل سيارتك», and the
      wizard shows `PriceGuidance` only **after** a price is typed — it positions
      your number, it does not propose one. For a Camry, with no `PriceStat` row
      at all, nothing appears either way. Either the hero promises less or the
      wizard proposes a figure; that is a product decision.
- [x] **A centred modal could not be scrolled, so its own button was out of
      reach.** `Modal` had no `max-height` and its body no scroll, while `Sheet`
      beside it had both from the day it was built. Measured on a 377×522 phone:
      the bid dialog is **678px tall**, centres to top −78 / bottom 600, and
      «أرسل المزايدة» sits at 538 — below a screen that ends at 522, with nothing
      to scroll. And it grows to that height exactly when the deposit card picker
      appears, which is **every bidder's first bid**. The panel is now
      `max-h-full` and the body `min-h-0 flex-1 overflow-y-auto`, so the header
      and footer stay pinned and the content scrolls. Every centred dialog in the
      product was affected.
- [x] **Quick-bid chips showed ungrouped numbers.** «أقلّ مزايدة مقبولة ٦٩٬٦٢٥»
      above three chips reading «69625 70125 71125» — two formats for one kind of
      number in one dialog, at the moment it is read fastest. `displayDigits`
      converts digits but does not group; `<ArabicNumber>` does both.
- [x] **The auction journey walked by clicking.** Opened a live auction, bid
      70,125, the server asked for the deposit (402), the dialog revealed the card
      picker, the sandbox hold went through and the bid was created (201). The
      page updated in place: «٧ مزايدين · ١٠ مزايدات · بلغ السعر الاحتياطي ·
      مزايدتك هي الأعلى».
- [x] **The offer dialog promised a reject the seller cannot do.** «يقدر البائع
      يقبل **أو يرفض** أو يعرض مبلغ مقابل» — and the seller's inbox offers exactly
      two buttons, «اقبل» and «قابِل». Measured in the domain: `createOffer`,
      `counterOffer`, `withdrawOffer` (the buyer's), `acceptOffer`,
      `expireOffers` — **no seller-initiated decline exists**, and
      `OfferStatus.REJECTED` is written only automatically (below the hidden
      floor, or losing to an accepted offer). The text now says what the product
      does; whether to add the button is the owner's call, recorded in
      `docs/OPEN-QUESTIONS.md` with the argument for adding it.
- [x] **The negotiation journey walked by clicking, both sides.** Buyer offers
      26,500 → seller's inbox shows it → seller counters 27,250 → **buyer can
      accept the counter** (the defect recorded earlier is gone) → `ORD-2026-1014`
      is created at 27,600 with the transfer fee, source «عرض».
- [x] **The sell wizard walked to publish.** Nissan X-Trail S 2022, 88,000 km,
      Riyadh — a photo attached, the plate blurred client-side and the duplicate
      check ran («تمّ الفحص الآلي · لوحات مطموسة ١ · ولا صور مكرّرة»), price 72,500,
      direct sale. `POST /api/v1/listings/images` 200, `POST /api/v1/listings` 201,
      and the account page greeted it: «نُشر إعلانك — صار ظاهرًا في نتائج البحث»
      with `ADS2026A0061`. The `?listed=` parameter that once went unread is read.
- [x] **The wallet card held money it does not hold.** «رصيد المحفظة **٠** ريال»
      with «منها **٥٬٠٠٠** محجوزة كعربون مزاد» beneath it — five thousand out of
      zero. And the money is not ours to hold: `holdDeposit` requires a card and
      goes through the gateway on every path, so the deposit sits on the bidder's
      card. The field's own comment still said «وهو اليوم دفتريّ… لا تمرّ ببوابة»,
      written before the hold was wired — so whoever read it believed it. Renamed
      `depositsOnCard`, and the line now reads «وعلى بطاقتك ٥٬٠٠٠ محجوزة كعربون
      مزاد».
- [x] **The «متعثّرة» tab counted nine and opened eight.** The row is marked
      critical with `isLiveOrder(status) && isStalled(…)` and the counter counted
      `DISPUTED` and `STALLED` as well — so a disputed order was counted here and
      shown in its own tab, and the operator opened the queue looking for a row
      that was not there. One predicate in both places now. *(It passed until
      today only because no seeded order had crossed the threshold; the first
      purchase walked by hand exposed it.)*
- [x] **Two invariants were judging their neighbours' data.** `seed-reachable-
      states` asserted every order at `PAYMENT` or beyond has an escrow — but an
      order is **created in** `PAYMENT`, before any money moves, so every new
      purchase breaks it. The condition is on the money now (`payments: some`),
      not on the stage. Third instance of this shape today.
- [x] **The production build is clear.** `npm run build:check` after
      `rm -rf .next-check`: compiled in 19.9s, 101 static pages, exit 0.
- [x] **A seller could not delete anything.** They could pause and edit; there was
      no delete at all. So a draft started and abandoned sits in «إعلاناتي» and in
      the «تنتظرك» counter forever, telling its owner every time that something is
      waiting for them that they do not want. And a listing **under review had no
      control whatsoever** — no edit, no pause, no withdrawal: it could only be
      waited out. `DELETE /api/v1/listings/{ref}` now removes a `DRAFT` or
      `PENDING_REVIEW` listing that carries **no** offer, order, auction or service
      request; anything published is paused instead, because whoever saw it or
      negotiated on it keeps a record. Its images cascade with it — an orphan
      fingerprint raises a false duplicate alarm on another seller months later.
      The confirmation says what goes and what stays: **the vehicle remains in
      «سياراتي»**, so the seller does not think they are erasing their car.
- [x] **A fraudulent account could not be stopped.** Sign-in refuses `SUSPENDED`
      and `BANNED` from day one, `users.suspend` is defined and granted, and
      `/admin/users` shows «موقوفون» and «محظورون» segments — and **nothing in the
      product wrote `User.status`**. Both counters read zero forever and both
      queues were empty forever. Thirteenth instance of a schema value with no
      writer, and the most consequential. Built with the reason required, an
      `AuditLog` row, a critical notification to the account's owner (templates
      shipped by migration), and a ban refused while an order is live or escrow is
      held — suspension is the investigation tool. `docs/workflows/account-status.md`.
- [x] **And the block bit only the next sign-in.** `currentUser` — the entry point
      of every writing route — read the row without looking at its status, and a
      session token lives thirty days: an account blocked today kept buying,
      selling and bidding **for a month**. It now refuses any non-`ACTIVE` user,
      while pages still render so the person can read why.
- [x] **The customer page printed raw enum keys.** `SUSPENDED` and `PENDING` as
      badges above someone's name, while the identity queue on the next screen
      calls the same values «ينتظر» and «موثّق». One label map now, read by both.
- [x] **An account could never be closed.** No screen, no route, no domain
      function — whoever registered stayed registered. **Owner's decision
      (16 Oct): anonymise, keep the invoices and contracts.** What makes that
      possible was measured before building: `TaxInvoice` and
      `VehicleSaleAgreement` both snapshot the parties' names at issue, so
      erasing the person does not hollow out the documents. Personal fields are
      cleared, the phone becomes a reserved non-E.164 value (the column is unique
      and not nullable), `CLOSED` is its own status beside `BANNED` — theirs
      versus ours — and nothing closes over a live order, held escrow, live
      auction, held deposit, payout in flight or a wallet balance, each said
      **before** the button is pressed. `docs/workflows/account-closure.md`,
      decision 11 in `docs/DESIGN-DECISIONS.md`.
- [x] **Six notification switches nobody could reach.** `PushChannel`,
      `NotificationPreference`, `setPreference` and `isChannelEnabled` were all
      written for A10 — and **no screen set a preference, and nothing led from a
      sent template to the topic its owner could mute**: the template carried
      transport flags (email/SMS/push/in-app) and no link to a topic. Not one
      preference row had ever been written. `NotificationTemplate.pushChannelKey`
      is that link; `notify` consults it; the panel sits above the notification
      list, with the critical channels shown **locked, not hidden**.
- [x] **And the gate that should have caught it was reading comments.** A comment
      in `/admin/push` mentions `setPreference` by name, so the "domain writer
      with no door" check counted it as a caller. It strips comments now — the
      second gate in this repository fooled by prose, and the measurement after
      the fix found exactly this one.
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

## 7 · The provider panel — one panel, fields per type — *requested 2026-10-17*

> «يجب ان تكون لوحة مستقله للمزود و كما تناقشنا موحده لجميع المزودين بطريقه
> ذكيه و تشمل المزودين من نوع فاحصين حيث هناك حقول للتعامل مع الفحص و اذا كان
> المزود نقل ملكيه هناك حقول تناسبه لتنفيذ الطلب و هكذا لباقي المزودين»

The panel itself exists (`/provider`, one shell for every type, steps driven by
`STEPS_BY_TYPE`). What the owner is asking for is the part that was marked and
never built:

- [x] **A door to a provider login.** It was three locks, not one: no way to
      create the account, no way for the provider to change the temp password
      they are told to change at every sign-in, and no way to suspend or reset
      one. All three are built; the temp password is generated, shown once, and
      never written to the audit log.
- [ ] **A completion form per provider type.** `form: 'INSPECTION'` is declared
      in `STEPS_BY_TYPE` and **nothing renders it**; the other six types finish
      with no fields at all — a shipping provider marks "done" and we never
      learn the tracking number, an insurer leaves no policy number.
- [ ] **A `TRANSFER` provider type** (نقل الملكية) with the fields that
      completing a transfer needs. The enum has no such value today, and
      `provider-queue.ts` carries the note «ونقلُ الملكية سيُضاف هنا سطرًا لا
      شاشة».
- [ ] The inspection field list itself is **still owner-blocked** — recorded
      long before this: «وحقولُه يزوّدنا بها المالك».

**The shape, so it stays one panel and not seven:** the difference between
types is *data*, not screens — a field schema per type, rendered by one form
and validated in the domain. A second screen per type is how one panel becomes
seven that drift.

---

## 6 · A provider's 360° profile — *requested 2026-10-17*

> «أليس من المفترض ان يكون لهم صفحة خاصه مثل ما للعملاء و التجار صفحه ..
> بحيث يمكننا مشاهدة تفاصيلهم و الطلبات التي تمت لصالحهم و المنفذة منها و
> غير المنفذة و كذلك رصيد حسابهم لدينا .. يعني كأفضل تجربة اعتقد ان وجود
> صفحه لهم بنفس سياق العملاء و التجار يجعلنا نديرهم بشكل افضل و ناخذ نظرة
> شمولية حولهم ٣٦٠ درجة بشكل افضل كذلك يكون لهم كشف حساب و امكانية اضافة
> ديبت او كريدت لحسابهم»

A provider is a third party we owe money to and take commission from, so it
needs what a customer and a dealer already have: **one page that answers every
question about them**, a statement of account, and a manual entry when one is
needed.

What the owner asked for, item by item:

- [x] Their details — in the same shape as the customer and dealer profiles.
- [x] **Every request carried out for them**, split into done and not done.
- [x] **Their balance with us.**
- [x] **A statement of account** (كشف حساب).
- [x] **Posting a debit or a credit** to that account by hand — second approver
      required, as for a customer's wallet.
- [ ] **How the money actually reaches them** — nothing debits `PROVIDER_PAYABLE`
      yet, so the balance is everything ever earned, not what is still owed. The
      manual entry covers it until the answer arrives; see `docs/OPEN-QUESTIONS.md`.

And the standing instruction that came with it:

> «ابغى المنصة تكون ١٠٠٪ متكامله ولا ينقصها البديهيات»

— the basics are not to be waited for. Where a party exists, the page that
manages it exists too, with the same depth as its siblings.

**Blocking question already open against this:** today the ledger says a
provider's money is *not* held by us (`recordServiceCaptured` moves it to
`ESCROW_AT_PROVIDER`; the screen reads «رصيدُه ليس عندنا — المال يذهب إليه من
البوّابة مباشرةً»). A balance and a statement mean we do keep an account for
them. See `docs/OPEN-QUESTIONS.md`.

---

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
| English UI strings | `docs/BACKLOG.md` § D | deferred by the owner — **655 lines / 68 files**, re-measured 2026-10-17. The data fix shipped (twice) and the percent sign is fixed; **error messages still read `messageAr` in 19 of 20 places** although `messageEn` is already in hand — listed there, open. `/en` is in the sitemap, so what stays Arabic is advertised. |
| `home_story` ad slot has no design | `docs/DESIGN-DECISIONS.md` | question pending |
| Full car catalogue (A12 CSV import) | `docs/BUILD-WEB-ADMIN.md` §A12 | **32 of 42 brands have no models.** The sell wizard now offers only the 10 completable ones, with a “tell us” link; importing the catalogue restores the rest with no code change. |
| Six plan entitlements still have no reader | `docs/NOTES.md` | `featured_slots` · `bulk_upload` · `team_seats` · `priority_support` have no feature behind them; `deposit_required` and `commission_pct` are governed elsewhere today. Listed, not forgotten. |
| Notification templates still silent | `docs/BACKLOG.md` § G | 7 remain, all declared with a reason, guarded by gate 45 |
| Production build barrier | `CLAUDE.md` | **Clear.** Measured 2026-10-16 after `rm -rf .next-check`: compiled in 19.9s, 101 static pages, exit 0, working tree restored. The cause was `NODE_ENV=development` during `next build`; still run `npm run build:check` before any release, because `verify` does not build. |

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
