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
| 8 | **Vehicle inspection: the inspector enters it, the admin publishes it** | spec 2026-10-17, **plan approved**, building |

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
- [x] **The inspection form** behind `complete`. Built 2026-10-17 — and the
      hole was wider: `form` was declared and **never enforced**, so an
      inspector could close an inspection with no report while revenue was
      recognised and the money captured. `docs/workflows/provider-panel.md`.
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
- [x] **A vehicle order never writes `PLATFORM_CASH`.** Answered 2026-10-17:
      money captured but not yet in the bank **is ours**. `order.captured` now
      writes the treasury move beside revenue recognition, and two existing
      entries moved with it — `payout.sent` was paying sellers out of
      uncaptured money, and `refund.after_earning` was refunding captured money
      from a finished hold. `docs/LEDGER.md` § 5.2a.

      *(original note)* **A vehicle order never writes `PLATFORM_CASH`.** `service.captured` and
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
- [x] **Commission.** Confirmed by the owner 2026-10-17: «نسبة العمولة يتم
      ضبطها من اعدادات الادمن حيث يمكن تغييرها متى اردنا ذلك و ليست مزروعه
      داخل الكود». Walked it by clicking: setting a rate in `/admin/plans`
      writes a **new dated rule** and leaves the old one, so orders already
      placed keep the rate they were quoted.

      **And setting a real rate exposed three money bugs that zero had hidden**
      — zero of any base, from any side, under any rule, is zero:
      the car page carried a **third copy** of the commission formula; it
      computed on `askPrice` while displaying the **live bid** (so an auction
      quoted 2.8% when 2.5% was set); and it picked the rule with `findFirst`
      with no `side` and no `enabled` filter, **quoting the buyer the seller's
      commission** — a total higher than they would ever be charged. A test in
      `tests/offers.test.ts` was pinning the same double-charge relation and
      passing green because `0 == 0`.
      Development now seeds a working 2.5% (production still seeds zero —
      nobody should invoice a number the owner has not set): **what is not
      seeded is not seen.**
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
- [x] **The report builder.** Built 2026-10-17: `approveInspection` creates the
      `InspectionReport` on admin approval, and `publishOnIssue` decides whether
      it is public. Before that nothing but the seed could produce one.
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

## 8 · Vehicle inspection — entry, review, publish — *spec received 2026-10-17*

The owner pasted a full specification (Syarah/Carly-style): the inspection is
entered from the **service provider dashboard** by a provider of type Inspector
(فاحص), reviewed and published by the admin, and shown on the public car page
as an "Inspection Report" tab beside "Car Information".

**Its step 0 says: explore, present a plan, and wait for approval before
writing code.** That was followed; the plan was approved on 2026-10-17 with
three answers, recorded in `docs/DESIGN-DECISIONS.md` §13:

- **Freeze the report as a snapshot** on submit (rows to edit, snapshot to keep).
- **Use the existing `ServiceRequest`** — no second queue.
- **Notifications deferred** — providers have no notification channel at all yet.

### Order of work

1. [x] Template tables + seed from the existing 210 points — `851f8ac`
2. [x] Inspector-only access control + draft creation — `9df6937`
3. [x] The entry form in the provider panel — `9df6937`
4. [x] Scoring service with its tests — `a43fc39`
5. [x] Admin review: return / approve / publish — `a43fc39`
6. [x] Template management in the admin panel — `60cfa53`
7. [x] Public summary block — `edf4308`
8. [x] Interactive body map in the form — `6d3fd91`
9. [x] Per-item photos — `6825e5b`

**Also measured, already complete before this work:** the «مفحوصة» badge on
listing cards and the `inspected` / `scoreMin` / `paintStatus` filters — type,
URL parsing, `where` clause and chip were all wired. Verified by measurement,
not by reading: the domain returns exactly 3 for `inspected=true` and the page
renders exactly 3 cards.

**Left, and deliberately so:**

- [x] **PDF of the report** — ~~optional in the spec; «اطبع» works today~~ built
      2026-10-18 on the owner's instruction: `…/inspection/pdf`, its own A4
      layout with the vehicle card and a QR to the listing on `carz.sa`. See
      § 12 and `docs/api/inspection.md`.
- [ ] **Notifications** — deferred by the owner, and providers have no
      notification channel at all yet (`Notification.userId` is a market
      account; a provider is a third identity).
- [ ] **Photo required on «ملاحظة» too** — the spec asks for it, I implemented
      it for «عطل» only and asked why in `docs/OPEN-QUESTIONS.md`.

### What already exists (measured 2026-10-17, before planning)

| Piece | State |
|---|---|
| `ProviderType.INSPECTION` (فاحص) | exists |
| `InspectionReport` — ref, score, `sections` Json (210 points), `paintMap` Json, inspector, `pdfUrl`, `publishedAt` | exists |
| Owner decision 4 on who sees a report, and that publishing is one-way | recorded and enforced (gate 44) |
| Domain: grade, parse, VIN masking, validity, `toPublicReport`, `publishOnIssue` | exists |
| Public display: car-page `inspection` tab, `InspectionScreen`, `PaintMap`, `ScoreRing` | exists |
| 210 points across 6 categories | exists, as **seed JSON** |
| Request → provider assignment, SLA, accept/start/complete steps | exists |
| Buyer's «تقاريري» screen | exists |

### What is missing — and the first one is the whole point

1. **Nothing can produce a report.** `inspectionReport.create` appears **only
   in `prisma/seed.ts`**. The two visible reports are seeded; no inspector can
   file one. The display has been built on top of data the product cannot make.
2. **No entry form.** `form: 'INSPECTION'` is declared in `STEPS_BY_TYPE` and
   nothing renders it.
3. **The checklist is a seed file, not editable data** — adding a point needs a
   deploy.
4. **No draft → submitted → returned → approved → published workflow**; only
   `publishedAt`.
5. **No admin review screen** for inspections.
6. **No scoring service** — the seed averages section scores by hand.
7. **No photo upload in the provider tree**, and no per-item photos.
8. **No notification reaches a provider at all** (a known, recorded gap).
9. **`pdfUrl` has no writer.**
10. Optional in the spec: an "Inspected" badge and filter on listing cards.

---

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
- [x] **A completion form per provider type.** Built 2026-10-17 — one form, a
      field schema per type (`completion-schema.ts`), validated by a pure
      function the screen and the server both call. And the hole was wider than
      the note: `form` was **declared and never enforced**, so an inspector
      could close an inspection with no report at all — recognising revenue,
      issuing a tax invoice and capturing the money for work that did not
      exist. `applyStep` now refuses `FORM_INCOMPLETE`. `docs/workflows/provider-panel.md`.
