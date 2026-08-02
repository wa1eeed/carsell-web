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

**Status: awaiting design review.**

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
