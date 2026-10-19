# SEO surfaces: landing pages, structured data, the sitemap

_Last updated: 2026-10-19_

Four things carry the marketplace into search results: the **landing pages**
(city × brand × model), the **editorial text** an operator writes for them, the
**structured data** on every listing, and the **sitemap** that declares both.

## The editorial text is edited, not deployed

Decision 26 asked for «قالب + متغيّرات… يحرّرها الأدمن» — one template per
surface instead of thousands of hand-written pages. It existed in the schema as
`SeoTemplate` and **was wired at neither end**: one seeded row, and no query in
`src/` touched the table. What the pages actually printed came from
`src/messages/*.json`, so changing a title a search engine indexes needed a full
deploy, and the intro and outro paragraphs the decision designed were never
built at all.

Three surfaces now read a template, because three pages render one:

| Surface | Page | What the template drives |
| --- | --- | --- |
| `search` | `/cars` with no filters | Title and description only — filtered search is `noindex`, so there is nothing else to drive. |
| `landing_brand` | `/browse/{city}/{brand}` | Title, description, and the paragraph below the grid. |
| `landing_model` | `/browse/{city}/{brand}/{model}` | The same three. |

There is no `landing_city` surface, although the schema's comment named one: no
city-only page exists, and a surface with no page behind it is the «value in the
schema with no door» class this repository has closed eleven times.

Edited at `/admin/seo`, with a live preview on sample values, an `AuditLog` per
save, and the variable list per surface shown beside the fields. Rows reach a
running environment **by migration**, because the seed only ever runs on an empty
database.

### A paragraph whose variable has no value is dropped whole

Decision 26 said it about percentiles («إن كانت العيّنة أقل من ٨، أخفِ الفقرة
كاملة»); it is generalised to every variable. «منها ٠ سيارة مفحوصة» and «بأسعار
من إلى» read as defects, and a landing page is the thing that gets indexed — what
prints there stays in the results after it is fixed. A missing paragraph is
cheaper than an incomplete one.

The panel enforces the other half: a placeholder the page cannot fill is refused
on save, in the domain and not only in the field, because a direct call arrives
without a screen.

### The variables describe this page, and nothing wider

`brand` · `model` · `city` · `count` · `priceMin` · `priceMax` · `priceMid` ·
`inspected` — all read from the same `where` clause that produced the grid, so
the sentence cannot describe a slice other than the one shown.

**`priceMid` is not a market median.** Decision 26 named `PriceStat` as the
source, and that table is keyed by model × year × trim × city × mileage bucket:
anything aggregated across those rows mixes a 2015 car with a 2024 one and then
calls itself «the median price of this model in this city». `priceMid` is the
middle asking price **among the cars on this page** — and an observed one, the
lower of the two middles when the count is even, so the figure is always a real
car's price.

### The intro is the description, not a paragraph

It used to print above the grid, where it repeated the stat row word for word —
the count and the price range twice in three lines. It is now the
`<meta description>` only, which is the one place it was doing work: that is the
text a search result shows, and its numbers are what earns the click. The outro
stays on the page because it says what the stat row cannot — inspection reports
that can be read before contacting a seller, and payment held until ownership
moves.

The panel labels them for where they land («وصف نتيجة البحث» and «الفقرة في
أسفل الصفحة»), because a screen that says a text appears on the page while it
does not is a broken promise, and this repository stops for those.

The message files stay as the fallback: an operator who empties a title or
switches a template off must not leave a page without one.

## Both landing levels show their cars

The brand page was once a heading, a stat line and a button: whoever arrived
from a search result **saw no car at all** and was asked to click to begin. It
was fixed — and its twin, the model page, kept the defect until this sweep. The
model page is the more specific of the two, which is what a searcher actually
types ("camry in riyadh"), so it was the worse of the two to leave empty.

Both now carry: a breadcrumb, the count and price range, sort chips whose state
lives in the URL (shareable, works without JS), and a grid of up to twelve cards
**each wrapped in a link** — a card you cannot open is not a card.

## Structured data

| Page | Emits |
|---|---|
| Car | `Vehicle` · `FAQPage` · `BreadcrumbList` |
| Landing (both levels) | `BreadcrumbList` · `ItemList` |
| Help centre | `FAQPage` · `BreadcrumbList` |

**No node without a page.** The car page's breadcrumb used to declare
`/cars/{city}/{brand}` and `/cars/{city}/{brand}/{model}` — **three URLs that
all returned 404**, because the real page for a city × brand is the landing
page. We were declaring pages we do not own, to a machine, so nobody complained
and nothing surfaced it.

`carTrail` is a pure function (`src/lib/seo/car-trail.ts`) so the rule is tested
rather than rendered: the city node goes to the search with its filter (a page
that always exists), the brand and model nodes go to the landing pages **when
they clear the threshold**, and the node is dropped when they do not. A shorter
breadcrumb is truer than one that leads nowhere. `landingDepth` answers the
threshold question with two counts that stop at the threshold, not by loading
every published listing.

The `ItemList` on a landing page is built from the cards actually rendered. A
list that declares a hundred and shows twelve is a broken promise the engine
reads before a human does.

## The sitemap is derived

`src/app/sitemap.ts` reads listings, landing combinations and dealers from the
database. A hand-kept list keeps the URLs of cars that sold and misses what was
published today, and a dead URL in a sitemap teaches the engine that what we say
about ourselves does not match what we have.
