# Home page (Wa)

`src/lib/domain/home.ts` is one batched call returning everything Wa renders.

## Every number is counted, never written

The design markup carries display figures — "18,400 vehicles", "316 dealers".
Here they come from `count`. A page that promises verified ownership and
independent inspection reports, then opens with an invented figure, breaks its
promise in the first line the visitor reads.

`tests/home.test.ts` asserts each statistic against its own query, and asserts
that the design's placeholder numbers are **not** what we display.

The queries run as **one parallel batch**. The page is server-rendered, so a
chain of sequential queries shows up directly in time-to-first-byte.

## Monthly-payment bands

The monthly payment is derived from price by a linear formula (decision 14), so
the formula is **inverted** into price bounds rather than computing a payment per
row. Filtering stays on an indexed column, and a band is counted with one
`count` no matter how large the inventory grows.

A test asserts the inversion round-trips: the bounds of every band produce a
payment inside that band, and every car shown in a band really has its payment
there. Another asserts the bands sum to the financeable total — nothing dropped,
nothing counted twice.

**An empty band is shown disabled, not hidden.** Hiding it reshuffles what comes
after it under the reader's finger, and the ladder itself is information: "nothing
under 1,000 riyals" is an answer, not a gap.

The band selection **writes to the URL**, like every filter on Wb, so the home
page at a chosen band is shareable and browser-back works.

## Cumulative layout shift

CLS is an acceptance criterion, not an optimisation. Measured on the production
build: **CLS 0**, performance 100, LCP 0.7s.

Three things buy it:

- Every image placeholder reserves its aspect ratio before loading.
- The auction countdown's first value is **formatted on the server**, so no empty
  box is replaced by a number after the first tick.
- The live bar disappears entirely when there is no live auction, rather than
  rendering and then collapsing.

## Sections that disappear

Auctions, recently-added, services and FAQ each render nothing when their query
returns nothing. A heading over an empty row tells the reader we forgot
something.

## Not on this page

The natural-language search input is **absent, not disabled** (decision 24). The
flag stays off and nothing is rendered — we do not show what does not work.

`BodyTypeStrip` **is** built — the gap was in the Wa markup, not in §10. It comes
from screen 13a of `CarSell Redesign.dc.html`; see `DESIGN-DEVIATIONS.md` for
what it was built from and what still needs review.

Body types sit **between makes and finance**: make is what a Saudi buyer searches
first, body type second.