- [x] **A `TRANSFER` provider type** (نقل الملكية). And measuring it found
      worse: `ownership_transfer` **already existed as a 350-riyal service on
      the home page** with `providerType: null`, so `cityPool` returned nothing
      and every request was refused `CITY_NOT_COVERED`. A service advertised
      and never buyable. Migration `20261017160100` points it at `TRANSFER`
      (reference data reaches a live database by migration, not by seed), and
      the seed gives the type a provider — a type with no provider refuses
      identically.
- [x] **The inspection field list is not blocked and never was, after the spec
      the owner pasted.** The template holds **210 points in six categories**,
      and every one is added, removed, renamed or flagged critical from
      `/admin/inspection-template` — each change bumps the version, and issued
      reports keep their own snapshot. What actually needs the owner is
      **category weights** (all `1` today, so a ruined chassis and worn tyres
      both score 83) — asked in `docs/OPEN-QUESTIONS.md`, and answerable with
      six clicks rather than a code change.
- [x] **The field lists for the other seven types.** Asked, and the owner
      delegated: «افعل ما تراه احترافي و يناسب السوق السعودي». So they were
      rebuilt for this market rather than kept generic — a finance decision is
      **الدفعة الأولى والقسط الشهري ونوع العقد (مرابحة/إجارة)**, not an amount
      and a term; a transfer carries its channel (أبشر/تم/المرور) and whether
      the plate moved; comprehensive insurance carries its deductible. And
      «موافقة مشروطة» had collected **nothing at all** — the condition itself
      had nowhere to be written, which is the whole of what it means.

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
- [x] **How the money actually reaches them** — «ابدأ بصرف مستحقات المزودين»
      (2026-10-18). `ProviderPayout` with a two-person quorum, mirroring the
      seller flow: `/admin/provider-payouts` is the queue, the provider's own
      page carries the bank account and what was transferred, and
      `provider_payout.sent` debits `PROVIDER_PAYABLE` so the balance now means
      *what is still owed*. `ServiceProvider.iban` was added with it — the
      destination had no field, so the guard would have been a lock with no key.
      The provider reads the same figures at `/provider/earnings`.

And the standing instruction that came with it:

> «ابغى المنصة تكون ١٠٠٪ متكامله ولا ينقصها البديهيات»

— the basics are not to be waited for. Where a party exists, the page that
manages it exists too, with the same depth as its siblings.

**Blocking question already open against this:** today the ledger says a
provider's money is *not* held by us (`recordServiceCaptured` moves it to
`ESCROW_AT_PROVIDER`; the screen reads «رصيدُه ليس عندنا — المال يذهب إليه من
البوّابة مباشرةً»). A balance and a statement mean we do keep an account for
them. See `docs/OPEN-QUESTIONS.md`.

**Answered in practice while the question stands open:** until the provider
gateway's split payments are switched on, the money *is* ours — we capture it
(`service.captured`) and owe them (`PROVIDER_PAYABLE`). So the payout path pays
from `PLATFORM_CASH`, and a provider paid by a future split is never credited
here, so the two cannot double-pay. The statement that reads «رصيدُه ليس عندنا»
is about the **gateway account balance**, which we mirror and do not compute —
a different number from what we owe them, and now labelled as such on the page.

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

## 9 · Viewings — an appointment, not a service — *closed 2026-10-17*

Asked which it was; the owner delegated: «افعل ما تراه احترافي و يناسب
السوق السعودي».

- [x] **It was advertised and unbuyable.** `viewing` was a `Service` row with
      `providerType: null`, so every request was refused `CITY_NOT_COVERED`,
      and the button on the car page — **the most visited screen in the
      product** — said «قريبًا».
- [x] **Built as its own entity**, because no third party performs a viewing:
      no provider, no money, no commission. The `Service` row is retired.
- [x] **A day and a period, not a timestamp** — «بعد العصر», «بعد المغرب».
      Appointments here are set against prayers, and minute precision is a
      claim we cannot keep.
- [x] Both halves: request, accept with a meeting point, decline with a
      reason, cancel from either side, and a scheduler that separates
      «انقضى بلا ردّ» from «تمّت» — the difference measures a seller.
- [x] The privacy promise already printed on the car page is now enforced
      where the data is fetched.
- [x] **A counter-proposal from the seller.** Built the same day — a decline
      alone *ends the conversation*, and a seller who cannot do Saturday but
      can do Sunday had to refuse and hope the buyer asked again. It carries
      the meeting point so it is a whole proposal, the turn moves to the buyer,
      and what they first asked for is kept so the screen can show the
      difference.
- [x] **A reminder before the slot** — both parties, once,
      `viewingReminderHours` (24h, tunable in `/admin/deadlines`) before a
      confirmed slot. The notification row is its own "already sent" record;
      no column was added.

`docs/workflows/viewings.md`.

---

## 10 · Commission and its VAT, both from the panel — *owner's request 2026-10-17*

> «انا ابغى النسبه نكون قادرين على تعطيلها او ضبطها … و نضبط احتساب
> ضريبتها كتعطيل او تفعيل للضريبه و تحديد نسبة الضريبه»

Three separate controls. What was true before, and what is true now:

| Control | Before | Now |
| --- | --- | --- |
| Commission on/off, rate, fixed, min, max | **built and working** (walked by clicking) | unchanged |
| VAT on the commission: on/off and rate | screen existed in `/admin/tax`, **did not reach the money** | wired |
| VAT-inclusive vs added on top | not a setting, and the ledger disagreed with everything else | **still the owner's answer** |

### The screen existed and did nothing to the money

`/admin/tax` edits `TaxRule.ratePct` and `TaxRule.active` for the
`COMMISSION` supply — with audit and dual approval. But
`computeOrderAmounts` read `PlatformSetting.vatPct`, **a different field
that screen never touches**. Measured: the rule was set to 0% and the order
still charged 326.09 on a 100,000 sale.

So the owner's requested capability was half-built in the worst way — a
control that looks authoritative and is inert. `supplyVatPct()` in `tax.ts`
is now the single source: the active platform-wide rule for the supply,
falling back to `vatPct` only when the rule carries no rate. **A disabled
rule yields zero, not the default** — falling back there would make the
off switch do nothing, which is the whole point of having it.

Measured after wiring, on a 100,000 sale:

