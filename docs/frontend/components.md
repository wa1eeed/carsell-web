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

Below `lg` the sidebar is `hidden` and `AdminMobileNav` takes its place — see
*The admin on a phone* below. The nav model itself lives in
`src/components/admin/nav.ts` so both the sidebar and the drawer read one list;
badge counts come from `adminNavCounts()` and count **waiting work only**, so a
zero is omitted rather than rendered.

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


## Wc components (task 11)

| Component | Note |
|---|---|
| `Gallery` | 16:9 hero, thumbnail strip, position counter, fullscreen. No images → the diagonal pattern with no counter; a listing without photos is a real state, not an error to hide behind a grey box. |
| `SpecTable` | Two columns, separated **by lines, not shadows**. Values are passed as nodes, never strings, so numbers go through `ArabicNumber`/`Quantity` (gate 9). |
| `PaintMap` | Three states, not two — **"not measured" is not "original"**. Hiding that difference makes an unmeasured panel look verified, which is worse than silence. |
| `HistoryList` | Every line carries its source. Empty state rather than grey placeholder rows. |
| `BuyColumn` | Swaps wholesale by selling method rather than hiding buttons. Never renders a reserve or minimum-accept **amount**. |
| `FaqAccordion` | Native `<details>`, one open at a time, answers present in served HTML for `FAQPage`. |
| `SimilarGrid` | Deliberately lighter than `CarCard` — the reader is comparing, not searching, so seller and badges would compete with the page. Returns nothing when the list is empty. |

### One namespace for enum labels

`transmission`, `fuel`, `bodyType`, `drivetrain`, `spec`, `condition`,
`listingType`, `paintState`, `featureGroup` and `source` values live in a single
`enums` namespace read by Wb and Wc alike. They previously existed twice — the
value maps under `search`, the field labels under `ui` — and the second copy is
how two screens start disagreeing about what `CVT` is called.


## `Breadcrumb` (task 89)

The design puts a breadcrumb on four screens — legal documents (Wo), auction
detail (We), dealer page (Wg) and the inspection report (Wd). **None of them
rendered one.** A deep page without a trail is left by going back, not by going
up: someone who arrives at a legal document from a search engine has no way to
learn there is a section above it, let alone a site.

| Rule | Why |
|---|---|
| The last item is never a link | A link to the page you are on reads as a destination, and a screen reader announces it as one. It is rendered as text with `aria-current="page"` **even when the caller passes an `href`**. |
| `href` is optional on middle items | "Legal" has no index page in the product. A node that is shown but not clickable is more honest than a link that 404s — the class already fixed in the account counters and six other screens. |
| It wraps, it does not shrink | A long trail ("Nissan Patrol Platinum 2022 · Inspection report") overflows at 375px. Shrinking deletes content; a second line keeps it readable. |
| Each label is `bidi-isolate` | "Toyota Camry GLE 2024" mixes Latin and Arabic-Indic inside an RTL context; without isolation the Latin run migrates to the end of the line. |
| The `aria-label` comes from the caller | The component is used in both locales. A hard-coded Arabic string would make the English page announce its navigation in Arabic. |

The auction page previously hand-rolled a two-level nav: no "Home", `›` instead
of the design's `·`, no `aria-label` and no `aria-current`. It now uses the
shared component, so the four screens cannot drift apart.

On the inspection report the breadcrumb is **computed before the "no report"
branch**. Most listings have no inspection, so the empty state is the more
visited of the two — a trail that only appears on the populated branch is
missing from most of the people who need it.

### `Breadcrumb` — the four hand-rolled trails it replaced (task 90)

Beyond the four design screens, three more places had written their own
breadcrumb and two had none:

