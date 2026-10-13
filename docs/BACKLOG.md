# Open work — the owner's list, tracked

Everything the owner has asked for that is not yet done, so nothing lives only
in a conversation. Closed items stay here with their commit so the list reads as
a record, not a wish.

Updated: 2026-10-13.

---

## Done

| # | Item | Commit |
| --- | --- | --- |
| 1 | Cancelled order still demanded payment — 9 places, incl. the server guard | `c019bfe` |
| 2 | Mobile header overflow (41px) and the logo class that never applied | `dce1a58` |
| 3 | Commission editor sat in the monitoring tab — moved to Settings | `cc00270` |
| 4 | English locale showed Arabic **data** (brand, model, trim, city, colour) | `b7cd619` |
| 5 | Browse opens on the list; list row fits a phone | `f407bf4` |
| 6 | Services banner carries the car; services page car picker verified | `fa53eba` |

---

## Open

### A · Pages that do not match the design

The owner supplied screenshots of the original design next to the build. These
are examples, not the whole set — each screen is compared against its block in
`design/Front-end Web.dc.html` before it is called done.

- [~] **Auction detail** — the bid log is now the design's table (bidder ·
      timestamp · step · type · status · amount), with the «٦ مزايدات · ٤
      مزايدين» header and a card layout below `sm` so the amount is never
      behind a horizontal scroll. Countdown, closing-soon rail, dealer card and
      the stats strip were already built. Still missing from the design:
  - [ ] **CSV download** of the bid log — needs a route.
  - [ ] **Cancelled bids** («ملغاة · إخلال بالشروط») — `Bid` has no
        cancellation field. Who may void a bid and on what grounds is a
        business rule, not a layout question.
  - [ ] **Inline event rows** — «مُدّد وقت الإغلاق ٥ دقائق» and «أُلغيت
        مزايدة #U-… — إخلال بشروط المزاد» between the bid rows. Needs the
        extension and cancellation events to be recorded per auction.
  - [ ] **«اعرض الـ١٣ مزايدة الأقدم»** — the log shows every bid today.
- [~] **Account home** — the tab bar is gone; the page now stacks the design's
      sections (إعلاناتي · العروض الواردة على مركباتك · طلباتي · مزاداتي ·
      تقارير الفحص), three rows each with «عرض الكل» to the full page, and each
      stat card carries the sub-line the design draws under it. Still missing:
  - [x] The **sidebar** the design puts beside the content — a sticky 300px
        column holding the profile card and the sections, one column inside it
        and two below `lg`.
  - [ ] Plates — see **F** below.
- [x] **Sell wizard** — walked against Wh. The 3-step progress, the stats row
      (commission read from `CommissionRule`, not written by hand), the photo
      grid with its cover / plate-blurred / blurry badges and duplicate check,
      and the price range bar with the above-below-market line were all already
      built. What was missing was the **hero's sub-paragraph** — the screen went
      from a headline straight to numbers, so a first-time seller never read that
      listing is free and the money comes through escrow. Added, in two versions:
      the design's sentence promises VIN lookup, which sits behind a flag, so the
      copy only offers it when the field is actually rendered. Days-to-sell at
      two prices stays out, with the reason recorded in `DESIGN-DEVIATIONS.md`.
- [x] **Order detail** — walked as both parties: escrow panel, stage tracker,
      order path, amounts, documents and the cancel block are all there, and the
      cancel button is correct for the seller too (`cancelOrder` admits either
      party, which the screen states). What was missing was the **way in for the
      seller**: «طلباتي» lists what the user *bought*, and the order reference on
      «مستحقّاتي» was plain text — so whoever sold the car could not open the
      page at all, while the page itself accepts them. The reference is now a
      link (verified signed in as a seller with two sales: both refs open, 200).

### B · My cars (the garage) — **usable end to end**

The design has had it from the start: «٣ مركباتي · ٢ معروضة · ١ في المرآب» on
the account home, and «سياراتي ٣» first in the sidebar. The admin dashboard
counts a `garage` segment («مركبة بلا إعلان»).

**Measured: 61 vehicles, 61 listings, 0 in the garage** — the count cannot
exceed zero, because the only path that creates a vehicle (`/sell`) always
creates a listing row with it, draft included.

- [x] A path that creates a vehicle with no listing — `addVehicle` in
      `src/lib/domain/garage.ts`, and two seeded so the state is reachable.