| Rule | VAT charged |
| --- | --- |
| active, 15% | 326.09 |
| **disabled** | **0** |
| active, 5% | 119.05 |

### What is still the owner's

Whether the rate he sets is **what the seller pays** (we keep ~87% of it)
or **what we keep** (set it higher to cover the VAT). Recorded in
`docs/OPEN-QUESTIONS.md` with the numbers; it is a one-line change either
way and no code moves if the answer is "inclusive", which is what
`tax-model.md` already says and what is implemented.

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

## 11 · The report's points, grouped and marked — *owner's request 2026-10-18*

> «يجب ان تكون الحقول الفرعيه مرتبه و فرعيه تحت البنود الاساسيه (توقل) و ان
> حصل نضيف ايقونات و ايضاً علامة صح للسليم و علامة تعجب للي فيه ملاحظه او غير
> سليم و علامة مناسبه للي لم يتم فحصه» — and «خلك مبدع و احترافي».

Asked after reading the published report of a seeded car. What is there today:
a flat table of 210 rows, defaulting to the 4 findings with a button that
expands all 210 at once — correct information, wrong shape. A buyer asking "how
are the brakes?" has to scan a list that does not say where one section ends.

- [x] **Points nest under their section, each section a toggle.** Sections
      carrying a finding open by default; sound sections stay closed with their
      count on the header, so the four findings are still the first thing read.
- [x] **A mark per state, not a word alone** — a check for sound, an exclamation
      for a note or a fault, and its own mark for a point that was not examined.
      Colour is never the only carrier: the icon's shape differs too, and each
      row keeps its text label.
- [x] **`NOT_INSPECTED` exists at last.** The freeze used to map *anything not
      answered* to «سليم» — publishing a point nobody looked at as sound. It is
      unreachable today (submission is blocked until all 210 are answered) but
      it is a landmine: the first optional point, or a catalogue row added after
      a draft was opened, publishes silence as a promise.

Still with the owner, and it does not block the above:

| What | Why it matters |
| --- | --- |
| **`PAINT` («صبغ») has no writer** | Measured: only the seed writes it. The inspector's form offers سليم · ملاحظة · عطل, and the freeze emits OK · NOTE · FAIL. So no real report can ever show «صبغ» — the paint story belongs to the body diagram, which exists and works. Proposal: drop it from the point states. |
| **Naming** | «عطل» is sharper than the common case (a strut beginning to seep). The owner's own words suggest «يحتاج صيانة أو استبدال». A rename touches frozen reports, so it needs the owner's word first. |
| **Scoring a non-inspected point** | Excluded from the section score, or counted against it? Nothing can produce one yet, so the question is not urgent — but it is a money-adjacent rule once it can. |

## 12 · The report, continued — *owner's requests 2026-10-18*

Five, given after reading the rebuilt report:

> «لا تحذفها و ابقها في البند (الهيكل و الصبغ) واستبدل اسم البند (الهيكل
> الخارجي) .. ايضاً البنود الاساسيه و الحقول الفرعيه لكامل الفحص يمكن اعداد
> البنود و تعديلها و اضافتها و حذفها من الأدمن … طبعاً الملاحظات الاضافيه يمكن
> اضافتها على الحاله من نوع (عليه ملاحظات) … ايضاً اسم الفاحص بدل الاسم الصريح
> ضع رقم الآي دي للفاحص لمزيد من خصوصية الفاحص … بالنسبه لتحميل تقرير الفحص يجب
> ان يكون البي دي اف مصمم بعنايه … كأنه تقرير بي دي اف مصمم … يحتوي على مستطيل
> في مقدمه الصفحة ككرت معلومات السيارة و بجانبه QR كود يقود لرابط السياره في
> المنصه على الدومين carz.sa»

- [x] **`PAINT` stays, and gets the writer it never had.** The owner answered the
      open question: keep «صبغ», inside the body section. So it becomes a state
      the inspector can actually choose — today only the seed writes it, which
      is why no real report could ever show it.
- [x] **That section is renamed «الهيكل الخارجي».** Category names are rows now,
      so this is a migration, not a seed edit — reference data reaches a live
      database by migration or it reaches only new environments.
- [x] **Categories can be added and removed from the panel.** `updateCategory`,
      `updateItem`, `addItem` and `removeItem` exist; **`addCategory` and
      `removeCategory` do not** — so the operator can rename a section and edit
      its points but cannot create a section or retire one.
- [x] **The inspector is identified by a code, not a name.** Privacy: the person
      who inspected a stranger's car should not be named on a public page.
- [x] **The PDF is a designed report, not a printout of the page.** Today the
      button calls `window.print()` — `pdfUrl` has never had a writer. It needs
      its own A4 layout: a vehicle card across the head of the first page with a
      QR beside it pointing at the listing on `carz.sa`.

**And `carz.sa` is the production domain** — recorded here because `APP_URL`
and the sitemap, canonical links and QR payloads all read from it.

## 13 · Trust marks in the footer, and a PDPL page — *owner's request 2026-10-18*

> «في فوتر المنصه لتعزيز الموثوقيه اعتقد يجب ان نضيف الشعارات التاليه ولكن بذكاء
> و احترافيه تضاهي المنصات السعوديه و العالميه و ايضاً ضع صفحة في المنصه بخصوص
> حماية البيانات PDPL بحيث يكون محتواها افضل من المحتوى في الرابط التالي كمثال
> … https://waki.sa/ar/pdpl» — plus the payment marks (Visa · Mastercard ·
> Apple Pay · mada · stc pay).

- [x] **Regulatory marks**: Digital Government Authority · Saudi Business Center
      · National Data Governance Platform · VAT.
- [ ] **Payment marks**: the methods the platform actually accepts. *Blocked: the logo file has not reached the repository.*
- [x] **`/pdpl`** — a data-protection page that beats the reference.

**A badge is a claim, not decoration.** A VAT mark says "this platform is
registered for VAT"; a Saudi Business Center mark says "this commercial
registration exists". Saudi platforms that do this well print the **number**
beneath the mark and link it to the official verification — which is what makes
the badge worth anything. So the marks are rows, not markup: each carries its
registration number and verify URL, both set from the panel, and a mark whose
number is missing is still shown but unverified until the owner fills it.

**And legal documents have no editor.** `/admin/legal` lists them and nothing
updates them — no route, no screen. So the PDPL text ships in the repository
(`src/content/pdpl.ts`) rather than as a `LegalDocument`: putting it in the
database would not make it editable and would add the problem of reaching a
running environment, since the seed runs once on an empty one. **Writing an
editor for legal documents is its own task**, and when it exists this page's
text moves into it.

