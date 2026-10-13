# Who gets told, and when

A notification is a row in `Notification` keyed by `templateKey`; the text comes
from `NotificationTemplate`, seeded from
`prisma/seed-data/notification-templates.json`. Writing one is `notify()` in
`src/lib/domain/notifications.ts`, which also broadcasts over the realtime
channel so the bell count moves without a reload.

Two rules decide everything below.

**The one who acted does not need telling.** They pressed the button and saw the
result. The one waiting is the one who does not know. So every helper in
`src/lib/domain/order-notify.ts` takes the actor and skips them.

**The domain does not compose sentences.** The payload carries keys and numbers;
the wording lives in the template (gate 17). A template that needs a stage name
in its body would force the domain to translate an enum, so the order-journey
bodies are written to be complete without one.

## The order journey

Wired in this commit. Before it, every one of these moments was silent: a seller
could list a car, have it ordered, have 60,850 held in escrow against it, have
ownership transferred and the money released — and never receive a single line.

| Moment | Key | Who receives it | Written in |
| --- | --- | --- | --- |
| Order created | `order.received` | **seller** | `orders.buyDirect`, `offers.acceptOffer`, `auction-order` (×2) |
| Order created | `order.created` | buyer | same, except where a more precise message already went to the buyer in the same transaction (`offer.accepted`, `auction.won`) |
| Stage advanced | `order.stage_changed` | the party who did **not** move it | `orders.advanceStage` |
| Money reached escrow | `escrow.held` | **seller** | `payments.applyState`, on `HELD` |
| Money released | `escrow.released` | **seller** | `payments.applyState`, on `SETTLED` |
| Deal complete | `listing.sold` | **seller** | `orders.advanceStage`, on `DONE` |
| Order cancelled | `order.cancelled` | the party who did **not** cancel | `order-cancel.cancelOrder` |

`order.received` did not exist. `order.created`'s text is written in the buyer's
voice («أُنشئ طلبك»), so sending it to a seller would have read wrong — the
seller's own template is new, and mirrors `offer.received`, which has always
been wired.

### Where each write sits

Inside the transaction that causes the fact, except two:

- `listing.sold` fires **after** the transaction, beside the sale agreement and
  the escrow release, because a completed transfer is not undone by a bell that
  failed to ring.
- `escrow.released` is inside, because its transaction is the ledger entry that
  recognises the revenue — if that rolls back, nothing was released.

## Entity links

`entityType: 'Order'` with `entityId` set to the order's **ref** (not its id).
`destinations()` in `notifications.ts` turns that into
`/{locale}/account/orders/{ref}`, so every line in the bell opens the order it
is about. A notification without a destination is a line the reader cannot act
on.

## Cleaning up after a walk

A notification is a side effect on a shared entity, so both restore paths follow
it:

- `tests/helpers/order-fixture.ts` — `restoreOrder` deletes notifications for
  the order's ref created after the snapshot.
- `scripts/trial-reset.ts` — `removeOrder` deletes them by ref before the order
  row goes.

Without the second, one manual walk left five bells ringing in a seeded seller's
account about a deal that no longer existed. That happened, and was cleaned.

## The auction

Wired in the same sweep. `auction.outbid` is not a courtesy — it is the
mechanic an auction runs on: you are outbid, you are told, you come back and
raise. Without it the format ends on whichever bid its owner walked away from.
And an auction closes on a scheduler, not a click, so **no party is at a screen
when it matters**.

| Moment | Key | Who receives it | Written in |
| --- | --- | --- | --- |
| A higher bid lands | `auction.outbid` | the **previous** top bidder (never the person who just bid) | `auctions.placeBid` |
| A last-minute bid extends closing | `auction.extended` | every other bidder | `auctions.placeBid` |
| Deposit held on a card | `deposit.held` | the bidder | `auctions.holdDeposit` |
| Auction opens | `auction.starting` | everyone who favourited the listing | `auctions.openScheduledAuctions` |
| Closing soon | `auction.closing` | everyone who bid | `reminders.remindClosingAuctions` |
| Closed, reserve met | `auction.won` / `auction.lost` | winner / every other bidder | `auctions.closeEndedAuctions` |
| Closed, reserve not met | `auction.reserve_not_met` | seller **and** top bidder | `auctions.closeEndedAuctions` |
| Deposits returned | `deposit.released` | each loser | `auctions.settleDeposits` |

`auction.lost` already existed, but only on the buy-now path — the rarest way an
auction ends. A bidder who lost by the clock got «رُدّ عربونك» and nothing
saying the auction was over.

**Destinations key on the auction id, not the listing ref.** `destinations()`
maps `Auction:{id}` → `/auctions/{listing.ref}`; passing the ref as `entityId`
produces a line with no link — nothing throws, nothing opens.

**Who is the audience before anyone has bid?** Whoever favourited the listing.
They declared intent before the window opened, which is exactly when the news is
useful.

