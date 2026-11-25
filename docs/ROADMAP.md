# The register — everything the owner asked for, in the order they set it

_Last updated: 2026-11-25_

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

**Superseded 2026-11-23 by §40** — the owner re-set the order after the
production deploy: design conformance first, then the remaining panels, then
the mobile app. The table below is kept because the rows it names are still the
work; only their sequence changed.

| # | Stage | State |
| --- | --- | --- |
| 1 | The rest of the marketplace screens | **in progress — now §40a** |
| 2 | Settle the order stages | not started — **needs the owner** |
| 3 | The services vertical and the two gateways | 1 of 8 steps done |
| 4 | The dealer panel | fully specified — **now §40b**, no longer deferred |
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
- [x] **Payment marks** — unblocked 2026-10-19: the owner supplied
      `public/trust/payment-icons.webp`, one strip of five. Cut into five files
      and five rows (mada first — the national scheme and the most used), so a
      method can be switched off on its own; a strip would show all five or
      none, and a method that fails at checkout is a promise broken at the
      worst moment.
      - [x] **The white tile removed** at the owner's request: content is what
            is clearly dark or saturated, because the tile's shadow is neutral
            grey at `rgb(222)` and a naive white test keeps the whole card; and
            the erase is a flood fill from the border, because «MasterCard» is
            written in white *inside* its circles and a blanket key punches
            holes in it.
      - [x] **The strip reads as one line on mobile**, tighter than the
            regulatory row: the five are read as a sentence, and wrapping
            splits them into what looks like two lists.
      - [x] **The regulatory marks take two lines on mobile, not three** — a
            two-column grid promises the count, which `flex-wrap` cannot.
      - [x] `ndgp.png`: shortened at the owner's request, then **restored
            whole** the same day when he said the full wordmark reads better.
            It is the body's own mark again.
      - [x] Order set so VAT sits furthest right and the Digital Government
            Authority immediately to its left (owner, 2026-10-19). `sort` is
            not editable from the panel — which edits the number, the link and
            the visibility — so order travels as a migration.
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

## 26 · Documentation that cannot lie about a path — *owner's request 2026-10-19*

> «ابدأ بـ(أ) ثم واصل» — after asking whether the documentation is kept
> accurate, and how that could be guaranteed.

**Answered by measurement, not assurance.** 62 documents · 25,635 lines, of
which **~2,200 (9%) are generated** and fail `verify` when stale: the ERD,
OpenAPI's 142 paths, the component index, plus the state names in
`state-machines.md`, which are checked against the schema's enums. The other
91% is prose nothing verifies.

And the decay is **not staleness**. Three documented claims this session were
wrong the day they were written: the roadmap said a trust mark's number «is set
from the panel» when no panel existed; `cn`'s comment said the last class wins,
which the browser disproves; `state-machines.md` draws a transition the product
cannot make. A sentence written at planning time describes an *intention*, and
is read a month later as a *description*.

Option (أ) was the cheapest of the three offered, and the owner chose it first.

- [x] **Gate 62 — every repository path a document names must exist.** Measured
      before enabling, as the rule requires: **179 unique references, 2 broken**
      — under the ten-alarm line, so it ships enabled the same day.
- [x] The two were both `totp`, removed when the designer dropped two-factor
      auth. One is a dated journal entry in `NOTES.md` — true when written — and
      one is **`docs/api/admin-auth.md` describing TOTP in the present tense**,
      a whole section about a feature that does not exist. The gate found a real
      lie on its first run.
- [x] A path the text marks as removed is allowed, so history stays readable
      without the gate going blind.

## 27 · A register of what nobody can edit — *owner's request 2026-10-19*

> «واصل بـ(ب)» — the second of the three guards offered.

**The proposal was wrong, and measuring it showed why.** (ب) was going to
require every sentence promising an operator capability to name a screen.
Measured: **39 such lines, 37 without a path** — but reading them, most are
quotations of the owner's own request, entries in the journal, or *descriptions
of the bug itself*. A gate on words would have raised an alarm on nearly all of
them, and an alarm that is usually false is worse than none.

So the gate does not read the prose. It reads the thing the prose is about:
**can anybody change this row without a deploy?**

- [x] **Gate 63** — every model the product neither creates nor edits must
      appear in `docs/architecture/editability.md` with a reason. Checked both
      ways: a model that loses its editor must be added, one that gains an
      editor must be removed, so the register cannot lie in either direction.
      It is gate 45's shape («a writer or a declared silence») applied to rows.
- [x] The classifier moved to `scripts/model-writers.mjs`, read by both the
      gate and `npm run dead-ends` — two checks measuring one thing must not
      keep separate copies.
- [x] Measured at **ten models**, each now declared. Writing those ten reasons
      turned up two gaps nobody had named:
      - **`PriceStat` has no writer and no scheduled job.** The price guidance
        a seller reads — «مبنيّ على ١٧ صفقة» — is frozen at seeded values and
        never learns from a real sale.
      - **`VehicleHistoryItem` has zero references in `src/`.** A car's history
        timeline is demo data; nothing adds to it after an inspection, a
        service or a transfer.

## 28 · The two gaps the register named — *owner's request 2026-10-19*

> «اصلح ثغرتي PriceStat و VehicleHistoryItem»

Both were found by writing the reasons in §27's register, not by counting.

### `PriceStat` — guidance that never learns

The seller's price guidance reads these rows, and **nothing wrote them**: no
screen, no domain function, and no entry in `src/lib/jobs/run.ts`. So «مبني
على ١٧ صفقة» has always meant seventeen *seeded* deals, and would have meant
the same after a thousand real sales.

The seed already says what the source should be: «ووسيطُ السوق في الحقيقة من
**صفقاتٍ مكتملة**، لا من أسعار طلبنا» — and explains why asking prices are the
wrong input: most model-years have one listing, so the median equals that
listing's own price and the indicator says nothing about anything.

- [x] `recomputePriceStats`, registered in `src/lib/jobs/run.ts` and running
      last with the reconciliation: it reads what settled, and its failure
      delays no money and no notification. Source is `agreedPrice` on orders at
      `DONE`/`COMPLETED` — never `askPrice`, and a test asserts that.
- [x] One deal feeds all **four tiers** the reader falls back through, in the
      10,000 km buckets it rounds to, with percentiles interpolated rather than
      snapped to a member — on a sample of eight, `p90` would otherwise be the
      single dearest deal, read as a ceiling for the market.
- [x] **It never replaces a usable row with an unusable one.** A key under
      `PRICE_STAT_MIN_SAMPLE` is left alone. Measured on development data: 2
      completed deals → 8 candidate slices → **0 written, 8 left**, so the
      first real sale improves the guidance instead of deleting it.
- [x] `daysToSellMedian` from published to completed, so «يُباع خلال» comes
      from our own sales too.

### `VehicleHistoryItem` — a timeline that never grows

Zero references in `src/`. A car's history is seeded demo data; nothing adds to
it when the car is inspected, serviced or transferred — the three things the
platform itself knows and the buyer most wants to read.

- [x] Written at the three moments the platform witnesses: an inspection
      **published** (an unpublished report belongs to whoever asked for it), a
      sale completed, a service done. **Only what we witnessed** — the seller's
      own claims are already his description, and a platform line carries more
      weight than it has earned if it merely repeats him.
- [x] The inspection line's source is `INSPECTION`, not `PLATFORM`: the
      inspector is a third party, and that distinction is what makes the line
      worth anything to a buyer.
- [x] No line is written twice — a duplicate in a car's history reads as two
      events.
- [x] **And the shared fixture now restores it.** `advanceStage` writes history,
      so a test that completes an order would otherwise leave a permanent line
      on a seeded car, read by everyone who opens its page. Third effect traced
      into `tests/helpers/order-fixture.ts` after the ledger and the bell — the
      repository's standing rule, followed rather than rediscovered.
- [x] Walked end to end: a seeded order driven through all five stages writes
      exactly one `owner` line, and severing the call fails the test.

## 41 · No action needs a second person — *owner's decision 2026-11-24* — **done**

> «انا ما اعجبني ان الأدمن يحتاج ثلاثةَ حسابات سلطةَ لتنفيذ بعض الاجراءات و
> المفروض عنده سلطه كسوبر ادمن ... طبعاً كلامي عن كل القرارات اللي من هالنوع»

§35 removed the two-approver quorum on 2026-10-14 and set `REQUIRED_APPROVALS`
to one. This request restates it as a **class**, not a case, and the measurement
showed §35 had changed the constant and left its consequences in two places
nobody had looked at.

### Nothing required a second person. Thirteen screens said it did.

Measured across `src/`: all ten flows that open an `ApprovalRequest` pass
`REQUIRED_APPROVALS`, no stored row demanded more than one, and
`selfApprovalBlocked` only engages above one. **The requirement was gone and
the product had not been told.**

- [x] Three lines in the wallet panel and three in the provider ledger said
      «**لا يقع التعديل بهذه الضغطة** — يرسل طلب ويوافق عليه شخص ثاني» and
      «لا يوافق طالبه على نفسه. يلزم شخص ثاني». At quorum one `requestAdjustment`
      calls `approveWalletAdjustment` **in the same call**: the money moves on
      that click. A screen that says a click does not move money, while it does,
      is the worst form of the broken-promise class.
- [x] Five screens hid the approve control from the requester — payouts,
      provider payouts, the provider's bank card, and the settlements queue —
      with «أنت الطالب · يعتمده غيرك». **The server allows it.** The block was
      client-side only, so the panel invented a second person the system does
      not need. That is also where «ثلاثة حسابات» comes from: the seed ships
      three admin accounts and the panel kept pointing at the other two.
- [x] `DUAL_APPROVAL_FIELDS` named four auction fields as needing a quorum and
      its comment said it is «تُقرأ في الشاشة وفي الحارس معًا». Measured:
      **no reader anywhere**. Deleted with its claim.
- [x] Nineteen comments asserting a current two-person rule rewritten; the
      historical ones («أُلغي نصابُ العضوين بقرار المالك») kept, because a
      record of a decision is not a stale claim.

### Two things §35 could not have known it left behind

- [x] **The schema default was still `2`.** Every creation site passes the
      constant, so nothing was broken today — but a new one that forgot the
      field would have reinstated the quorum silently, and the request would
      wait for somebody who is never coming. Now `1`, with a migration.
- [x] **`selfApprovalBlocked` reads the row, not the constant.** A row written
      before §35 keeps its own `requiredApprovals: 2` forever, so lowering the
      constant never reached it. The migration lowers pending rows and leaves
      executed and rejected ones alone — their history is what it was.

### The gate stopped being a list of phrases

Gate 19's deny-list let a wording through **twice**: «عضوان» in §40a·7, and now
«شخص ثاني» across seven live lines plus «غيرك» across five more. The fault is
the shape, not a missing entry — a phrase list enumerates what its author
remembered.

- [x] Rebuilt as **two conditions on the same line**: an approval word
      (موافق · يوافق · اعتماد · يعتمد · نصاب) together with a second-person word
      (عضو · شخص · غيرك · آخر · اثنان, in any form). It found the five that the
      list had never seen, on its first run, and a probe confirmed it fires on
      «زميل آخر» and «مسؤول ثاني» — wordings nobody enumerated — while staying
      quiet on «أفرج عن المبلغ» and «اعتمد الطلب الآن».
- [x] `tests/quorum-one.test.ts` guards the number rather than the prose: the
      constant, the self-approval rule at both settings, the Prisma default, the
      database column default, and that no pending row demands more than one.

`RECORDED_ACTIONS` is untouched. The owner removed the **quorum**, not the
**record**: an action that moves money still writes a row naming who did it,
and a ledger asks nobody's permission.

## 40 · The order from here: conformance, then the remaining panels, then the app — *owner's request 2026-11-23*

> «ينقص المشروع الكثير من العمل و التطوير من ناحية اكمال التصميم و اكمال
> الوظائف ليصبح جاهز تماماً بكامل لوحاته … يوجد لوحات تحكم تخص اطراف اخرى
> تتعامل مع المنصه لم نكملها و يوجد ايضاً صفحات في لوحة الادمن و صفحة
> المستخدم لم تكتمل وفق التصميم .. لذلك يجب ان نراجع التصميم وملفات التصميم
> … كذلك ملفات التوثيق و نحرص ان يكون تصميم المنصه حالياً بجميع صفحاتها
> مطابق بنسبة ١٠٠٪ للتصميم ثم نكمل لوحات التحكم التي يتطلبها المشروع ثم بعد
> ذلك ننجز تطبيق الجوال للمستخدمين و الذي سأشاركك بتصميمه لاحقاً في حينه»

This replaces the stage order at the top of this file. Three stages, in the
owner's sequence:

| # | Stage | What «done» means |
| --- | --- | --- |
| **40a** | Every existing page matches its design block | `node scripts/design-audit.mjs` reports no screen below its threshold, and each remaining gap is a recorded design decision rather than an omission. **Baseline 2026-11-23: 59٪ (305/515).** |
| **40b** | The panels the platform's other parties need | measured below — the dealer panel is the whole of it |
| **40c** | The mobile app | design to be supplied by the owner; `design/Supper App.dc.html` holds 124 screens already drawn |

### What was measured before writing this

The design folder holds four files, and their screens are countable:

| File | Screens | Built |
| --- | --- | --- |
| `Admin.dc.html` | 36 (A1–A36) | 35 — `A24` طلبات التمويل deferred by the owner |
| `Front-end Web.dc.html` | 28 (Wa–Wz) | 26 — `Wq` التمويل and `Wr` اللوحات المميّزة deferred by the owner |
| `Dealer.dc.html` | 11 (D1–D11) | **0** |
| `Supper App.dc.html` | 124 | 0 — stage 40c |

So **40b is the dealer panel and nothing else**: the provider panel was
finished in §7 (one shell, a field schema per type), the admin panel in §38,
and no third party in the specification has a panel of its own. The dealer
requirements are already written against the code in
`docs/dealer/requirements.md`, and the gap named there is the one that decides
the work — **no purchase price is recorded anywhere**, so margin VAT, the hook
the owner called the showrooms' biggest accounting problem, cannot be computed
because its first operand does not exist.

### Why 40a is measured and not judged

`scripts/design-audit.mjs` already extracts each screen's **signals** — section
headings, button labels, table headers — from its design block and looks for
them in the served page. It is an existence measure, not a pixel measure: it
says «the section is missing», not «the padding is 12 instead of 14». The first
loses the user something; the second is read off a screenshot by eye.

Both are needed for «١٠٠٪», so 40a runs in two passes: the tool first, then a
walk with the browser open on what it cannot see.

### What the first pass fixed — in the measure, before the screens

The tool was answering a different question than it appeared to. Five defects,
each found by opening a screen the number called broken:

1. **It counted the owner's own decisions as missing work.** The design is
   drawn with diacritics, Arabic-Indic numerals and the `carsell.one` name;
   the product strips diacritics (§15), prints numerals Latin (`task-140`) and
   is called CARZ. So every signal carrying a diacritic or a digit could never
   match. `A10` read **13٪** against a screen that is largely built. Both sides
   are now normalised, and a signal that is nothing but a number — a seed value
   like «٩٬٣٢٠ جهازًا» — leaves the denominator. Measured on four screens the
   moment it landed: `A1` 85→92, `Wc` 63→75, `Wa` 50→57, `A10` 13→25.
2. **It never read `Dealer.dc.html`.** Eleven designed screens were outside the
   measure entirely, so the total said nothing about the quarter of the design
   that is not built. They are read now and reported in their own line — debt,
   not a conformance gap, because mixing the two makes the percentage answer
   two questions at once.
3. **`Wj` had no route**, so the order page counted zero. It is discovered live
   now from a buyer's own orders page. Finding a buyer for it turned up
   something about the seed worth keeping: **of 200 accounts, not one has both
   a listing and an order.** Sellers sell and buyers buy, so no screen has ever
   been seen in the state a real marketplace user is in.
4. **`A14` and `Wh` were read as 404 and 0٪** because their content is behind a
   click — the trim editor needs an id the tree loads lazily, and the sell
   wizard renders its steps in the client. Searching the raw payload instead
   would have been the «the name appears, therefore it is wired» trap that
   gates 50 and 52 exist to close, so they are declared walk-only.
5. **It let an incomplete run print a number.** Three crawlers against one dev
   server produced eighteen 500s and a figure that looked fine. The tool
   already refuses this — it names what it could not reach and exits 1 — and
   that refusal is what caught the real cause: **the machine's disk was full**,
   2.8 GiB free of 228, and `ENOSPC` was reaching Next as a 500.


### 40a · 1 — `A10` push notifications, 25٪ → the half that does not need the app

The weakest screen in the ranking, taken first by the owner's ruling «الأضعف
أوّلًا أيًّا كانت». Opening it showed the measure was right about the gap but
not about its nature: the channel table and the device preview were built, and
what was missing was **the measurement the screen's own rule demands** — A10
writes «قياس الأثر لا العدد» and the screen counted devices.

Built, per the ruling «أبني جمع البيانات الآن»:

- **`PushSend`** — one row per push that becomes due, opened by `notify` when
  the template carries a push channel, the user has not muted it, **and the
  user has a device**. Source of the delivery, open and opt-out rates and the
  two new table columns.
- **`PushPermission`** — the app records what the OS answered. Without it the
  «أذونات ممنوحة» card has no denominator: whoever refuses leaves no token, so
  counting tokens reads 100٪ forever.
- **`DeviceToken` gained a writer** — `POST /api/v1/me/push/token`. It had none
  in the whole product: the screen counted the table, account closure deleted
  from it, and nothing ever created a row. It leaves
  `architecture/editability.md` accordingly.
- **`PushChannel.sound` · `.badge`** — the markup's «الصوت» and «شارة» columns,
  which had no field at all, so a marketing notification and an auction
  notification made the same sound. Settable per channel from the panel,
  audited, and read by the app on delivery.
- **The two explanation panels** the markup draws and the screen never had.

**Every card reads «لا قياس بعد» today, and that is the point.** There are no
device tokens, so no row is written and no denominator exists. A card printing
`0٪` would accuse the sending of being broken when nothing has been sent — and
the screen says «يبدأ مع التطبيق» instead.

**What stays open in `A10`:** the sender. Nothing dispatches to FCM or APNs, so
«اختبار على جهازي» and «سجل الإرسال» wait on a provider integration and a real
device — stage 40c. Detail in `workflows/notifications.md`.

### 40a · 2 — `A30` ad slots, 25٪ → and a revenue line that read zero

Second in the ranking. The markup wants four cards, an «أضف مساحة» button and a
«معاينة في التطبيق»; the screen had the slot table, the campaign list and two of
the cards. Measuring the missing two found something worse than a layout gap.

**`AdCampaign.status` was a free string with four vocabularies.** The seed wrote
`active`, `createCampaign` wrote `live`, the screen's tabs read `live`, and
`admin-finance` filtered `status in ('running','ended')` — **a value nothing in
the product writes**. So the finance dashboard's ad-revenue line read **zero no
matter how many slots were sold**, and `adsFor` — the serving query — filtered
`live`, so the seeded banner campaign was never served either. Two silent
failures from one undeclared vocabulary.

It is an enum now (`AdCampaignStatus`), and the compiler found every drifted
site the moment it existed. A migration normalises the rows that were already
written, mapping each old spelling and falling back to the campaign's own window
for anything unrecognised — a row with an unknown state is better read from its
dates than deleted.

**And the money rule is written once.** `adRevenue(from, to)` lives in `ads.ts`;
the finance dashboard and the new A30 card both call it, so they cannot drift.
It keeps the existing treatment — the whole budget recognised in the month the
campaign *starts* — and the accrual question is now asked rather than decided
silently: `OPEN-QUESTIONS.md`, with the answer costing one line in one file.

Also built: **`adOccupancy`** (slot-days sold over slot-days available on active
slots, counting a day once however many campaigns bought it), and **«أضف مساحة»** —
`AdSlot` had its flag toggled from the table and **nothing ever created one**, so
seven seeded slots were all the operator would ever have. New slots are born
**inactive**: an active slot enters the occupancy denominator immediately and
appears in the campaign picker before any surface reads it.

**What stays open in `A30`:** «معاينة في التطبيق» — stage 40c.

### And the numerals leak reference data carries

Gate 70 reads `src/`, and the ad slot sizes come from `prisma/seed-data/`. So the
table printed «٤٨px سطر» beside a price of «3,500» — two numeral systems in one
row, through a door the gate did not look at. Measured across the reference
files: **91 occurrences in six files**. Fifty-five were converted (slots, FAQs,
features, inspection points, services) with a migration for the rows already in
live databases, since reference data reaches them by migration and not by seed.

The remaining 36 are all in `brands.json` — «راف٤» · «أيونيك ٥» · «زد٧١» — and
they are **not numbers**. A mechanical sweep yields «راف4», which nobody types
and nobody searches for; the right form is a naming question, asked in
`OPEN-QUESTIONS.md`. The file is excluded from the gate with that reason written
beside it.

### 40a · 3 — `Wj` the order page, 27٪ → 100٪, and a cancel button that hid when it mattered

