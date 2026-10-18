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

And `REPAINT` closes the other half. «صبغ» was a display state the seed alone
wrote — the inspector's form could not produce it, so no real report could ever
show it. The owner's answer was to keep it («لا تحذفها و ابقها في البند»), so it
became a state the inspector picks, scored at 0.7 (a repainted panel works; it
is disclosed because it touches value, not because it is a fault). The section
it belongs to is now «الهيكل الخارجي» — renamed by migration, because category
names are rows and reference data reaches a live database by migration or it
reaches only new environments.

**And every state but «سليم» now owes a sentence.** The note was required for
MINOR and MAJOR; «لا ينطبق» and «صبغ» could be saved silently. A point marked
not-applicable with no reason reads as the inspector skipping work rather than
as a fact about the car.

Two consequences, both deliberate:

- **A non-applicable point is not a finding.** It is excluded from «ما يستحقّ
  الانتباه» and does not open its section. Padding the findings list with
  "this car has no turbo" costs the list the thing that makes it useful — its
  shortness.
- **`notInspectedPoints` is part of the public report.** The identity used to be
  `passed + findings = total`; with three buckets, leaving the third implicit
  makes "206 of 210 sound" read as "4 have notes" when it is 4 notes *and 2 not
  inspected*.

## The inspector is a code, not a name

> «اسم الفاحص بدل الاسم الصريح ضع رقم الآي دي للفاحص لمزيد من خصوصية الفاحص»
> — the owner, 2026-10-18.

`inspectorName` stays in the row — it is the record anyone would reach for in a
dispute — and **leaves the public object entirely**. What ships is
`inspectorCode`: `FA-7K4M`, derived from whoever filled the draft, stored on the
report so it cannot drift when the derivation changes.

Stable, so two reports by the same inspector read as the same inspector — half
the value of a code. Not reversible: no name or id comes back out of it, and the
internal match is against the stored name.

The alphabet drops `0/O` and `1/I`: it is a code that gets read aloud on a phone
and written down, and a character read as a digit loses the match.

## The PDF is its own document

> «يجب ان يكون البي دي اف مصمم بعنايه … كأنه تقرير بي دي اف مصمم … يحتوي على
> مستطيل في مقدمه الصفحة ككرت معلومات السيارة و بجانبه QR كود يقود لرابط
> السياره في المنصه على الدومين carz.sa»

The button used to call `window.print()` on the web page — `pdfUrl` has never
had a writer, so the fallback *was* the feature: site header, tabs, backgrounds
that eat ink. A screenshot on paper.

`…/{ref}/inspection/pdf` is a separate A4 layout (`ReportSheet` +
`report-sheet.css`): a bordered **vehicle card** across the head of page one —
wordmark, vehicle, report number, centre, inspector code, dates, the score — and
the **QR beside it**, pointing at the listing on `APP_URL` (`carz.sa` in
production). Then the tallies, the section bars, the body panels, the findings,
and every point under its section.

Three decisions worth keeping:

- **HTML for print, not a PDF generator.** Arabic needs shaping and bidi, which
  Node PDF libraries do not do — letters come out detached and reversed. A
  browser shapes Arabic correctly because it does it every day. A headless
  browser in the image would cost ~300MB, and a build here has already died on
  a full disk.
- **The QR points at the listing, not at the report.** Someone scanning a sheet
  in their hand wants the car — its price, its photos, whether it is still
  listed. The report is already in their hand.
- **Nothing of the platform appears on the sheet.** It is rendered without the
  shell, but the `(site)` layout still appends its footer — measured by opening
  it: two footers on the page. `(site)` is a route group, so a second route at
  the same URL is impossible and the URL is deliberately a child of the
  vehicle's; the chrome is therefore hidden wherever a sheet is present.

**Each body panel sits in its own box.** It was a four-column list of
`name … state` pairs, and the gap *between* columns is wider than the gap
*within* one — so «أصلي» floats between two names and belongs to neither. The
owner read it on the sheet and said so. A border around the pair settles it
without the reader having to judge a distance: name above, state below, and the
repainted ones tinted so they are found before they are read. Separation by
rules, not by space — the repository's own rule.

**And it wears the platform's colours.** Black ink on white is correct and
cheap, and it does not read as a document issued by anyone. A brand band across
the head of the card, the score as a green disc, section headers as green bands,
findings on a gold tint with a rule down their edge — the same green the site
uses, in weights that survive a printer. `print-color-adjust: exact` on the
filled areas, because browsers drop backgrounds when printing unless told not to.

Ink colours live in `globals.css` under «حبرُ الورق» — a separate, fixed set.
Screen tokens invert in dark mode, and paper is ink on white regardless of the
screen the print was ordered from.

**The domain on the sheet is `SITE_URL`, not `APP_URL`.** `APP_URL` is the host
that rendered the page — localhost in development, the staging domain in
staging. Correct for sitemaps and absolute links, **wrong on a document that
gets printed and handed over**: a report in a buyer's hand carrying a QR that
resolves to `localhost:3000`, with that address printed under it. `SITE_URL`
defaults to `https://carz.sa` so an environment that forgets the variable still
prints a real address, and the path is unchanged — the same listing link, only
the host differs.

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