## Reminders

`order.payment_due` and `auction.closing` had no writer because **nothing in the
product looked at a deadline before it passed**. Every timed job looked after:
`timeoutUnpaidOrders` cancels the order *then* tells the buyer. Discovering a
deadline after it lapsed is discovering it after losing.

`src/lib/domain/reminders.ts` adds `remindPaymentDue` and
`remindClosingAuctions`, both registered in `src/lib/jobs/run.ts` **after** the
closers — put them before and you would remind someone about an order the next
job cancels.

Thresholds are admin settings (`paymentReminderHours`, default 6;
`auctionClosingReminderMinutes`, default 15), not constants.

**Sent once.** The scheduler runs every few minutes and a deadline six hours out
stays six hours out, so the marker is the notification row itself: a key already
present for that entity means it was sent. No new column, no migration.

The hours in the payment reminder are **computed from the deadline**, not copied
from the setting — a late scheduler pass would otherwise tell someone with two
hours left that they have six.

### Why `order.payment_overdue` stays unwritten

An overdue order does not exist for any length of time: `timeoutUnpaidOrders`
cancels it on the first pass after its window and sends
`order.payment_timeout`. There is no honest moment for a second key, and a key
sent at a moment that never arrives is noise, not coverage.

## Identity

The reviewer's screen (A18) asks for a note in so many words — «ما الذي ينقص أو
يمنع؟ — **يقرؤه صاحبه**» — stores it in `identityNote`, and **nothing delivered
it**. No notification, and no screen showed it. A loop where one side asks a
question the other side cannot receive.

Worse, the account row was computed from `idVerified` alone, so four different
people read the same sentence: someone awaiting review, someone asked for a
clarification, someone rejected, and someone who never submitted. The waiting
one resubmits; the rejected one thinks nothing was ever sent.

| Moment | Key | Who receives it | Written in |
| --- | --- | --- | --- |
| Verified | `account.id_verified` | the applicant | `admin-identity.decideIdentity` |
| Clarification or rejection | `account.id_rejected` | the applicant, **with the reviewer's text as `reason`** | same |

Verification gates every transaction — listing, offering, bidding, buying — so
being verified and not knowing is as costly as being rejected and not knowing.

Three things had to move together, and a notification alone would not have been
enough: the bell carries the reason, the account row now names the real state
(`PENDING` / `CLARIFICATION` / `REJECTED` / verified / never submitted), and the
note is shown with a link to `/account/profile#idVerification` — the anchor that
already existed, so the loop closes where it is answered.

`account.iban_required` stays unwritten: the profile-completion banner already
says it on every account screen, continuously, which is better than one bell.

## Listings and offers

| Moment | Key | Who receives it | Written in |
| --- | --- | --- | --- |
| Review approved | `listing.published` | the seller | `admin-listings.decideReview` |
| Returned or suspended | `listing.rejected` | the seller, with the reviewer's note as `reason` | same |
| A report pulls a live listing | `listing.under_review` | the seller | `listing-state.sendListingToReview` |
| An offer lapses | `offer.expired` | the buyer | `offers.expireOffers` |
| An offer is about to lapse | `offer.expiring` | **both** parties | `offers.remindExpiringOffers` |

`listing.under_review` is written **inside the transition**, not in its two
callers (a user report and an admin action) — two copies of "who gets told"
drift on the first change. No reason is passed with it: the report is someone
else's words, and sending them to the person reported on identifies the
reporter.

The expiry reminder goes to both sides because both can still act: the seller
can accept, the buyer can change or withdraw. Threshold:
`offerReminderHours`, default 6.

## Gate 45

Every template in `prisma/seed-data/notification-templates.json` must have a
writer, or be named in `DECLARED_SILENT` inside the gate **with a reason**.

The gate finds a key written anywhere in `src/lib` as a quoted literal, with
comments stripped first — so a ternary (`cond ? 'account.id_verified' :
'account.id_rejected'`) counts and a mention in a comment does not.

It checks **both** directions: a template with no writer fails, and a declared
key that later gains a writer fails too. Without the second check the list
becomes the place anything awkward goes to be forgotten.

It was measured before being enabled, per the repo's ten-alarm rule: 29 at the
start, moved in three passes, until 7 remained with no honest moment — each
declared with why. The table is in `docs/BACKLOG.md` § G.

## What is still silent

7 of 42, all declared in the gate with a reason, and the reasons are the
point: five are covered elsewhere or have no moment to fire in, and two are
real holes that a notification cannot fill on its own.

`listing.expiring` has no trigger because **listings do not expire** — no
field, no job. That is a product decision.

`service.completed` has no trigger because **nothing in the product completes a
service request**: one `serviceRequest.create` in the whole tree and zero
updates, read-only admin screens, inspection reports written only by the seed,
and the buyer's money held on their card with no ledger entry at all. That is
`docs/BACKLOG.md` § I, and it needs two owner decisions before it is built.
