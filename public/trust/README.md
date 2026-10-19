# Trust marks

Logos shown in the site footer, one row per mark in `TrustMark`. The database
holds the path; these are the files it points at.

## Regulatory

`dga.png` · `saudi-business-center.png` · `ndgp.png` · `vat.png` — supplied by
the owner. Each row also carries a registration number and an official
verification URL, set from `/admin/trust-marks`. **A mark whose number is empty
is still shown, but unverified** — the panel badges it «بلا رقم» until it is
filled, and a mark the platform does not hold should be switched off there.

`ndgp.png` is the **full wordmark**. It was briefly cropped on 2026-10-19 to
drop «منصة» and "Platform", and the owner then asked for the complete logo
back the same day — so it reads «منصة حوكمة البيانات الوطنية / National Data
Governance Platform», as the body itself writes it.

Order is set by `TrustMark.sort`, and the page is right-to-left, so **the
lowest sort sits furthest right**: VAT, then the Digital Government Authority
to its left (owner, 2026-10-19), then the Saudi Business Center, then NDGP.
The panel does not edit `sort` — it edits the number, the verification link and
whether the mark appears — so order changes travel as migrations.

## Payment

`payment-icons.webp` is the original the owner supplied: one strip of five
white rounded tiles. `payment/*.webp` are cut from it, one file per method.

**Five files, not one strip**, because the row is the unit of the claim: a
method the platform stops accepting is switched off on its own, and a single
strip would show all five or none. Showing a method that fails at checkout is a
promise broken at the worst moment.

**And the white tile is removed** (owner, 2026-10-19). The mark stands on the
paper, as `TrustMarks` has required since it was built. Two details decide
whether that works:

- **The shadow is not the logo.** It is neutral grey at `rgb(222)` on its
  darkest edge, so a crop that keeps anything below 225 keeps the whole tile.
  Content is what is *clearly* dark (`max < 200`) or *saturated* (`> 28`).
- **Enclosed white is not background.** «MasterCard» is written in white inside
  the two circles; a key that erases every white pixel punches holes in it. The
  erase is a flood fill from the border, so white the logo encloses survives.

To re-cut after replacing the strip, see the script recorded in ROADMAP §13.