| Place | What it was |
|---|---|
| `AccountList` | Its own `<nav>` with `›` — the pattern six account pages inherited |
| `account/wallet` | A `<p>`, not a `<nav>`, so screen readers announced a paragraph rather than navigation |
| `auctions/[ref]` | Two levels only, no "Home", `›` where the design uses `·`, no `aria-label` |
| `account/profile`, `account/earnings` | A bare `← حسابي` back-arrow |

A back-arrow says where you return to; a breadcrumb says where you are. Two
pages with arrows and six with trails makes the pattern look accidental.

Two props carry the variation the design actually has:

- **`separator`** — `·` on public screens (legal, auction, dealer, inspection),
  `›` on account pages. The design distinguishes them, so the component does.
- **`crumb`** on `AccountList` — the trail names the page as the account hub
  names it ("تقاريري"), while the heading describes it ("تقارير الفحص"). The
  design writes both; one prop stops them being forced to agree.


## Popular searches on the homepage (task 91)

The design puts a row under the hero search: "Popular: Camry 2024 · Patrol ·
Under 50k · Electric · Today's auctions". It was never built, so the first-time
visitor met a four-field form and no single thing to click.

**Every chip is derived from stock, never written down.** A hard-coded chip
points at an empty page the moment that model sells out — and an empty result
reached from the platform's *own* suggestion reads as "there is nothing here",
not "try another search". So:

| Chip | Source | Omitted when |
|---|---|---|
| Two model names | `vehicle.groupBy(modelId)` over published listings | no published listings |
| A price ceiling | the smallest band holding **3 or more** listings | no band qualifies |
| Electric / hybrid | `vehicle.groupBy(fuel)` restricted to those two | none in stock |
| Today's auctions | `status: LIVE` **and** `endsAt > now` | no open auction |

The auction chip checks the clock as well as the stored status: an auction whose
time has passed but whose sweep has not yet run still reads `LIVE`, and the chip
would promise a page that rejects you on arrival.

`popularSearches()` returns **keys, not sentences** — `priceMax:50000`,
`fuel:ELECTRIC`. The domain cannot phrase them: it knows neither the locale nor
`Quantity`, so a sentence it builds emits Latin digits (gate 17). The screen
turns the key into "أقل من ٥٠ ألف ريال".

`tests/popular-searches.test.ts` walks each chip's query through the same
`parseFilters` the results page uses and asserts the result is **non-empty and
narrower than unfiltered**. Non-empty alone would pass even if the filter key
were misspelled and silently ignored.


## The auction a seller could never create (task 93)

`type: AUCTION` was writable on a listing, but **nothing in the product created
an `Auction` row** — the only `auction.create` in the repository was in
`prisma/seed.ts`. Walked it: a listing published as an auction renders
`/ar/auctions/{ref}` as **404**, while its vehicle page carries an "auction"
badge and offers **"Buy now via escrow"** at the asking price. A listing that
says one thing and does another.

The tenth instance of "a value in the schema that nothing writes".

| Field | Who chooses it |
|---|---|
| duration, start time, reserve, bid increment, buy-now | the seller, in the wizard |
| deposit, minimum increment, allowed durations, extension window | the operator, in auction settings |

The row is created **inside the publish transaction**. Outside it there is a
window in which a listing is an auction with no auction, and one page view in
that window is enough — the same rule as "what needs guarding is built guarded".

`status` is computed, not assumed: an auction starting immediately is written
`LIVE`. Writing `SCHEDULED` and waiting for a sweep means an auction whose whole
window can elapse before the sweep opens it — closing without a single bid.

`minAcceptPrice` had the same shape: the domain auto-rejects offers below it and
the help centre tells buyers the seller sets it, but **no field at publish ever
asked**. It is now part of the negotiation step.

### The error map

The route's error branch was ten nested ternaries ending in "unknown brand or
model" as the fallback, so every new failure reason would be **born with the
wrong message**. It is a `Record<PublishFailure, …>` now: a missing message is a
type error, not a sentence shown to a seller.


## `MobileNav` — the drawer, and which side it opens from (task 101)

