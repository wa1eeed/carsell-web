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
  - [ ] The left **sidebar** («لوحة الحساب») the design puts beside the
        content — the build has «أقسام حسابي» as a grid at the bottom instead.
  - [ ] Plates («لوحة · ر ك م ٧٨٩») appear in the design's offers and auctions
        rows; the product has no plate listings yet.
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
- [ ] Edit and remove a vehicle from the garage.
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
