# API conventions

Applies to every route under `/api/v1`. The public API (`/api/public/v1`) is
built and follows the same envelope — see [`public.md`](public.md).

## Envelope

Success is `{ data, meta? }`. Failure is
`{ error: { code, messageAr, messageEn, fields? } }`. Messages ship in both
languages so no client keeps its own error translation table. Codes are defined
once in `src/lib/api/response.ts`.

## Versioning

The version is **in the path**, not in a header. A URL that identifies its own
contract can be pasted into a browser, a log, or a bug report and still mean the
same thing a year later.

`/api/v1` is internal — consumed by this web app and by the Flutter app.
`/api/public/v1` is external and will be documented separately.

## Serialisation

**Never return a Prisma object.** Every response passes through a `toPublicX()`
function that decides what leaves the building.

This is not style. `Listing` carries `minAcceptPrice` and `Auction` carries
`reservePrice`; a single `return listing` leaks a commercial secret, and no
reviewer reliably catches it. A serialiser makes the leak impossible by
construction rather than by vigilance, and a test asserts the fields never
appear.

## Pagination

`GET /listings` accepts both `page` and `cursor`. The web uses `page`, because
crawlable numbered links are what SEO needs. The app uses `cursor`, because
infinite scroll needs stability under insertion.

## Idempotency

Every `POST` accepts `Idempotency-Key`. It is **mandatory** for offers, bids,
orders and payments — a retried bid must not become two bids.

## Rate limits

| Surface | Limit |
|---|---|
| OTP send | 5 per hour, per number |
| OTP verify | 5 per challenge |
| Bidding | 10 per minute |
| Reports | 5 per day |

## Business logic

Lives in `src/lib/domain/`, never in a route handler. Routes validate shape,
normalise input and delegate. The Flutter app will call the same functions
through the same endpoints, so a rule that lives only in an HTTP handler is a
rule the app does not have.

## Realtime channels

REST is the source of truth; WebSocket only announces that something changed.
Full design in [`docs/architecture/realtime.md`](../architecture/realtime.md).

| Channel | Visibility | Events |
|---|---|---|
| `auction:{id}` | public | `bid.placed` · `auction.extended` · `auction.ended` |
| `user:{id}` | owner only | `offer.received` · `offer.countered` · `offer.accepted` · `order.stage_changed` |

Consumers must take a REST snapshot on connect and on any `seq` gap. Payloads
carry identifiers and small numbers only, never `reservePrice`,
`minAcceptPrice`, or a full bidder identity.