Five nav links do not fit 375px. They were a horizontally scrolling row with
`no-scrollbar`, so the last one ("Services") sat off-screen reachable only by a
swipe **with nothing to suggest it** — no arrow, no fade, no visible scrollbar.

On mobile the row is replaced by a drawer. Two things decide its side:

| | Arabic (RTL) | English (LTR) |
|---|---|---|
| Menu button | right | left |
| Drawer opens from | right | left |

Both are the thumb side, and keeping them together means the gesture does not
cross the whole screen.

**`start-0`, not `end-0`.** The inline axis reverses with direction: in RTL
`inline-start` is the **right** edge. Writing `end-0` first put the Arabic
drawer on the left — the opposite of what was wanted. The button needs no
variant at all: it is simply first in the flex row, and flex follows `dir`.

**`translate-x` does not reverse.** It is a visual axis, so the closed state
needs `rtl:translate-x-full ltr:-translate-x-full` to push the panel out through
the edge it sits on.

The drawer lives inside a `fixed inset-0 overflow-hidden pointer-events-none`
container so the closed, off-canvas panel cannot widen the page — a real
behaviour in browsers, though **not** the cause of the 95px overflow that first
sent me looking: that was the preview pane's size emulation, which reported the
same figure on a page with no drawer at all.

It also carries `LocaleSwitcher`, which had been written and wired to **nothing**:
before this, a visitor who opened the site in Arabic could reach English only by
editing the URL.

## The admin on a phone — and gate 36 (task 143)

The sidebar was a flat `w-[238px]` with **no responsive class at all**. At 375px
it ate two thirds of the width, leaving ~130px of content: the panel was usable
only by zooming and scrolling sideways. Whoever runs a marketplace is not always
at a desk — a report arrives at night, a payout waits on a second approval, an
auction closes — and those are decisions measured in minutes.

`AdminMobileNav` is built on the same bones as the site's `MobileNav`, not eyeballed
from it: overlay click closes, Escape closes, body scroll is locked while open,
focus moves to the panel, and the closed panel is clipped inside a
`fixed inset-0 overflow-hidden` container so it cannot widen the page. `start-0`
plus `rtl:translate-x-full ltr:-translate-x-full` puts it on the thumb side in
both directions.

**The waiting count rides on the closed button.** Badges inside the drawer are
invisible until it is opened, and nobody opens a menu to discover whether
something is waiting for them.

### What the sweep found

All **49 admin routes** were measured at 375px for horizontal overflow. One
failed: the model catalog's `CatalogTree`, where
`<aside className="w-[250px] shrink-0">` inside a horizontal row left the trims
panel **77px wide** — a six-column table in the width of one word. Nothing fails
when this happens: the page renders, and the tests pass because tests do not open
a screen.

### Gate 36 — a sidebar stacks on a phone or it hides

`AdminShell` and `SearchScreen` were both already guarded by the same idiom
(`hidden … lg:flex`); `CatalogTree` alone was not. A class that is already solved
twice in the tree and broken once is a gate, not a third fix.

The check is scoped to `<aside>` and `<nav>` deliberately. A fixed-width element
inside a `flex-wrap` row drops to its own line and squeezes nothing — widening
the rule to every `shrink-0` flagged `PaintMap`, which is not a defect.

The gate was run against the original defect before being kept: it reported
`CatalogTree.tsx` and fell silent once the fix was restored. A gate that has
never fired is not known to guard anything.

### The language switcher is not built here, and why

The admin has **no translation layer**: ~895 Arabic string literals across 115
files, with `next-intl` appearing in exactly one admin file (the provider in
`layout.tsx`, there for shared UI components). A switcher added today would flip
`<html lang>` and change no visible word — the dead-control class this codebase
keeps closing. Extracting those strings is its own task; the switcher follows it,
not the reverse. The **site** switcher already exists (`LocaleSwitcher`, wired in
task 101).

