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
A real Saudi plate, copied from the object rather than from the design system.

Structure: two rows × two columns plus a vertical strip at the right edge.
Left column digits, middle column letters, Arabic row on top and Latin below.
The strip carries the emblem, the country name, K S A stacked, and a filled dot.

Props are `letters` (3 Arabic characters) and `numbers` (4 digits). **The Latin
equivalents are derived inside the component** from the official 17-letter table
— م→Z and ص→X are codes, not transliteration, so no caller can get them wrong.

Two deliberate exceptions, both because a plate is a physical object and not a UI
element:

- **Colour.** Black text on `#f2f2f2` cells inside a white frame, via
  `plate-ink` / `plate-cell` / `plate-frame` / `plate-line`. These are the only
  tokens outside the three-meaning colour system.
- **Type.** Arial for **both** rows, Arabic letters included. Plate letters are
  engraved symbols, not running text, so they do not take the body font.

Sizes are `sm` 82px · `md` 120px · `lg` 180px wide at a 2.4:1 ratio. Only the
width and a base font size change; everything inside is in `em`, so the plate
scales without its structure changing. `dir="ltr"` on the whole component —
column order is fixed on a real plate and does not follow page direction.

### `Countdown`
Under 24 hours: `HH:MM:SS`, **Latin in both languages**. Above 24 hours: days and
hours, as two isolated segments. Thousands of hours (`634796:04:20`) is
arithmetically correct and meaningless to a reader, so it is never shown. It stops on `visibilitychange` and
recomputes on return, so no timer runs in a hidden tab. Remaining time is derived
from a timestamp difference rather than a decrementing counter, so it cannot
drift. Tones `ink | warn | plain`; `onEnd` fires once at zero.

### `ScoreRing`
Inspection score out of 100 in three sizes. Colour is meaning, not decoration:
≥80 green, ≥60 ochre, below that red. Thresholds live here so the vehicle page
and the report page cannot disagree.

### `Quantity` · `Percent`
`Quantity` renders a number with its unit. **Arabic pluralisation has six forms**
— «طلب واحد» · «طلبان» · «٩ طلبات» · «١١ طلبًا» — and writing the unit by hand
produces «٩ طلب», a grammatical error that then repeats on every screen. Rules
live in the `units` messages as ICU plurals; no unit is written outside this
component.

The number is formatted in the component and passed in as `{n}`, because ICU's
`#` renders through `Intl.NumberFormat('ar')`, which produces **Latin** digits.
CI check 7 fails on any `#` left inside an Arabic plural.

`Percent` renders sign, number and percent mark as **one** isolated segment.
Split across three elements, direction reorders them into «٪ ٤٠ −».

Neither applies `font-num`: the Arabic font stack already maps digits to Arial by
unicode range, and forcing `font-num` on mixed text would put the Arabic letters
in Arial too.

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

## Screens without a design card

`/admin/login` has no card in `CarSell Admin.dc.html` — A1–A14 all begin after
sign-in. It is built on the token system and recorded here as a **documented
deviation**:

- Full page on `--color-ink`, no sidebar and no header.
- One centred card, 400px wide, `--color-bg`, `radius-xl`, 40px padding.
- Wordmark at `text-3xl`, then `ADMIN CONSOLE` at `text-3xs` with `0.12em`
  tracking at 55% opacity.
- Two fields, then a full-width primary button. After the password step the same
  card shows six TOTP boxes with Latin digits.
- In staging, an ochre strip at the top of the page.
- No "remember me", no "forgot password", no social sign-in.

## Review page

`/dev/ui` shows every state of every component grouped as scales → atomic →
composite → shells. It is the review tool: open it beside the design card and
compare. It is not published — dev routes are blocked in task 28.
