# Components

Everything lives in `src/components/ui/`, with two shells in
`src/components/admin/` and `src/components/site/`.

**A screen is composition, not drawing.** If a screen needs an element that does
not exist, add it here first with all its states, then use it. Review every state
at `/dev/ui` against the matching design card before closing a task.

Build order is dependency order: atomic → composite → shells. Nothing below
imports from something above it.

## Atomic

### `ArabicNumber`
Every displayed number goes through this. It applies `font-num`, converts to
Arabic-Indic in `ar`, and wraps the result in `bidi-isolate`. Props: `value`,
`decimals`, `grouped`.

### `Money`
Amount plus currency. `struck` for a previous price, `negative` for a discount or
refund — **rendered green, not red**, because red means failure only. Currency is
a separate segment so it cannot slide between the number and what follows.
Sizes `sm | md | lg | xl`.

### `Badge` · `InspectedBadge`
Status tag in five tones (`neutral · accent · warn · danger · ink`), one size.

`InspectedBadge` is a filled green "مفحوصة" with **no number**. There is
deliberately no "not inspected" state: the absence of the badge means no
inspection was done, not that one failed.

### `Button`
`primary · outline · ghost · danger · icon`, sizes `sm | md`, optional `count`
badge, optional leading `icon`. `md` and icon-only variants meet the 44×44
minimum touch target.

### `Chip`
A capsule — that is what separates it from `Badge`. Filter chips are clickable,
`active` renders dark, `count` shows a circled number, `onRemove` adds the × used
by the active-filter row on the search page. Disabled chips are inert.

### `PlateBadge`
Saudi plate: KSA strip on top, then Arabic digits and letters, then the Latin row.
Sizes `sm | md | lg`. Everything inside is `font-num` including the letters —
plate letters are symbols, not text — and the box is `dir="ltr"` because the
order of digits and letters is fixed regardless of page direction.

### `Countdown`
`HH:MM:SS`, **Latin in both languages**. It stops on `visibilitychange` and
recomputes on return, so no timer runs in a hidden tab. Remaining time is derived
from a timestamp difference rather than a decrementing counter, so it cannot
drift. Tones `ink | warn | plain`; `onEnd` fires once at zero.

### `ScoreRing`
Inspection score out of 100 in three sizes. Colour is meaning, not decoration:
≥80 green, ≥60 ochre, below that red. Thresholds live here so the vehicle page
and the report page cannot disagree.

### `EmptyState` · `Toast`
`EmptyState` is required on every table and every result grid. `Toast` comes in
success · error · info and is one of the few places a shadow is allowed, being a
floating layer.

## Composite

### `StatCard`
Admin dashboard tile. `plain | warn | ink`. `delta` renders **green for up and
ochre for down** — again, red is reserved. `breakdown` shows the components of the
number, because every figure on the growth dashboard is expected to explain
itself.

### `SpecRow`
Label/value row for the spec table and for number breakdowns.

### `CarCard` · `CarRow`
The same listing data as a grid card or a list row. Handles direct, negotiation
and auction shapes: an auction card shows highest bid, bidder count and a live
countdown instead of a price and a type badge. `sponsored` adds the mandatory
"إعلان" tag.

The internal `MetaLine` is the reference implementation of the isolation rule —
each of city, mileage and transmission is its own isolated segment, and a number
travels together with its unit inside one segment so no separator can fall
between them.

### `RangeBar`
Where this listing sits in the market. Axis ends are the 10th and 90th
percentiles, the green band is the 25th–75th, and the marker is this listing's
price with its label centred on it. Out-of-range prices pin to the end with a
ring.

**It returns `null` when the sample is smaller than 8**, so callers need no
guard. A median drawn from three deals is worse than no median.

### `StageTracker`
The six order stages, horizontal or vertical, with done · now · next states.
Visual order is built from document direction, never from fixed values.

## Shells

### `Tabs`
Circled counters, active tab filled dark, separated by a bottom line.

### `DataTable`
Header, rows, sorting, bulk selection, loading skeleton and empty state. Numeric
columns are end-aligned and isolated. Cell padding is fixed here once for the
whole admin panel.

### `Sheet` · `Modal`
Floating layers: handle, title, body, footer. Backdrop closes. Shadow permitted.

### `AdminShell`
Dark 238px sidebar with **30 items in 4 groups**, matching the A1 markup exactly.
Items with `href: null` are destinations that have no designed screen yet; they
render disabled with a "قريبًا" marker rather than being invented.

The admin panel is **Arabic only** in phase 1, so its navigation labels are
constants in this file rather than translation keys. These are chrome, not
content — all content still comes from Prisma.

`EnvBanner` shows a warning strip when `APP_ENV=staging`, so nobody mistakes the
test environment for production.

### `SiteHeader` · `LiveBar` · `SiteFooter`
`LiveBar` is the dark strip carrying live auction count and the soonest closing
lot; it renders nothing when no auction is live rather than showing an empty bar.
`SiteHeader` marks the active nav item with an underline.

## Review page

`/dev/ui` shows every state of every component grouped as scales → atomic →
composite → shells. It is the review tool: open it beside the design card and
compare. It is not published — dev routes are blocked in task 28.
