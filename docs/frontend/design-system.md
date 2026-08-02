# Design system

The single source of truth for colour, type, spacing and direction is
`src/app/globals.css`. Nothing in this document is decorative advice — every
value here is enforced either by the token layer or by a CI check.

**Design is truth.** Where this document and `design/*.dc.html` disagree, the
design file wins and this document is the bug.

## The rule that shapes everything

Components never carry raw values. No hex colour, no pixel spacing, no shadow is
written inside a component. `scripts/check-tokens.mjs` fails the build on any
`#rrggbb`, `rgb()`, `hsl()` or `oklch()` found under `src/app` or
`src/components` — `globals.css` is the only exempt file.

Tailwind's default palette, font stack, radius scale and text scale are all
disabled (`--color-*: initial` and friends). A stray `bg-red-500` or `rounded-3xl`
is a build error rather than a silent deviation.

## Colour

Three meanings, never mixed:

| Token | Meaning | Never used for |
|---|---|---|
| `accent` (green) | action, verification, success | warnings, time |
| `warn` (ochre) | time, warnings, things needing attention | failure |
| `danger` (red) | failure and deletion only | chart series, decoration |

Surfaces: `bg` is the page, `surface` is cards and bars, `ink` is the dark
surface *and* the text colour — there is only one ink.

Chart series live in their own namespace (`chart-1` … `chart-5`, `chart-neg`),
capped at five series plus a negative. The first series is always the most
important one. This exists so admin charts do not have to break the "red means
failure" rule to colour a stacked bar.

`accent-400` and `warn-400` are for dark surfaces only.

## Separation

Lines, never shadows. `--carz-line` at 13% and `--carz-line-2` at 7% do all the
separating in both the site and the admin panel. Shadow is reserved for floating
layers — dropdowns, sheets and modals — and that is the only place `shadow-*`
may appear.

## Type

Nine body sizes and four heading sizes. Any measurement in the design markup
that does not match a step is rounded to the nearest one; a new step is only
added by a recorded decision.

| Token | px | Used for |
|---|---|---|
| `text-3xs` | 8.5 | **admin only** — micro labels, table headers |
| `text-2xs` | 9.5 | helper labels under numbers |
| `text-xs` | 10.5 | secondary card data |
| `text-sm` | 11.5 | the most common size — list items, fields |
| `text-base` | 12.5 | body, navigation, buttons |
| `text-md` | 13.5 | card titles |
| `text-lg` | 15 | small section headings |
| `text-xl` | 17 | admin page header |
| `text-2xl` | 20 | site section heading |
| `text-3xl` … `text-6xl` | 22 · 26 · 32 · 36 | large headings |
| `text-display` | 44 | page heroes only |

Weights: 400 body · 500 secondary · 600 label · 700 heading · **800 the wordmark
only**.

`text-3xs` is **forbidden in the public site**. 8.5px Arabic on a phone screen is
not readable; the admin panel is an internal tool on a large screen, which is the
only place it is allowed.

`text-display` is a deliberate single exception rather than a broken scale: the
Wa headline is the largest text in the product and the first thing the eye lands
on, and 36px costs it its presence.

### Where the scale came from

Counted across `CarSell Web.dc.html` and `CarSell Admin.dc.html`: 3,249 font-size
declarations. 57% land exactly on the scale. The rest are whole-pixel values
(11px ×442, 10px ×281, 12px ×207) that round down by 0.5px — under 5%, invisible.
`8.5px` was added as a step because it appears 105 times and rounding it up to
9.5 would be a 12% jump on the smallest text in the product.

## Spacing

One variable generates the scale: `--spacing: 4px`, so `p-1` is 4px, `p-10` is
40px — the web page margin and column gap.

**The design uses 4px for layout and 2px inside components.** The most-used value
in the whole design is 10px (1,108 occurrences), then 14px (788). Half steps of
the same variable express exactly that, and `p-2.5` is readable and conventional
in Tailwind. Naming the 2px grid explicitly would create a second scale competing
with the first, so we do not:

```
p-0.5 = 2   p-1.5 = 6   p-2.5 = 10   p-3.5 = 14   p-4.5 = 18   p-5.5 = 22
```

Odd values (7, 9, 11, 13, 15) round to the nearest step — a 1px difference that
cannot be seen.

## Radius

`sm` 8 · `md` 11 · `lg` 12 · `xl` 14 · `2xl` 18 · `full` 999. Admin table cell
padding is *not* a radius token: it is set once inside `DataTable` (rows
`13px 22px`, header `12px 22px`).

## Grid

Web content is 1360px wide (`max-w-page`) with a 40px margin and 40px column gap.
Admin is 1440px (`max-w-admin`) with a 238px dark sidebar.

## Numerals

Three rules that always travel together, and are why `ArabicNumber` exists:

1. **Arial for every digit.** A `@font-face` copied from the design markup maps
   `local("Arial")` over the digit unicode ranges only, so numerals render in
   Arial inside Tajawal text without wrapping each one.
2. **Arabic-Indic for display, Latin for storage.** Conversion happens in the
   view layer only — never in `domain/` or in an API response.
3. **Every value is an isolated segment.** See below.

