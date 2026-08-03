# Design deviations

Screens or components built **without design markup**, and places where the
build departs from the markup on purpose. Each entry states what was built, on
what basis, and what the designer still has to review.

## BodyTypeStrip — built without Wa markup · 2026-08-02

**Status: awaiting design review.**

`BodyTypeStrip` is listed among Wa's components in §10 but has **no markup in
Wa**. The owner confirmed it was dropped by mistake when the web version was
built from the app, and that it is genuinely designed — in screen **13a** of
`CarSell Redesign.dc.html` ("ابحث حسب الفئة").

### What it was built from

Screen 13a, adapted to the web:

| From 13a | On the web |
|---|---|
| Horizontal scrolling row, 126px cards | Same row, `w-32` cards |
| Silhouette image, Arabic name, count | Same three |
| Section head with an "all" link | Standard `SectionHead` |

### Placement — the owner's ruling on my objection

I argued the strip would crowd brands, since make is what a Saudi buyer searches
first. Partly upheld: **makes stay on top, body type follows immediately, and
finance drops one place.**

### Rules that came with it

- 6–8 cards in a **scrolling row, not a grid**. A grid forces a height that
  crowds what follows on a small screen.
- **No image → the name alone.** Not an initial letter: a body type is a *shape*,
  not a name, and "S" in a box tells nobody "sedan".
- **Empty types are hidden, not disabled** — the opposite of the payment bands.
  There the ladder itself is information ("nothing under 1,000 riyals" is an
  answer); here "no vans listed" is not something anyone is looking for.
- Clicking opens Wb filtered by `bodyType`.

### Admin (A12)

`BodyTypeDisplay` is a **display table, not an entity table**. Its primary key is
the `BodyType` enum itself, so there is no second reference that can drift from
the enum and no vehicle can point at a type with no name.

Consequently the admin API exposes **`PATCH` only** — no create, no delete.
Adding a type means a schema migration; deleting one would orphan vehicles. The
admin edits both names, the image, sort order and visibility.

Hiding a type removes it from the home row and touches neither the search filter
nor any listing.

### Still to review

- The silhouette artwork itself (none uploaded yet; cards render name-only).
- Whether the row should also appear on Wb as a filter entry point.

## Body diagram — schematic, not a car outline · 2026-08-02

**Status: RESOLVED 2026-08-02.** The artwork arrived as
`public/diagrams/car-body-top.svg` and is now rendered; the schematic remains
only as the fallback when the file is absent. Everything below is kept as the
record of what was built in the interim.

Wd's markup draws the paint map as an `<svg>` car outline. What was built is a
grid of labelled rectangles carrying the same panel keys, the same three states,
the same legend and the same tooltips.

**Why:** the outline is artwork, not layout — it needs a drawn asset, and
approximating one by hand produces a shape that reads as a mistake rather than a
car. The schematic is honest about being a schematic.

**What is identical:** panel keys, states (`original` / `repainted` / `replaced` /
`unknown`), the legend, per-panel tooltips, and the summary paragraph.

**To supply:** a single SVG car outline with `id` per panel; the component then
swaps `<rect>` for `<path>` and nothing else changes.

---

## A7 ordering — arrows, not drag handles · 2026-08-03

A7's markup shows a `⠿` drag handle in every row and a footer reading "drag to
reorder how they appear in the services directory".

**What was built:** a `ترتيب العرض` toggle — the button the design already has in
the header — which reveals `↑` / `↓` in each row. Off by default.

**Why:** drag needs a pointer. Arrows work from the keyboard, announce themselves
to a screen reader, and each press is one auditable move rather than a gesture
that has to be interpreted. Two arrows in every row of a table nobody is
reordering is noise, hence the mode.

**What is identical:** the ordering itself (`Service.sort`), where it takes
effect, and the header button that starts it.

**To change it back:** `moveService` already swaps two neighbours; a drag
implementation would call the same function with the same arguments.

---

## A7 editing — a drawer, not inline fields · 2026-08-03

A7's row action is a single `تحرير` button. The first build put a price input in
every row instead.

**Why the design is right:** a table is scanned, not filled in. Every row being
one stray keystroke from a price change is the wrong default for the screen that
sets what customers pay — and the inline inputs also rendered Latin digits in a
column of Arabic-Indic ones, which is what made the deviation visible.