- [x] `/account/vehicles` — state badge per car, «اطلب خدمة» on all,
      «اعرضها للبيع» on garage cars.
- [x] Account stat «مركباتي» with its listed / garage breakdown, and
      «سياراتي» first in the sections list.
- [x] `/sell` finishes as «احفظ في سياراتي» from the vehicle step —
      `POST /api/v1/vehicles`, walked by clicking end to end.
- [x] Edit (mileage · colour · city) and remove a vehicle — the schema's own
      `Restrict` on `Listing` and `InspectionReport` writes the delete rule.
- [ ] A plate («لوحة») in the garage — the mobile design's empty state says
      «أول إضافة، سيارة أو لوحة», and plates are sold on the platform.

### C · Every account section and every admin page, one by one

The owner's standing instruction: walk each screen and add what it lacks, judged
as a UX and marketplace specialist would, not only what was specified.

Account: home · listings · orders · offers · favourites · searches · reports ·
earnings · wallet · notifications · profile.

Admin: dashboard tabs · orders · listings · users · dealers · auctions ·
disputes · services · campaigns · catalog · finance · tax · payouts · ledger ·
settlements · deadlines · plans · payments · team · audit · exports · ads ·
faq · contact · settings.

**Swept 2026-10-13:** all 37 routes fetched with a signed-in session — every one
200, none redirecting to login, so no page is broken. `npm run dead-ends` was run
instead of eyeballing them; it named `EntitlementOverride` as having no writer at
all while `/admin/plans` counted it and promised «وكل تجاوزٍ يُمنح يظهر هنا
بسببه ومدّته». That door is now open (`grantOverride`, reason required in the
domain, audited, walked end to end).

**Swept again 2026-10-13 (service requests, providers):**

- `/admin/service-requests` — the four stat cards were computed from the
  *filtered* list, so clicking one made the other three describe themselves:
  `?overdue=1` read «الإجمالي ١» with eight in the queue. «تجاوزت المهلة» was
  defined in four places (row badge, card, a client-state button, a domain
  filter) and two of them disagreed on the one-hour boundary. One `scopeWhere`
  now feeds both the counter and the query; the card *is* the filter; gate 40
  was extended to the cards and proved by reverting the defect. `26cfea9`
- `/admin/providers` — `ServiceProvider` had **no writer but the seed**, while
  the page footer promised «إضافة مزوّد وتعديل بياناته». Service requests are
  assigned to providers, so onboarding an inspection company meant writing SQL
  by hand. `saveProvider` (create + edit, audited, phone normalised, `Decimal`
  commission) with a form on the page; `active` stays with the row's own button
  so saving a phone number cannot disable a company by accident.

- `/admin/faq` — `FaqItem` had **no writer but the seed**: the screen hides,
  shows and places questions, but could not add one or fix a character in one.
  And it **counts «ترجمة ناقصة» and badges every row missing English** — a
  problem tallied, its rows named, with no door to fix it. `saveFaq` (create +
  edit, audited, order derived from the top of its category rather than from a
  count) with a text editor on the row. English is warned about, never required:
  blocking the save pushes the editor to write bad English just to get past it.
  Hiding and placement stay on their own buttons — a form that does not send
  `active` would read as «hide it», so fixing a typo would pull a question off
  the site.

- `/admin/ads` — `AdSlot` is a **catalogue of placements**, each rendered by a
  hard-coded key in a screen, so creating one from the panel would sell a product
  nothing can show. Create stays with the seed, as it does for
  `NotificationTemplate`. What the measurement did find: of the seven priced
  slots (1,200–6,000 SAR), **only `search_inline` is called anywhere in the
  product** — and it rendered in grid mode only, while the owner made the list
  the default view, so the one wired placement was invisible to most visitors.
  Fixed with `SponsoredRow` (same shape and rhythm as `CarRow`, sharing the
  impression counter so a CPM slot cannot bill differently per view mode).

- Every sold ad placement now renders at the position its row states, except
  one. `search_inline` (both view modes) · `home_banner` (between the auction
  rail and «أُضيفت حديثًا», where the design draws it) · `vehicle_inline`
  (directly under the price) · `brand_featured` (first cell of the brand grid,
  1:1, measured 131×131 beside a 131×131 neighbour) · `service_featured` (first
  cell of the first directory section) · `empty_state` (only when the account
  page is reached with `?listed=`, i.e. the moment after publishing). Gate 44
  keeps it that way: every active slot in `ad-slots.json` must be called by a
  screen, exemptions by written reason only.