Exempt from Arabic-Indic, by decision: `HH:MM:SS` counters, identifiers
(`ADS2026A0005`, `ORD-…`, VIN, IBAN, phone, email), licence plates, and technical
symbols. None of these are followed by an Arabic word, which is exactly what
CI check 5 looks for.

## Direction

`dir` comes from the locale and is never written by hand in a screen. Use logical
properties throughout: `ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`, `text-start`.
`left`/`right` must not appear.

### The separator trap

A neutral `·` between an Arabic word and an Arabic-Indic numeral slides to the
wrong side of the number and reads as a stray digit:

```
«١٤٥٬٠٠٠ ريال · ٣٬٤٥٦ كم»   renders as   «١٤٥٬٠٠٠ ريال ٣٬٤٥٦٠ كم»
```

This is the data line of **every card in the product**, every admin table column,
and the spec line on the vehicle page. The fix is structural, not textual: wrap
each segment in `bidi-isolate` and let layout provide the separator. Never build
a data line as one string, and never patch it with RLM characters — an invisible
character breaks comparison, search and export, and is invisible in code review.

CI check 6 fails on any translation string containing both `·` and a number or an
ICU placeholder.

Bidirectional fields inside Arabic text — phone, IBAN, VIN, plate, email — use
`bidi-ltr`.

## Checks

`npm run check` runs all of them.

| # | Check | Enforced by |
|---|---|---|
| 1 | no type errors | `tsc --noEmit` |
| 2 | no lint warnings | `eslint` |
| 3 | no `any` | `@typescript-eslint/no-explicit-any` |
| 4 | no raw colour in components | `check-tokens.mjs` |
| 5 | no Latin digit before an Arabic word | `check-tokens.mjs` |
| 6 | no data line built as one string | `check-tokens.mjs` |
| 7 | no `#` inside an Arabic ICU plural | `check-tokens.mjs` |
| 8 | every `Quantity` unit is declared | `check-tokens.mjs` |
| 9 | no Arabic unit written after a number | `carsell/no-arabic-beside-number` |

Checks 7, 8 and 9 exist because the same defect appeared three times: a unit
written by hand after a number produces «٩ طلب» instead of «٩ طلبات». Arabic has
six plural forms, so a hand-written unit is wrong in most of them. The rule is
scoped to text **after** the number — a label before it («المحدَّد: ٣») needs no
agreement and flagging it would be noise that gets the rule disabled.

`StatCard` takes `suffix`, not `unit`: it is for suffixes that do **not** depend
on the count («ريال», «م», «٪»). A count with a unit always goes through
`Quantity`.


## Gate 9 — a number never becomes a string

`` `${item.title} ${item.year}` `` renders "Camry EX 2021": Latin digits inside
Arabic text. Gate 5 cannot see it — that gate reads the translation files, and
this number arrives from the database at runtime.

**The gate defines itself from the schema.** `scripts/check-tokens.mjs` reads
every `Int`/`Float`/`Decimal`/`BigInt` field name out of `schema.prisma` and
splits it into words (`mileageKm` → mileage, km). Any new numeric field is
guarded automatically, with no edit here — which is what makes it a gate rather
than a correction that keeps recurring.

It fires only in **displayed-text context**: a text-bearing object property, a
text attribute, or element content. The first version checked every template
literal and produced nine false positives on CSS percentages and translation
keys. A rule that emits noise gets disabled, and a disabled rule is worse than
no rule.

`aria-label` is deliberately **not** in that set. A screen reader pronounces a
Latin digit correctly, and converting it to Arabic-Indic there helps nobody.

Digits inside a model name — `Mazda CX-5`, `Kia K5` — are proper nouns, not
quantities, and are never converted. `tests/listings.test.ts` asserts the
narrower rule that actually broke: no model year glued into a title.

## Countdown — two formats

A card is **scanned**; a car page is **read**. So:

| Surface | Over 24h | Under 24h |
|---|---|---|
| Card (`compact`, default) | «٤ أيام ١ س» | `HH:MM:SS` |
| Car page (`full`) | «٤ أيام و١ ساعة» | `HH:MM:SS` |

The conjunction sits between the two isolated segments, not inside either, and
its spacing lives in the message file because «و١ ساعة» and "and 1 hour" space
differently.

On a card the countdown is a small badge at the bottom of the image, the same
size as the photo count. A countdown covering a quarter of the image steals what
the reader came to see.


## Gate 10 — a colour utility with no token

Tailwind's palette is **disabled** (`--color-*: initial`), so a utility naming an
undeclared token does not error — it renders **black**, or nothing.

`fill-accent-2` painted the body diagram's repainted panels solid black on Wd,
and `bg-accent-2` had done the same on Wc's paint map before it. The same defect
twice, so: a gate instead of a third correction. Both were fixed together.

The cause was a rename that the components missed. The design markup calls the
ochre `--color-accent-2`; the token set calls it `warn`. Nothing failed loudly,
because there is nothing to fail — an unknown token is simply absent.

The gate reads the declared names out of `globals.css` itself, so adding a token
guards it automatically and removing one surfaces its users immediately. Edge
modifiers (`border-b`, `border-s`), scale steps (`text-3xs`) and non-colour
keywords (`outline-offset-2`) are excluded — the first pass flagged 22 of them,
and a rule that emits noise gets disabled.
