# Auctions — rules 6–10

## Rule 6 · minimum bid

First bid = **opening price, with no increment**. Adding the increment to the
opening would make the first bidder pay more than the seller advertised.
Afterwards: highest + increment.

A bid requires a **held deposit** (rule 9). A bidder with no deposit is a bidder
with no cost of walking away, which empties the auction of meaning. Checked in
the domain, not on the screen.

A seller cannot bid on their own vehicle.

## Rule 7 · last-minute extension

A bid inside the final 60 seconds extends the auction by 5 minutes **from that
moment**, up to a **published** maximum.

Without a cap, two bidders extend indefinitely by bidding once a minute, and
waiting becomes a weapon. With one, the auction ends at a time everyone can see —
`maxExtensions` is part of the public object precisely so it is not a surprise.

## Rule 8 · the reserve never appears

`isReserveMet` takes the secret amount and returns a **flag**. No route and no
serialiser touches `reservePrice`, which makes leaking it impossible by
construction rather than forbidden by review.

Bidder identity does not leave either. Bids carry a **stable alias within one
auction** ("bidder 3") — enough to follow who is bidding against whom, not enough
to identify anyone. Numbering by order of first appearance rather than a
truncated id prevents matching the same bidder across two auctions.

## Rule 9 · deposit lifecycle

| Outcome | Status |
|---|---|
| Did not win | `RELEASED` — refunded immediately |
| Won | `APPLIED` — credited to the order |
| Walked away | `FORFEITED` |

Holding a loser's deposit after the auction ends is not a guarantee; it is
withholding money for no reason. Deposits settle in the **same operation** that
closes the auction, not in a later job.

> **A vocabulary trap.** `RELEASED` on a `Deposit` means *returned to the bidder*.
> `RELEASED` on an `Escrow` means *paid out to the seller*. Same word, opposite
> direction. The schema owns the vocabulary and the code follows it, but anyone
> reading both models must know the difference.

## Rule 10 · buy-now disappears when the reserve is met

Not disabled — **absent from the public object**. Once the reserve is met the
vehicle sells for certain, so buy-now would pull it away from bidders at a price
they might have exceeded.

## Realtime

**Snapshot from REST, nudges from WebSocket.** The message says "something
changed"; the snapshot says "this is the state". Building state from messages
means one lost message corrupts everything after it, invisibly — so a gap in
`seq` triggers a fresh snapshot rather than an attempted patch.

**Polling every 30 seconds continues even with a healthy socket.** That is what
turns a Redis outage into a delay instead of an outage.

Publishing happens **after** the bid is saved and outside the transaction.
Including it would let a Redis failure fail a successful bid — the worst thing a
notification carrier can do.

`services/realtime` subscribes and broadcasts. It never reads or writes the
database. `user:*` channels need a short-lived ticket and **the ticket endpoint
does not exist yet**, so subscription to them is refused outright: an open
subscription to a private channel is worse than a missing feature.