That also means **the owner must confirm each one the platform actually holds**
and switch off any it does not. A mark the platform has not earned is the
clearest possible case of «النصّ المعروض وعدٌ لا وصف», with a regulator on the
other end of it.

### And the door for that was missing — opened 2026-10-19

The paragraph above said the number and verify URL are «both set from the
panel». **They were not, and could not be**: `TrustMark` had no writer anywhere
— no screen, no route, no domain function — so the footer shipped four
regulatory marks with **not one registration number**, and the owner was told
to confirm what he holds with no way to do it. A condition imposed with no door,
and a comment promising a capability that did not exist.

- [x] `/admin/trust-marks` — each mark with its logo as the visitor sees it,
      its registration number, its official verification page, and a switch for
      whether it appears at all. Every change writes an `AuditLog`.
- [x] The verify URL is checked: `https` only, because a string that is not a
      URL prints into an `href` and leads nowhere, and `http` on a secure page
      makes the browser warn about the very link meant to prove trust.
- [x] An empty number is a **withdrawal**, not a blank: whoever clears it meant
      to. The panel badges a mark «موثقة» only once it has one, and «بلا رقم»
      until then — the same distinction the footer draws.
- [ ] **Still the owner's:** fill the four numbers, confirm each verification
      link, and switch off any mark the platform does not actually hold.

## 14 · The licence plate, drawn — *owner's request 2026-10-18*

> «دعنا نضيف تصميم لوحة السياره داخل صفحة تفاصيل السيارة ان اختار البائع عرض
> اظهار عرض اللوحة مع اعلان السيارة .. كذلك عرض في لوحة الادمن … ايضاً عرض في
> نموذج ادخال السياره … ايضاً عرضها في تقرير الفحص ضمن معلومات السيارة و طبعاً
> ظهورها في تقرير الفحص ضروري لجعل التقرير متكامل»

The spec is the owner's own, from another project of his:
`/Users/aa/plate-auction-live-stream/docs/plate-rendering.md` — an SVG plate
drawn to match the real thing: geometry per plate type, the seventeen approved
letters with their unofficial Latin counterparts, ink-height sizing from Arial
metrics rather than font size, and the engraved/embossed two-layer treatment.

Today the platform stores `Vehicle.plateLetters` and `Vehicle.plateNumbers` and
**draws nothing** — the plate appears only as text, and only in the admin.

- [x] A plate component in `src/components/ui/`, built to that spec.
- [x] The car detail page — **only when the seller chose to show it**.
- [x] The admin vehicle page.
- [x] The entry form — the sell wizard, with a live preview. **The columns had
      no writer at all**: `Vehicle.plateLetters` has existed since the schema was
      built and only the seed ever wrote it, so every vehicle a real seller
      published had no plate and its inspection report lacked what identifies it.
      The route accepts the plate now, and the screen that uses it is § 16.
- [x] The inspection report, inside the vehicle block.

**And showing a plate is a disclosure.** The platform already blurs plates in
photos (`ListingImage.plateBlurred`), so printing the same plate in text beside
the blurred photo would undo that deliberately. It therefore needs the seller's
explicit choice (`Listing.showPlate`, off by default) — except in the inspection
report, which the owner has ruled belongs there for completeness.

## 16 · Add a vehicle from the account — *owner's request 2026-10-18* — **done**

> «نعم ابنِ شاشة إضافة مركبة في الحساب»

`POST /api/v1/vehicles` has existed since the garage was built, and **nothing
called it** except a secondary button inside the sell wizard. The «أضف سيارة»
button on `/account/vehicles` pointed at `/sell` — a page headed «بِع سيارتك»
that asks for photos, a price and a sale method. Those are the conditions of
*offering*, not of *owning*: a man who registers a car to order an inspection
on it is not selling anything.

- [x] `/[locale]/account/vehicles/new` — the screen, with the plate field and
      its live preview.
- [x] The «أضف سيارة» button repointed at it.
- [x] `?saved=1` read on the list, so a successful save says so. It was being
      sent and nobody read it — the same silence `?listed=` once had.

### Three defects the work uncovered

- **Publishing dropped the plate.** The wizard built its vehicle payload by
  hand in three calls — publish, draft, garage — and the plate reached two of
  them. A seller who filled the plate and ticked «أظهِر اللوحة مع الإعلان» got
  a listing with neither, and no word. The same shape had already cost the
  colour and the condition (a 422 the screen could never avoid), so the payload
  is built once now in `vehiclePayload`, and **gate 60** checks both ends: every
  field the form shows is sent, and every field the route requires is sent.

- **Nobody could publish the first listing.** The sell wizard sourced its city
  dropdown from `groupBy` over *published* listings. On a fresh database that
  list is empty, the city is required for «التالي», and listings are what would
  fill it — a lock with no key. Cities now come from `CITY_NAMES`, the one list
  the account, auth and profile screens already read.

- **«اعرضها للبيع» duplicated the vehicle — closed 2026-10-18.** A garage car's
  sell button went to the empty wizard, and `createListing` always created a new
  `Vehicle` row, so listing a car you had already registered wrote a second copy
  of it: the inspection on one, the listing on the other, and «سياراتي» counting
  two. `PublishInput` now takes an optional `vehicleId`; the button carries it,
  the wizard shows the car's identity read-only and lets the seller correct only
  what changes (mileage, colour, city, plate), and the domain reads the identity
  **from the row, not from the request body** — a direct call with another
  brand's ids cannot repoint the car. The draft path goes through the same
  resolver: it used to return before it, so «احفظ كمسودة» wrote the second copy
  silently, with nothing on any screen to show for it.

  Guarded by `tests/list-from-garage.test.ts` — five cases, each proved by
  reverting the defect it covers. And the plate field now normalises what it is
  given: seeded plates are stored as «س ع د» with spaces, so splitting them
  character by character put a space in the middle slot and dropped the third
  letter — a plate missing its middle letter in front of a seller who had
  touched nothing.

## 17 · The vehicle form, redesigned — *owner's request 2026-10-18* — **done**

> «بينما انت تعمل على اللوحه في النموذج صحح ظهورها من خلال زر تفعيل خيارات
> إظهار رقم اللوحة ضمن الإعلان + اعد تنسيق الخيارات و الحقول للنموذج بشكل
> احترافي و جذاب و ذكي و يفضل اضافة انيميشن و جعل النموذج تفاعلي»