Third in the ranking, and the first screen the measure was reading in the wrong
state. `Wj` is drawn at the **payment** stage — «قيد الدفع», «المستحق الآن»,
«ادفع الآن» — and the tool was taking whatever order it found first, which was
complete. It now prefers an order that shows the pay button, and says so when
there is none, because a missing state must not read as a missing screen.

**With the right order, the first finding was the seed.** It gave an escrow to
orders **at** `PAYMENT` as well as after it (`>=` where `>` was meant), and that
is a state the product cannot produce: `startHold` writes `HELD` through
`applyState`, which advances the stage in the same move. Two consequences, both
silent:

- `canPay` requires `escrow === null`, correctly — so **«ادفع الآن» had never
  rendered for any order at the payment stage**. The buyer arrived and found
  nothing to press.
- The escrow card told that buyer «المبلغ محجوز ولم يصل البائع» when they had
  not paid a riyal.

What is wrongly seeded is wrongly seen, and the screen was built on what it saw.
Two invariants now hold it: no order at `PAYMENT` has an escrow, and at least
one payable order exists so the state is reachable at all.

**And the cancel button was hidden exactly when cancelling is free.** It sat
inside the `canPay ? null : …` block, so at the payment stage it disappeared —
while `CANCELLABLE` in `order-cancel.ts` has listed `PAYMENT` since it was
written, and the markup draws the button there with its fee rule beside it. A
door the server opens and the screen closed.

The rest was labelling the markup already implies: the live status badge
(«قيد الدفع» — `orderStage` names *steps* for the tracker, so the badge reads a
second map of *states*, both held complete by gate 59), a support link carrying
the order reference, the breadcrumb, a name on the sale-method value, a heading
over the stage tracker, and «المبلغ في الضمان» as the amounts heading before
payment — where the title itself tells the buyer where the money goes.

### 40a · 4 — `A11` integrations, 31٪ → 88٪, and a register that never reached production

Fourth in the ranking, and the gap under it was not on the screen.

**Eight of the fourteen integrations the markup lists had no row at all**, and
the nine that did were seeded in `seed.ts` alone — which **refuses to run
outside development on purpose**. `plantReference` seeds twenty tables and
`Integration` was not among them, so the external-dependency register on
`carz.sa` was **empty**: no provider, no state, no written fallback, nowhere to
put a key. §39 built the bootstrap to close exactly this class; this table was
not counted that day. `FinanceProvider` was the same — eight lenders in
development, zero in production, read by the financing page, the calculator and
every «أقساط من» card.

Both now plant from `reference.ts` and reach existing databases by migration,
and the missing eight are added as honest `INACTIVE` rows with their real
fallback behaviour. A row saying «متصل» without an adapter would be a lie; a row
saying «غير مفعّل» is an acknowledged dependency — and push notifications are
the proof it was worth it: 40a·1 built their whole measurement pipeline while
nothing recorded that FCM and APNs are an external dependency at all.

**And the bootstrap was re-inserting lenders on every run.** `skipDuplicates`
guards a unique key, and `FinanceProvider` has a `cuid` id and no unique name —
so nothing conflicted and eight more appeared each time. Measured when the
guard went in: **104 rows where there should be 8**. The reference-bootstrap
test caught it, which is what it was written for.

On the screen: the two markup cards that had no field behind them —
**«تكلفة الشهر»** (a contract, not something a provider reports) and
**«مفاتيح تنتهي قريبًا»** (thirty days' warning, because a key that expires
unannounced stops an integration mid-working-day) — with one editor for both,
audited, and no approval request: a number and a date open no door.
Then the environment indicator the markup puts in the header, a **kind chip**
per row («بنكي» · «مركبات» — finer than the four categories, and the
difference between a bank rail and a card gateway inside `PAYMENT`), and Arabic
names for the key fields, which were rendering as `secretKey` and `clientId`.

**What the panel deliberately does not do** — «+ تكامل» and the publishable-key
field — is in `DESIGN-DEVIATIONS.md` with the reasoning.

### 40a · 5 — `A18` identity, 38٪ → 75٪, and «8 جهة تمويل» on the home page

Fifth in the ranking. Most of what the measure called missing was **behind the
«راجع» click** — the whole decision panel, which has had its three buttons
since it was built. What was genuinely absent were the two cards that tell a
reviewer about **today**: the screen showed «موثّق ١٬٤٢٨» across all time,
which does not move with a day's work.

Today's verifications come from `idVerifiedAt`, split by method; today's
rejections come from the **audit log**, which is the authoritative record of a
decision and already carries who and when — no new column for a timestamp that
exists. The rejection sub-line says «آخرها» and not «أكثرها»: the reasons are
free text, and picking the commonest would be classification, not counting.

**«سياسة الرفض»** is now a panel, and its value is the line it draws:
*what is missing gets a clarification request; what conflicts gets a
rejection.* Two reviewers reading the same blurred photo should not reach
different answers, and rejecting something that was merely incomplete starts
the loop between the two sides that `decideIdentity` already guards against by
demanding a reason.

**Two things the panel deliberately does not do** — show the national ID in the
review panel, and verify in bulk — are in `DESIGN-DEVIATIONS.md` and
`OPEN-QUESTIONS.md` respectively. Bulk verification opens publishing, buying,
bidding and receiving money in one press; that is the owner's call, with three
possible shapes offered.

### And the home page was printing «8 جهة تمويل»

Found while confirming the integrations fix reached production. The hero
statistics put the number in `<dd>` and a **fixed** noun in `<dt>`, so the
plural never agreed: «8 جهة تمويل» for eight, «3 معرض موثق» for three. It had
been right by accident for 11–99 — the commonest range — which is why it
survived on the most-visited screen until financing partners reached eight.

The lint rule did not see it: it checks Arabic text **adjacent to**
`<ArabicNumber>` in the same expression, and these are sibling elements. The
labels are plural units now, carrying the noun alone in its six forms with the
number above them. Scanned for the same shape across every definition list in
`src/`: none left.

### 40a · 6 — `Wf` the account home, 40٪ → 80٪, and a CTA that lived in dead code

The screen every signed-in person lands on. Four of its sections were wrapped
in `{false ? <EmptyState …/> : …}` — **dead branches**, because each section is
already hidden when it has nothing to show, so the empty state could never
render. Removing them left two imports unused, which is how dead code proves
itself.

**And one of those branches held the design's «اعرض مركبة للبيع».** It was
written, styled, and unreachable: the listings section hides when you have no
listings, so the person with nothing to sell — the one the button is for —
could never see it. It is in the welcome block now, where the markup puts it.

**Offers could be read but not answered.** The row showed the amount, the ask
price and the expiry, and ended in «عرض» — so a seller went to the offers inbox
to reply to something they were already looking at, on an offer that expires.
`OfferActions` is inline now, and it carries `sentByMe` with it: a counter-offer
keeps the original `buyerId`, so without that flag the seller sees «اقبل» above
their own counter and accepts their own offer — the bug that was fixed in the
inbox and would have been copied here by copying the row.

Also: the offer's **age** beside its expiry (the reply window is measured from
it), «تفاصيل» rather than «عرض» on an order row that opens the order's stages,
and a lapsed offer now reads «منتهٍ» instead of «بانتظار الرد» — the stored
status is not enough when the thing has a clock, and the buttons were already
hiding correctly, so the row contradicted itself.

### And the seed could not show the screen the design draws

Two measurements, both zero:

- **No live offer existed anywhere.** Offers were seeded `days(-between(2, 20))`
  with a 96-hour window, so «ينتظر الرد» was born expired whenever the dice
  rolled above four. Accept and counter could not be seen on any screen, and
  the negotiation journey could not be walked.
- **No account both sold and bought** — 200 accounts, sellers sell and buyers
  buy. `Wf` draws «طلباتي» and «العروض الواردة على مركباتك» in one screen, so
  every check of it covered half the page. This was recorded at `Wj` and is now
  fixed: the first seeded order is bought by a seller, and the first pending
  offer lands on that same seller's listing.

The measure also picks the account to walk by **what its page actually renders**
rather than a fixed phone number — and the first version of that probe counted
«طلباتي» from the sidebar, which every account has, so it chose the poorest one.
It reads section content now.

### 40a · 7 — `A17` disputes, 44٪ → 67٪, and two gates that were letting things through

The queue had no figures above it, and the markup's four say the thing that
matters: **what is frozen.** Three disputes is a number; three hundred thousand
riyals held between two waiting parties is a reason to work today. They are
built from the escrow — what actually reached the gateway, counting only what
is still `HELD` — plus «متوسط الحل» from `openedAt → resolvedAt`, and
«بلاغات تنتظر» with the age of the oldest and a link that opens them.

### Gate 19 was green on a promise the product had dropped

The disputes empty state read «يحسم بقرار يعتمده **عضوان**» — forty days after
the two-approver rule was removed (§35). Gate 19 exists for exactly this, and
it matched `عضوين` and missed `عضوان`: **the Arabic dual has two forms, and the
list had one.** A phrase missing from a deny-list lets through what the list
was built to stop. Extended, and it caught the live one on its first run.

### And a grammatical class the lint rule cannot see by design

`منذ يومان` is wrong — a preposition governs what follows, so the dual becomes
`يومين`. Every other plural form is unchanged, so **the error appears only at
two** and passes unnoticed at every other count.

The lint rule did not catch it and should not have: its scope is text *after*
the number, because a label before it («السنوات ٣») is correct and banning that
would be noise. A preposition is not a label.

`<Duration genitive>` selects the genitive forms, five units now carry them,
and **gate 71** requires the flag after a preposition. Measured first: eight
places across four screens, all moved, then the gate switched on and proved by
breaking one.

**Two things the markup asks for are questions, not code** — auto-suspending a
listing on report count, and letting an admin open a dispute for someone who
phoned in. The first hands anyone with three accounts the power to take a
competitor's listing down; the second writes the admin's name where the
record needs the party's. Both are in `OPEN-QUESTIONS.md` with options.
Keeping reports and disputes on separate screens is in `DESIGN-DEVIATIONS.md`,
and the reason is the permission matrix the markup predates.

### 40a · 39 — `Wx`, `A23`, `A26`: numbers whose value is the gap between them

**`Wx` 60٪ → 80٪.** The pay button read «ادفع واطلب **فحص فني 210 نقطة**» —
the marketing name inside an action that takes money. Services have a short
label now, and a key without one falls back to its full name rather than being
given an invented one. The heading stays generic: «ما يشمله الفحص» needs the
verb to agree with the service noun, and all eight services happen to be
masculine today — it would read correctly now and break on the first «الصيانة».

**`A23` 80٪ → 100٪.** Two measures, and each is only useful beside the other:

- **«وسيط ردّ البائع», not an average** — one reply after a week drags the mean
  of twenty given in minutes, so the mean describes an outlier rather than what
  anyone meets. The same decision was already recorded for the dealer card.
- **«من العروض فوق الحد»** sits beside the acceptance rate it explains: an offer
  under the seller's floor is auto-rejected, so a low acceptance rate can mean
  low offers rather than a reluctant seller — and the numbers apart do not say
  which.

**`A26` 80٪ → 90٪.** The dealers' **share of GMV** beside their share of
listings: a third of the listings and half the volume means pricier,
faster-turning stock; the reverse means listings that sit. Measured from
completed orders, not listing prices — a million-riyal listing that never sold
is not volume.

`أضف معرضًا` joins the on-behalf questions (`A17` · `A22` · `A29` · `A35`):
opening an account for someone with **their** commercial register, and deciding
for them that it is valid. They are one decision.

### 40a · 38 — `A36` exports: a duration nothing measured

`A36` read **60٪**, wanting «أطول تقرير ١٤ ثانية» beside «حدّ المهلة ٦٠». The
figure is a **warning, not decoration**: a report nearing the limit will fail
one day on larger data, and the operator should know before it does — and
**nothing measured it**.

Every export now records how long its query took, alongside its row count, and
the card reads the slowest run this month with the report's name.

**Getting it reversed a recorded decision.** Exports were audited only when they
carried personal data — reasoned at the time as "logging every one floods the
log". That reasoning has lapsed on two counts: this repository's first rule is
that **every admin action writes `AuditLog`**, and the log now has a «حسّاسة»
lens (task 28) separating what gets reviewed from the routine. The deciding
fact: **the heaviest report is the ledger, which is not personal** — so the
duration that mattered most was the one never written. The old test asserted
the old rule; its replacement carries why it changed, so the next reader is not
left guessing.

`تقرير مخصّص` stays asked: a builder running arbitrary selections over `User`
is an export of personal data by another name, and needs its own guard on what
may be chosen.

Measured after: **60٪ → 80٪ ⚠**.

### 40a · 37 — `A29` and `Wg`: a trail written and never read

`A29` read **75٪**. **«سجل التغييرات» was built into the trail and out of the
screen**: `commission.changed` and `entitlement.override_granted` have been
written to `AuditLog` since the screen existed, and answering "when did
commission change, and who changed it" meant opening the whole audit log and
searching four thousand rows. The log is on the screen that holds the question
now — the same shape as `A20`'s switch log.

**And «على كل الباقات» appeared only while commission was switched on.** With it
off the card read «معطلة على البائع», which says the state and not the scope —
and the plan table underneath has a commission column per row, so the reader
could reasonably think it differs by plan. Both are said now.

`أنشئ باقة` stays asked: a plan is a bundle of entitlement values and the code
asks for the entitlement, never the plan, so creating one means defining the
whole matrix — and one created without it grants nothing while looking as
though it does.

### `Wg`: the design reproduces a bug we closed with a lint rule

«١٤٢ مركبة معروضة» — a singular noun under a count, which is exactly the defect
found on the home page («8 جهة تمويل») that had been live for months because it
reads correctly for 11–99. The product's label is a **state** («معروضة الآن»),
true under any number. Reproducing the markup would reintroduce what a lint rule
now forbids, so it is recorded as decided and subtracted.

«تابع» stays counted: there is no follow model and nothing for it to deliver.

Measured after: **A29 75٪ → 92٪ · Wg 78٪ → 88٪**.

### 40a · 36 — `A4` orders: an export behind the wrong permission, and a stage that did not say whose

`A4` read **77٪**.

**«تصدير CSV» existed — for someone else.** `sales_commissions` sits behind
`finance.view`, so the person standing on the orders queue cannot download it.
They are two different reports anyway: that one is revenue, commission and VAT;
this one is the order with its stage, its deadline and both parties. `orders`
is a catalogue report now, behind `orders.view`, **not personal** — it carries
ids, not names, because operations are followed by reference.

*(Its money columns first came out as a thrice-quoted string: `cell` serializes an
object with `JSON.stringify`, and a Prisma `Decimal` is an object. Every other
report writes `.toFixed(2)`; this one does now. Caught by downloading the file,
not by a type.)*

**«موافقة البائع» was «الموافقة».** The stage is the seller's approval — the
order is created and waits for them — and a bare «الموافقة» does not say **who**
is being waited on, which is the first question asked about an order stuck
there.

**And «فلاتر».** The tabs ask "which stage"; the operator also asks "what came
in this week" and "what is in Jeddah". A GET disclosure, like `A16`'s, filtering
**in the query** — filtering after the fetch would let `take` cut before the
filter and show a slice that looks smaller than it is, which is a rule already
written in that file. Walked: all cities 11 orders, Jeddah 2.

Measured after: **77٪ → 100٪**.

### 40a · 35 — `A27` and `A22`: numbers we had, and an order nobody stated

`A27` read **73٪** and `A22` **73٪**.

- [x] **«مبيعة — إجمالي» and «متوسط أيام البيع».** Both were computable from
      what is stored and neither was asked for. The average is measured **to
      the close, not to today**: a listing sold after a month stays a month
      old, and measuring to today raises the average as time passes over what
      has already sold — so the market looks like it is slowing while it sits
      still. `null` when nothing sold has both dates, because a zero here reads
      as "sells the same day".
- [x] **«يتابعون».** An upcoming auction has no bids, so a row reading «لا
      مزايدين · لا مزايدات» says nothing about whether it is awaited. Watchers
      are the people who favourited the listing — **the ones
      `remindClosingAuctions` already notifies** — so the screen counts exactly
      who will be told. Written as the design writes it, a verb not a noun
      («٤٢ يتابعون»), with the singular and dual inflected properly.
- [x] **The sort order is stated on both.** `A27` has been newest-first and
      `A22` soonest-closing since they were built, and neither said so — the
      reader takes the first row for the most important rather than the newest
      or the most urgent. It is a description, not a control: a second ordering
      is a product decision, and a control with one option is a dead button.

`أنشئ مزادًا` is left asked: a seller creates an auction in the wizard, and an
admin creating one is publishing on someone's behalf — the same question as
A17's `نزاع جديد`.

Measured after: **A27 73٪ → 100٪ · A22 73٪ → 91٪**.

### 40a · 34 — `A18` identity, where the reviewer decided with nothing to compare

`A18` read **75٪**. Three of its four signals are the review dialog's own
contents, behind «راجع» — walked, seen, listed.

The real finding is inside that dialog: it showed the name, the phone and the
method, and **nothing to compare them against**. The design's note under
«البيانات المُدخَلة» is entirely about matching the bank account against the
identity, and the reviewer had to open the customers screen to do it — or
verify without doing it, which is the comparison the queue exists for.

- [x] The bank and the IBAN's **last four** are shown (enough to match, not
      enough to transfer). The ID number stays out: revealing it is a separate
      act with a written reason, and every look is logged.
- [x] Pending accounts are seeded with a bank and an IBAN. They had neither, so
      the block could not render in any environment — «ما لا يُزرع لا يُرى».
- [ ] **One field the design's note needs does not exist.** It explains
      comparing the *account holder's name* at the bank with the name on the ID;
      `User` holds the bank and the IBAN and no holder name. The note is not
      written on the screen — a sentence explaining a comparison whose other
      half the screen does not hold sends the reviewer hunting for data that is
      not there. Collecting it is a question for the designer; it is the core
      name-mismatch check in KYC.

