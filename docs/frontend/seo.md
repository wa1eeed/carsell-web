# SEO surfaces: landing pages, structured data, the sitemap

Three things carry the marketplace into search results: the **landing pages**
(`/browse/{city}/{brand}[/{model}]`), the **structured data** every public page
emits, and the **sitemap**, which is derived from rows rather than written by
hand.

## Landing pages are generated only for combinations that exist

`landingCombinations()` reads published listings and keeps a combination when it
has at least `MIN_LISTINGS` (3). An empty landing page is worse than a missing
one: the visitor arrives, finds nothing and leaves, and the engine learns that
the site promises what it does not hold — which costs the pages that do hold it.

The threshold is checked **per request**, not only at generation. A combination
published in `sitemap.xml` today falls below the threshold tomorrow when a car
sells, so the page redirects (301) to the search with its filters while anything
remains, and 404s only when nothing is behind it. A link you published yourself
and then killed is worse than a link you never published.

**And the seed plants one on purpose.** Measured: the biggest city × brand ×
model combination in seeded data was **two** — below the threshold — so the
model-level landing page could not be opened in any development environment. It
had kept a defect its sibling had already been fixed for (see below) precisely
because nothing could render it. The first three listings are now pinned to one
city and one trim. **What is not seeded is not seen.**

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