The form that `VehicleFields` renders — used by the sell wizard's first step and
by «أضف سيارة» in the account — is a flat two-column grid of eleven inputs with
a bare checkbox at the end. Three things to fix:

- [x] **A toggle, not a checkbox**, for «أظهر اللوحة مع الإعلان». A `Toggle`
      already exists but lives inside `src/components/site/AuctionSettings.tsx`,
      so nothing else can reach it — it belongs in `src/components/ui/`.
- [x] **Sections instead of one grid**: identity · condition · specification ·
      plate, each with its own heading and its own completion state, so the
      seller can see what is left rather than scanning eleven fields.
- [x] **Motion and interactivity**: the repository already has `step-in`,
      `registry-scan` and `rail-fill` with a `prefers-reduced-motion` guard —
      the new motion joins that vocabulary rather than inventing its own, and
      every piece of it says *where you are* or *what just happened*, never
      decorates.

**And one flow, not two** — the owner's second message the same day:

> «الامر طبعاً ينطبق على النموذجين .. اضافة اللوحة و نموذج البيع و يفضل دمج
> النموذجين من خلال صفحة اوليه بخيارين اضافة السيارة في قائمة سيارات المستخدم
> او خيار عرض السيارة للبيع .. طبعاً في خيار اضافة السياره في قائمه سيارات
> المستخدم يكون فيه ملاحظه اسفل الخيار انه يمكنه بعد الاضافة عرضها للبيع او
> طلب خدمات على السياره»

- [x] A **choice step** before the form: list it for sale, or add it to «سياراتي»
      — and under the second, in the owner's own words, a line saying the car
      can be listed later or have a service ordered on it.
- [x] `/account/vehicles/new` folds into that flow rather than keeping a second
      shell of its own.

**And the dropdowns**, third message the same day:

> «الدروب داون ليست يجب ان تكون عصريه و احترافيه. وبالنسبه لدروب داون الماركه
> يجب ان يعرض الماركات بجانبها صوره اللوقو لكل ماركه (يتم عرضها من اللوقو
> المرتبط لكل ماركه مضافه في اعدادات الماركات في لوحة الادمن»

- [x] A listbox of our own, not the browser's `<select>` — which cannot carry an
      image, cannot be styled, and looks like a different product on every OS.
- [x] The brand list shows each brand's logo, read from `Brand.logoUrl`, which
      the admin's brand settings already upload and store.

> **And no brand had a logo.** Measured 2026-10-18: 42 brands, **zero**
> `logoUrl` values — the admin screen could set one and nothing ever had. The
> list reads correctly without one (initials, not a broken image).
>
> **Closed the same day** at the owner's instruction («ارفع شعارات الماركات من
> البذرة»): every brand now carries `/brand-logos/<slug>.svg`, written by the
> seed for a fresh database and by a migration for a running one — because the
> seed runs once on an empty schema and would never have reached staging.
>
> **What ships is ours, not the manufacturers'.** The files are typographic
> monograms in the platform's palette — a filled square with the brand's
> initials — so every row renders something deliberate and aligned. Real
> manufacturer artwork is a **file swap at the same name**: no code, no
> database. `public/brand-logos/README.md` says so, and the admin uploader
> remains the path for anyone without repository access.
>
> **And the migration will not touch a logo the operator uploaded** —
> `WHERE "logoUrl" IS NULL` — so a real mark set from the panel survives it.
>
> Manufacturer logos are trademarks. Displaying them to identify a vehicle is
> what car marketplaces do, but **which artwork is used and where it comes from
> is the owner's call**, not something to decide inside a commit.

## 18 · The year picker, and English for the catalogue — *owner's request 2026-10-18* — **done**

> «سنة الصنع في نموذج اضافة السياره او بيعها يجب ان يكون دروب داون ليست فيه
> الموديلات حسب الاحدث و كل سنه يتضمن السنه الجديده تلقائياً اقدم سياره 1960
> الى السنه الحاليه / الماركات و الموديلات يجب اضافة لها اللغه الانجليزيه في
> اعدادات الماركات بحيث ينعكس ذلك على تغير اللغه للمنصه بحيث لا تظهر باللغه
> العربيه في حال تغيير لغة العرض للمنصه للغه الانجليزيه»

- [x] **Year as a list, newest first**, 1960 to the current year — **derived, not
      written**: a list ending at a year someone typed goes stale on the first of
      January, and the newest model year is the one most sellers pick.
- [x] **English catalogue names reach the screens.** The admin can already set
      `nameEn` on brands, models and trims — measured 2026-10-18, all three
      editors have the field and all 42 brands carry a value. What is missing is
      the reading: screens print `nameAr` regardless of locale, and `Vehicle`
      snapshots only the Arabic name (`brandName` · `modelName` · `trimName`),
      so an English visitor reads Arabic on every card and every car page.

      **What already existed, per the owner's standing instruction to say so:**
      all three admin editors (brand, model, trim) already have the English
      field, and every one of the 42 brands already carries a value. Nothing
      was added there.

      **What was missing was the reading.** Measured on the running site before
      and after:

      | page | Arabic words before | after |
      | --- | --- | --- |
      | `/en` | 6 | 5 — all of them **people's names** |
      | `/en/cars` | 19 | 12 — people's and one dealer's name |
      | `/en/account/vehicles` | 0 | 0 |

      The brand chips on `/en/cars` printed «تويوتا · هيونداي · نيسان», and the
      header printed «بع سيارتك» and «تسجيل الدخول» and «حسابي» as literal
      Arabic beside «Browse cars». Both are fixed. What remains on `/en` is
      real data — a seller is named خالد العتيبي in both languages — and the
      account screens' own prose, which is the separately deferred «English UI
      strings» item, not the catalogue.

## 19 · Registration data on the form — *owner's request 2026-10-18* — **done**

> «الدروب داون لست يجب ان يفتح بطريقه صحيحه حيث يظهر وكأنه يغطي او تغطي عليه
> الاقسام اللي تحته .. ايضا: في قسم لوحة المركبة اعد تسميته بيانات تسجيل
> المركبة / يجب اضافة حقل رقم الهيكل (بجانبها تنويه رقم الهيكل لا يظهر في
> الاعلان و لكن لغرض طلب الخدمات) و خيار جديد او مستعمل و في حال جديد اضافة
> خيار بطاقة جمركيه او رقم اللوحة و بجانبها (تنويه رقم اللوحة لا يظهر في
> الاعلان و ينصح ادخاله وذلك لغرض طلب الخدمات مثل الفحص او اصدار تقارير موجز
> عندما تطلبها او يطلبها المشتري)»