*(The first draft labelled the bank's name «اسم حساب البنك» — a label promising
the holder's name over «البلاد». Caught by opening the dialog, not by a test.)*

Measured after: **75٪ → 92٪**; `وثّق المحدَّد` stays asked, not built.

### 40a · 33 — `A19` and `A12`: a parameter the route accepted and nothing sent

`A19` read **64٪**. Three of its four signals are the feature editor's own
fields, behind «تعديل» — the design stacks the editor under the table the way
mocks do. Walked, seen, listed.

The fourth was real: **`ترتيب العرض`**. `Feature.sort` has existed since the
schema, indexed `[group, sort]`, and the `PATCH` route **accepts `sort`** — and
nothing ever sent it. So the order of features inside their group was whatever
the seed wrote, with no way to change it; and that order is read in three
places (the search filter, the car page, the trim editor), where "the important
one first" is a content decision, not decoration.

The editor has the field now, and saving it reorders the list — walked in the
browser and put back afterwards, since a seeded row is shared data.

### `A12`: the import lives where the import happens

`A12` read **67٪**, wanting `استيراد CSV` in the brands header. **The importer
creates models and trims, not brands** — a brand is curated with its logo, slug
and ordering, and a file that invents one produces a brand with no logo in the
search filter, which is why the importer answers `BRAND_NOT_FOUND`. So the
button points at the door that exists (`/admin/catalog/models`) rather than
promising a second one.

`الفئات (Trims)` got its parenthetical back: the rule in this repository is
that the Latin term **moves, it is not deleted** — and it had been applied to
one card and dropped from this one, which reads as an oversight rather than a
decision.

Measured after: **A19 64٪ → 100٪ ⚠ · A12 67٪ → 100٪ ⚠**.

### 40a · 32 — `Wt` and `Wi`: views that had no week, and a garage nothing pointed at

`Wt` read **60٪** and `Wi` **67٪**, and both were missing the same button.

### «مشاهدات هذا الأسبوع» is computed now, not renamed

The card read «المشاهدات» with a comment explaining why: `Listing.viewCount` is
cumulative with no time series, so the design's weekly window could not be
computed, and a label promising a window that is not measured is worse than a
broader number. That reasoning was right — and the answer was to build the
window, not keep renaming the card.

`ListingViewDay` holds one row per listing per day it was seen, written beside
the cumulative counter, and keyed on the **Riyadh calendar day**: two views
either side of midnight are two days, and dividing elapsed hours would make them
one day that shifts with the hour you ask.

**Both numbers are shown, because either alone misleads.** A large total over a
quiet week means a listing that died; a strong week over a small total means one
that has just started being seen. The seller prices and times on the second, and
the screen had only the first.

- [x] Tested by **crossing** the window — a row eight days back must not count,
      a row today must. Removing the date filter fails it.
- [x] The seller's own views are still not counted, and that is tested too.
- [x] Seeded with the week's share spread over seven days, heaviest today:
      otherwise every seller reads «مشاهدات هذا الأسبوع ٠» above a total in the
      hundreds — a contradiction in one row, read by the person it is about.

### «أضف مركبة»

`Wi` ends with it in the design — register your vehicle and a service reaches
it without re-entering the brand, model and year every time. **The garage was
built** (`/account/vehicles/new`) and nothing on the services page pointed at
it. `Wt` gets the design's own word for its action, and the garage screen's
«أضف سيارة» becomes «أضف مركبة» so the product says one thing.

Measured after: **Wt 60٪ → 100٪ ⚠ · Wi 67٪ → 100٪ ⚠**.

### 40a · 31 — `Wc` the car page, where the measure kept landing on the wrong car

`Wc` read **56٪** and the screen was essentially complete. Every missing signal
was the measure looking at a car in a state the design does not draw.

- `الأمان · الراحة · التقنية` are the feature groups, behind the «المميزات»
  tab — **and the design has that same tab bar** (المواصفات · تقرير الفحص ·
  المميزات · تاريخ المركبة · وصف البائع), showing all their contents stacked
  the way mocks do. Walked and listed under `BEHIND_CLICK`, as is `· من
  البائع` in the history tab.
- `قدّم عرضك` appears only on a negotiable listing, and `التقسيط` only above
  the financing floor. The audit was taking the first unreserved car out of an
  **unordered** result set — so one run met twenty direct listings and another
  met a negotiable one, and the figure moved between runs without the build
  changing. It now asks the search for the state it measures:
  `?type=NEGOTIATION&financing=true`.

### And the reserved-detector was matching every page

Normalising «طلبٌ قائم» (this morning's fix, so the tashkeel decision would
stop hiding reserved cars) made it match **every** car page — because an FAQ
answer on each one reads «بعد القبول يصير الطلب قائمًا», and the normalised
needle sits inside it. Every candidate was skipped as reserved and the tool
fell back to a hard-coded reference, which is why `Wc` was being measured on a
28,000-riyal direct listing.

The marker is the reserved banner's own sentence now — «محجوزة بطلب قائم». The
rule was already written in this repository: **a short needle is a trap for
everything that contains it**, and it had already cost a measurement once
(«رمز التحقق» swallowing «أرسل رمز التحقق»).

Measured after: **56٪ → 100٪**, tree **85٪**.

### 40a · 30 — `Wa` the home page, and an electric car that could never be seeded

`Wa` read **62٪** — the screen every visitor lands on first.

### Not one electric car could exist in any environment

The popular-search chips are derived from stock, and the fuel chip read
«هجين». The catalogue holds **24 electric trims**; none could ever be seeded,
because the seed's filter for "a trim with enough data" required an engine
displacement — and an electric car correctly has none. A condition written to
exclude incomplete rows was excluding **a whole category whose data is
complete**.

Its reach is wider than the chip: the fuel filter on search could never return
an electric car either, in dev or staging. One clause, and the segment appears:
8 electric listings, and the chip row now reads exactly as the design does —
«كامري · باترول · أقل من ٥٠ ألف · كهربائية · مزادات اليوم».

### «مزادات اليوم» now opens auctions that close today

The chip linked to all auctions and was labelled «المزادات». Naming it "today"
without filtering would promise what it does not show, so the auctions page
takes `closing=today` — a **calendar** day in Riyadh, not twenty-four hours,
because twenty hours may or may not cross midnight and the same auction would
read «اليوم» or «غدًا» depending on the hour you asked. Walked: 13 cards
without it, 7 with.

### And every auction card said «سعر الافتتاح» over seventeen bids

`AuctionRail` renders the top bid and falls back to the opening price when
there is none. The bids are in the database — ten to seventeen per live auction
— and the home query wrote **`highestBid: null` by hand**. So the number that
says an auction is alive never appeared on the busiest screen in the product.
Four cards now carry it.

- [x] `عندك استفسار؟` — the support block the design ends the page with. A
      visitor who finds no channel on the first page they see leaves; they do
      not hunt the footer. Channels come from `/admin/contact`, and what is
      unset is not drawn — a WhatsApp link with no number opens an error.
- [ ] **The opening hours are not written.** The design states them («السبت
      إلى الخميس ٩ص–١١م»); there is no settings field, and a fixed sentence
      about support hours promises staffing nobody can change without a
      deploy.
- [x] The support numbers are seeded in `seed.ts`, **not** in `reference.ts`:
      reference data reaches production, and an invented support line on a live
      site is worse than none — someone calls it. The owner sets the real ones
      before launch.

Measured after: **62٪ → 100٪**. And `Wk`, the auctions index, 67٪ → 100٪: the
list has been ordered by soonest-closing since it was built and never said so,
so the reader saw an order without its rule and took the first card for the
most important rather than the most urgent.

### 40a · 29 — `A5` customers: three metrics, and a denominator that would have lied

`A5` read **64٪**, missing three figures the design puts above the table:
average customer value, average deals per customer, and the verification rate.
All three are computable from what we already store — the screen simply never
asked.

**The denominator is the whole decision.** «متوسط قيمة العميل» divided by
*registered users* measures conversion, not value: a thousand new signups halve
the number without anyone's buying behaviour changing. It is divided by people
who have **completed a purchase**, and the count of them is printed underneath,
so the figure is never read against an audience it was not computed on.
`tests/customer-value.test.ts` proves it by creating a user with no orders —
the verification rate moves and the average does not. Switching the
denominator back to all users fails it.

**And «قيمته» is our commission, not the car's price.** The design's own
figures give it away — «٩٨٠ ر.س» average, «٢٬٤٦٠» for a buyer with three deals
— those are commission numbers. Summing what a buyer paid would measure volume:
someone who bought one car at 100,000 and someone who bought ten at 10,000 are
identical by volume and very different to us.

- [x] `تصدير CSV` existed but read «تصدير العملاء وسلوكهم». The design puts
      the same words in every list header, and the operator learns the button
      by its label; the report name moved to `title`.
- [x] `شريحة جديدة` opens the segment builder **pre-set from the current
      filter** where one maps — dealers, individuals, verified, unverified,
      sellers, buyers. Where none maps («متكرّرون» · «موقوفون») it opens empty,
      because the design's «يمكن حفظ أي فلتر» cannot be honoured for filters
      that are not in the rule vocabulary.
- [x] `isVerified` is now a segment rule — the missing vocabulary word, and the
      most useful marketing audience in a market where buying requires
      verification: «أكمل توثيقك» goes to its negation. The screen could filter
      them and nothing could address them.

Measured after: **64٪ → 100٪**.

### 40a · 28 — `A16` the audit log: a sensitive lens, an export, and a window

`A16` read **57٪** with three lenses — money, identity, permissions — all
defined by action **prefix**. The design's fourth, «حسّاسة», is the narrowest
of all: 31 of 4,280, below both money (146) and identity (89). So it is not a
union and not a prefix. It is what an auditor opens first.

The criterion written into the code: **irreversible against a person, money
leaving the platform, or a change to who can do what.** `escrow.settled` is in
and `deadline.changed` is not (no money moves); `identity.view` is in and
`identity.verified` is not (a decision can be reviewed, a look at someone's
document cannot be taken back).

- [x] A list of exact action names, not a prefix — and
      `tests/audit-lenses.test.ts` requires every one to have a label, so a
      renamed action breaks the test instead of silently dropping out of the
      lens. Proved by renaming one: it fails.
- [x] The lens condition is written **once** and read by both the list and the
      counters, which were translating it separately.
- [x] The page's own hand-written list of accepted `?lens=` values is derived
      from the domain now; a lens added there was previously rejected here and
      silently read as «الكل».

### The export goes through the report catalogue, not beside it

`تصدير CSV` is an `audit_log` report with `audit.view` and `personal: true` —
so the same guard, the same row limit, and the same rule that **records who
exported how many rows**. The file carries actor names and IP addresses; that
is an export of people's trail, which is exactly why the customers report sits
behind `users.viewIdentity`. Downloaded and checked: 180 rows, before/after
columns serialized.

### And «تصفية متقدّمة» is a GET form

A date window and an action fragment, combined with `AND` — a URL that can be
copied and sent, which is what someone handing a reviewer a specific window
needs. Walked: `action=escrow` with August returns the one release; moving the
window to September returns nothing.

**«تمس بيانات شخصية» reads 0, and that is left alone.** Nothing in the seed
writes `identity.view`, and planting a fake record of someone opening an ID
document is the one place a fabricated row is worst.

Measured after: **57٪ → 100٪** ⚠ (7 signals).

### 40a · 27 — `A8` notifications, and 55 templates where not one named the car

`A8` read **59٪**, and measuring its missing copy turned up something larger
than the screen: **not one of the 55 notification templates names the
vehicle.** All 55 use `ref` — an opaque code. A buyer with offers on two cars
received «قبل عرضك» and could not tell which, and that is the one notification
followed by a payment deadline: whoever waits to find out can lose the car.

- [x] `offer.accepted` carries `{vehicle}` — the design's own copy — in
      subject, body and SMS, with the title snapshotted into the payload at
      accept time. Brand, model and year do not change after publication, so a
      snapshot is safe where the duplicate-image evidence was not.
- [x] By **migration**, because templates are reference data: the seed file is
      applied to an empty database once, so an edit there reaches a fresh
      environment and never production. Guarded on the old text, so a template
      an operator has edited is left alone.
- [ ] The other 54 still name no car. Listed here rather than swept: the
      payload must be filled at each writer, and the entity key is not uniform
      (`Listing` carries an id, `Order` a ref). Worth doing as its own pass.

### And the send log says who, where the cards say how many

`سجل الإرسال` reads `Notification` rows with the recipient, the time, and
whether they read it. It is **not** the push log: that one records what left
for a device and is empty without the app, while this records what reached the
bell and is written for real users today. «قرأه» is as close to *delivered* as
we can honestly print, since no provider returns a receipt.

**Three signals stay counted as missing**, with reasons in
`DESIGN-DEVIATIONS`: both delivery rates need a provider that is not connected,
and «اختبار إرسال» needs a recipient an admin does not have — an `AdminUser`
has no bell and no device. A fourth, `+ إشعار جديد`, is not built on purpose: a
template keyed to an event nothing emits is a row that can never be sent.

Measured after: **59٪ → 75٪**, and the remainder is capability, not conformance.

### 40a · 26 — `A20` payment routing, and reference data that never reaches a live database

`A20` read **57٪** and is one of the better-built screens in the panel: routes,
gateways, switch requests and approvals all work. What it was missing was what
an operator reads **before** switching a gateway.

- [x] **What each purpose does with money**, under its name — «حجز ثم إفراج
      بعد نقل الملكية» · «تحصيل فوري بلا حجز». Not decoration: a gateway with
      no hold suits a wallet top-up and cannot carry an escrow, and that is the
      first thing the person switching needs to know.
- [x] **What each gateway accepts** — «مدى · بطاقات · تحويل». A bank-escrow
      gateway takes transfers only, so routing wallet top-ups through it means
      the user transfers by hand.
- [x] The switch log was built, read by `routeChanges()`, and **rendered under
      a different name**. It is «سجل التبديلات» now, the design's words.

**The methods are reference data, so they reach a running database by
migration.** `payment-gateways.json` is applied with `createMany` +
`skipDuplicates` — an empty database, once. A key added to `capabilities` would
reach a fresh environment and never reach production, leaving the line missing
there and nowhere else. The migration merges with `||` so an operator's edit is
not overwritten, and skips rows that already carry the key.

*(Applying it by hand first split the file on `;` and skipped every statement
that began with a comment — the first gateway silently got nothing. Comments
are stripped by line now, not by the statement's first characters.)*

### Two header buttons that cannot be built as drawn

`اطلب الموافقة الثانية` asks for a quorum **the owner cancelled**; gate 19
refuses the text and a migration set the stored requirement to one. `اربط
بوابة` would insert a gateway row with no code adapter — which this very screen
marks `بلا وصلة`; credentials belong to `A11`. Both are recorded in
`DESIGN-DEVIATIONS` and subtracted from the denominator.

Measured after: **57٪ → 100٪**.

### 40a · 25 — `A9` campaigns, where a campaign could not be created and a scheduled one never sent

`A9` read **56٪**. Segments could be built and saved, sending was built with
every guard it needs — consent, 72-hour cooldown, four-a-month cap — and
**nothing between them created a campaign**. What the screen showed was what
the seed had planted.

Worse: `CampaignStatus.SCHEDULED` and `scheduledAt` have existed since the
schema was written, and **no job ever sent them**. A campaign scheduled from
anywhere would have waited forever while the «مجدولة» tab counted it. That is
the twelfth time this repository has found a value with a writer and no reader,
or the reverse.

- [x] `createCampaign` — draft or scheduled, writing `AuditLog`, with a route
      behind `notifications.manage` and a form in the header the design draws.
- [x] `sendDueCampaigns` in the scheduler, using `sendCampaign` itself so the
      rules cannot fork. The actor recorded is **whoever scheduled it**; a
      campaign whose scheduler no longer exists is cancelled with an audit row
      rather than sent unattributed.
- [x] The seed plants a scheduled campaign, now that one can be sent.
- [x] Walked: created a campaign from the form, saw it in the table as a draft
      with its channel and segment, then deleted it.

**The timing control says what it cannot do.** The design offers «أفضل وقت لكل
مستخدم» beside «وقت محدّد». The first needs the hour each account opens the
app and no app sends that, so the dialog states the reason instead of offering
a control that does nothing. The second works end to end.

### And a failing test was quietly putting real users in cooldown

Walking the screen after a deliberately-broken test run showed every segment
reading «سيصلهم فعلًا ٠». Nothing was wrong: the failed run had left a *sent*
campaign behind, and its `CampaignSend` rows put nine seeded users into a
72-hour marketing cooldown. `global-setup` cleaned ad campaigns but not
marketing ones.

- [x] Marketing campaigns, segments and their sends are cleaned in
      `global-setup` like every other entity a test creates.
- [x] The screen now carries the design's fourth line, «خارج فترة التهدئة» —
      which is exactly what would have told me this in one glance, instead of a
      zero with no reason. Tested by **creating** the cooldown and measuring
      the gap, not by hoping one existed.

Measured after: **56٪ → 100٪**, tree **80٪**.

### 40a · 24 — `A35` team, where every missing signal was a decision already taken

`A35` read **56٪**, and I was two files into building «أضف عضوًا» when I read
the register. All four of its missing signals are **recorded deliberate
deviations**: two-factor auth was cancelled by the designer, members are
provisioned from `ADMIN_TEAM` at boot so a stolen session cannot mint a second
account, and there is no `Invite` model so a «دعوات معلّقة» card could only ever
read zero.

So the work was not on the screen. **The measure was reading decisions as
gaps** — the fourth time, after `A10`, `A3` and the terminology map — and this
time it nearly sent me to build the one thing a security decision says not to
build. The provisioning question is for the designer, not for me to reverse,
and it is raised below.

- [x] `DECIDED_AGAINST` subtracts those signals per screen, by **exact** match,
      and prints them with their reasons in the report footer so the list
      cannot be a hiding place.
- [x] `tests/design-deviations.test.ts` refuses any entry that
      `DESIGN-DEVIATIONS.md` does not name — the exclusion list and the
      register cannot drift. Proved by adding an invented exclusion: refused.
      It caught a real gap on its first run: the register named the design's
      other wording, not the signal the screen actually prints.

The one real gap: the card read «أعضاء» over a count of **every** member while
the design reads «أعضاء نشطون». True today, since nothing writes a non-active
status — and false on the first day someone is disabled, which is exactly the
day the question is asked. It counts `status: 'active'` now.

Measured after: **56٪ → 100٪** on five signals, so marked ⚠.

### And the account home was being measured on its poorest user

`Wf` read **56٪** against 89٪ a day earlier, and nothing in the product had
changed: the audit signs in as whichever seeded account draws the most of three
marks, and the score was a plain count. An account with orders and an
inspection report ties one with incoming offers — and the first one found wins.
Four of `Wf`'s five "missing" signals come from the offers block alone.

Checked rather than assumed: signed in as the seller who actually has a pending
offer, and the page renders «سعرك المعلن», «اقبل», «عرض مقابل» and «العروض
الواردة». The screen was never the problem.

- [x] The offers block is worth two points, and the scan runs to twelve
      accounts. `Wf` reads **89٪** again, and the tool states plainly that the
      richest account reaches 3 of 4 — so the remaining gap is seed data, said
      out loud rather than scored silently.

### 40a · 23 — `A15` listing review, and evidence gathered differently from how the flag was raised

`A15` read **56٪**. Its own subtitle in the design is «القرار بدليله» — the
decision with its evidence — and the screen had the decisions and none of the
evidence.

### The evidence was searched differently from the way the flag is raised

A listing enters the queue when `findDuplicate` finds another seller's image
within **Hamming distance 6** of **any** of its images. The admin screen built
its evidence by comparing the **first** image's fingerprint for an **exact**
match. Two divergences from one rule, and both fail in the same direction: a
listing flagged at distance 3, or flagged by its third photo, showed the
reviewer a tag reading «صورة مكررة» with **no match, no reference and no
image** — a decision asked for on the name of a flag rather than on what
raised it.

- [x] One module owns the rule now (`src/lib/domain/duplicate-images.ts`), free
      of `sharp` so the admin can import it, and the **nearest** match is
      returned rather than the first — the reviewer judges the strongest
      evidence standing.
- [x] Proved by breaking it back: restoring exact-match-on-first-image fails
      three of the six new tests. The threshold is tested **by crossing it** —
      distance 6 accepted, 7 refused.

### The report count was read with a key the writer never uses

`reportListing` resolves its target by **id** and stores that id; the review
evidence counted reports `where targetId = listing.ref`. So the count was
**zero for every user-reported listing in production**, and the panel told the
reviewer «بلغ عنه مستخدمون: لا بلاغات» about a listing a report had put in
front of them. Found by opening the screen — every number was arithmetically
right and every sentence contradicted itself.

### And the seed wrote flags with nothing behind them

All four queued rows said «رُشّح لكذا» and their evidence said «ولا كذا»: no
report row, no market statistic, no matching image, and a «حساب جديد» aged 128
days. The product only ever writes `reviewReason` *because* the cause exists,
so a seed that writes it by hand produces a state the product cannot reach. The
seed now creates the cause for each — and seeds **all four** reasons, where it
had written `DUPLICATE_IMAGE` for every row, leaving three of the four tabs at
zero and three of the four evidence shapes unopened in any environment.

The fourth queued row is taken from the suspended ones, not the published ones:
reducing the published count moves the landing-page threshold and every market
counter.

### Smaller, in the same screen

- [x] Wait times were divided by 60 and passed to `<Duration hours>`, which
      says «أقل من ساعة» below one — so a queue entirely in minutes read as
      four identical rows. The component escalates from minutes by itself.
- [x] «ارفض وأوقف الحساب» opened a dialog titled «إعادة الإعلان»: two
      contradictory sentences in a window that suspends an account. The intent
      is carried now, and the title and primary button follow it.
- [x] `Button` gained `dangerOutline` — the design draws the heaviest action as
      a red **edge**, not a red block. `A18` draws «ارفض بسبب مكتوب» the same
      way.

Measured after: **56٪ → 100٪**, tree 75٪ → 77٪.

### Two measuring instruments repaired on the way

**The audit knocked on the wrong door.** Its default was port 3002 while this
project's own `.claude/launch.json` starts the server on 3000, so it printed
«٠/٠ — ٠٪» — a line that reads as a result and is the absence of one. It reads
the port from the project's configuration now.

**And the decision-29 leak test was green and blind.** It compared every public
value against **every** listing's secrets, so one listing's public `askPrice`
matching another's `minAcceptPrice` (which is 92٪ of ask) raised a false alarm.
Scoping it to the row's own secret then made it **vacuous**: all twenty rows it
examined had no secret at all — `minAcceptPrice` belongs to negotiation
listings and a reserve to auctions. It now selects rows that hold a secret,
counts them, and refuses to pass on a zero denominator. Proved by leaking a
reserve price into `highestBid`: it names the field and the reference.

### 40a · 22 — `A6` service requests: a queue with no action, and a metric with no timestamp

`A6` read **53٪**. Its own subtitle is «تنفيذ وإسناد لمزوّد» — execution and
assignment — and **the admin could do neither**.

### The queue had no action at all

`RequestsQueue` was read-only cards. A provider picks work out of *their own*
queue; nothing in the admin panel assigns. So a request nobody picks up sits at
«بلا مزوّد» until its deadline passes while the operator watches. The design's
table has «أسنِد» per row and «إسناد جماعي» in the header; neither existed.

Assignment now exists, single and bulk through one route — bulk is a list of
one, so the two cannot drift apart in eligibility. **Eligibility is the
provider-queue rule itself**: the provider's type matches the service and their
cities cover the request's city, exactly what decides whether they can see it at
all. A second copy would let the panel assign work the provider never sees.

**The bulk path writes one request at a time.** The rule in this repository is
explicit: a function that walks a set and touches work does not write in one
statement. A single `updateMany` would assign a hundred requests on a bad line
*and skip eligibility entirely*. One failure does not stop the rest, and the
report names each refusal with its reference and reason — not «7 of 10».

Walked end to end: a shipping provider on an inspection request is refused with
nothing written; a mixed batch assigns the eligible one and names the missing
reference and the already-assigned one. Audit row, notification and status all
landed, and the walked seed row was put back.

### Two of three metrics measured something that was never recorded

The design's card row wants «إيراد الخدمات», «متوسط زمن التنفيذ» and «التزام
المزوّدين». `ServiceRequest` carried *when requested* and *when due* and **no
completion time at all** — so two of the three had no source. `completedAt` is
added and written at `provider-queue`, the single door for provider
transitions.

The turnaround figure is a **median**, not a mean: one request stuck for a week
drags the mean of twenty done in hours, and the number then describes nobody.
SLA adherence counts completed-with-a-deadline as its denominator — an open
request has not broken a promise yet, and counting it would drop the figure
every time the queue fills.

### And I nearly shipped a second money rule

I wrote «إيراد الخدمات» as a sum of `adminFee`. It read **zero** — no service
has a fee enabled — while the finance screen reads a real number from the same
money, because the tax rule makes the platform the supplier, so the whole value
is revenue and the provider's price is cost of sale. Two screens, two numbers,
one amount. The rule now lives in one function both call, the way `adRevenue`
already works for ads, and both read the same Riyadh month.

**A6: 53٪ → 87٪** — the remainder is the service's own name («نقل الملكية» vs
the markup's «نقل ملكية», operator-editable and better Arabic as it stands) and
the service rating, which has no source anywhere and is the question already
open for `Wx` and dealers.

### Two production defects found while deploying this

Neither is in the product, both hide themselves, and both are now fixed in
`scripts/ops/deploy-production.sh`:

- **The disk filled and the build died** with `failed to extract layer … write`
  — a message that accuses a Docker layer, not the disk. Twenty superseded
  images at 1.57 GB each had accumulated with nothing pruning them: 98% full,
  1.4 GB free. The deploy's own guard held and the old container kept serving.
  Cleaned to 53%, and the script now prunes after a successful health check,
  keeping the running image and the previous one — the rollback target.
- **A failed build made the next deploy report success.** `git reset --hard`
  runs *before* the build, so a failed build leaves the checkout at the new
  commit while the old container runs. The next run compared the **checkout** to
  `origin/main`, found them equal, printed «لا جديد» and **exited zero**. I ran
  it twice and read "nothing new" both times while production sat a task behind.
  It now compares the **running container's tag** — the only thing that says
  what visitors are served.

### 40a · 21 — `Wn` `Wu` `Wv` `Wz`, four thin screens and what a 2-signal denominator hides

Four screens at **50٪**, each on 2–4 signals, all carrying ⚠ — the percentage is
read, not built on.

### `Wz` 50٪ → 100٪: measured on the wrong page, and a feature with no data

The audit pointed `Wz` at `/ar/browse/riyadh/toyota` — the **brand** page. Its
markup draws the model: breadcrumb «… › تويوتا › **كامري** › الرياض», heading
«سيارات تويوتا كامري مستعملة في الرياض», and the trim chips. Pointed at the
model page, the only missing signal was «كل الفئات».

The chips are now built from the listings on that page, not the model's
catalogue — a model with twelve trims and two listings in Riyadh would otherwise
produce ten chips opening on zero, which is the filter lesson already recorded.
They are hidden below two trims: «كل الفئات» plus one trim is a division with
nothing divided.

**And the seed could never produce two.** The first three listings are pinned to
one city and model on purpose — the landing page needs three to be generated at
all — but they were also pinned to `buildableTrims[0]`, the same trim. So the
chips were unreachable in every environment. Three Camrys in Riyadh all badged
"LE" is not a realistic shape either; they now cycle through that model's trims.

### `Wu` 50٪: built in three wordings, measured against one

«في مزاد · ينتهي غدًا» is now built — and the guard is the recorded one: an
auction still `LIVE` whose time has passed is not live, so no badge and no
negative duration. The wording is chosen by **calendar days in Riyadh**, not by
dividing a duration: twenty hours may or may not cross midnight, and «ينتهي بعد
يوم واحد» is clumsy Arabic where the design writes «غدًا».

The design's signal is one text node carrying that day word, so it matches only
when the measured account's saved auction closes tomorrow exactly. **The seed
was not bent to produce that** — seeding to satisfy a tool corrupts the data.
What was seeded instead is representative: half the buyers who have favourites
now have one on a live auction, so the badge is visible in any environment in
whatever wording the dates produce.

### `Wn` and `Wv`: two signals with no source

- **`Wn`** wants a support ticket «مرفقة بطلبك تلقائيًا». There is no ticket
  system at all — no model, no route, no admin queue; `/help/contact` is a list
  of channels, not a form. Whether to build one alongside disputes is a product
  decision, so it is a question. Disputes already cover anything with money
  attached; a ticket would cover questions without.
- **`Wv`** wants «أضف رصيدًا» and «سحب إلى الآيبان». `WALLET_TOPUP` is a routed
  payment purpose with no screen, and there is **no withdrawal path anywhere**.
  The screen says so in words rather than shipping two buttons that error after
  the press. Already a recorded deviation; it stands until the gateway keys land.

### 40a · 20 — `A13` models and trims, and a catalogue maintained one row at a time

`A13` read **50٪** on four signals (thin, ⚠). Missing: «الشجرة» and
«استيراد CSV».

### The tree column had no name

The design labels the left column «الشجرة». Built, it was a brand picker with a
list of names and a number beside each and no heading — nothing said the names
were that brand's models, or that the number was its trim count.

### The catalogue is 42 brands, 303 models, 360 trims — all added one at a time

There is no import anywhere in the product; CSV existed only for export.
Onboarding a brand's thirty models is a day of clicking.

`POST /api/v1/admin/catalog/import` takes the file in two phases through the
same reader, so what the preview showed is exactly what gets written:

- **preview** reports what `D3`'s own vocabulary names — rows read, new models,
  new trims, «مكررة (موجودة)», the columns matched, the columns ignored, and
  every rejected row with its line, column and value.
- **commit** writes only what is missing, through `createModel`/`createTrim`, so
  validation is the one the screen uses and every created row lands in
  `AuditLog` with who imported it.

**It never updates and never deletes.** A trim's specs fill in every listing
published against it, so an import that updates would change the specs of three
hundred models from one file without saying so. Existing rows are counted and
left alone.

Details that decide whether this is usable or a trap:

- The parser is quote-aware, not `split(',')` — «مرسيدس-بنز، الفئة S» is a real
  trim name. It strips the BOM Excel writes, or the first column arrives as
  `﻿brand` and the error says "unknown column" about a correctly spelled one.
- Accepted enum values are `Object.values(Enum)`, never a hand-written list —
  `ALL_SPECS` already shipped with two values that did not exist and missing two
  that did.
- The downloadable template is built from `IMPORT_COLUMNS`, so it cannot drift
  from what the reader accepts. It lives in the route, not the domain: its
  example row is Arabic by nature («كامري»), and the domain writes no Arabic.
- Writing requires `canWrite`, not merely the permission to open the screen — a
  reader who imports three hundred trims is not a reader.

Walked, not only unit-tested: a file carrying all five rejection shapes plus a
quoted comma, an existing row and a new one. Preview read 8 rows, named `notes`
as ignored, and listed each rejection with its line. Commit created 1 model and
2 trims and skipped the existing one; **re-running the same file created nothing
and skipped all three.** The rows it made were then deleted — a manual walk is a
run without an `afterAll`.

**A13: 50٪ → 100٪** (thin denominator, ⚠).

### 40a · 19 — `Wx` service checkout, and a screen measured signed-out that is drawn signed-in

`Wx` read **40٪** — the weakest screen in the tree. Three of its five signals
missing: «ادفع واطلب الفحص», «ما يشمله الفحص», «الموقع والموعد».

**All three exist.** `RequestService` has the vehicle picker, the location and
time block, and the pay button carrying the total. Fetched with a session they
are all in the markup. The audit sends the user cookie only to paths under
`account|sell|orders|inbox|checkout`, and `Wx` lives at `/ar/services/{key}` —
public by path, **drawn inside the account**: the design shows a signed-in name,
a chosen vehicle, a location and a time.

The prefix rule itself is right and was written from a real failure (sending the
cookie everywhere hid «تسجيل الدخول» on the home page). It errs in the other
direction here, so screens whose designed state is signed-in are named
explicitly — and the list prints in the report footer, like `BEHIND_CLICK`, so
it cannot become a hiding place.

### What the thin denominator could not see

Five signals is below the floor, so the percentage carries ⚠ and is not
something to build on. Reading the design against the screen instead:

- **The breadcrumb skipped the category.** Design: «الخدمات › قبل الشراء ›
  فحص فنّي معتمد». Built: two levels. `service.category` was already loaded and
  labelled; the middle level is now a link to the filtered index, and the filter
  was walked to confirm it returns that category and not everything.
- **The provider line had no record.** Design: «٤٫٦ من ٥ · ١٬٢٤٠ فحصًا · التزام
  ٤٨ ساعة» — only the commitment was built. The count has a real source
  (requests completed under that provider) and is now shown, counting `DONE`
  only: an in-flight or failed request is not a record that reassures someone
  about to pay 517 riyals. Zero is omitted rather than printed — «٠ خدمة منجزة»
  under a provider's name reads as an accusation when they simply have not
  started.
- **The rating has no source at all** — no column, and nothing anywhere asks a
  customer what they thought. It is the same question already open for dealer
  ratings (`ratingAvg` read on four screens, written by nothing), so both go to
  the owner as one decision.
- **«الإلغاء مجاني حتى ٦ ساعات قبل الموعد» was not written.** There is no
  customer cancellation in the product: `ServiceRequestStatus` has no
  `CANCELLED`, no route, no screen; the only refund path is for a request the
  *provider* failed. Cancellation terms are a business rule, so it is a question,
  not an implementation — and the line stays off the screen until it is answered.
  A promise of free cancellation with no button is worse than its absence.

**Wx: 40٪ → 60٪**, the remaining two being the template's generic headings
against the design's inspection-specific wording.

### 40a · 18 — `A30` ad slots, a cap nobody enforced, and a flag that denied live ads

`A30` read **63٪** (not the 25 the stale table said). Three signals missing:
«معاينة في التطبيق», «السقف في الجلسة», «يُفرَض في الخادم».

### The screen said there were no ads on the home page. There were two.

`HOME_ADS_SERVED` was a hand-maintained `false`, and the cap card read it to
tell the operator «قاعدة — ولا إعلان في الرئيسية بعد». Measured: the home page
renders `home_banner` and `brand_featured`, both with live campaigns, both with
click routes in the markup. The flag was written when the home surface did not
exist and was never flipped when it was built.

Deleted, not corrected. It is now a query — is there a live campaign on an
active home slot — so there is no copy to drift. **ما يحتاج حراسةً يُبنى
محروسًا.** The test that guarded it was
`expect(stats.homeServed).toBe(HOME_ADS_SERVED)`: a flag checked against itself,
green while it lied. It now crosses the condition in both directions.

### The cap was a constant nothing read

`HOME_SESSION_AD_CAP = 4` existed with its own comment saying the screen would
read it «وسيقرؤه مسار العرض حين يُبنى». The serving path was built; the cap was
not wired. The design is explicit about where it must live: «٤ إعلانات كحدّ
أقصى في جلسة الرئيسية، **والسقف يُفرَض في الخادم لا في التطبيق**» — because a
client-side cap is bypassed by a reload.

A Server Component can read a cookie and cannot write one, so the enforcement
is split across two server points and the client touches neither:

- **Middleware** reads `carz_ads` and passes the remaining allowance to the page
  in a request header; the page asks `adsFor` for no more than that.
- **The impression route** increments the counter — and the count is on what was
  *seen*, not what was rendered, which is the same rule the route was built on
  (`cpm` sells impressions, not renders).

Only home slots count against it; `search_inline` and `vehicle_inline` have
their own `maxPerSession`, and folding them in would silence an ad sold under
other terms.

Walked with a cookie jar, not only unit tests: fresh session 2 ads → after three
impressions 1 → after four 0, and the counter stops at 4 rather than running
negative. A forged cookie (`-5`, `abc`, `9999999999`) cannot widen the
allowance.

### And the preview

The slot preview is real: the frame carries the slot's own aspect ratio, the
creative is the campaign the visitor actually sees (ordered by `priority` then
earliest start), and a vacant slot says so. Named «معاينة المساحة», not «في
التطبيق» — there is no app, and a phone frame drawn around it to match the
wording would be decoration that lies. Recorded in `DESIGN-DEVIATIONS.md`.

**A30: 63٪ → 88٪.**

### 40a · 17 — `A10` push, and a heading that turned four intentions into guarantees

**The table in §40a said `A10` was 25٪. Measured live it was 75٪** — the table
was taken once and rotted, and I quoted it to the owner. Re-measured
2026-11-24; the score line at the end of §40a is the stale artefact, this entry
is the measurement.

Two signals were missing: «اختبار على جهازي» and «سجل الإرسال».

### The rules block promised four guards that do not exist

A panel headed **«قواعد مفعلة»** — *rules in force* — listed seven. Three are
genuinely enforced in the domain: critical channels cannot be muted
(`setPreference` returns `CRITICAL_CHANNEL`, and `isChannelEnabled` does not
read the preference at all for them — reading and then ignoring leaves a
one-line bug able to silence everyone), marketing is off by default
(`NEVER_DEFAULT_ON`, which caught a real regression when I flipped it by hand in
a manual walk), and the text limit is measured per template.

The other four have no implementation anywhere: permission timing, auction
grouping and collapse key, deleting a device token on provider rejection, and
suppressing the push while the user is on the relevant screen. Each needs the
app or a dispatcher to FCM/APNs, and **neither exists** — `queueSend` opens the
row and `recordEvent` takes delivery back from the app, with nothing in between.

One heading made four intentions read as four guarantees. Split into «مفعلة
الآن — يفرضها الخادم» and «تنتظر التطبيق والدافع», each pending rule carrying
what it is missing.

### The preview was pinned to one template, and the list hid 43

`PushPreview` was wired to `templates[0]`, and the sort puts over-limit first,
then longest — so the operator saw whichever template was worst and could not
preview the one they were about to edit. The list under it was
`templates.slice(0, 8)` **of 51**, under a heading reading «قوالب الدفع مقيسة
بالحد». None is over the limit today, and an over-limit one would sort to the
top, so nothing was hidden — but the heading claimed coverage the list did not
show, and a truncation with no door is the shape, not the instance.

Now every template is listed in a scrolling panel and each row opens its own
preview, with the count stated. The selection is derived, never seeded from the
list — `useState(rows[0]?.key)` is exactly what gate 47 exists to stop.

### `PushSend` was written and never read as rows

Four rates read it with `count` and `groupBy`. Nothing listed the rows, so when
a user writes "I got no notification" there was no way to answer whether it was
queued, delivered and unopened, or failed and why. `/admin/push/log` is that
screen: channel by name, template by title (a key reads as code, not news), the
recipient by name or phone, status, failure reason, and the three timestamps.

It opens empty today and says why — the writer exists (`notifications.ts` calls
`queueSend` for every push-channel notification to a user with a device) and
there are no devices before the app. **The empty state was not papered over by
seeding devices**: a `DeviceToken` row means an app registered a token, and the
four rate cards already chose «لا قياس بعد» over inventing delivery data. The
table was walked with five temporary rows covering every status, screenshotted,
and the rows deleted.

### «اختبار على جهازي» cannot work, and is not hidden

No dispatcher, and `DeviceToken` hangs off `User` not `AdminUser`, so the
operator has no device to send to. Left counted as missing — the measure's own
`DEFERRED_SIGNALS` list carries a written warning about becoming a hiding place,
and a signal blocked by a missing capability is not an owner's deferral. The
reason is in `DESIGN-DEVIATIONS.md`.

**A10: 75٪ → 88٪**, the remaining 12٪ being that one signal.

### 40a · 16 — `A25` escrow, and a release that captured money without a ledger entry

`A25` read **50٪**. Six signals missing: the daily reconciliation, the awaiting
-release tab, settled-this-month, the reconciliation difference, the per-gateway
panel, and "awaiting the settlement file".

**The reconciliation already existed and was already wired.** `reconcileGateway`,
`reconcileAll`, `reconcileYesterday` (registered in the scheduler),
`listRuns`, `runMismatches`, the `ReconciliationRun` model, `ReconciliationTable`
in `A20`, an API route and a test file — all of it built. `A25` needed one
reading function (`latestRuns`: the newest run per gateway, because `listRuns`
answers "how was the week" and this panel answers "where are we now") and the
panel to show it. The status labels moved out of `A20`'s local
`Record<string, string>` into `src/lib/labels/admin.ts` with a `satisfies`
pledge, because a second copy diverges on the first change — and the designer's
word «بانتظار ملف التسوية» replaced «تعذّرت القراءة» in both.

**I destroyed that module before finding it.** The opening `git status` said
` M src/lib/domain/reconciliation.ts` and I wrote over it, assuming the file was
new because a grep had looked unconvincing. Gate 63/64 caught it within the
minute — `ReconciliationRun` suddenly had no writer and no reader — and `git
checkout` restored the committed version. The uncommitted change it carried is
gone and I cannot say what it was. **The ` M` in the status block is the whole
warning, and reading a file before writing it is the whole fix.**

### The release captured money and recorded nothing

Walking the screen, not a test, found it. `canSettle` had two conditions —
transfer confirmed, no open dispute — while the queue is assembled from orders
carrying a `HELD` **payment**. A dispute resolved by partial refund leaves the
payment held *by design* (the remainder is the seller's) and sets the escrow to
`PARTIAL_REFUND`, returning the order to `TRANSFER`. When that order reaches
`DONE` again it read as releasable.

Pressing release captured at the gateway; `applyState` then released with
`updateMany({ status: 'HELD' })`, which matched no row. So: no revenue
recognised, no capture entry, no notification to the seller — **and a settlement
statement and a tax invoice issued against revenue the ledger never recorded.**
That is the `startHold` class inverted: money leaves and the book does not know.

Closed in the three places that must agree, because a guard at one entrance is
not a guard:

- `canSettle` takes the escrow row as a **required** argument, so the compiler
  names every caller; it found four, one of which I had not seen.
- `settleableOrders()` — the scheduled job's list, a hand-written twin of the
  same conditions — gained the same clause. Without it the job would retry an
  unreleasable order every hour forever.
- `applyState` reads the escrow before updating and separates two cases the old
  `count === 0` conflated: a duplicate settlement (`RELEASED`, benign, skip) and
  an escrow that was never held (reported, order event `settle.escrow_not_held`,
  **and documents withheld** — a paper attesting to a settlement the ledger has
  no record of is worse than no paper).

### Seven tests failed, and the tests were what was wrong

All seven came from fixtures writing a `HELD` payment with no `Escrow` row — a
state `applyState` cannot produce, since it writes both in one transaction. The
shared fixtures gained the escrow; `documents.test.ts` now walks
`CREATED → PENDING → HELD → SETTLED` instead of skipping the hold.

`settlement-gateway-block.test.ts` had been patched three times for borrowing
"the first seeded order with held money" — first it became disputed, then
partially refunded, then **another test in the same run consumed it**
(`releaseConfirmedOrders` released it, correctly). Each fix added a clause to the
query. The shape was the fault: a seeded row is a shared resource, and a test
that needs it in a particular state needs nobody else to touch it. It now
creates its own order and deletes it.

### §41 leftovers, round two

Gate 19's wording list let a third form through: «واعتماد طلب **غيره**» in the
settlements footer — «غيرك» was listed, «غيره» was not. The list is now «غير»
plus its pronoun family. Then the gate was measured by breaking what it guards,
which showed its scope was `src/app/admin/**/*.tsx`: **API route messages are
`.ts`**. Widening the extension turned up three more live ones — disputes,
integrations and payment routes all telling the operator «يلزم عضو ثاني» forty
days after the quorum was removed.

Four more in `SettlementsTable` that no gate can see, because they promise a
*request* rather than a second person: the trigger button «اطلب الإفراج», the
dialog title «طلب تحويل المبلغ للبائع», the confirm button «افتح الطلب» — and
the file header comment explaining that the first press moves no money. The
dialog **body** had been corrected in §41 and its title and button had not, so
one dialog that moves a hundred thousand riyals carried two contradictory
sentences.

### And the screen was describing the wrong actor

The header said «الإفراج يقع بضغطة واحدة». True of this screen, false of the
product: `settleOnTransferConfirmed` releases automatically the moment transfer
is confirmed, and the scheduled job is a safety net. So what sits in this queue
is money whose **automatic** release did not complete, and the button is a retry.
An operator reading the old text would think they were the gate.

### Seeded so the button can be pressed

Every seeded payment was on `bank_escrow`, which has no adapter — so every
completed order was either settled or blocked as `GATEWAY_UNAVAILABLE`, and
«تنتظر الإفراج» was zero in every environment: **the screen's only action had
never been exercised.** One order is now seeded in the state the product
produces between transfer confirmation and release — payment `HELD` on the
sandbox gateway with a matching row in its own ledger (so `settle` does not
answer `HOLD_NOT_FOUND`), escrow `HELD`, sale agreement issued, no settlement
statement and no revenue recognised, since those belong to the release. Pressed
it in the browser: held fell from 241,540.91 to 143,896.87.

Reconciliation runs are seeded the same way — by calling `reconcileAll` for three
past days rather than writing rows by hand, so `sandbox` reads «مطابق» because it
really was compared, and the three gateways without adapters read «بانتظار ملف
التسوية» because they really could not be.

Two tables were leaking across runs for want of a foreign key, the same shape as
`LedgerEntry` before them: `ReconciliationRun` (twelve rows had become
twenty-one) and `SandboxTransaction`, whose surviving row failed the next seed
with a unique-constraint error that blamed the insert rather than the leftover.
Both are in the truncate list now.

**A25: 50٪ → 100٪.**

### 40a · 15 — `A3` finance, and a measure that read an owner decision as a gap

`A3` read **41٪**. Opening it: GMV with its split, net revenue with five
streams, escrow cash, subscriptions, a twelve-month chart, a revenue-mix donut,
six composite indicators, a commission simulator, **and an input panel for the
costs the platform does not know about itself**. Almost all of it built.

#### Most of the gap was the owner's own wording

The owner decided on 2026-10-11: «بعض العبارات والكلمات غير مفهوم المقصد منها
مثلًا مدرج» — the markup's investor vocabulary becomes plain Arabic, and the
table of renamings lives in `NOTES.md`. The measure knew nothing of it, so it
reported **«تكلفة الاكتساب CAC»** and **«القيمة الدائمة LTV»** as missing from
a screen that shows both under the owner's own names.

- [x] The renaming table is applied to the **design side** before comparing —
      the fourth product-wide departure, beside the rebrand, the diacritics and
      the numerals. It cannot hide an absence: the map rewrites the design's
      term to ours and then looks for ours, so a deleted card stays missing.

#### And the owner's own rule was half-applied

That decision says **«الرمز يُزاح ولا يُحذف»** — the acronym moves into the
explanation rather than disappearing, so whoever reads an English financial
report can still connect the two. It was applied to «قيمة المبيعات … (GMV)»
and to nothing else.

- [x] `(CAC)`, `(LTV)`, `(take rate)` and `(payback)` restored to their notes.

#### Two cards the markup draws and the screen lacked

- [x] **«المصروف الشهري».** The inputs were already collected and burn already
      computed — nothing summed them into one figure, so whoever wanted to know
      what the platform spends read six fields and added them up. **And a month
      with nothing entered now says so** instead of printing «٠»: the gap
      between «we spend nothing» and «nobody entered anything» is the whole
      gap, and one of them is an alarm.
- [x] **«هامش المساهمة»** — what is left of a customer after their direct cost
      and their acquisition. It sits before profit, carrying no payroll: a
      negative one means we pay customers to buy, and that is news long before
      it reaches any profit line. The direct cost comes from our own chart of
      accounts — `PROVIDER_COST` and `GOODWILL_EXPENSE` — and **gateway fees
      are not in it**: their account is named «عبور», money passing through to
      somebody else. A cost is debit **minus credit**, or a refund counts as
      spending.

#### And a record whose reason had expired

`A36`'s deviation said the investor report needs «data we do not collect».
`FinanceInput` collects it now. The record is updated rather than left standing
— **a record kept after its reason is gone lies the same way a missing one
does** — and the report remains unbuilt for a different reason.

Measured after: **41٪ → 82٪**. Whole tree **72٪ → 73٪**.

### 40a · 14 — `Wp` the dealer index, and six mock addresses read as structure

`Wp` read **40٪**. Opening it against the markup: the title, the intro, the city
chips with counts, the sort, the cards with logo · name · verified badge ·
location · stock · rating, and the «عندك معرض؟» band — **all built**. The forty
per cent was six signals, and every one of them was a mock address.

#### The measure counted «الرياض · حي الملقا» as a heading

The data filter tested the **start** of a signal and the city name **alone**, so
a compound «city · district» passed both: it does not start with «حي», and it is
not a bare city name. Six of `Wp`'s ten signals were the designer's invented
dealer addresses.

- [x] A signal whose **every** part is a place is a place.
- [x] And bare district names — «الكورنيش» · «العزيزية» · «قربان» — have no
      pattern and must not be a hand-written list that rots. **The city anchors
      them**: a known city followed by one more part is a location, because that
      is the shape the card prints.
- [x] Measured tree-wide before enabling: **7 signals of 508 removed**, six of
      them `Wp`'s. Narrow and proportionate — not the self-blinding that was
      reverted on `Wb`.

#### And one real defect the measure could not see

The card prints «المدينة · العنوان», and an address a dealer types ends with
their own city. So every card read **«الرياض · طريق الملك عبدالعزيز، حي الملقا،
الرياض»** — the city twice in one line, on the index of every dealer.

- [x] The city is stripped from the **edges** of the address only. «حي الرياض»
      in Jeddah is a district, not a city, so removing the name wherever it
      appears would mangle correct addresses — and `tests/dealer-address.test.ts`
      asserts both directions.

Measured after: **40٪ → 100٪** on three signals, so marked ⚠ — the judgement
was reading the markup, and the work was one line of real product.

### 40a · 13 — `Wm` sign-in, and a condition the product enforces without warning

`Wm` read **33٪** on three signals. Its first state was already built and
matching; two of the three signals live in the **second** state, which appears
only after «أرسل رمز التحقق» and which a fetch can never see.

#### The markup's third block was the real gap

Under the code field the markup draws «يُكمل قبل أول شراء أو بيع» listing
البريد الإلكتروني · توثيق الهوية · رقم الآيبان (للبائعين).

The product **enforces exactly those**: `canBuy` needs email and identity,
`canSell` adds the IBAN. And it said so nowhere — the buyer learns it when they
press «اشترِ», having chosen a car and opened their wallet. This repository's
own rule covers it: **التذكير يسبق لحظة الحاجة**.

- [x] The panel is built from `BUY_REQUIRES` and `SELL_REQUIRES`, **the same
      constants the guard reads** — a hand-written list beside a guard is a
      second copy that drifts, and then the screen promises something other
      than what is enforced.
- [x] The IBAN line is marked «للبائعين»; telling every new account they need
      a bank account to buy is a different lie.
- [x] The constants moved to a module with no Prisma import. `AuthForm` is a
      client component and `profile.ts` imports a generated type —
      `checkClientDbImports` caught it on the first run, which is what it is for.

#### And the measure learned two things about itself

- [x] **A screen can have part of its markup behind a click.** `WALK_ONLY`
      removes a whole screen from the denominator, which would have thrown away
      `Wm`'s measured first state. `BEHIND_CLICK` names the specific signals,
      excludes those only, and **prints them in the footer every run** so the
      list cannot become a hiding place.
- [x] **Its first entry became exactly that hiding place.** I listed «رمز
      التحقق», and substring matching swallowed **«أرسل رمز التحقق»** — the
      button on the *first* state, and the only signal `Wm` had that was being
      measured. The denominator fell to zero. Matching is exact now: a short
      entry must not be a trap for every longer signal that contains it.
- [x] **And a zero denominator read as 100٪.** `total === 0 ? 100` meant a
      screen the tool could extract nothing from was reported as a perfect
      match. It now reads «لا إشارات تُقاس» and stays out of the total — the
      zero says «I did not measure», and the report must not say «perfect».

Whole tree after: **69٪ → 71٪**.

### 40a · 12 — `Wg` the dealer page, and two numbers with no source

`Wg` read **33٪**. Its header is a reputation panel of five figures; the product
had two of them, and the markup's other three each needed something built.

#### «معدل الرد» and «متوسط زمن الرد» had no source at all

`Offer` carries `createdAt` and nothing else about the seller's reply — so
there was no way to know **when** a dealer answered, or **whether** they did.

- [x] `Offer.respondedAt`, written at the three deliberate replies: accept,
      counter, decline. **An auto-rejection is not a reply** — the system
      answered, not the dealer, and counting it would reward whoever set a high
      floor and never opened their inbox.
- [x] An offer still inside its window counts for neither side: the seller is
      not late yet, and judging them before the deadline is judging them early.
- [x] **The median, not the mean.** One reply after seven days drags a mean
      across twenty replies in minutes, and the figure then describes an
      outlier rather than the dealer.
- [x] **Below eight decided offers the cards do not render.** «٥٠٪» from two is
      read as a year's record. Same shape as `RangeBar`'s confidence floor.
- [x] Seeded for every dealer with four different profiles, since a card that
      renders on one page of four reads as broken on the other three — and the
      dealer with no negotiable stock still shows none, which is the honest
      empty state.

#### The seed's fallback credited one dealer's offers to another

The history block fell back to «any negotiable listing» when a dealer had none
of their own, so the offers were written against **another seller's** listings
and counted for them. «معرض الشرق» showed no response card while I believed I
had seeded it thirteen offers. Removed: a dealer with no negotiable stock has
no response history, and that is the truth.

#### `Duration` stopped at months

Five years read «٦٠ شهرًا» — a number needing division in the reader's head,
which is the whole reason this component exists. It scales to years now, and
the threshold is **24** months, not 18: the division floors, so «سنة واحدة»
for eighteen months silently drops half the span.

#### And the stock could only ever be newest-first

- [x] «الأحدث» with lowest/highest price beside it, as the markup draws. Whoever
      opens a dealer page looking for their cheapest car was scrolling.
- [x] The type filter survives a sort change — choosing «مزاد» then sorting by
      price does not mean «show me everything again».

#### Two the measure still reports, and neither is built on purpose

- **«مركبة معروضة»** — a singular noun under a count. Rendered with real data
  that is «142 مركبة معروضة», the exact bug closed on the home page («8 جهة
  تمويل»). The product's «معروضة الآن» is a state, true under any number.
- **«تابع»** — there is no follow model and **nothing for it to deliver**:
  `Filters` has no dealer dimension, so the saved-search notifier cannot carry
  it. A button that stores a row and sends nothing is the dead-button class.
  Recorded as a question with a proposal instead.

#### And one the measure cannot see

`Dealer.ratingAvg` and `ratingCount` are read on **four** screens and written
by the seed alone — no review model, no submission, no moderation. Production
holds no dealers yet, so nothing false is published, but the first real dealer
would carry a reputation nobody gave them. A question, not a build: who may
review whom, and after what.

#### The measure learned the brand's other spelling

It normalised `carsell.one` → `CARZ` and did not know «كارز», which is what the
product writes inside Arabic prose — Latin letters mid-sentence cut it. So «في
كارز» was read as a miss against «في carsell.one»: **the same name in its own
alphabet.**

Measured after: **33٪ → 78٪**, the remaining two being the deviations above.

### 40a · 11 — `Wl` the offers inbox, and a number the seller could never see

`Wl` read **20٪** on five signals. Behind four of them was one finding: the
seller's hidden floor is written once and then disappears from the product.

#### `minAcceptPrice` had no door after the wizard

It is the floor below which offers are auto-rejected. `SellWizard` writes it,
and after that **nothing in the product shows it or changes it**. Measured:
`updateSellerListing` accepts it, `PATCH /api/v1/listings/{ref}` accepts it, and
**no screen calls that route at all** — the inline editor on `/account/listings`
sends `askPrice` and `description` only.

So a seller who set an optimistic floor in a hopeful week negotiates for months
without offers and cannot find out why: **the reason is a number they wrote and
nobody can see, including them.**

- [x] The floor is shown and editable where offers are read — not in a
      publishing form that ended weeks ago. «ارفع الحد» is its own button,
      because an empty field in a form reads as «don't touch this», not «none».
- [x] The ceiling is stated before it is enforced: a floor above the asking
      price rejects every offer including one at the full asking price.

#### An amount with nothing to judge it against

The inbox showed «٢٨٬٣٦٥» and, in a separate column, the asking price. The
seller did the comparison in their head — against a floor they could not see.

- [x] Each incoming offer now carries its standing: «فوق الحد الأدنى» ·
      «دون الحد الأدنى» (in red) · «أعلى من سعرك بـ …». Keys from the domain,
      wording in `src/lib/labels/offers.ts` (gate 17), and `no_floor` is said
      out loud — silence about a floor that does not exist reads as «below it».
- [x] **The floor never enters a buyer's object.** Not hidden at render —
      `null` in the object, because what is fetched is serialised whether or not
      it is drawn. `tests/offer-floor.test.ts` asserts both directions, and
      tests the three standings by crossing the boundary rather than hoping the
      seed sits on both sides of it.

#### «مركباتك المعروضة» — and the vehicles nobody asked about

The markup's right rail lists the seller's negotiable listings with an offer
count, **including the ones with none** («لا عروض بعد»). That is its point: the
inbox shows what arrived, the rail shows what did not.

- [x] Built from the listings, not from the offers — a list derived from the
      inbox drops every vehicle with no offer, which is the row the column
      exists for.
- [x] The count excludes the seller's own counters. A counter keeps the
      original `buyerId`, so «buyer is not me» counts **my own counter** as a
      decision waiting on me. Same shape as the bug fixed in the inbox tabs.

#### And two texts

- [x] «عرض مقابل» instead of «قابل». The markup writes it in full, and «قابِل»
      alone reads as an order to meet the person.
- [x] What accepting does, said before it is done: it closes the other offers
      with notice and pulls the listing. It cannot be undone, and it was
      discovered after the click.

Measured after: **20٪ → 100٪**, still on a thin denominator (five signals), so
the number is marked ⚠ and the work was judged by reading the markup.

### 40a · 10 — `Wb` search, and a measurement that was reading the wrong screen

`Wb` read **44٪**. The screen turned out to be one of the most complete in the
product, and most of the gap was in the instrument.

#### The measure was reading a state the design does not depict

`design-audit` pointed at `/ar/cars` — the bare index. The markup is titled
«نتائج البحث — **فلاتر مرافقة**», and everything that distinguishes it exists
only in a *search*: the active-filter chips, the «فُهم كالتالي» bar, the
compound heading «سيارات تويوتا كامري مستعملة في الرياض», and the «عن أسعار…»
block with its sibling searches. All built; none visible on an unfiltered index.

- [x] The path now carries a sentence. Taking the markup's own
      («كامري مستعملة في الرياض») returned **two** results on our data, which
      hid the sponsored card (placed «بعد كل ٦ نتائج») and «أعلى مزايدة» — a
      screen measured in a state it does not fit. The query is wider now, and
      the reason is written where the path is set.

#### And it was counting the designer's sample cars as structure

«قبل يومين» passed the digit filter because Arabic names its dual in letters.
«تويوتا أفالون الرياض» and «لكزس ES الرياض» are related-search chips built
from *their* catalogue against *ours*.

- [x] Relative-time phrases are data. Catalogue names are data, and **the list
      is fetched from the product** rather than hand-written, so it cannot rot
      as the catalogue grows (73 models → 230 in one session).
- [x] **A thin denominator is now marked.** `Wb` reads on four signals; one
      absence is a quarter of the screen, and «٢٥٪» reads like a measurement.
      Any screen under eight signals carries ⚠ and is named in the footer.
- [x] **One attempt was reverted for making the tool lie.** Harvesting trim
      names from the page's own `<h3>` elements swallowed «حالة المركبة» ·
      «السعر» · «الماركة والطراز» — *the very signals being measured* — and
      would have raised the score by going blind. Reverted, with the reason in
      place of the code.

#### Six of seven ad slots had never been seen

Measured: the seed creates a campaign for `home_banner` only. Its creative is
`/uploads/seed/ad-banner.png` — **a path with no file and no folder** — so the
home page showed a **broken image** under the word «إعلان» to every visitor,
and five slots with built render sites had no campaign at all.

- [x] A campaign per slot, with a generated creative stored the way listing
      images are. The sponsored card in search results rendered for the first
      time — built, correct, and never once looked at.

#### The brand filter was cut at eight with no door

Ten brands have published listings; the rail showed eight and offered nothing
else. «جي إم سي» (3) and «مازدا» (2) were in the results and could not be
filtered to. The markup draws the door in its place: «اعرض ٤٢ ماركة».

- [x] A sheet with every brand that has a result — the count is of brands with
      results, not of the catalogue, so the button cannot promise forty and
      open on zeros.

#### Two more the markup draws and the product lacked

- [x] **The favourite heart on the card.** `FavoriteButton` existed in exactly
      one place: the car page. Browsing twenty results to save three meant
      opening twenty pages. It is rendered as a **sibling of the card's link**,
      never inside it — a button in an anchor is interactive-inside-interactive,
      and **gate 48 cannot see it** because the link is in one file and the
      button in another. Verified in the browser: `a button, button a` → 0.
- [x] **«عدّل الجملة».** The understanding bar quoted the sentence and offered
      no way to change it — `HeroSearch` lives on the home page alone, so a
      visitor arriving from a search engine found **no input anywhere on the
      screen**. Editing keeps the manual filters and resets the page.

#### And gate 41 let me write the bug it exists to prevent

I wrote `(<ArabicNumber value={n} />)` — a count in parentheses to dodge the
plural — and the gate passed: it knew `({displayDigits(` and a template form,
not this one. Generalised to «Arabic word, then a parenthesis holding a rendered
number», which **immediately raised three false alarms on correct code**:
«المتاح (٨٬٥٠٠)» is a label with its value, not a counted noun. Narrowed to
require a sound-plural ending, which separates «ماركات» from «المتاح»
mechanically. Measured at zero, proven on both sides.

### 40a · 9 — `A34` legal, 44٪ → 100٪, and consent that was never recorded

The screen was missing «سجل النسخ» · «مستند جديد» · «نسبة القبول» ·
«إلزاميّ للتسجيل». Three of those four turned out to be symptoms of one thing:
**the product had no concept of a legal version, and no record of consent.**

#### The sign-in screen asked for a consent nothing stored

`AuthForm` renders a required checkbox — «أوافق على الشروط والأحكام وسياسة
الخصوصية» — and refuses to submit without it. `agreed` is `useState(false)` in
the browser and it dies with the tab. Grepped the schema for
`termsAccepted|acceptedAt|LegalAcceptance|consent`: **nothing**. So the platform
required an agreement and held no evidence of it; one dispute asking «على أي
نص وافق؟» finds us with no answer.

This is the displayed-condition-never-enforced class in its worst form. The
usual case costs the user a click. This one costs the platform its case.

- [x] `LegalAcceptance` — one row per user per document **per version**, written
      in `completeRegistration`. A version string, not a reference: whoever
      agreed in August agreed to August's text, and a reference would move with
      every later typo fix.
- [x] `/account/legal` and a strip under the header, because **a condition
      enforced with no door to satisfy it is a lock with no key**: the 26
      accounts that predate the record cannot prove a consent they gave. No row
      is fabricated for them — a consent date we write ourselves is a forged
      record, worse than an honest shortfall. They are asked, and the figure
      rises by what happens.
- [x] «نسبة القبول» reads 4٪ today and that is the true number. **Its value is
      in falling**: at 100 it says nothing, and below it says either a material
      version took effect unaccepted, or accounts hold no record at all.

#### «نسخ موقّتة لا تحرير حيّ» had a policy and no mechanism

The screen's own footnote explained why there was no edit button. The markup
puts «تعديل» on every row — its rule is that **editing creates a version**, not
that editing is forbidden. The register of uneditable models said as much:
`LegalDocument`'s entry ended «the publishing path does not exist either».

- [x] `LegalVersion` — drafts, the published one, and the superseded ones that
      stay because somebody's consent points at them. Migration backfills one
      `PUBLISHED` row per existing document, so the history starts from what is
      there rather than from nothing.
- [x] `/admin/legal/[key]` edits a draft born from the published text,
      `/admin/legal/history` is «سجل النسخ» with an acceptance count per
      version, `/admin/legal/new` is «مستند جديد» and creates it unpublished.
- [x] Publishing takes **one** person (§35, §41) and writes an `AuditLog` row.
      The markup's «والنشر يحتاج موافقة عضوين» is recorded in
      `DESIGN-DEVIATIONS` as superseded, not quietly dropped.
- [x] A material version cannot be published with less than fourteen days'
      notice — the markup's own figure, now a validation rather than a sentence.

#### A 500 that no test could have caught

`toDraft` was exported from `DraftEditor.tsx`, a `'use client'` module, and the
server page called it: **the whole screen returned 500**. Types passed, lint
passed, 1496 tests passed. Clicking the row found it in one second.

It is the third shape of one boundary error — `checkClientDbImports` guards a
client module importing `db`, gate 22 guards a function prop crossing to the
client, and this is the reverse crossing. Measured after the fix: **zero** in
the tree, so **gate 72** shipped enabled the same day, and was proven by putting
the bug back and watching it fire on the value while ignoring the component.

#### And the measure was pointing at an empty port

`design-audit.mjs` defaults to `localhost:3002`; the dev server runs on 3000. It
printed «تعذّر دخول الأدمن (TypeError)» and then **0/0 — 0٪**, which reads like
a measurement. A zero is only believable once the tool is shown to have run: the
failure line now names the base URL and the real error, not just the class.

### 40a · 8 — `A2` operations, 44٪ → 89٪, **and the first visual pass**

The owner asked mid-task whether this work was matching the design files or
only improving the screens. The honest answer was: the design folder is the
reference for every change, **but the measure reads content, not form** — it
checks that «المبلغ في الضمان» appears, not that the padding is 18px. That
limit is written in the tool's own header and in §40a, which says «١٠٠٪» needs
two passes. The second had not started.

It starts here, and the order is now: measure the screen, then compare it to
its markup with the browser open, before moving on. Taking the measurement
once and returning weeks later is how a measurement rots — the font scale
changed once and the home page began overflowing with nothing to say so.

**What the signal pass built.** The tab jumped straight to per-stage cards,
which answer «how many are in payment?» but never «where is work piling up?» —
and the four queues it would answer with live on four separate screens. So the
markup's four roll-ups are built from their own sources: live orders by stage,
the four review queues, open risks, and cancellations. Plus the month's orders
as its own band, because the markup reads it as a sentence («١٨٠ طلبًا هذا
الشهر»), not a fifth card in a row about what is waiting now.

**And cancellations needed a field.** `cancelReason` carried two different
things — a key the scheduler writes (`payment.timeout`) and a person's own
words — and you cannot group free text. `OrderCancelCategory` is the five the
markup names; the scheduler sets `PAYMENT_TIMEOUT`, a person may pick one, and
whoever does not falls to `OTHER`. **It is optional on purpose**: requiring a
category before someone may withdraw makes them click the first option to get
out, which collects data worse than none.

**What the visual pass found**, which no signal could:

| | markup | built |
|---|---|---|
| card radius · padding · border | 14px · 18/20px · 1px | ✓ exact |
| bar height · radius | 7px · 999px | ✓ exact |
| swatch | 7×7 · 2px | ✓ exact |
| grid | 4 columns, **14px** gap | 4 columns, 16px gap |
| bar margin | **11px** | 10px |

Two differences of one and two pixels, now aligned — and more importantly the
card's **stacked bar with a matching swatch legend** was absent entirely. Four
numbers in a column are read one at a time; a bar says in a glance that three
quarters of the queue sits in one place, which is the question the screen is
opened for. `StackedShare` is that, and it is not `ShareBars`: that one is
parts of a common base («٥٫٦٪ of photos rejected»), this one is a whole split
into its parts.

**Still missing: the deltas** («−٤» · «+٧» beside each total). They need either
a stored snapshot to compare against or a definition of the period, and
inventing one would put a number on the screen whose meaning nobody agreed.
Recorded rather than guessed.

### Where the screens stand — measured 2026-11-23, after the normalisation

**305 of 515 signals · 59٪**, on a quiet server with nothing unmeasured — the
run exits non-zero if a single screen could not be reached, and this one exited
clean. Forty-eight screens carry a figure; `A14` and `Wh` are walk-only, five
are empty of data, and the eleven dealer screens are debt rather than a
conformance gap.

**The number is a floor, not a verdict.** It counts whether a design signal
appears in the served page, so a screen can read 80٪ and still look wrong, and
one can read 25٪ because the design draws metrics we do not yet collect.

> **هذا الجدول لقطةٌ لا وصف.** قِيس يوم كُتب، ويتقادم مع كلّ
> مهمّة — قرأتُ منه «A10 ٢٥٪» وقلتُه للمالك، والقياس الحيّ ٧٥٪.
> فالرقم النافذ ما يُخرجه `npm run design:audit` الآن، لا ما هنا.

| Band | Screens |
| --- | --- |
| **under 45٪** | `A30` ad slots 25 · `Wj` order page 27 · `A11` integrations 31 · `A18` identity 38 · `Wf` **account home 40** · `Wp` dealer index 40 · `Wx` service checkout 40 · `A3` finance tab 41 · `A17` disputes 44 · `A2` ops tab 44 · `A34` legal 44 · `Wb` search 44 |
| 45–65٪ | `Wg` 45 · `A13` `A16` `Wn` `Wv` `Wz` 50 · `A6` 53 · `A15` `A35` `A9` 56 · `A20` `Wa` 57 · `A8` 59 · `A36` `Wt` 60 · `A19` `A5` 64 |
| 65–85٪ | `A12` `Wk` 67 · `A22` `A27` 73 · `A29` `Wc` 75 · `A4` 77 · `A23` `A26` `Wi` 80 · `We` 81 · `A32` `A33` 83 |
| over 85٪ | `A28` providers 90 · `Wo` legal page 91 · `A1` dashboard 92 · `A7` services **100** |

The owner's own words were «صفحات في لوحة الادمن و صفحة المستخدم لم تكتمل»,
and the measure agrees with both halves: eight of the thirteen weakest screens
are admin, and `Wf` — the account home, the screen every signed-in person lands
on — is sixth from the bottom.

**What the weakest ones have in common** is worth stating before any of them is
touched: much of what they are missing is **numbers we do not collect**.
`A10` wants a delivery rate and an open rate for push notifications that no app
yet sends; `A3` wants CAC, LTV and contribution margin; `A2` wants queue ages.
Building those panels without the data behind them would be the «شاشةٌ تقول
شيئًا والنظام يفعل غيره» failure this repository stops for. So 40a splits in
two, and the split belongs to the owner:

- **Layout and controls that are simply missing** — buttons, filters, exports,
  section headings. Build them.
- **Metrics with no source** — decide per metric whether to collect it now,
  defer the card, or replace it with something we can honestly show.

---

## 39 · A fresh production database could not sell a car — *found while preparing the SCCC deploy, 2026-11-23*

The owner moved to deploy on SCCC. Before writing the runbook I measured what a
brand-new database actually contains after the two steps the container runs on
boot — `prisma migrate deploy`, then `prisma/admin-sync.ts`:

| Table | Rows on a virgin database |
| --- | --- |
| `NotificationTemplate` | 10 of 55 |
| `PushChannel` | 7 |
| `InspectionTemplate` | 1 |
| `SeoTemplate` | 2 |
| `Brand` · `Model` · `Trim` | **0 · 0 · 0** |
| `Service` · `TaxRule` | **0 · 0** |
| `PaymentGateway` · `PaymentRoute` | **0 · 0** |
| `Plan` · `Entitlement` · `CommissionRule` | **0 · 0 · 0** |
| `PlatformSetting` · `FinanceSetting` | **0 · 0** |
| `Feature` · `BodyTypeDisplay` · `AdSlot` · `FaqItem` · `LegalDocument` | **0** |

Of 109 migrations, twelve carry data; everything else lived in `prisma/seed.ts`,
**which refuses to run outside development on purpose** — it writes fictional
cars and users. So the first production deploy would have come up as a site that
boots and cannot be used: nobody could publish a listing (no catalogue), no VAT
could be computed (no rule), no payment could route (no gateway), no invoice
could issue, the plans screen would be empty, and `setTransferFee` would throw
on its first save because it updates a row that was never created.

### The bootstrap

`prisma/reference.ts` holds everything a database needs to work and nothing
fictional. `prisma/plant-reference.ts` runs it, `docker-entrypoint.sh` calls it
on every boot after `admin-sync`, and `npm run db:reference` runs it by hand.

**It inserts and never updates.** The operator edits these rows from the panel —
a service price, a tax rule switched off, a brand hidden. A bootstrap that
upserted would erase that work on the next deploy, which is the damage the rule
«reference data reaches a live database by migration» exists to prevent.

**And for the catalogue the gate is on the group, not the row.** Measured: four
delete functions in `catalog.ts` — brand, model, trim, feature — and none
anywhere else in the reference data. A bootstrap that inserts a missing *row*
would restore a brand the operator deleted, on the next restart, silently, with
no way for them to make the deletion stick. So the catalogue and the feature
list ask «is this empty?»: a virgin database is filled once, a live one is never
touched. Templates and gateways, which no screen deletes, keep per-row
insert-if-absent — a missing template is a real gap, and shows its raw key in
the user's bell.

### What the walk caught that no test did

With the server pointed at the virgin database, the home page read:

> «ونعرض لك السيارات التي تقدر تمولها **مع لا جهات تمويل معتمدة**.»

Zero finance providers — true on day zero, and the sentence put the `Quantity`
zero form behind a preposition. The adjective «معتمدة» also sat *outside* the
plural, in a different message key, so it never agreed: two providers gave «مع
جهتي تمويل معتمدة». Gate 44 guards that class but reads one key at a time. The
adjective moved into the plural forms and zero got its own sentence.

### Gates 67 and 68

- **67 — every reference file reaches production.** A file in `seed-data/` that
  `prisma/reference.ts` does not read reaches development and not a deploy, and
  nothing says so until someone opens an empty screen on a real server. One
  exception, named with its reason: `inspection-points.json`, planted by
  migration.
- **68 — a message that takes `count` is written as a plural.** «The number does
  not govern the counted noun» was fixed in the SEO templates inside the
  database and **left standing in the message file**, which is the fallback
  printed when an operator switches a template off: `landing.meta` and
  `landing.metaModel` both said «{count} سيارة {brand}» → «3 سيارة تويوتا».
  The check reads the convention, not the prose: `count` is the plural selector
  in this repository, so a message that takes it and does not branch on it is
  the fault itself. Measured 2026-11-23: two per locale, **no false positives** —
  fixed, then enabled. A word-based measurement had returned 23 hits of which
  seven were real; «{price} ريال» and «{city} في» are correct, and a gate that
  warns on those is a gate nobody reads.

### Measured, not asserted

- A virgin database, migrated and bootstrapped: **19 groups planted**, and a
  second run plants nothing.
- An operator's edits — a service at 7,777.77, a transfer fee of 611, a brand
  renamed and hidden — all survived a bootstrap run.
- A deleted trim and a deleted feature stayed deleted.
- A deleted notification template came back.
- Each of those is a test with a break-probe: the overwrite test fails when the
  bootstrap upserts, the deletion test fails when the group gate is removed, the
  boot-order test fails when the entrypoint line is deleted, and the no-copy
  test fails when a reference write is added back to the seed.
- The admin panel on that database: 14 tax rules, 6 payment purposes over 4
  gateways, 3 plans, both commission handles with their live preview.

### The production build had never been run without a `.env` *(found 2026-11-23)*

The first `docker build` on the SCCC server failed:

```
Build error occurred
[Error: Failed to collect page data for /api/cron/run]
```

`/api/cron/run` is fine. `src/lib/db.ts` checked `DATABASE_URL` **at module
scope and threw** — and `next build` imports every route to collect its page
data, so the first route that touches the database took the whole build down.
Next names whichever route the collector reached first, and that name changes
between runs: the Docker build blamed `/api/cron/run`, the local reproduction
blamed `/api/public/v1/dealers`. **Both are innocent.**

It had never shown because nothing ever built without the variable: Next loads
`.env` locally, Coolify passes its runtime variables into the build, and CI sets
`DATABASE_URL` because `npm run db:seed` needs it. `npm run build:check` inherits
the same environment. **A clean build — inside a Dockerfile, with no orchestrator
injecting anything — was the first one that didn't.**

The guard was redundant anyway: `docker-entrypoint.sh` validates `DATABASE_URL`
before the server starts and prints every missing variable at once. So the client
is now built on first use behind a proxy, the message is unchanged, and
`tests/db-import.test.ts` asserts both halves — the module imports with no
environment, and the first use throws the same sentence. Measured by putting the
eager check back: both halves fail.

### `robots.txt` was baked at build time, so production was never crawlable *(found 2026-11-23)*

Opening `https://carz.sa/robots.txt` on the first deployment returned:

```
User-Agent: *
Disallow: /
```

The container's environment said `APP_ENV=production`, and `robots.ts` returns
*allow* for production. The file disagreed because Next had prerendered it: the
build output listed it as `○ /robots.txt`, and `.next/server/app/robots.txt.body`
was a 27-byte file written at build time — when the Docker build had no
environment at all. **The site would never have been indexed, and nothing would
have said so.** `sitemap.xml` is dynamic, so the two files contradicted each
other in the same deployment: one advertising the pages, the other forbidding
the crawl.

The other direction is worse. The function's own comment promised «الحدّ على
`APP_ENV` لا على النطاق: من ينشر staging على نطاق الإنتاج يبقى محميًّا» — and
an orchestrator that passes `APP_ENV=production` into a staging build (Coolify
passes its variables into the build) would bake an *allow* file onto a staging
site full of seeded listings. The comment described an intent the code could not
keep, because the value was read at build and not at request.

`export const dynamic = 'force-dynamic'` fixes it; the build now lists
`ƒ /robots.txt` and writes no body file. Measured across every route file in
`src/app`: three others read the environment without declaring dynamic, and all
three export `POST` only — Next never prerenders a handler with no `GET`, so
this was the only case.

### What this does not plant, and why

`FinanceProvider` stays out. The eight rows in the seed carry **invented profit
rates** (`4 + i × 0.25`) under the names of real Saudi banks. Publishing those
to production would put figures nobody decided under a bank's name. It is
already recorded as a real gap in `docs/architecture/editability.md`: adding a
financing partner needs a deploy. The ladder itself works from `FinanceSetting`,
and the home page now reads correctly with none.

## 38 · The admin panel: complete, controllable, plainly written — *owner's request 2026-10-20*

> «العديد من الاعدادات حقولها و اعداداتها فيها نواقص… محتوى صفحات لوحة الادمن
> يجب ان نطورها… النصوص بداخلها واضح انه صياغه ذكاء اصطناعي و غير مفهومه…
> ينقصها الفنكشنز مثل امكانية التعديل… فيه بعض الاشياء مالها صفحة تفاصيل»

A program, not one task. Measured on 2026-10-20: **46 screens**, 13 of which
write nothing, 36 with no detail page, and **107 Arabic paragraphs longer than
90 characters** written in the aphoristic register this repository uses for
*code comments* — which is the wrong register for a screen an operator works in.

### 38a — The panel was telling operators a rule that no longer exists *(done)*

- [x] **42 visible strings across 11 screens** still said an action waits for a
      second approver, three weeks of work after the quorum was removed
      (§35). The worst was «هذه الضغطة **لا تحرك المبلغ**» above a button that
      now releases escrow immediately — an operator clicking it expecting a
      draft moves a buyer's money.
- [x] Two more were **never true at all**: `/admin/auction-settings` carried a
      «يحتاج موافقة شخصين» badge and the commission simulator said applying a
      rate needs two people. `COMMISSION_CHANGE` and `PLAN_CHANGE` have no
      writer anywhere — the badge described an approval that was never built.
- [x] Each was rewritten to what the screen actually does, in the plain register
      the owner asked for: «أفرج عن المبلغ إلى البائع», «سجل طلب التحويل. نفذ
      الحوالة من البنك ثم أدخل مرجعها هنا».
- [x] **Gate 66** — no screen may promise a second approver while
      `REQUIRED_APPROVALS` is 1. It **reads the number rather than storing an
      opinion**: raise the quorum back to two and the same wording is allowed
      again, so the gate can never become a rule that contradicts the code.
      Proved in both directions.

### 38b — A payout had no page of its own *(done)*

A transfer of a seller's money showed as **one row in a list**: amount, status,
four digits of an IBAN. To answer «why does this seller have 14,500 owed?» an
operator had to open the ledger and filter it by hand, and to see who asked for
the transfer and who sent it there was nowhere to look at all.

- [x] `/admin/payouts/{id}` — the amount and where it came from (**the ledger
      lines that built this seller's balance, each naming its order**), the
      bank details, who requested and who sent it and when, the audit trail,
      and the actions that are still open on it.
- [x] Rows in the list link to it, and so does the seller's own page.

### What 38b caught on the way

- **`Payout` was zero rows.** The screen listed who was owed and never a single
  transfer, so the detail page would have shipped with nothing to open. Two are
  seeded now — one sent with its bank reference, one waiting for it.
- **And the seeded pending one vanished after the first test run.** The shared
  cleanup deletes every `PENDING` payout — the exemption for seeded rows existed
  for *provider* payouts only, written when that exact thing happened there. The
  second occurrence of a class is where it gets closed, so the seller side now
  carries the same exemption.
- **The first seeded transfer went to a seller with no IBAN** — a state the
  product refuses to create (`requestPayout` rejects it), and the page read
  «آيبان مسجل: لا» above a transfer that had been sent. Seeded data imitates
  what the product produces, not just its shape.
- **Amounts are shown to the halala.** 47,287.50 was rendering as «47,288» in a
  figure an operator reconciles against a bank statement.

### 38c — A provider's transfer, and the balance that two screens disagreed about *(done)*

The provider side of 38b: `PROVIDER_PAYABLE` is credited on every completed
service and debited only by a bank transfer entered by hand, so «why is 1,350
owed to this inspection shop?» is a question an operator asks while reconciling
a bank statement — and the list answered it with a name, an amount and a bank
reference.

- [x] `/admin/provider-payouts/{id}` — the amount, **the ledger lines that built
      this provider's balance, each linking to the service request that created
      it**, the bank details, the provider's type and whether an IBAN is on
      file, who requested and who entered the reference and when, and the
      approval window if the request still has one.
- [x] Both sections of the list open it — the queue and the history.
- [x] **The reference is resolved, not inferred.** The ledger has no column for
      a service-request reference, so it is written into `note` — and
      `provider_payout.sent` writes `payout … · ‹bank ref›` into the same field.
      A link built from the shape of the text would point at a 404; it is
      matched against `ServiceRequest.ref` and only a row that exists is a link.
- [x] **`/admin/settlements` needs no page of its own** — measured, not assumed:
      every row already links to `/admin/orders/{ref}`, where the escrow, the
      ledger and the documents for that settlement already are. A second page
      would say what the first says and drift from it on the first edit.

### What 38c caught on the way

- **The balance on a payout detail page was summed from the sixty lines it
  displays.** Not from the account. A seller or provider with more ledger
  entries than that would read one number on the screen while the transfer
  guard (`accountBalance` in `requestPayout`/`approvePayout`) enforced another —
  the screen says the money is owed and the approval answers «exceeds what is
  owed». **Two numbers for one money**, and the seller page had shipped with it
  in 38b. Both now read the aggregate, and the card says plainly when the lines
  shown are only the most recent of more.
- **The test for it was green on data that could not reach the limit.** Nothing
  seeded has sixty ledger entries, so comparing the two sums passed whatever the
  code did — it described the data, not the code. Both tests now plant past the
  limit in one balanced transaction and restore it by `txnId`, and the fix was
  proved by reverting it.
- **A raw cuid was on screen in a figure an operator reconciles.** The ledger has
  no column for the transfer that produced a debit, so `payout.sent` writes
  `payout ‹id› · ‹bank ref›` into `note` — and the line rendered it, truncated,
  as «…rqu55jisvvlx · TRF-2026-104417». Both pages now match the note against
  that party's own payout rows and show the **bank reference**, linking to the
  earlier transfer when the line belongs to one.
- **The seeded seller transfer wrote its own wording into that note**, so its
  debit line read «—» where a real one reads its reference — seeded data that
  does not imitate what the product writes. The seed now uses the product's
  wording, and a test asserts the line carries `bankRef` for every sent payout.
- **Four copies of the payout status labels, already drifting.** `FAILED` was
  «تعذّر» in a list and «فشل» in the page that list opens — in one session. One
  `PAYOUT_STATUS_LABEL` keyed `Record<PayoutStatus, …>` now serves all four, so
  a status added to the schema fails the compiler instead of rendering raw.
- **And two labels could not be read.** Unvowelled, «حوّل» is «حَوْل» and «أُلغي»
  is an active verb. A noun reads one way only: «محول» · «ملغى» · «حوالة إلى
  البائع».

### 38d — «ساعات (٤٨)»: the exemption was by form, not by destination *(done)*

Found by clicking the service-request link from the new provider-payout page:
the SLA field read «الالتزام · ساعات (٤٨)» — the exact shape gate 41 exists to
forbid, in the screen an operator reads to answer a provider's question.

The gate read JSX (`({displayDigits(`) and exempted every template literal,
because toast text cannot take a component. But **a template literal reaches a
component as readily as it reaches a toast**: `value={\`ساعات (${n})\`}` is a
prop typed `ReactNode`, not a system message. Twenty-four sites passed under it.

- [x] Measured 2026-10-20: **38 occurrences**, of which 14 are genuine
      plain-string sinks (6 toasts, 4 HTTP error messages, 2 form-field errors,
      2 more) and **24 were displayed labels**. Over the ten-alarm limit, so the
      copy moved first and the gate followed — as the rule in `CLAUDE.md` says.
- [x] **Two helpers were written twice, and both wrote the bad shape.** `sla()`
      byte-for-byte in `ProviderTable` and the service-request page → one
      `<Sla hours>`; an elapsed-time helper in `ReportsQueue` and
      `MonitorShell` → `<Duration minutes>`, a second input to the component
      that already owned the rule. The `MonitorShell` copy **had no caller at
      all** and was deleted rather than converted.
- [x] Three props were widened to `ReactNode` so the right thing is possible:
      `AdminShell.subtitle`, `ShareBars.baseNote`, and the account page's `Row`.
      A prop typed `string` is what forces the workaround in the first place.
- [x] New plural units where none existed: `docSections` · `legalDocs` ·
      `reports`. Three screens then read «٨ مستندات» · «٩ أقسام» · «٣ بلاغات»
      instead of «المستندات (٨)».
- [x] **The sparkline's spoken label said the wrong thing entirely.** «منحنى —
      عدد النقاط (٣٠)» tells a screen-reader user an implementation detail; it
      now says the trend and the span — «منحنى صاعد من ‹أول› إلى ‹آخر›».
- [x] **Gate 41 now checks the template's owner**, not its form: a displayed
      prop (`value` · `note` · `subtitle` · `label` …) may not be built from a
      string carrying a parenthesised count; everything else is left alone,
      because a repeated false alarm disables measurement more thoroughly than
      no gate at all. Comments are stripped first. Proved in both directions by
      a test that breaks what it guards and then checks the toast stays silent.

### 38e — A campaign could be fired without reading what it says *(done)*

A marketing campaign showed as a table row: a name, a channel, four counters.
**Nothing in the product displayed `subjectAr` or `bodyAr`** — two columns the
schema has carried since it was written and no screen ever read. The send
confirmation names the campaign and shows its audience size, so an operator
approved an irreversible send to thousands without being able to read the text
that would go out.

- [x] `/admin/campaigns/{id}` — the message as it will arrive, the segment with
      its rules in readable Arabic, the audience now, **who is blocked and
      why**, and after sending the recipients with open/click/convert. The send
      button moved here too, where the text is in front of the operator.
- [x] Rows in the list link to it.
- [x] **The audience rule was written twice.** `resolveSegment` computed
      cooldown-and-cap to show «سيصلهم فعلا» and `sendCampaign` computed the
      same thing to choose who gets written — **two numbers for one audience**.
      Change the cooldown in one place and the screen says seven while five
      receive. One `blockedRecipients()` now serves both, and it returns the two
      sets separately so the page can say «one in cooldown, one at the monthly
      cap» instead of «two blocked».
- [x] `SEGMENT_FIELDS` and the marketing limits moved to `lib/campaigns/` so the
      label map can pledge `Record<SegmentFieldKey, string>` without dragging
      Prisma into the browser bundle. `CAMPAIGN_STATUS_LABEL` is now one map
      with an enum pledge instead of a copy per screen.

### What 38e caught on the way

- **The only seeded campaign had no text and no sends**, so half the screen
  could not be seen and the empty-text branch was the only one reachable. A
  draft with its copy and a sent one with six recipients are seeded now.
- **The first version of the blocked-breakdown test was blind.** Nothing seeded
  is in cooldown or at the cap, so `cooldown + cap === consented − reachable`
  reduced to `0 === 0` and passed whatever the code did — **proved by zeroing
  the cap term and watching it stay green**. The test now plants all three
  cases, including a user blocked for *both* reasons, which is the only one that
  catches double counting.

### 38f — Three service fields nothing could reach *(done)*

Measured `Service`'s columns against every screen and route that writes them:
**`includesAr`, `includesEn` and `providerType` had no writer at all**, and
`adminFeeMode` and `category` could be set only at creation.

That is not cosmetic. `includesAr` is the list of what the service covers,
**shown to a buyer right above the pay button** — the schema comment says the
design puts it there because a price is judged against what it buys, not against
a sentence. It was seeded, read by the public page, and changeable only by
deploying. `providerType` is the rule the city queue is built on (the owner's
rule: an inspection goes to inspectors in the vehicle's city); without it the
assignment has no basis. And `adminFeeMode` is the owner's own decision that a
platform fee may be a percentage or a fixed amount — a service created with a
fixed fee could never be switched.

- [x] `/admin/services/{key}` — everything the model holds, the recent requests
      with their state, the provider and the SLA, where it appears, **and an
      editor for the five fields the list cannot reach**.
- [x] The fee-mode selector shows the computed riyal effect of the mode in the
      field, from what is typed rather than what is saved.
- [x] Rows in the list link to it.
- [x] **The audit entry is now derived from the fields that were sent.** It was
      a hand-written list of six columns, so any field added to `ServiceEdit`
      would have been editable with no trace in the log that is read during an
      investigation.
- [x] The route's enum lists come from the schema (`z.nativeEnum`) rather than
      being typed beside it — the first draft omitted `OTHER`, which is the
      eleventh instance of a list that imitates an enum instead of deriving
      from it. The API doc generator learned `nativeEnum` so the published
      schema carries the real values.

### 38g — «What did this person do?» had no answer *(done)*

The audit screen filters by **kind** — money, identity, permissions — and never
by **actor**. So the first question of any investigation («ماذا فعل فلان؟»)
could not be asked in the panel at all: you read a hundred and twenty rows
looking for a name. And the team row gave a name, a role and a session count,
but not where they signed in from or what their role actually grants.

- [x] `/admin/team/{id}` — what they did, their sessions with IP and device and
      whether each is live, the lock and password state, and **the permissions
      their role grants, computed from the matrix the guard itself reads**
      rather than a table written beside it.
- [x] A session counts as live by **time and revocation together**, not by the
      column alone — an expired-but-unrevoked session reads as live otherwise.
- [x] Rows in the list link to it.

### What 38g caught on the way

- **76 of the 80 actions the product writes had no Arabic label.** The policy in
  `labels/audit.ts` says the raw key stays for what has no label, because
  `listing.review.approve` tells an investigator more than «إجراء» — a sound
  rule that **had never been measured**. The exception had become the rule: the
  audit screen and this new page read as English keys. All 76 are written now,
  and a test derives the list from `src/` and fails on the first one that is
  added without a label. It reads `src/` only, the same scope as the existing
  dead-label gate, so the two cannot disagree about `seed.run`.

### 38h — The last four needed no page; two needed rows *(done)*

The remaining four on the list were measured the way settlements was, by asking
what a detail page would answer that the screen does not. Every column of
`AdSlot`, `AdCampaign`, `ApiKey` and `WebhookEvent` is already on its screen —
and for the other two the case file already exists elsewhere:

| Entity | Verdict |
|---|---|
| Identity | **No page.** A request's subject is a user, and `/admin/users/{id}` already holds the status, the audited reveal, the tax status and the margin scheme. The queue's rows link there. |
| Webhooks | **No page.** The row carries the whole payload and the outcome, and links to the order's payments tab, where the events for that payment appear together. |
| Ad slots | **No page.** The slots table carries every column, and the campaigns table beneath it carries delivery per campaign. |
| API keys | **No page.** The panel shows the scopes, the rate limit, last use and revocation; a key has no request trail to open. |

**But two of them had never been seen with data in them.** `ApiKey` and
`AdCampaign` were zero rows, so both screens could only ever be opened on their
empty state — the scopes, the rate limit, the revoked shape, the impressions,
the clicks and the CTR column had never been rendered in any environment. That
is what reads as «a page that is not finished», and it is a seeding gap, not a
missing screen.

- [x] Two API keys seeded, one live and one revoked. **The raw key is not
      seeded** — it is shown once at issue and stored hashed, so seeding a
      working key would hand every environment a known credential. Only the
      hash is planted, and a test asserts no stored value is in key form.
- [x] Two ad campaigns seeded, one running and one ended, with impressions and
      clicks whose ratio is near 1% — a seeded CTR of 50% poisons every reading
      of the screen.
- [x] `mintKey`/`hashKey` moved to `lib/api/key-mint.ts`. They are pure crypto
      but lived beside `checkApiKey`, which imports `db` — so the seed could not
      use them without pulling a second Prisma client in. Same split as
      `lib/campaigns/segments.ts` and `lib/seo/templates.ts`.
- [x] **Two number formats in one screen.** Slot prices grouped («٦٬٠٠٠») while
      impressions beside them did not («١٨٤٢٠»), because `displayDigits`
      substitutes digits without grouping. Both are `<ArabicNumber>` now.

### 38i — The transfer fee nothing could change *(done)*

Every settings model was measured the way `Service` was, but against **write
paths only** — the zod schemas of the admin routes and the `data:` blocks of the
domain — because a column named in a read shape is not a column an operator can
set. Twenty-three config models, and the measurement came back almost clean:
every one of `TaxRule`, `PaymentGateway`, `PaymentRoute`, `Plan`, `Entitlement`,
`FinanceProvider`, `NotificationTemplate`, `PushChannel`, `SeoTemplate`,
`TrustMark`, `LegalDocument`, `InspectionTemplate`, `AdSlot`, `FaqItem`,
`Segment`, `BodyTypeDisplay` and `Brand` is fully reachable.

`PlatformSetting` was not. **Three of its columns are read in the price of every
single order and no screen or route writes any of them**: `transferFee` (the
government ownership-transfer charge, frozen at the seeded 350) and
`transferAdminFeeEnabled` / `transferAdminFee` (our own fee on top, switched off
and unswitchable). The order page *displays* all three. The owner's rule that
our margin stays a separate line from the pass-through — so VAT lands on our
margin and not on the whole 350 — was built in the money path with no control
to operate it.

- [x] A transfer-fee card on `/admin/payments`, beside the processing fee and
      the gateway fees, with a `PUT` route and an audited write.
- [x] **The live example computes what the buyer pays** from what is typed:
      «350 government + 60 ours + 9 VAT = 419». A rate written beside the form
      would be a second source, so it is read server-side from
      `supplyVatPct('ADMIN_FEE')` — the gate caught the hardcoded `0.15` on the
      first try.
- [x] **A fee enabled at zero is refused.** A flag saying «we charge» beside an
      amount saying «nothing» reads to the operator as switched on.

### What 38i caught on the way

- **The finance summary read a second VAT source.** Orders compute VAT from
  `TaxRule('COMMISSION')`, and `financeSummary` read `PlatformSetting.vatPct` —
  a number `/admin/tax` does not touch. Set the rule to 5% and the finance
  screen kept saying 15%. The same mistake was found and fixed in
  `order-amounts.ts` months ago, and its sibling here was never looked for. Both
  read the rule now, proved by moving the rule and watching the screen follow.
- **Breaking a writer to prove a gate leaves the database in the broken
  writer's state.** The probe that deleted the `transferAdminFee` write made the
  test's own restore unable to undo itself, so a 60-riyal admin fee stayed
  switched on in the dev database and **failed seven unrelated money tests** on
  the next run. The restore now writes the row directly instead of calling the
  function under test.

### Open, and not mine to decide

- [ ] **`CommissionRule.scope` is always `'global'`.** The schema allows
      `plan | dealer | listing_type` and `scopeId` is never written or read, so
      a per-dealer or per-plan commission cannot exist. Whether commission
      should vary by dealer or plan is a business rule — asked, not assumed.
- [ ] **`Integration.configPublic` has no writer and no seeded value**, so the
      integrations screen's public-config section is always empty. Nothing
      defines what keys belong in it; building an editor would be inventing the
      feature rather than operating one.

### 38j — The register of the comments had leaked into the screens *(done)*

The owner's words were «واضح انه صياغه ذكاء اصطناعي و غير مفهومه». The first
measurement — paragraphs over 90 characters — was the wrong one: it counted 119
and most of them were fine. What actually reads as machine-written is a
**register**, and the register has a signature that can be counted.

Measured on what an operator reads, not on what is in the files: **536 displayed
paragraphs, 245 of them carrying an em-dash aside (46%)**, nine sentences over
22 words, and four logic symbols (`⇒`) in text meant for a person. That is the
register this repository uses in *code comments* — antithesis, the explanatory
«فـ» clause, the parenthetical justification — and it had leaked onto the screen.

The rule applied: one sentence per idea, lead with what the operator does, and
**drop the justification of the design** — that belongs in the comment, not the
screen. Each paragraph was rewritten whole rather than patched, because patching
half a sentence leaves the other half dangling (which happened before, in six
places).

- [x] 23 screens rewritten. Em-dash asides in displayed **prose**: 124 → 5, and
      all five that remain are `label — hint` apposition, which is a legitimate
      UI pattern and not prose. Sentences over 22 words: 9 → 3, all enumerations.
- [x] «5 محاولات فاشلة ⇒ قفل 15 دقيقة» is now «خمس محاولات فاشلة تقفل الحساب
      ربع ساعة». No logic symbols remain in displayed text.
- [x] **Gate 61 caught an Arabic error I introduced while rewriting**: I wrote
      «قرار ثان» and «شخص ثان». A منقوص noun's tanwīn stands in for a dropped
      yāʾ, so stripping the diacritic alone produces a different word; the
      repository writes «ثاني».

### What stays open in this program

Nothing measured. The field-label apposition that remains is deliberate.

## 37 · The auction's bid log, finished — *owner's request 2026-10-20*

Four rows of the design were left open on the auction detail (`docs/BACKLOG.md`
§ Auction detail). Three are plumbing; the fourth is a business rule and is
asked, not guessed.

- [x] **Older bids are folded.** The log prints every bid, and the design folds
      all but the newest with «اعرض الـ١٣ مزايدة الأقدم». A log of sixty bids
      buries the ones that decide the auction.
- [x] **CSV of the log.** It carries exactly what the page already shows —
      alias, time, step, type, amount — so it discloses nothing the page does
      not. A bidder who wants to check a close needs the rows, not a screenshot.
- [x] **Extensions appear in the log.** An auction extends itself when a bid
      lands inside the closing window, `extendedCount` counts them, **and the
      moment is recorded nowhere**: the reader sees a bid at 21:59 and a close
      at 22:05 with nothing saying why. The extension is written as an event
      and printed between the bids.
- [ ] **Cancelled bids are a business rule, and it is asked.** `Bid` has no
      cancellation field, and who may void a bid and on what grounds decides
      who wins and whose deposit is forfeited. Raised with the designer;
      nothing is built on a guess.
- [x] Walked: a live auction with twelve bids opens on eight, the control reads
      «اعرض ٤ مزايدات الأقدم» and opening it shows all thirteen rows, the
      extension prints between the bids it fell between — «مدد وقت الإغلاق · ٥
      دقائق · ١٩ أكتوبر ١٩:٥٧:٢١» — and the CSV downloads with the extension as
      its own row and no `bidderId` anywhere in it.

### What the walk caught

The extension row was built in the **desktop table only**, and the table is
hidden below `sm`. On a phone — where most of this log is read — the bids
showed and the extension did not. What is added to one of the two layouts is
added to the other.

And the first probe of the new test passed while the writer was disabled: it
searched for `auctionEvent.create` as text, which survives inside `if (false)`.
The assertion is behavioural now — a bid placed inside the closing window, and
the row it must leave behind.

## 36 · The sell page proposes a price, or stops promising one — *owner's request 2026-10-19*

The hero reads «ونقترح عليك سعرا مبنيا على صفقات حقيقية لمثل سيارتك», and the
wizard does nothing of the kind: `PriceGuidance` returns `null` while the price
field is empty, so it **positions a number the seller already chose** — it never
proposes one. For a model with no `PriceStat` row, 42 of 73 of them, nothing
appears either way and the seller is left with an empty box under a sentence
that promised help.

- [x] Propose the median **before** a price is typed, with the slice it was
      computed on and the number of deals behind it, and a control that fills
      the field with it.
- [x] Say so when there is nothing to propose. The hero made a promise; silence
      after a promise reads as a fault in the page, not as absent data.
- [x] **And the hero promises what always happens.** «نقترح» is true only where
      a stat exists; the sentence now says we show where the price sits, and
      the proposal appears on top of that when the data is there. A screen that
      says one thing while the system does another is a broken promise, which
      this repository stops for even when the difference looks small.
- [x] Walked the wizard to the price step on a Tucson 2024: the card reads
      «سعر مقترح لمثل سيارتك · ٨٦٬٠٠٠ · توسان ٢٠٢٤ · ٥٢ صفقة», and the figure
      is the stored `p50` for that slice to the riyal. Pressing «استخدم هذا
      السعر» filled the field and the card switched to positioning — «سعرك ضمن
      السوق», 70,500 · 86,000 · 101,500.
- [x] **And the slice names what the figure was computed on, not what was
      asked.** The stat row's city is `*`, so the card says «توسان ٢٠٢٤» with
      no city — the lie recorded in CLAUDE.md, avoided by `scopedToCity`.

### And the gate's own clock

Gate 65 compared the stamp against `toISOString()`, which is UTC. At 00:31 in
Riyadh it read yesterday and refused a document dated today — **the first three
hours of every day would have failed**, on the first midnight after it was
switched on. A date written in a document is a human claim in its writer's
timezone, so it is measured in that timezone.

### What the walk caught

`RangeBar` reserved `pt-7` — 28px — for a label that is **two lines**: «هذا
الإعلان» and the price, 41px together. So the price sat **on** the bar and read
as clipped, and it is the number the reader came for. A test could not see it;
the measurement is 3px of clearance where there had been −13.

## 35 · The two-approval requirement is removed — *owner's decision 2026-10-14, built 2026-10-19*

> «موافقة العضوين يجب أن نعمل على إزالة هذا القيد من لوحة الأدمن، حيث الأدمن
> يملك صلاحية مطلقة»

Nine flows wrote `requiredApprovals: 2`: escrow release, seller payouts,
provider payouts, wallet and provider-ledger adjustments, key rotation,
environment switch, payment-route switch, tax-rule changes and dispute
resolution. The quorum is now **one**, from a single named constant — it was
hardcoded in three files and defined twice more with the same name and value,
which is how two copies of one rule drift.

- [x] The requester is the quorum: a request whose quorum is already met
      **executes in the same call**, rather than leaving a pending row for the
      same person to click a second time. Two clicks by one admin is the
      «عضوان عضوًا يضغط مرّتين» the code itself mocked.
- [x] Self-approval is refused **only while the quorum is greater than one** —
      so raising it back to two restores the old behaviour with no other edit.
- [x] **Gate 19 is re-aimed, not deleted.** It exists because half-built quorums
      shipped three times, and that class is still live: a request kind with no
      approver, an approver with no route, a check on a weaker permission.
      Deleting the rule without the gate leaves a gate guarding nothing;
      deleting the gate leaves the class unguarded. It now asserts the path is
      complete whatever the quorum is.

### What replaces it for money

The third open item asked what control remains once a single admin can move
money. The answer was «every such action already writes `AuditLog`» — and
measuring it found that **dispute resolution writes none**. It splits escrow
between buyer and seller and left no audit row at all; the quorum was the only
control it ever had.

- [x] `AuditLog` on dispute resolution, with the split and the reason, before
      the quorum is lowered — not after.
- [x] **Twenty tests asserted the rule that was removed**, across eight files —
      «الطالب لا يوافق على طلبه», «الطلب وحده لا يغيّر شيئًا», «والثاني ينفّذ».
      Each was rewritten to the rule in force, because a test that pins a
      cancelled rule makes carrying out the decision look like breakage.
- [x] And three of them pinned behaviour that **no longer has a subject**: «a
      second request does not open while the first is pending» cannot happen
      when nothing stays pending. Those were replaced by the guard that is
      still real — a debit above the balance, measured by exceeding it.
- [x] **The gate's own premise would have switched it off.** It tested for
      `requiredApprovals >= 2`; on the day the quorum became one it would have
      skipped every flow silently. It reads `[1-9]` now, and was proved by
      renaming an approver — it named the orphaned kind.

### What the rename caught

`DUAL_APPROVAL` is `RECORDED_ACTIONS`. The old name promised a second member
after the member was gone, and **the promise outlives the rule it was written
for unless its text is hunted down**: four documents still described key
rotation and escrow release as «بموافقة عضوين», two of them specifications a
reader would take as current.

## 34 · `ApiKey` — a public API nobody can call — *owner's request 2026-10-19*

Three routes under `/api/public/v1` demand a key: the listings page, a single
listing, and the dealer index. The authenticator is built — hashed storage,
constant-time comparison, «revoked» separated from «unknown» — the minting
function is built, the per-key rate limit is built, and the documentation says
«keys are inserted directly for now».

**No key is inserted anywhere.** The seed creates none, no screen issues one, no
route mints one, and `mintKey()` has no caller outside its own test. So the
public API cannot be called in any environment that has ever existed: a lock
built, guarded, documented — and no key cut for it. That is the shape closed
twice before in this repository, most recently when `profileCompletion` was
enforced before `/account/profile` existed.

- [x] `/admin/api-keys`: issue, rename, re-limit, revoke. The raw key is shown
      **once**, at creation, and never again — a «show me my key» feature is a
      back door into every integration that uses it.
- [x] Every action writes `AuditLog`. A key is an identity; who cut it and when
      is the only record that it was authorised.
- [x] **Scopes are enforced, or they do not appear in the form.** The field is
      stored and returned today and checked nowhere, which `docs/api/public.md`
      records as «worse than no field» — and building a UI for it without the
      check would be a screen promising what the system does not do. Each route
      declares the scope it needs; an empty list keeps today's meaning, the full
      public read surface, so no key already cut stops working.
- [x] The scope catalogue is **derived from the routes that declare it**, not a
      second list beside them.
- [x] Proved by breaking it three ways: the scope check neutered, the raw secret
      written into the `AuditLog`, and a route's scope removed — each failed the
      test it should.
- [x] **And the client/server gate caught the fourth.** The panel imported the
      rate-limit range from the domain module, which reaches `db`; the browser
      shape now lives in `src/lib/api/keys.ts`. Fourth occurrence of that class,
      and the first the gate stopped before it was committed.

## 33 · The documentation is guarded where it can be, dated where it cannot — *owner's request 2026-10-19*

> «ابدأ بالمولدين وبوابة التاريخ وأصلح الخمسة و طبق اقتراحاتك»

Asked whether the documentation matches the platform, the answer was a
measurement, not a reassurance. 63 files · 26,249 lines, of which ~2,200 are
generated and fail `verify` when they drift. **The other 85% had no guard at
all**, and five live failures turned up in minutes:

- [x] `README.md` claimed «Measured 2026-10-19: 62 files · 25,635 lines» — and
      was already wrong **the same day**.
- [x] `frontend/seo.md` had **zero** mentions of `SeoTemplate`, `/admin/seo` or
      the meta description, hours after the SEO text was rebuilt.
- [x] `workflows/scheduler.md` said «Thirteen jobs» with **seventeen** in the
      registry, and did not know `recomputePriceStats` — a document that exists
      only because «the scheduler had no documentation» was a recorded lesson.
- [x] `TASKS.md` last changed 2026-10-12, stops at gate 42 against 64 shipped.
      `RUNBOOK.md` had not been touched since 2026-08-02.
- [x] Many files carry **no date at all** — `api/payments.md` among them, where
      an undated present-tense section was added the same day, against the
      standing rule written in `README.md` itself.

### Two generators and one gate

- [x] **The scheduler's job table is generated from `JOBS`** — and the «why
      here» column survives: the generator reads the existing table, keeps each
      note by job name, and leaves a new job's note empty so `--check` refuses
      it. A table that cannot fall behind, with prose a tool could never write.
- [x] **`architecture/admin-screens.md` is generated from `nav.ts`** — 45
      folders against 39 nav entries, and nothing anywhere listed them. The six
      without an entry are listed too: a screen with no door is the class this
      repository has closed eleven times.
- [x] **Gate 65: every document carries `Last measured`**, and it may not be
      older than the last commit that touched the file. It turns «is this
      true?» into «when was it checked?», which is a question a tool can ask.
      Measured before being switched on, and the files migrated first.

### And the language rule says what is true

`CLAUDE.md` says «والتوثيق كله بالإنجليزية». Six files are majority Arabic, and
rightly so: `DESIGN-DECISIONS.md` quotes the owner, `NOTES.md` is a session
journal. A rule contradicted by a fifth of the tree is not enforced, it is
ignored — so it now names the exception instead of pretending there is none.
- [x] Proved by breaking what each guard guards: a stamp removed, a stamp older
      than the file's last commit, a stamp in the future, and a row deleted from
      the generated table — each failed the check it should, and
      `tests/docs-guards.test.ts` keeps all four proven.
- [x] **And the generator's first parser lied.** It required `permission:` on
      the line, and three entries do not have one — so the index was short by
      three and declared their screens «with no door» while they sat in the
      sidebar. A generated document that lies is worse than a hand-written one,
      because its reader believes it. Fields are read one by one now, and a
      disabled entry (`href: null`) is listed rather than silently dropped.

### What the measurement now says

63 → **64 files · 26,565 lines**. Generated and checked: the ERD, OpenAPI's 144
paths, the component index, the scheduler's 17 jobs, and 44 sidebar entries
across the admin index. Everything else carries a date a tool can disprove.

## 32 · The two open questions from §30, answered — *owner's decision 2026-10-19*

> «طبق الاثنين»

**A median that is true.** Decision 26 asked for `{median}` from `PriceStat`,
and §30 left it out because that table is keyed by model × year × trim × city ×
mileage bucket: anything aggregated across those rows is not «the median price
of a Yukon in Jeddah», it is 2015 mixed with 2024. The variable now exists and
says something else — **the middle asking price among the listings on this very
page**, read from the same `where` clause that produced the count and the range,
so it cannot describe a different slice than the one shown. It is an observed
price, not an average: for an even count the lower of the two middles, so the
figure is always a real car's asking price.

- [x] `priceMid` in `landingContent`, computed from the page's own slice.
- [x] No separate threshold: a landing page does not exist below
      `MIN_LISTINGS`, so the figure is always backed by at least three cars.
      Inventing a second cut-off would be a number nobody could justify.

**The intro leaves the screen.** It repeated the stat row above it almost word
for word, and a visitor arriving from a search engine read the same three facts
twice. It stays as the `<meta description>`, which is the only place it was ever
doing work — that is the text the search result shows, and its numbers are what
earns the click. The outro stays on the page, because it says what the stat row
cannot: inspection reports that can be read before contacting a seller, and
payment held until ownership moves.

- [x] Removed from both landing pages; still the description for both, and for
      unfiltered `/cars`.
- [x] **And the panel stops promising otherwise.** The field was labelled
      «المقدمة» beside a preview headed «الوصف والمقدمة» — a screen that says a
      text appears on the page while it does not is a broken promise, which this
      repository stops for even when the difference looks like a detail.
- [x] Walked: the duplicated paragraph is gone from the page, the description
      now reads «وأسعارها من 28,000 إلى 97,000 ريال وأوسطها 72,000» — and the
      three cars on that page are listed at 28,000 · 72,000 · 97,000, so the
      figure is the middle one's own asking price.
- [x] Proved by breaking it three ways: taking the lowest instead of the
      middle, widening the query to all published listings, and putting the
      intro back on the page. Each failed the test it should.

## 31 · `WebhookEvent` — the gateway's own words, with no door — *owner's request 2026-10-19*

> «اصلح WebhookEvent»

Named by gate 64 the day it was built. Every callback Moyasar sends is stored
with its full payload, and **nothing reads the table**: when a payment goes
wrong the evidence is there and nobody can look at it.

Measuring the route found three more, each worse than the missing screen:

- [x] **`signatureOk` is never `false`.** A rejected callback returns 401
      *before* the store, so the column that exists to record a rejection has
      never recorded one — and a run of rejections is exactly what a rotated
      key or a prober looks like. It is now written, **bounded**: only when the
      reference already matches one of our payments, and capped per payment, so
      the table cannot be filled from the open internet.
- [x] **`applyState`'s result is thrown away.** The gateway says «settled», a
      late webhook is refused as an invalid transition, the row is marked
      processed, and nothing anywhere says the refusal happened. The outcome is
      now recorded per event: applied / unmapped type / refused, with the
      reason, and the status we actually wrote.
- [x] **No link to the payment.** The reference lives inside the JSON, so «what
      did the gateway say about this payment?» was not a question the database
      could answer. A `paymentId` column, backfilled from the payload.
- [x] **A retry leaves no trace.** The second delivery fails the primary key
      and returns 200; the gateway retrying eight times meant nothing was
      recorded. Counted on the existing row.

- [x] `/admin/webhooks`, and the same list **on the order's payment tab** —
      that is where an operator is standing when the question arises.
- [x] Removed from the reader register in `docs/architecture/editability.md`;
      gate 64 refuses the file until it is.

### And nothing would have been visible anyway

`WebhookEvent` has **zero rows** in the development database, and so does
`PaymentEvent` beside thirteen payments: the seed creates payments without
their trail, and the trial gateway confirms instantly rather than calling back.
So the screen would have shipped as an empty state that nobody could ever fill
— «ما لا يُزرع لا يُرى», recorded here after nine defects hid in an order
status the seed never planted.

- [x] Both are seeded, in every shape the product writes: applied, unmapped
      type, refused transition, bad signature, and one with retries.
- [x] Walked: the screen lists all five shapes with their filters, the payload
      opens on the row, and the order's payments tab shows the four callbacks
      that belong to its payment — a rejected signature, one that never
      completed, one applied, and a type with no matching state.
- [x] **And the probe caught a blind test.** The check «the route records before
      it returns 401» read the file as text, so commenting the call out left it
      green — the exact shape that fooled gates 50, 52 and 19. `stripComments`
      now has one home (`scripts/strip-comments.mjs`) read by the gates, the
      model tools and this test, instead of the two copies it had.

## 30 · `SeoTemplate` — the prose search engines read — *owner's request 2026-10-19*

> «اصلح SeoTemplate»

Named by gate 63 as a model nothing edits. Measuring found worse: **nothing
reads it either.** One seeded row (`search_results`), surface `search`, and no
query anywhere in `src/` touches the table — so decision 26's «قالب +
متغيّرات… يحرّرها الأدمن» was never wired at either end.

And what the landing pages actually print comes from `src/messages/*.json` —
`landing.title`, `landing.meta` — so changing the title a search engine indexes
needs a deploy. The intro and outro paragraphs decision 26 designed, the two
that carry the page's substance, **were never built at all**: the page is a
heading, a stat line, a sort bar and a grid.

- [x] Reader first, in both landing pages — title and description from the row,
      intro above the grid, outro below. The message file stays the fallback:
      an operator who empties a title must not leave the page without one.
- [x] **A paragraph whose variable has no value is dropped whole**, never
      printed with a blank. This is decision 26's own rule («إن كانت العيّنة
      أقل من ٨، أخفِ الفقرة كاملة») generalised: «٠ مفحوصة» and «من إلى» read
      as defects, and on a landing page the defect is what gets indexed.
- [x] Variables are exactly what `landingContent` already computes for *that*
      page — count, price range, inspected count, brand, model, city. No
      market median: `PriceStat` is keyed by model × year × trim × city ×
      mileage bucket, and a figure averaged across years is not «متوسط سعر
      يوكن في جدة». CLAUDE.md records that exact lie («الوصفُ يُبنى من
      المُطابِق لا من المُدخَل»). Raised with the designer instead.
- [x] `/admin/seo` with a live preview, the variable list per surface, and an
      `AuditLog` per save. Three surfaces, because three pages render them —
      not the six the decision guessed at, and not a `landing_city` surface
      with no page behind it.
- [x] Rows reach a running environment **by migration**, not by the seed.
- [x] Removed from `docs/architecture/editability.md` — gate 63 fails until it
      is.

### Gate 64 — and the second register

The writer side has been guarded since gate 63. The reader side was not, and
`SeoTemplate` is its second instance. Measured across 97 models: six that no
`db.<model>.find*` touches are read through a parent's `include`
(`ListingFeature`, `Invoice`, `InspectionDraftPanel`, `PlanEntitlement`,
`TaxInvoiceLine`, `SettlementStatement`), so a naive check would have cried
wolf six times out of eight. Counting relation reads leaves exactly two, and
after this task, one.

- [x] `WebhookEvent` — **written on every gateway callback and read by
      nothing.** Provider, type, `signatureOk`, `processedAt` and the full
      payload of every webhook we have ever received, with no door to any of
      it: when a payment goes wrong the evidence is in the table and nobody can
      look. Declared in the register, and the screen is the next task.
- [x] `model-writers.mjs` gains `READS` and strips comments before matching —
      it did not, and gates 50, 52 and 19 were each fooled by a comment that
      named what it was looking for. Measured at zero today, so the hardening
      changes nothing now; it is the recorded class, closed before it bites.
- [x] Walked: the panel saved a new title, the public landing page's `<title>`
      changed with no deploy, an `AuditLog` row recorded it, and the original
      was restored through the panel so the trail tells the true story.
- [x] **Measured in a production build, not inferred.** In dev the whole
      template row appears in the HTML — Next's own instrumentation, which also
      serialises the `NEXT_LOCALE` cookie and a row read only inside
      `generateMetadata`, where nothing can reach the component tree. Built and
      served on :3100: zero occurrences of the raw row, zero unfilled `{…}`.

### What the walk caught that no test did

The first wording was «{count} سيارة {brand} معروضة في {city}», and the page
printed **«3 سيارة تويوتا»** into `<meta description>` — «3 سيارات» is the
correct Arabic. The count was governing its noun, which is the Toast lesson
(gate 18) **in a place no gate reaches**: the text lives in the database and is
typed by an operator, with no compiler, no lint and no review.

So it is checked in the two places that can see it: the screen warns while the
operator types, and a test reads the rows **as they are in the database**, which
covers what arrives by migration as well as by seed. All three templates were
reworded so the number ends its clause — «سيارات تويوتا المعروضة الآن في
الرياض: ٣.» — and the sentence never asks the numeral to agree with anything.

## 29 · Financing terms, editable at last — *owner's request 2026-10-19*

> «اصلح FinanceSetting»

Four numbers — down payment, term, annual profit rate, and the price floor
below which no instalment is shown at all — sitting behind every «أو شهريا» on
every car card, and behind whether a listing counts as financeable. Seeded, and
**nothing edited them**: changing a rate the financier renegotiates each season
needed a full deploy. Named by gate 63.

- [x] `/admin/financing`, in «الإعدادات — المال» beside tax, plans and
      deadlines — `/admin/finance` is the P&L dashboard, a different thing.
- [x] **The screen shows the instalment its numbers produce, on three sample
      prices, before the save.** «نسبة الربح ٦٪» does not say what «٢٬١٤٠
      شهريا» says, and the figure being published sits under every car.
- [x] Limits enforced in the domain, not the field: a direct call arrives
      without a screen, and a stray value prints a nonsense instalment platform
      wide. A 100% down payment is rejected — principal zero, instalment zero,
      a number that means nothing.
- [x] Every change writes an `AuditLog`.
- [x] **And the instalment formula was written twice**, byte for byte, in
      `listings.ts` and `listing-detail.ts` — two copies of a money rule that
      diverge at the first edit, so the search card says one figure and the car
      page another. Moved to `money.ts`, which both now call. Making its inputs
      editable raised that risk rather than lowering it.
- [x] The screen computes live, so it cannot import `money.ts` — that reaches
      `db` through `tax.ts` and would drag Prisma into the browser bundle. The
      shared half lives in `src/lib/finance/terms.ts`, and **a test asserts the
      two produce identical figures** across four cases rather than trusting it.
- [x] Walked: the panel saved 9%, and a public search card for an 88,000 car
      then read «أو شهريا ١٬٧٠٠» — the formula's exact output. Restored after.

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

### The production build reached out to Google at build time — *found and fixed 2026-11-24*

A deploy of `28e5377` failed in the image build:

```
src/app/admin/layout.tsx
An error occurred in `next/font`.
TypeError: Cannot read properties of null (reading '1')
  at .../@next/font/dist/google/loader.js:122
```

That is the Google Fonts loader failing to parse what it fetched — a null
regex match on the CSS. Three layouts call `next/font/google` for `Figtree` and
`Tajawal`, so **every production image depends on `fonts.googleapis.com`
answering during `npm run build`**.

**I called it transient, and I was wrong.** The first measurement said so:
`curl` from the host returned 200, a throwaway `node:22-alpine` container —
the same base the build uses — fetched valid `@font-face`, and the deploy
thirty minutes earlier had succeeded on the same code. The retry went through.

**Then it failed again on the next deploy, in the same place.** A fault that
repeats is not a fault that passed; the probe proved only that a *single* fetch
from a shell succeeds, which is a different thing from a build's fetch
succeeding on every deploy. Rate-limiting fits both observations and is not
something the retry disproved.

**`carz-deploy` behaved exactly as designed**: the build failed, the running
container was never touched, and the site stayed up on the previous image.

**And `build:check` would not have caught it** — it passes locally where the
fetch succeeds. This is not the «verify does not build» gap; it is a build that
depends on a third party being reachable at the moment it runs.

**Fixed by not fetching.** Both families are committed as `woff2` under
`src/app/fonts/` (128 KB, SIL OFL, licence beside them) and declared once in
`src/app/fonts.ts` with `next/font/local` — the three layouts had carried
identical copies of the declaration, which is three copies that drift on the
first weight change. `Figtree` is a variable font and Google serves the same
file for every weight requested (measured: one checksum across three), so it
is one file per subset with a weight range rather than three copies of one
file.

`npm run build:check` passes on it. **And running `build:check` before a deploy
is the discipline this cost**: `verify` does not build, so a production-only
failure stays invisible until the deploy — which is written in `CLAUDE.md` and
which I had not been doing.


### A deploy button in GitHub — *owner's decision 2026-11-24, for after launch*

> «سوف نضع زر نشر في قيت هب بحيث اذا انتهينا من كل تطويرات المنصه يكون النشر
> للتحديثات بعد الاطلاق عبر ذلك الزر»

Production is deployed over SSH today, by the assistant on the owner's behalf
while the build is in progress. After launch it becomes a
`workflow_dispatch` action the owner presses: it connects to the SCCC box and
runs `carz-deploy`, which already does the whole job — tags the image by
commit, leaves the running container alone on a failed build, polls
`/api/health` for ninety seconds and rolls itself back.

**Deliberately not `on: push`.** A merge should not be able to change `carz.sa`
without someone meaning it. The button removes the SSH, not the decision.

Needs: a deploy key in GitHub secrets, and the action restricted to `main`.


### The production database has no backup — *owner's decision 2026-11-23, deferred to before launch*

> «نؤجل اعدادات النسخ الاحتياطي و نسجلها ضمن المهام لاحقاً و قبل الاطلاق النهائي»

`scripts/ops/backup.sh` is written, verifies its own dump before uploading, and
prunes to a 30-day window. What it lacks is a destination: an OSS bucket in the
same Riyadh region, a RAM key pair, the four `BACKUP_*` variables, a daily cron,
and **one restore drill** — `scripts/ops/restore-drill.sh` exists for it, and a
backup never restored is not a backup.

Until that is wired, production holds the only copy of every row in it. Today
that is the reference catalogue and one admin, which is why deferring it costs
nothing yet. **It stops costing nothing the day a real seller publishes a real
car**, so this is sequenced before launch, not merely before growth.


### Cloudflare CDN in front of carz.sa — *owner's decision 2026-11-23, deferred to before launch*

> «راح نؤخر ربط كلاودفلير CDN للدومين … قبل الاطلاق النهائي نضبط ربط كلاودفلير cdn»

The production ECS has **5 Mbps of bandwidth**, pay-by-traffic. That is roughly
625 KB/s shared across every visitor, and one page load of JS bundles is about
300 KB — so two concurrent visitors saturate the link. A CDN in front moves the
static bytes to the edge and leaves the origin serving HTML and API only.

It also brings, on the free plan: a TLS certificate with no renewal to watch,
DDoS protection, a hidden origin IP, and a smaller bandwidth bill.

**Do it before launch, not after.** The settings:

- DNS for `carz.sa` on Cloudflare, proxied (orange cloud).
- SSL mode **Full (Strict)** with a Cloudflare Origin Certificate installed on
  the server. Never *Flexible* — it leaves Cloudflare→origin unencrypted while
  the padlock tells the visitor otherwise.
- Cache everything under `/_next/static/` and `/public/`; bypass `/api/`.
- WebSockets on (the realtime service needs them).

Until then the origin serves TLS itself and the 5 Mbps is the ceiling — which
is fine while the only visitors are us.



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

## ٢٠٢٦-١١-٢٥ — المزايدة التلقائية وإلغاء المزايدة

طلبُ المالك في جلسة 40a: جوابًا على ثلاثة أسئلة مرفوعة، قال «اعمل
الأفضل» في المزايدة التلقائية حتى سقف وفي إلغاء المزايدة، و«ارشاد» في
تقييم سعر السوق (أي يبقى مجّانًا بلا خدمةٍ مدفوعة).

- [x] القاعدة ١١ — النيابة حتى سقف: حقلُ `Bid.maxAmount` سرّيّ، ومحرّكٌ
      يحسم في خطوة، وزرٌّ في نافذة المزايدة.
- [x] إلغاء مزايدة — صلاحية `bids.cancel`، وجدول `CancelledBid`، وحدث
      `AuctionEventKind.BID_CANCELLED`، وقالبا إشعار، وزرٌّ في
      `/admin/auctions/{ref}`.
- [x] «تقييم سعر السوق» — قرارٌ بعدم البناء، مسجَّلٌ في الانحرافات.

## ٢٠٢٦-١١-٢٥ — الكتالوج والإعدادات الأساسية وبيانات العرض

طلبُ المالك نصًّا: «تضيف البراندات و الموديلات بدل ما اضيفها بشكل
يدوي و كذلك المدن و حقول مواصفات السياره الموجوده في اعدادات الادمن
مثل الفئه و نوع المحرك … الخ من الاعدادات الاساسية المطلوبه لتشغيل
المنصه. وتضيف بيانات ديمو كأنها واقعيه عشان نختبر عليها و بحيث اذا
فتحت الادمن اجد بيانات و معاملات في مختلف الحالات و اعلانات في مختلف
الانواع و الحالات».

- [ ] كتالوج الماركات والطرازات والفئات — كاملًا لا يدويًّا
- [ ] المدن
- [ ] حقول مواصفات المركبة في إعدادات الأدمن (الفئة · نوع المحرك · …)
- [ ] بيانات عرضٍ واقعية: معاملاتٌ في مختلف الحالات، وإعلاناتٌ في
      مختلف الأنواع والحالات — تُرى عند فتح اللوحة