**What was added beyond the design's row action:** the drawer edits names,
descriptions, price, SLA and placements, and carries the publish/hide action.
The design lists further per-service settings the schema cannot yet hold — see
`docs/OPEN-QUESTIONS.md` §12.

---

## A3 — no charts, and figures that need a provider · 2026-08-03

A3's markup has a 12-month GMV/revenue chart, a revenue-mix donut, and a monthly
expense card.

**What was built:** the numbers those visuals summarise, as cards with their
breakdowns — GMV by source, revenue by stream, escrow by state, subscriptions by
plan — plus the composite indicators and the commission simulator.

**Why:** no charting approach has been chosen anywhere in the admin yet, and
picking one inside a single screen makes it that screen's choice rather than the
console's. The expense card renders `FinanceInput` values that the inputs table
already lists row by row.

**To add them:** every figure the charts need is already returned by
`financeSummary` and `indicators`; only rendering is missing.

---

## A8 — delivery rates and test send omitted · 2026-08-03

A8's markup shows email delivery 98.4%, SMS delivery 96.1%, and buttons for
"test send" and "delivery log".

**What was built:** sent count (from `Notification`), estimated SMS segments and
cost — the last two explicitly labelled estimates.

**Why:** delivery rate is a fact only a provider knows, and no provider is
contracted. Showing a computed-looking percentage with nothing behind it is
worse than showing nothing. Same for a test send with nowhere to send to.

**Also omitted:** "+ new notification". A template is keyed to the code that
emits it, so a template with no emitter is a text nobody will ever send.

---

## A1 — two cards omitted, not approximated · 2026-08-03

A1's markup has eight cards. Six are built; `المستخدم النشط` and `مصدر التسجيل`
are not.

**Why:** neither has a source. Active-user counts need an activity log; the
registration source needs a column on `User` written at signup. The screen says
so in a line at the bottom.

**Why not a placeholder:** the acceptance criterion for this screen is that every
number comes from the database. A card showing an estimate is exactly the shape
a hard-coded number takes in practice — it never arrives as a literal, it
arrives as "temporary until the data exists".

**Also omitted:** the 12-month growth chart, the customer pie, and the
registration-source chart, for the same reason as A3's charts.

---

## A11 — one environment, arrows of governance instead of a toggle · 2026-08-03

A11's markup shows a `بيئة الاختبار` / `إنتاج` switch with separate keys per
environment, per-integration health percentages, and a monthly cost figure.

**What was built:** one configuration per integration, the failure behaviour of
each shown in its own row, and the full key-governance flow — encrypted storage,
hint-only display, and two-member rotation.

**Why:** two environments is a schema decision (two rows or a second column) that
changes how every integration is read at runtime. Health percentages and cost
need a provider reporting real numbers, and there is no provider yet — the same
rule as A8's delivery rates.

**What is identical:** the grouping by category, the status vocabulary
(تعمل / تحذير / غير مفعّلة), the declared failure path per integration, and every
line of the key-governance panel — each of which is now enforced in code rather
than described in a paragraph.

---

## A9 — the rules engine before the composer · 2026-08-03

A9's markup shows a visual segment builder (conditions joined with «و», a
`+ شرط` button, live counts) and a campaign composer with A/B split and
send-time optimisation.

**What was built:** the rules engine underneath it — the closed field list, the
`NOT` handling, the three-number live resolution, the cooldown and monthly cap,
and the send path that recomputes at send time. The screen reads segments and
campaigns; it does not yet compose them.

**Why:** the visual builder is the certain part — it can be built any time
against a settled engine. The engine is the part with the acceptance criterion
attached, and building the editor first would have meant designing the rule shape
around the UI rather than around what a marketing send must not get wrong.

**What is identical:** the three counts and their labels, the five guard rules
in the panel, and the separation of marketing from transactional.

---

## A10 — a table that reads, because the rule is not the admin's to change · 2026-08-03

A10's markup shows per-channel toggles for sound, badge, open and delivery rates.

**What was built:** the six channels with their critical flag, the default state,
and how many users muted each. No toggle for `userControllable`.

**Why:** turning a critical channel into a mutable one is a product decision. A
switch for it in the console makes it happen by button-press. The flag is a
migration away when someone decides to change it — which is the correct amount of
friction.

**Also omitted:** delivery, open and opt-out rates, for the same reason as A8 —
they come from a provider that does not exist yet.