- [ ] **`home_story` (1080×1920, «أعلى الرئيسية», 1,200/day) has no design.** It
  appears in neither `Front-end Web.dc.html` nor `Supper App.dc.html`, and a
  9:16 creative is a format, not a banner. Question logged in
  `DESIGN-DECISIONS.md` with a proposal (a story rail under the header);
  exempted by name in gate 44 until it is answered.

- `/admin/payments` — **«مربوطة» is a row, «تُحصّل» is code.** Four gateways sat
  in the database, all `ACTIVE`; two adapters exist (`moyasar`, `sandbox`). The
  screen read «4 بوابات مربوطة», put «بيع المركبات — الضمان» on the bank gateway
  and showed «254,570 ريال محجوز الآن» with its full capability list — while
  every payment through it returns `GATEWAY_NOT_CONFIGURED`. The buyer finds out
  by pressing «ادفع». `resolve.ts` knew it, in a comment.
  `IMPLEMENTED_GATEWAYS` is now **derived** from the adapter registry (writing it
  by hand did not hold: a test that compared the list to behaviour passed when
  `tap` was added to it falsely, because it only checked what was outside the
  list). The screen counts «بوابتان تُحصّلان» beside «4 مربوطة», badges a gateway
  with no adapter «بلا وصلة», and warns by name which purposes accept no payment
  right now — before anyone tries, not after.

- [ ] **`VEHICLE_ESCROW` and `TRANSFER_FEE` route to `bank_escrow`, which has no
  adapter.** On seed data, buying a car cannot be paid for at all. `npm run
  trial:on` moves them to the sandbox for walking the journey; the real fix is a
  bank-escrow adapter, which waits on the bank integration.

- `/admin/tax` — the screen read «لا فواتير بعد · تصدر الفاتورة عند التسوية
  المؤكَّدة», which reads as *no settlement has happened yet*. Two had, and the
  invoices were **blocked**: `issueSettlementDocuments` builds `blocked` with a
  reason per supply, writes it as an `invoice.blocked` order event, and the event
  was readable only in that one order's timeline — not on the screen where
  whoever watches compliance stands, and they do not know which order to open.
  The first monthly reconciliation would surface a gap with no written answer.
  `blockedInvoices()` now lists them by order reference, each line naming the
  supply and the reason, and the empty state says «لا فاتورة صدرت» with a
  pointer rather than implying nothing settled.

- [ ] **The platform charges zero.** `CommissionRule` is 0% + 0 fixed on the
  seller side, the buyer side is disabled, and completed orders carry
  `commissionAmount: 0`, `transferAdminFee: 0`, `processingFee: 0` — on a 70,810
  SAR sale, CARZ earns nothing. The screen says «كلها مجانية اليوم · العمولة
  صفر», so it is honest, not broken: the number is unset. Owner's decision
  before launch.
- [ ] **No tax invoice can be issued for a vehicle sale.** Four rules sit in
  `AWAITING_MEMO` pending the «المورِّد المفترض» classification, so `VEHICLE`
  issuance is blocked by `RULE_AWAITING_APPROVAL`; with commission at zero there
  is no commission invoice either. The twelve questions for the adviser are in
  `docs/tax-model.md`.
- Plans: all three are priced 0 and every subscriber is on `free`; `Subscription`
  has no writer in the product. Buying a plan belongs with the dealer panel the
  owner deferred, so it was **not** built — the measurement said so before the
  work started.

- `/admin/settlements` — all 254,570 SAR held sits on `bank_escrow`, the gateway
  with no adapter, and the screen promises «عند الاعتماد يُنادى المزوّد». Two
  people would spend their approvals and the release would then fail.
  `GATEWAY_UNAVAILABLE` is now a settlement block, enforced in `requestSettle`
  as well as shown (a guard only on the screen is a suggestion). **Order
  matters**: checking the gateway first relabelled three orders whose real
  blocker was «لم تُؤكَّد الملكية», hiding what the operator can act on behind
  what they cannot — so it is checked last, and only speaks when everything else
  is clear.

