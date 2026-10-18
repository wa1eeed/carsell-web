# Inspection report (Wd)

`/{locale}/cars/{city}/{brand}/{model}/{ref}/inspection`

## The report lives under the listing

Next does not allow a fixed segment after a catch-all, so the report is the last
segment of the same route rather than a route of its own. The constraint pushed
us somewhere structurally better: the report is a **property of a listed
vehicle**, so its URL is a branch of the listing's, not a sibling. Wrong path
segments 308 to the canonical one, with the same loop guard as the car page.

The report is `noindex, follow` — the listing is what gets indexed; the report is
supporting content that would otherwise compete with it.

## 210 points, from the database

`sections` is a `Json` column, so **the contract is enforced in the domain, not
the schema**. Every reader must go through `parseSections`: reading the column
directly in a screen means a change in what the inspection centre writes breaks
the screen with no warning, while the parser drops what it cannot read and keeps
the rest.

A test asserts each report carries exactly 210 points and that **every point has
a name**. `"body-17"` tells a buyer deciding on a purchase nothing; the seed
carries the real checklist (`prisma/seed-data/inspection-points.json`), 210 items
across six sections.

`OK` is the overwhelming majority and is never written by the inspector. A point
with no note renders with no note — not with generic filler implying the
inspector wrote something.

## What the page leads with

Owner's instruction, 2026-10-18, after reading a published report:

> «يجب ان تكون الحقول الفرعيه مرتبه و فرعيه تحت البنود الاساسيه (توقل) و ان
> حصل نضيف ايقونات و ايضاً علامة صح للسليم و علامة تعجب للي فيه ملاحظه او غير
> سليم و علامة مناسبه للي لم يتم فحصه»

**Points nest under their section, and each section is a toggle.** What was
there before was a flat table of 210 rows that opened on the findings with one
button to expand everything — right information, wrong shape: a buyer asking
"how are the brakes?" scanned a list that never said where a section ended.

- Sections carrying a finding **open by default**; sound sections stay closed
  with their count on the header. The four findings are still the first thing
  read, and the other 206 are one click away with their number showing.
- A section header carries its own summary — score, and either «سليمة كلّها»
  with a check or the count of what is flagged. **A collapsed section says what
  is inside it before you open it**, so nobody opens six to find the one.
- Inside a section, points sort **by state, not by catalogue order**: needs
  repair, then not inspected, then notes, then sound.

**A mark per state, and shape carries it — not colour.** A check for sound, an
exclamation in a circle for a note, an exclamation in a triangle for a fault, a
dash for a point that was not inspected. Three distinct silhouettes, so a reader
who cannot separate red from green reads the same report everyone else does —
one man in twelve. **The text label stays beside the mark** in every row; the
mark speeds reading, it does not carry it alone.

**The legend sits above the list, not under it**, and doubles as the summary:
each mark with how many points are under it. A legend below the fold is a key
for a door you already walked through.

Section score bars grow with the score but **do not change colour with it**.
Colouring each bar by its own threshold puts nine colours on the page and makes
the reader compare hues instead of lengths. Colour is reserved for the
exceptional state.

## «لم يُفحَص» — the state that existed everywhere except the report

`InspectionResultState` has carried `NOT_APPLICABLE` since it was built, the
inspector's form has always offered «لا ينطبق», and the scorer excludes it from
numerator and denominator alike — the correct treatment. **The freeze threw it
away.** Its mapping read *`MAJOR` → fail, `MINOR` → note, everything else →
pass*, so a point the inspector declared inapplicable was published as sound,
and so was any point with no answer at all.

The second case cannot happen today — submission is refused until all 210 are
answered — but the default states what *will* happen the first time a point
becomes optional or a catalogue row is added after a draft was opened. **Silence
published as a promise.** The public state is now `NOT_INSPECTED`, with its own
mark, its own count, and the inspector's reason printed beside it.

Two consequences, both deliberate:

- **A non-applicable point is not a finding.** It is excluded from «ما يستحقّ
  الانتباه» and does not open its section. Padding the findings list with
  "this car has no turbo" costs the list the thing that makes it useful — its
  shortness.
- **`notInspectedPoints` is part of the public report.** The identity used to be
  `passed + findings = total`; with three buckets, leaving the third implicit
  makes "206 of 210 sound" read as "4 have notes" when it is 4 notes *and 2 not
  inspected*.

## Values that are computed, not stored

- **Validity** — 90 days from the inspection date. Two stored dates can
  contradict each other; one stored date and a rule cannot.
- **Grade** (excellent / good / fair / poor) — thresholds live in one function so
  Wc and Wd can never disagree about what 89 means.
- An expired report is **shown with a banner**, not hidden. A six-month-old
  report does not describe today, and saying so is more useful than silence.

## VIN is always masked

`JTDBE32K***01847`. The full number lets a third party impersonate the vehicle in
registry lookups; the masked form is enough for a reader to match what they hold.

## PDF download

Printed by the browser, not generated on the server. An Arabic PDF generator
needs font embedding, glyph shaping and bidi — each a place for a silent failure
that ships a report with broken letters. Browser print already knows Arabic and
produces a file identical to what the reader saw.

`@media print` drops navigation and buttons, forces a white surface, and prevents
tables and figures from splitting across pages — the output is a report, not a
screenshot.

When the inspection centre has uploaded its own official PDF, that file wins and
the button links to it directly.

## No report is a state, not an error

Most listings have no inspection. The page renders an explicit empty state
pointing at the services directory — not a 404 implying a broken link.
