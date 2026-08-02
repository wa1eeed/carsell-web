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

The findings table **opens on what is not OK**. Four points out of 210 are the
news; a 210-row list mostly reading "pass" buries them. The passing points sit
behind an explicit button that states their count, so nobody thinks we hid them.

Section score bars grow with the score but **do not change colour with it**.
Colouring each bar by its own threshold puts nine colours on the page and makes
the reader compare hues instead of lengths. Colour is reserved for the
exceptional state.

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