- **Test rows were cleaned before a run, never after it.** Between `npm run
  verify` and the next one, the dev database — which is what the owner actually
  looks at — held **11 admin accounts where 3 are real, one of the eight a
  `SUPER_ADMIN`**, and «الفريق والصلاحيات» listed them all as staff. Nine test
  files create an admin with no `afterAll`, so this is a class, not nine
  oversights: the sweep in `global-setup` now also runs as vitest's teardown, so
  a run leaves the database as it found it. Measured after a full run: 3 admins,
  0 stamped, 0 test campaigns, 0 stray events.

- **Three screens claimed automation that does not exist.** `/admin/identity`
  said «التوثيق عبر النفاذ الوطني يتم تلقائيًا» and its empty state repeated it —
  but `submitIdentity('nafath')` has no caller and the integration is «بلا
  مفاتيح», so *every* verification passes a human; an operator reading that line
  staffs the queue as if it were a residue. The lead now reads the integration
  row, so it corrects itself when the keys arrive. `/admin/providers` said «الطلب
  يُسنَد آليًّا للمزوّد المفعّل في مدينة العميل بأقلّ حِمل قائم» — none of that
  happens: `service-purchase` writes the provider linked to the service in the
  catalogue, with no city match and no load balancing, which is also why requests
  arrive unassigned.

### KYC / KYB — identity for people and for businesses

**Owner's direction, 2026-10-13:** Nafath will not be connected now (contracting
with the provider takes time), so registration should get smarter instead —
KYC-style for individuals, KYB-style for the commercial side (showrooms and
agencies).

Built: `AccountType` on `User` (`INDIVIDUAL | BUSINESS`) plus `businessName`,
`crNumber`, `crExpiresAt`; `vatNumber` was already there. `identityMethod`
carried `commercial_register` from the first schema **with no writer** — nothing
in the product could mark an account as a business, so verifying an agency went
down the individual path and asked only for the signatory's national ID. The
account type is asked at **first verification**, not at sign-up: sign-in is a
phone and a code, and a step there taxes the majority for the minority's sake,
while the answer is needed exactly when identity is.

Person and entity are **one submission and one decision**: splitting them makes
the reviewer rule twice on half a picture, and leaves an account whose person is
verified and whose business is not — buying as itself and selling as the firm.
An expired CR is refused at submission, not at review, so nobody waits two days
to be told. The admin queue row now says «منشأة», names it and shows the CR, and
badges an expired register, because reviewing a business is not reviewing a
person.

**Owner's spec, 2026-10-13 — registration and onboarding.** Individuals register
with name, phone, city and a password; afterwards the profile still needs the VAT
answer (plus the number if registered) and the bank details (bank name + IBAN).
The commercial side registers as a **dealer account** with showroom name, phone,
email and password, then an onboarding completes CR number, address and IBAN to
reach 100%. Both see a completion percentage and a banner at the top of the
account that leads to the data page and points at what is missing.

Built in this pass: `city`, `bankName`, `address` and `passwordHash` on `User`
(password nullable — 29 existing accounts have none and keep the one-time code,
and a required column would lock them out); `profileCompletion` now returns
`percent` and a **per-type** required list (individuals are not asked for an
address, businesses are not asked for a single city because their address carries
it); the banner on the account home shows the bar, the percentage and the trust
line, and each missing field still links to its anchor on the profile page; and
the profile page grew the city / address / bank-name / VAT-status rows so none of
the newly required fields is a lock without a key. The VAT row completes on
**being answered** — «لا تنطبق عليّ» is a complete answer, and requiring a number
would leave every unregistered individual permanently incomplete.

- [ ] **Registration with a password is not built yet** — sign-up is still phone
  + one-time code, and the dealer registration path (showroom name, email,
  password) with its onboarding screen is the next piece.
- [ ] **Documents are not collected.** KYB normally takes the CR certificate and
  the authorisation; today only the numbers are typed. Needs the owner's call on
  which documents are required before launch.
- [ ] **Business accounts and `Dealer`.** A verified business is a `User` with
  `accountType: BUSINESS` — the `Dealer` row stays the *storefront*, created with
  the dealer panel when that is built. Flagged for the owner in case they want
  one entity instead of two.