- [x] **The list opens behind the sections below it.** The cause is ours: every
      section carries `animation: step-in` with `animation-fill-mode: both`, and
      an element filling a transform animation **keeps a stacking context** — so
      a panel inside section 1 cannot paint above section 2 whatever its
      `z-index`. The panel moves to a portal.
- [x] «لوحة المركبة» becomes **«بيانات تسجيل المركبة»**, and carries:
  - [x] **VIN**, with the owner's own note: it does not appear in the listing,
        it is there so services can be ordered on the car.
  - [x] **New or used**, moved here from «حالها اليوم» — because what identifies
        a car that has not been registered yet is not a plate.
  - [x] **For a new car: a customs card number or a plate.** A new column; the
        plate columns have existed since the schema was built but a customs card
        has not.
- [x] **The two numbers must not be confused**, with the owner's own facts: the
      customs card is **10 digits**, the VIN is **17 characters** of letters and
      digits. Insurance on a new car before its plates are issued is activated
      on the 10-digit customs card and linked to Najm and the traffic system —
      so a seller who types one into the other's field breaks the policy, and
      the form must refuse rather than accept and fail later.
- [x] **A note under each field's label, in its own colour**, saying it is not
      shown to anyone else and exists so services can be ordered later —
      insurance issue or renewal, a Mojaz report, inspection.

  - [x] **And the question is asked, not inferred** — the owner's refinement the
        same evening: the customs option appears only for a new car, and then as
        a question («صدرت لها لوحات» / «ما زالت ببطاقة جمركية»), with the field
        following the answer. Showing both fields and hiding one when the other
        was typed made the seller read two fields and guess which was theirs.
  - [x] The plate note in the owner's words: it does not appear in the listing,
        and entering it is recommended so an inspection or a Mojaz report can be
        ordered — by the seller or by the buyer.

## 20 · Vehicle attributes, measured before building — *owner's requests 2026-10-18* — **done**

Four messages in a row, asking for registration status on the car and a set of
specification fields on the catalogue. **Measured first, because the owner's
standing instruction is to skip what exists and say so.**

### What already exists — nothing to build

| asked for | where it lives | state |
| --- | --- | --- |
| نظام الدفع (FWD · RWD · AWD · 4WD) | `Trim.drivetrain`, enum `Drivetrain` | complete, all four |
| عدد السلندرات | `Trim.cylinders` | 125 of 126 trims carry a value |
| سعة المحرك | `Trim.engineL` (`Decimal(3,1)`) | 125 of 126 |
| نوع الهيكل | `Trim.bodyType`, enum `BodyType` | exists, **six** of the owner's eight |
| وارد المركبة | `Vehicle.spec`, enum `VehicleSpec` | exists, **three** of the owner's four |

The admin trim editor already edits every one of them.

### What is missing

- [x] **`BodyType` lacks كروس أوفر and مكشوفة.** And the sell wizard's own
      fallback list offers `WAGON` and `CONVERTIBLE` — **values the enum does
      not have** — so a seller picking either sends a value the server rejects.
      A latent break, found by this measurement.
- [x] **`VehicleSpec` lacks أمريكي and كوري.** The owner says the import origin
      moves the price strongly in this market, so folding American and Korean
      imports into `AGENT_IMPORT` loses the distinction buyers pay for.
- [x] **نوع التسجيل is entirely new** — خصوصي · نقل خاص · نقل عام · حافلة صغيرة
      · أجرة · دراجة نارية · أشغال عامة. It is a property of the vehicle's
      registration, not of the model.
- [x] **حالة الفحص الدوري** (ساري / منتهي) and **حالة رخصة السير** (سارية /
      منتهية) on the vehicle — shown in the entry form **only when the car is
      used and its plates are issued**, in the admin listing page and in the
      owner's own car page, and **never publicly**.
- [x] Engine capacity and cylinders are inherited from the trim but **not shown
      in the entry form** — the owner asked for them to be visible there.

### And three more the measurement turned up

- [x] **The engine/EV split.** The owner's condition tree: petrol and diesel ask
      for capacity and cylinders; a full EV asks for battery, range and charge
      port and is **not** asked for a gearbox (it has none); a hybrid or plug-in
      is asked for both, because it has both. New columns for battery, range and
      port, and `PLUGIN_HYBRID` added to `FuelType`.
- [x] **`Vehicle.paintStatus` had no writer.** It has existed since the schema
      was built, defaults to `UNKNOWN`, **and the search filters on «كامل
      الوكالة»** — so every listing a real seller published fell out of that
      filter whatever the car. Now asked, and required, as the owner specified.
- [x] **`Vehicle.colorInterior` had no writer either.** Also required now.

### What the owner must still do

> The customs card, the VIN, the two document statuses and the interior colour
> are all asked for on the form now. **The thirty-odd listings already in the
> database carry none of them** — they predate the fields. Nothing is broken by
> that (every one is nullable), but the admin's listing page will read «لم يحدد»
> for them until their owners edit.

## 21 · Usage history, and a percentage instead of a count — *owner's request 2026-10-18* — **done**

> «ارقام الحقول الذي يظهر مقابل عنوان بيانات السياره 10/10 قد يحبط المستخدم و
> يعتقد ان الخطوات كثيره لذلك قم بإزالته و استبدله بنسبة إكتمال … حالة الهيكل و
> الصبغ ننقلها … بحيث تكون تندرج في قسم مخصص لحالة استخدام السيارة … حالة
> الحوادث و الاضرار … عدد الملاك السابقين … وطبعاً هذا القسم يتم اخفائه في حال
> كانت حالة السيارة جديدة»

- [x] **A percentage, not a tally.** «٧ / ٧» counts fields, and a count of
      fields reads as a list of chores. A percentage says how far along you are
      and nothing about how much there is.
- [x] **A section of its own for how the car has been used**, after the
      registration data:
  - [x] **حالة الحوادث والأضرار** — بدون حوادث · يوجد حوادث مسجلة · يوجد حوادث
        غير مسجلة. New.
  - [x] **حالة الهيكل الخارجي** — the paint status, moved here out of «حالها
        اليوم» where it sat beside the colour.
  - [x] **عدد الملاك السابقين** — مالك أول … أكثر من أربعة. New.
- [x] **And the whole section disappears for a new car** — it has no accident
      history and no previous owners, so asking is asking for an answer that
      does not exist.