## The notification centre (task 144)

`Notification` rows were written from five places under twelve template keys and
read by **nothing a user could see** — the only reader in the product was a count
on an admin statistics card. A seller received an offer and a row was written;
no screen showed it.

### One door in

`src/lib/domain/notifications.ts` owns every write (`notify`, `notifyMany`) the
way `postEntries` owns the ledger and `applyState` owns order state. Each writer
had its own `db.notification.create` before, and one of them forgot the template:
`offer.lost`, `listing.relisted` and `order.payment_timeout` were written with no
template to render, so they would have arrived blank.

`notify` publishes `notification.created` on the recipient's private channel after
the write, never before, and never throws on a publish failure — the truth is in
Postgres and the message is only a hint that it changed.

### Gate 37

Every `templateKey` written under `src/lib/domain/` must exist in
`prisma/seed-data/notification-templates.json`, have `channelInApp: true`, and
carry a non-empty `bodyAr`. A comment in `auction-order.ts` already described this
exact failure in prose, and three keys fell into it afterwards — a comment does
not guard. The gate was run against the original defect before being kept: it
reported both the missing key and the disabled channel, and fell silent once they
were fixed.

### Text comes from the template, not from a labels file

`NotificationTemplate` is edited by admins on A8, and until now it governed text
**nothing displayed**. The centre renders from it, so the editor controls what
users actually read and there is no second copy to drift. The twelve live bodies
were rewritten: every one ended with "التفاصيل في التطبيق" — displayed *inside*
the app, telling the reader to go where they already are.

Unresolved `{placeholders}` are left as-is by `renderTemplate`, and no live body
uses a variable today; the admin editor's `undeclaredVariables` check is what
keeps it that way.

### Destinations are looked up, never constructed

`entityId` is not one kind of value: an order holds a **ref**, a listing holds an
**id**, an auction holds its **auction id** rather than its listing's ref. Orders
were the one case built without a query — the ref is right there, so why look it
up? Because **the name is not the existence**: clicking the notification landed on
"لا توجد هذه الصفحة" for an order that had been deleted.

Ownership is the second condition: `/account/orders/[ref]` serves the order's two
parties, and a recipient may be a losing bidder rather than a party, so both are
in the same query. A dispute has no user-facing screen at all, so it gets no link —
a row that cannot be clicked beats a row that 404s.

Two tests cover this and both fail against the original code.

### The bell lives in another tree

"Mark all as read" succeeded, `router.refresh()` re-rendered the server tree and
the dots went — and the bell still read "3". The page said everything was read
while the badge above it said three were waiting.

The fix is not copying the prop into state (gate 27 forbids it) but an explicit
one-way signal in `src/lib/notifications-signal.ts`: whoever changes the count
announces, whoever displays it listens and re-reads from the server.

### "Real time" is a poll, and is described as one

The `user:{id}` channel has existed since the event system was built, carrying
four private event types — **with no publisher and no subscriber anywhere**. The
realtime service refuses private channels outright: its README says the ticket
endpoint does not exist yet.

So `notification.created` is now published, and nothing subscribes. What actually
happens is a 30-second poll, paused while the tab is hidden, plus a refetch on
window focus and on opening the menu. When the ticket issuer is built, the
subscription replaces the timer and nothing else changes.

### `TimeAgo`

Zero is not a number in a time phrase: `Quantity` renders it as "لا دقائق", and
"منذ لا دقائق" is the string every reader would see in the first minute after a
notification arrives. Zero gets its own sentence — "الآن".

The preposition sits **inside** each plural branch (gate 18): "منذ" before a count
leaves the dual nominative — "منذ ساعتان" instead of "منذ ساعتين". Past thirty days
it prints the date instead, because "منذ ٤٧ يومًا" is arithmetic the reader has to
redo.

`now` arrives as a prop so server and client start from the same instant and
hydration matches, then ticks forward once a minute after mount.
