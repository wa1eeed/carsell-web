# Car page (Wc)

`GET /api/v1/listings/{ref}` and `/{locale}/cars/{city}/{brand}/{model}/{ref}`
are the same object. The route does not build its own — if it did, the guard
below would have to be written twice, and writing it twice is how a secret gets
out.

## The serialiser is the guard

`Listing` carries `minAcceptPrice`; `Auction` carries `reservePrice`. Returning a
Prisma object leaks a commercial secret in one line that no reviewer catches
reliably. Nothing leaves `toPublicDetail` except fields built one at a time.

Because those fields are **absent from the type**, leaking them into JSON-LD or a
`data-` attribute is impossible by construction, not merely forbidden by review.

`generateMetadata` uses a separate query with an explicit `select`. Fetching the
whole row for four fields drags `minAcceptPrice` into everything that touches the
value — a Next dev-mode instrumentation hook published it into the HTML. Narrow
selects end the possibility instead of relying on nobody touching it.

### What is allowed out

Decision 29 permits `reserveMet: boolean`; the **amount** is what is banned. The
same applies to `minimumBid` — highest bid plus one increment, from which the
reserve cannot be derived.

`tests/listing-detail.test.ts` compares against the **actual values** in the
database across every published listing, not against field names.

> **Conflict on record.** §10's acceptance test is "a text search for `reserve`
> in the HTML returns zero". Decision 29 explicitly permits a field named
> `reserveMet`, so the literal search can never return zero. Decision 29 is later
> and design decisions override the spec, so the flag stays and the value test
> governs. Production output: `minAccept` = 0 occurrences; every `reserve`
> occurrence is the permitted flag or its label.

## Canonical URL

`/{locale}/cars/{city}/{brand}/{model}/{ref}` (decision 25). One catch-all route
handles every length: a bare `ref` **308**s to the canonical, four segments
render, and wrong segments 308 to the right ones so two URLs never serve the same
page and split its ranking.

Two things this cost, both found by running it:

- **The `Location` header is ASCII only.** Saudi cities are Arabic, so `path` is
  percent-encoded and `display` carries the readable form for the screen.
- **Route params arrive encoded.** Comparing them against decoded text never
  matches, so every canonical URL redirected to itself — an infinite loop. The
  segments are decoded before comparison, and a **loop guard** now refuses to
  redirect a path to itself regardless of what the comparison concludes.

308 rather than 301: Next only emits 307/308, and search engines treat 308 as a
permanent redirect identically. The SEO outcome decision 25 asked for is
unchanged.

## FAQ by selling method

`surface = listing_page` and `listingType = {type} OR NULL`. Type-specific
questions win and sort first; the generic set stays so a direct-sale page is
never empty. Duplicates are removed — a question can be placed both ways.

**One open at a time** (decision 31). The tab shows the **actual** number
displayed, not a fixed number. Built on native `<details>` so the answers are in
the served HTML — which `FAQPage` structured data requires.

## Sections that disappear rather than apologise

- No inspection → an empty state that says so and points at the services
  directory. Not a greyed-out score.
- History shows only what the platform owns, each line carrying its source
  (decision 15). Reports, liens and previous owners are in the paid report.
- Paint status comes from the inspection when there is one, from the seller
  otherwise, and **the source is shown next to it** (decision 16).
- Price position hides below a sample of 8 (decision 30).
- No similar cars → the whole section is gone. A heading over an empty row says
  we forgot something.

## Auctions

With no bids the card shows the **opening price**, not "highest bid 0". A zero
where a price belongs reads as a worthless car — the worst thing a seller can
read about their own vehicle.

Compare / 360° / messaging buttons are **absent** (decision 18); messaging needs
moderation and a content policy, and is not opened with a button.