### And the admin side, because a column with no editor is a column with no writer

Adding `Model.registrationType` to the schema and stopping there would have
created exactly the defect this repository keeps closing. So the model editor in
`/admin/catalog/models` now has **نوع التسجيل الافتراضي**, and it travels:
model → the user's form, pre-selected, still editable.

And the admin models route carried a **hand-written** body-type list of six
literals — so `CROSSOVER` and `CONVERTIBLE` would have been refused by the API
the moment the editor offered them. It reads `z.enum(BodyType)` from the schema
now, the way the rest of the product does.

## 22 · The model's years describe, they do not restrict — *owner's decision 2026-10-18*

> «سنة الصنع من المنطقي ان لا يتم ربطها بالماركه في اعدادات الماركات لمزيد من
> الحرية»

**Measured first: they already restricted nothing.** The seller's year list is
derived 1960→current whatever the operator writes, and no publish check, search
filter or facet reads `Model.yearFrom` — its only readers are three admin
screens.

**But a required field reads as a constraint.** Whoever fills it believes it
bounds what can be listed under that model, and whoever sees «السنوات
٢٠١٨–٢٠٢٢» beneath a model believes 2023 would be refused. The belief governs
as surely as the rule would: an operator hesitates to add a model whose range
they do not know, and reviews a listing whose year falls outside as if it were
an error.

- [x] `Model.yearFrom` is nullable, the line is not printed when it is empty,
      and the label says so: «اختياري، ولا يحد اختيار البائع».
- [x] What is already written stays — it is accurate description. What is
      written from now on is still range-checked, because a year outside
      1960–this year is a typo, not freedom.

## 23 · The catalogue, broad enough to sell from — *owner's request 2026-10-18*

> «ما رأيك لو نضيف جميع براندات السيارات بجميع فئاتها و طرازاتها في المنصه
> بحيث عند الديبلوي تكون مضافه ولا نبذل جهد كبير في اضافتها يدوياً / كذلك
> نراعى ملئ الحقول الاخرى التابعه لها مثل السلندرات و سعة المحرك .. الخ بما
> يتناسب مع الواقع لمختلف البراندات ؟»

**Measured before answering: 42 brands, 10 with models, 73 models, 126 trims.**
Thirty-two brands — three quarters of the list — had no model at all, so the
sell wizard hid them and nobody could list a Mercedes, a BMW, a Tesla or a
Jetour.

**What was answered, and what the owner chose.** Breadth is knowable: model
names, body type, drivetrain, fuel, transmission, seats, doors. Per-trim
`engineL`, `cylinders` and `horsepower` are not — and decision 32 snapshots a
trim's specs onto the `Vehicle` at publish, so a wrong litre figure travels
into the listing, the inspection report and the price statistic without anyone
seeing it enter. The owner chose **«اتساع بلا أرقام مخترعة»**: every brand
sellable, and no number on the platform that is not true.

- [x] **230 models and 234 trims** for the 32 empty brands, each model with a
      trim per powertrain it is actually sold with in Saudi Arabia — and
      `engineL` / `cylinders` / `horsepower` left empty, for the operator or
      A12's import to fill. The catalogue now reads 42 brands · 303 models ·
      360 trims, and **no brand is without a sellable path**.
- [x] Both paths, each measured: the seed on a throwaway database built from
      scratch, and `20261019050000_catalog_breadth` on the running one. The
      migration inserts only what is missing, matched on brand + English name,
      so it passes over whatever the seed already planted.
- [x] `Trim.yearFrom` became optional, as `Model.yearFrom` did in §22 — a trim
      called «قياسي» describes the model, not one generation of it.
- [x] Two defects the work uncovered, both fixed here: the fallback spec list
      offered `WAGON` and `FOURWD`, **which the schema does not have**, and
      lacked `CROSSOVER` and `PLUGIN_HYBRID`, **which it does** — so the fuel
      tree's plug-in-hybrid branch had no way to be reached. It is derived from
      the enum now. And the model and trim pickers showed no English name and
      could not be searched by one, which 73 familiar models hid and 230 did
      not: nobody finds «جي إل سي» by typing GLC.

## 24 · Features belong to the seller, not to the operator — *owner's request 2026-10-18*

> «المميزات الافتراضية للفئة المفروض ما تكون يتم تحديدها من لوحة الادمن و انما
> يتم عرضها في نموذج اضافة السياره او بيعها بحيث المستخدم يحددها / و يكون في
> الادمن المميزات الافتراضية للفئة لمقصد ظهور حقولها في نموذج الاضافة و الادخال
> ... بدل التشيك مارك فقط للادمن تكون زر + و تضاف المميزات مع تشيك مارك لتفعيل
> ظهورها في نموذج الادخال»

**Measured first, and the gap is wider than the request describes.**

`ListingFeature` has **no writer anywhere in the product**. The seed writes it
and nothing else does — no screen, no route, no domain function. Measured in the
development database: **60 of 62 listings carry features, and all 60 are seeded.**
The two published through the product today (`ADS2026A0062`, `ADS2026A0063`)
carry none, and always would.

And the sell form has **no features section at all**. The seller is never asked.
So the whole chain exists — 39 features, 1,472 trim links, a search filter that
offers them, a car page that renders them — and the one step that would put a
feature on a real listing was never built. Eleventh instance of the pattern.

Two placements are declared and read by nothing: `listing_page` is read by the
car page through the listing's own features (so it works), but `card_badge` has
no reader at all.

- [x] **Asked of the owner, who chose «في الكتالوج مرّة · والفئة تُرجّح».**
      Per-trim control (as the request described) would show a GLC seller four
      checkboxes and need the operator to walk 360 trims. So a fifth placement,
      `sell_form`, decides once per feature whether the seller is asked — and
      the trim's list **pre-ticks** instead of narrowing.
- [x] A grouped features section in the entry form, on **both** intents, that
      the seller fills. 39 features, pre-ticked from the trim.
- [x] Features stored on the `Vehicle` (`VehicleFeature`), and `ListingFeature`
      written as a snapshot at publish — decision 19 unchanged. A car added to
      the garage keeps them, and its owner is not asked twice when listing.
- [x] A `+` in the trim's feature list that creates and names a feature inline,
      in both languages, and ticks it for that trim. It says plainly that the
      new feature joins the whole catalogue.
- [x] A badge beside any trim feature the catalogue does not ask sellers about,
      so ticking it does not silently do nothing.
