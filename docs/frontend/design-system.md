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
| `text-3xs` | 8.5 | letter-spaced micro labels, table headers |
| `text-2xs` | 9.5 | helper labels under numbers |
| `text-xs` | 10.5 | secondary card data |
| `text-sm` | 11.5 | the most common size — list items, fields |
| `text-base` | 12.5 | body, navigation, buttons |
| `text-md` | 13.5 | card titles |
| `text-lg` | 15 | small section headings |
| `text-xl` | 17 | admin page header |
| `text-2xl` | 20 | site section heading |
| `text-3xl` … `text-6xl` | 22 · 26 · 32 · 36 | large headings |

Weights: 400 body · 500 secondary · 600 label · 700 heading · **800 the wordmark
only**.

### Where the scale came from

Counted across `CarSell Web.dc.html` and `CarSell Admin.dc.html`: 3,249 font-size
declarations. 57% land exactly on the scale. The rest are whole-pixel values
(11px ×442, 10px ×281, 12px ×207) that round down by 0.5px — under 5%, invisible.
`8.5px` was added as a step because it appears 105 times and rounding it up to
9.5 would be a 12% jump on the smallest text in the product.

## Spacing

One variable generates the scale: `--spacing: 4px`, so `p-1` is 4px, `p-10` is
40px — the web page margin and column gap.

The design is built on a **2px** grid inside components: the most-used value in
the entire design is 10px (1,108 occurrences), then 14px (788). These are written
as half steps of the same variable, with no extra tokens:

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
