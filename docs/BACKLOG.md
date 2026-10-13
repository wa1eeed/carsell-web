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
- [ ] **Sell wizard — vehicle step** — hero with stats, 3-step progress, photo
      grid with quality badges, price range bar with days-to-sell.
- [ ] **Order detail** — escrow panel, stage timeline, documents, cancel block.

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

- [ ] ~~Six sold ad placements render nowhere.~~ `home_story` («أعلى الرئيسية»,
  1,200/day) · `home_banner` («أسفل الملخّصات», 3,500/week) · `brand_featured`
  («أول خانة», 6,000/month) · `vehicle_inline` («أسفل السعر», 35 CPM) ·
  `service_featured` («أول الدليل», 2,800/month) · `empty_state` («بعد النشر»,
  12 CPM). Each carries its placement in the row, each is active and priced, and
  `/admin/ads` sells them. Nothing renders today because there are no live
  campaigns, so wiring them changes no pixel until one is sold.

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
