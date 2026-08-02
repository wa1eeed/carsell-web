# Offers — rules 1–5

`POST /api/v1/offers` · `PATCH /api/v1/offers/{id}`

## The rules live in the domain, not the route

One API route does not guard a rule. The screen calls it, the admin panel calls
it, a scheduled job calls it, and the app will call it. A rule written in a route
is forgotten in the second route — and here the consequence is financial, not
cosmetic.

Each rule is one function with a test named after it in `tests/offers.test.ts`.
**Time is passed in, never read from the clock**: a rule about 48 hours cannot be
tested by waiting.

## Rule 1 — below the floor is auto-rejected, with a notification

An auto-rejected offer is **recorded as a rejected offer**, not swallowed. The
seller needs to see how many offers landed under their floor to decide whether to
lower it; the buyer needs to know their offer arrived and was rejected, not that
it vanished.

**Auto-rejection is not an error.** The route returns `201` with
`autoRejected: true`. An error code would make the screen say "we could not send
your offer", which is false — it was sent, and the seller had set a floor. The
difference decides what the buyer does next.

The floor never leaves and cannot be inferred: the response is identical whether
the floor is 100 or 120 (decision 29). A test asserts the actual floor value
appears nowhere in the result or the notification.

## Rule 2 — one active offer per (buyer, listing)

The constraint is on the **pair**, not the listing: another buyer bids freely.
After a withdrawal the same buyer may offer again.

A seller cannot offer on their own listing — that is bidding the price up with no
real buyer behind it.

## Rule 3 — 48 hours

Expiry is **written, not inferred at read time**. An expired offer must look
expired to every reader — the screen, the admin panel, the report — not only to
whoever remembered to compare a date.

A counter-offer starts a **fresh** window. Inheriting the original's deadline
could expire an offer that was born a minute ago.

## Rule 4 — accept closes everything else

Four effects **in one transaction**: accept, reject the rest, withdraw the
listing, open a 24-hour payment window. An accept that succeeds while the closure
fails leaves one car sold twice. That is not theoretical — it is what happens when
a seller accepts two offers a second apart.

Commission and transfer fee are **snapshotted** into the order (rule 11): changing
the plan tomorrow does not touch today's deal. VAT is inclusive — 15/115 of the
total, not added on top (decision 17).

The winner's notification is `critical`: missing the window cancels the deal, and
rule 17 says critical notifications cannot be switched off.

## Rule 5 — unpaid means relist

**Cancellation is a status, not a stage.** The order stays at the stage it died
at, so it later reads "cancelled at payment" rather than just "cancelled". The
schema is right not to make `CANCELLED` a stage.

"Contenders" are those whose offers were rejected **by the acceptance** — not
everyone who ever offered. Someone who withdrew, or whose offer was auto-rejected
for being below the floor, chose to leave; notifying them is noise. A test
asserts the auto-rejected buyer gets no relist notice.

## A model that was missing

`NotificationTemplate` existed; `Notification` did not — a template describing the
shape with no record of the event. Rules 1 and 5 both require a notification, so
without a record the condition is untestable: there is no trace to measure.

Notifications are **recorded, never sent from here**. Sending depends on a
provider that can fail, and the rule requires the notification to *happen*, not to
arrive. The record is written inside the same transaction as the event that caused
it; delivery reads from it later.

## Verified live

Against the running production build: a 50,000 offer on a listing with an 82,340
floor came back `REJECTED / autoRejected: true` with the floor absent from the
response; a second active offer got `OFFER_ACTIVE_EXISTS`; a buyer accepting their
own offer got `FORBIDDEN`; the seller's counter succeeded; acceptance produced
`ORD-2026-1013`, closed one rival offer, and moved the listing to `RESERVED`.