- [x] `card_badge` now has a reader — **owner's request, same day**: a badge
      row on the car card, at most two, ordered by the catalogue's own `sort`.
      Five features ship flagged as a starting point (cooled seats, sunroof,
      panoramic roof, 360° camera, adaptive cruise); the operator changes that
      from `/admin/catalog/features` with no deploy.

## 25 · The sweep reached the code, not the content — *measured 2026-10-19*

Not a request: found by **walking the pages**, which is the only thing that
reads what a visitor actually reads.

**Gate 61 scans `src/` and `prisma/seed-data/*.json`. It never scanned
`prisma/migrations/*.sql`** — and the whole inspection template, a hundred item
names, was seeded by a migration rather than a seed file. So «تشقّق الأقراص»
and «المكيّف» sat vowelled in the report a buyer reads, nine months of
notification templates and service steps with them, and the SEO intro printed
on public landing pages.

**And the one measurement that could see it was crying wolf.** The walker
flagged diacritics on **36 pages**; 35 of them were «مشترٍ», a defective noun
that is spelled correctly — the exact case gate 61 has an exemption for and the
walker did not. Five real leaks drowned in it. A measurement that reports a
false alarm thirty-five times is worse than none.

- [x] `20261019080000_strip_content_diacritics` — the four tables the first
      sweep missed: integrations, SEO templates, ad slots, inspection items and
      categories. **Reference rows only**: a seller's description, a buyer's
      note on a viewing, a dispute reason and a provider's name are words
      somebody said, and editing them is forgery, not formatting — the same
      line the first sweep drew.
- [x] Gate 61 now reads migration SQL, comments stripped, with the seven
      already-applied files listed by name. An applied migration's file cannot
      change — its checksum would stop every deployment — so its rows are
      corrected by a new migration and its file stays as history.
- [x] A regex character class is not displayed text, so `E'[…]'` is excluded.
      And the new migration writes its class with `\u` escapes, which the
      2026-10-18 migration's own comment demands and its own code did not do.
- [x] `isClippedNoun` is one module both the gate and the walker read, so the
      walker stopped reporting «مشترٍ».

## 15 · Strip Arabic diacritics from every screen — *owner's decision 2026-10-18* — **done**

> «نعم اسحب حذف التشكيل على كل الشاشات»

The PDPL page and the trust marks were written plain after the owner read them;
the rest of the product still carried full diacritics. A half-voweled product
reads worse than either choice, so this was one sweep: strip `\u064B-\u0652`
and `\u0670` from user-facing text, **leaving code comments untouched** (they
never reach a reader, and this repository's comments are deliberately voweled).

- [x] `src/messages/ar.json` — 463 marks. (`en.json` had none.)
- [x] Arabic literals in screens and components — 4,322 marks in 272 files,
      stripped outside comments only.
- [x] `prisma/seed-data/*.json` — 609 marks across eight files, and the Arabic
      `prisma/seed.ts` writes.
- [x] A migration, because **the seed file does not reach a running
      environment**: it runs once on an empty database and the admin screens
      edit rather than re-seed, so legal text, FAQs, notification templates and
      inspection point names would have stayed voweled in staging forever.
      Reference tables only — `AuditLog`, sent notifications and disputes are
      records of what was said, and rewriting those is forgery, not formatting.
- [x] **Gate 61**, measured at zero and proved by six probes, including one that
      writes a diacritic into a comment (it must stay silent) and one that
      writes a tatweel (likewise).
- [x] And the surface walk now reads diacritics out of the **rendered** page,
      which the gate cannot: an admin who types a voweled FAQ into the panel
      puts it on a screen without touching the repository.

### Two things the sweep nearly broke

- **The tatweel is not a diacritic here.** The plan said to strip it; measuring
  said otherwise. All 24 occurrences are load-bearing — «ينتهي بـSA», «بـ350»,
  the plate letter «هـ» and the search token «بـ» — and stripping it would have
  produced wrong Arabic in the first case and a silent duplicate key in the
  last two. It stays, and gate 61 is silent on it.

- **Two normalisers wrote their diacritic range as literal marks.**
  `normalizeArabic` in `cities.ts` and `normalize` in `lexicon.ts` both carried
  `/[ً-ْـ]/` — which the sweep would have turned into `[-ـ]`, stopping Arabic
  normalisation across search and city matching **with no compiler or lint
  error and no test to ask**. They now use `\u` escapes, and
  `tests/arabic-normalizers.test.ts` asserts both the behaviour and the escaped
  form, because behaviour alone would pass right up until the day it broke.

## Also open, outside the four stages

These were asked for or decided earlier and are not part of the sequence above.
Each links to where it is specified.

| Item | Where | State |
| --- | --- | --- |
| KYC / KYB registration for individuals and businesses | `docs/BACKLOG.md` § KYC/KYB | built; refinements listed there |
| Lean Technologies registry lookup on the dealer CR step | `docs/BACKLOG.md` § Dealer registration | built behind a flag; credentials entered in `/admin/integrations` |
| Nafath | deferred by the owner — a contract with the provider is pending | not started |
| Plates as a sellable item | `docs/BACKLOG.md` § F — and the garage's one open row in § B | **decided: after launch** |
| `cn` does not merge Tailwind classes | `docs/BACKLOG.md` § E | **decided 2026-10-19, by measurement.** 9 real collisions in 2,073 elements, one of them a live defect (the header's «بع سيارتك» showed on mobile because `hidden` cannot beat a button's `inline-flex`). No dependency: the defect is fixed on a wrapper, the lying comment is gone, and the crawler counts collisions on every walk so growth is visible. |
| My cars (the garage) | `docs/BACKLOG.md` § B | **usable end to end**; its only open row is the plate, which follows § F |
| English UI strings | `docs/BACKLOG.md` § D | deferred by the owner — **655 lines / 68 files**, re-measured 2026-10-17. The data fix shipped (twice) and the percent sign is fixed; **error messages still read `messageAr` in 19 of 20 places** although `messageEn` is already in hand — listed there, open. `/en` is in the sitemap, so what stays Arabic is advertised. |
| `home_story` ad slot has no design | `docs/DESIGN-DECISIONS.md` | question pending |
| Full car catalogue (A12 CSV import) | `docs/BUILD-WEB-ADMIN.md` §A12 · ROADMAP §23 | **Breadth shipped 2026-10-18: all 42 brands are sellable.** What A12 still adds is depth — real trim names and the engine figures left empty on purpose. The sell wizard still hides a brand with no visible trim, and still offers the “tell us” link. |
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
