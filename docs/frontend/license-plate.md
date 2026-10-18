# The licence plate

The plate is drawn, not printed as text. `SaudiLicensePlate` renders it as
**vector SVG**, so it stays sharp from a thumbnail to a printed A4 report.

The design spec is the owner's own, from another of his projects:
`plate-rendering.md` in `plate-auction-live-stream`. This port keeps that
file's geometry, metrics and technique unchanged, so a fix in either project
reads the same in both.

## What carsell uses

`Vehicle` stores `plateLetters` and `plateNumbers` and nothing else — no plate
type, no issue format. So `LicensePlate` (the wrapper in
`src/components/ui/plate/`) always draws the **private long plate**, which is
what almost everything sold here carries. The other four geometries
(motorcycle, sport, transport, standard) came across with the component and sit
unused; the day a plate type is stored they are already there.

**Latin letters are derived, never stored.** The plate map is not a linguistic
transliteration — ص→X, م→Z, ع→E — so a second column written by hand drifts
from the first at the first typo. One source: `lettersToLatin`.

**Input is normalised at the point of storage**, not at each read. `أ` and `ي`
and Arabic-Indic digits arrive from forms; `publish.ts` writes the approved
shape from the traffic department's table, so search matches and no reader has
to normalise for itself.

## Where it appears

| Screen | Condition |
| --- | --- |
| Car detail, above the spec table | **Only if the seller chose** `Listing.showPlate` |
| The inspection report, web and PDF | Always — the owner's ruling: a report that does not carry the plate is incomplete |
| Admin listing detail | Always — hiding it is from the market, not from whoever manages the listing |
| The sell wizard | As a live preview under the input |

**Showing a plate is a disclosure, so it is the seller's choice.** The platform
blurs plates in photos (`ListingImage.plateBlurred`); printing the same plate in
text beside a blurred photo would undo that on purpose. The default is off.

**And the condition is applied where the data is fetched**, not where it is
drawn: a plate that enters the public object is serialised into the RSC payload
whether or not anything renders it. `tests/public-shape.test.ts` holds that
line — it used to forbid the plate outright, and now checks the harder case,
that a plate whose owner chose to hide it never leaves the server.

## Entering it

Three dropdowns, not a text field (`PlateField`). Seventeen letters are valid on
Saudi plates; a free field accepts «غ» and rejects it after submission, while a
list only offers what is accepted. Each option shows the Arabic letter beside
its Latin counterpart, because the mapping is not guessable. A box does not open
before the one before it is filled, and clearing one drops those after it, so
«ا _ ح» cannot be built.

The plate is drawn live under the fields: the seller sees what will be printed
rather than what he typed.

## What makes it match the real thing

- **Ink height, not font size.** In Arial, Latin ink is ≈0.73em and Arabic-Indic
  digits ≈0.58em, so equal font sizes produce rows that differ by a quarter.
  `plate-metrics.ts` carries measured ascent and descent per character and
  `layoutRow` sizes each item so the *ink* matches, then centres it in its band.
- **Per-character widths.** «ص» is 1.0625em and «ا» is 0.2168em — five times
  apart — so one average overflows the first and starves the second.
- **Two layers.** The face is engraved with an inner shadow; the characters are
  embossed with three outer ones. A real plate is struck metal, not print.
- **Stable SVG ids** derived from the plate's own content, so the server and the
  client agree and a mask never points at the wrong emblem.

Colours live in `globals.css` under «ألوان لوحة المركبة» — a fixed set. They
describe a manufactured object, so they do not invert in dark mode and do not
follow the brand.