**Deferred by the owner, 2026-10-13 — dealer onboarding.** `Dealer` has no
writer but the seed, so `/admin/dealers` counts «تنتظر التحقّق ٢» and carries
approve/verify/suspend buttons for a queue nothing can ever add to, and the
public `/dealers` page can only ever show the seeded showrooms. A join form was
built and walked end to end (application → admin queue → verify → status on the
account), then **reverted on the owner's instruction**: the dealer control panel
is to become an operating system for the showroom's business — inventory, sales,
POS, invoicing — alongside listing into the CARZ market, and what the join form
asks for, what the dealer commits to and which plan they enter on all follow that
design. Building it now means building it twice. Revisit with D1–D11.

Kept from that work: `normalizeSaudiContactPhone`. A showroom's or an inspection
company's number is a **business** line, usually a landline — the provider form
shipped in `98d78b4` rejected `+966 11 234 5678` as invalid. Account identity
stays mobile-only (it receives the OTP).

- [ ] `ApiKey` — no writer anywhere, while `public-key.ts` authenticates
      partners by key: **the partner API cannot be reached by anyone.** Issuing
      keys is an access-control decision (who may hold one, what it may read,
      how it is revoked), not a missing form — needs the owner's call.
- [x] `FaqPlacement` — a placement editor per question (replace-not-append,
      closed surface list, audited), walked end to end to the car page.
- [ ] `DeviceToken` — no writer until the mobile app exists.

### D · English UI strings — deferred by the owner

**624 lines across 68 files** of Arabic written into the public site's
components. The owner chose to ship the data fix and defer the translation. The
English site stays partly Arabic until this is done — known, not missed.

### E · Known risk, awaiting a decision

`cn` concatenates class names and does not merge Tailwind utilities, while its
comment claims the last one wins. A base utility can silently defeat one passed
by a caller, with the class visible in the DOM so inspection looks right. It hid
the logo's size for as long as the header has existed. `tailwind-merge` fixes it
everywhere and adds a dependency; the alternative is auditing each component.

### F · Plates as a sellable item — **awaiting the owner's decision**

The design treats a plate as a first-class listing beside cars: it appears in
«مزاداتي» («لوحة · أ ب ج ١٢٣ — ٦ مزايدين»), in incoming offers («فيصل ن. —
لوحة · ر ك م ٧٨٩»), and the mobile empty state reads «أول إضافة، سيارة **أو
لوحة**». It carries its own explanation:

> لوحة معروضة. النقل إلكترونيّ عبر أبشر بعد الدفع — بلا فحص ولا معاينة.

**The owner has overruled the design's last clause** (2026-10-13): a buyer is
**not** required to own a vehicle that can carry the plate. A plate may be
bought to hold, to gift, or for a car not yet owned — and a platform that asks
"do you have a car for this?" turns away a buyer for no benefit of its own.

**The product has none of it.** `Vehicle.plateLetters` / `plateNumbers` are the
plate *of a car*, for identification and blurring in photos. `ListingType` is
`DIRECT | NEGOTIATION | AUCTION` with no plate anywhere. Every screen assumes a
listing is a car: inspection, viewing, mileage, brand and model, a transfer
appointment at the traffic department.

A plate is not a cheaper car — it is a different journey:

| | Car | Plate |
| --- | --- | --- |
| Inspection | central | none |
| Viewing | appointment and place | none |
| Transfer | traffic appointment | Absher, electronic |
| Data | brand · model · mileage · colour | letters · numbers · class |
| Buyer condition | verified identity | same — **no vehicle requirement** |
| Search | brand, year | pattern: triple, repeated, short number |

Escrow still applies — but what *proves* transfer differs: an appointment for a
car, an Absher notification for a plate.

**Four decisions needed before any of it is built:**

1. Before launch or after? This is a new listing type with a full journey, not
   a field.
2. Commission — the same rate as cars, on an item that ranges from 28,000 to
   several hundred thousand?
3. Who verifies the plate belongs to the seller, with no Absher integration?
   Manual review by the team, or seller's word plus escrow?
4. ~~Is «you must own a vehicle that can carry it» enforced?~~ **Answered
   2026-10-13: no such condition.** The buyer needs nothing beyond the identity
   verification any purchase requires.

**Decided 2026-10-13: after launch.** The owner confirmed plates are a new
journey to be built once the core marketplace has shipped. Original reasoning
below. The core market is cars; plates double
the test surface and the money path without adding liquidity in the first
months. And «سياراتي» now exists, which is where a plate naturally lives when it
comes.
