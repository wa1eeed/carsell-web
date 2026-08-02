# Listings search (Wb)

`GET /api/v1/listings` and `/[locale]/cars` are the same query. Filters are
parsed by **one function** used by both — if each parsed its own, a shared link
would render a different result than the screen it came from.

## The URL is the state

There is no second copy of the filters in the client. The page is rendered on the
server from `searchParams`; every filter change writes to the URL and navigates.

That single decision buys copy-paste, share, browser-back, open-in-new-tab and
deep-linking with no extra code — and makes them impossible to break, because
there is nothing else to keep in sync.

`parseFilters` and `serializeFilters` are exact inverses; a test asserts the
round-trip. Defaults (`sort=newest`, `page=1`, `limit=20`) are omitted from the
URL so shared links stay short.

**An invalid value is ignored, never an error.** An old or hand-edited link must
show results, not an error page. `type=BOGUS` behaves as no type filter.

## Filters

`type` · `brandId` · `modelId` · `trimId` · `yearFrom` · `yearTo` · `priceMin` ·
`priceMax` · `mileageMax` · `city` · `condition` · `spec` · `transmission` ·
`fuel` · `bodyType` · `drivetrain` · `inspected` · `scoreMin` · `paintStatus` ·
`verifiedSeller` · `financing` · `features[]` · `sort` · `page` · `limit`

**Features are ANDed.** Selecting sunroof and leather returns cars with both, not
either — each becomes its own condition.

**Boolean filters are symmetric.** `inspected`, `verifiedSeller` and `financing`
all negate on `false`. A contract where some flags are one-way is harder to
predict than one where none are; `verifiedSeller=true` plus
`verifiedSeller=false` equals the unfiltered total, and a test asserts it.

`limit` is **clamped**, not defaulted: asking for 9999 means "give me the most you
allow", and silently returning 20 contradicts that.

Only `PUBLISHED` listings appear. Drafts, listings under review and suspended
listings are never searchable.

### Derived filters

`financing` is computed, not stored (decision 14):
`type != AUCTION && askPrice >= FinanceSetting.minPrice`.

`verifiedSeller` reads `src/lib/domain/seller.ts`, which is the **single**
definition: an individual with `idVerified`, or a dealer with `Dealer.verified`.
The buyer searching for safety does not distinguish the two — they want a seller
the platform has verified. The **badge** differs («بائع موثّق» / «تاجر موثّق»):
same criterion, a label that describes the party. The Prisma condition lives in
the same file so a query cannot drift from the badge.

## Facets

Each dimension's counts are computed **within the other filters and excluding its
own** — the standard behaviour that answers "how many would I see if I switched
this option". With `city=الرياض` applied, the type counts are counts within
Riyadh, while the city counts still list every city.

## Pagination

`page` for the web (crawlable numbered links, needed for SEO) and `nextCursor`
for the app (stable under insertion). Both come back in `meta`; decision 21.

## Serialisation

`data` is an array of serialised cards. Never a Prisma object: `Listing` carries
`minAcceptPrice` and `Auction` carries `reservePrice`, and returning the raw
object leaks a commercial secret in one line that no reviewer catches reliably.

A test asserts neither field name **nor either value** appears anywhere in the
response.

Monthly payment is `null` for auctions — financing never shows on an auction
(HANDOFF §4.7).

## Not in this task

- The natural-language search bar is behind `FEATURE_NL_SEARCH` and hidden while
  the flag is off (decision 24). The "understood as" chips are built as the real
  active-filter row, which is useful regardless.
- SEO landing pages (`/cars/{city}/{brand}/{model}`) are task 10-b.
- Filtered pages are `noindex`: duplicate content with no search value. The
  unfiltered page is indexable.
