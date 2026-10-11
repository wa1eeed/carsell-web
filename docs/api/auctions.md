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

"Walked away" has two concrete forms, and **neither had a caller** until task 105:
the payment window expiring (`timeoutUnpaidOrders`) and the buyer cancelling the
order themselves. A seller's cancellation is *not* a walk-away — the buyer broke
nothing, so their deposit is released, not seized.

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

## The deposit is money, not a flag

`holdDeposit` used to write a `Deposit` row with status `HELD` and touch no
money at all — no gateway call, no ledger entry, no payment. A bid was therefore
not a commitment, and `forfeitDeposit` forfeited a number in our own table.

**Owner's decisions, 2026-10-10:** the hold is taken **on a card**, and a
forfeited deposit belongs to **the platform**.

### How it flows

| moment | what happens |
|---|---|
| first bid | `POST /auctions/{ref}/bids` with `method` and `returnUrl` → gateway hold for `AUCTION_DEPOSIT`, `Payment` row linked to the `Deposit` |
| later bids | nothing — one hold per (auction, bidder) |
| auction closes, you lost | the hold is **cancelled at the gateway**, deposit `RELEASED` |
| auction closes, you won | deposit `APPLIED`, and the amount is **deducted from the order** (`Order.depositApplied`) |
| you pay and the sale settles | the hold is **captured into escrow** (`deposit.captured`), so the seller receives the full hammer price |
| you won and walked away | the hold is **captured for the platform**, deposit `FORFEITED`, two balanced entries credit platform revenue |

The deposit stays held between winning and one of those two outcomes, deliberately:
before settlement the order may still be cancelled, and a hold is released with one
call while a capture needs a refund.

### Two rules that are easy to get wrong

**The row follows the money, never leads it.** A `Deposit` written before the
hold succeeds makes the bidder committed in our table and free at their card.
Same for forfeiture: a `FORFEITED` row with a failed capture makes the ledger
claim income we never collected.

**The deduction happens in both places at once.** The order's `totalAmount` is
reduced *and* the gateway hold is settled against it. Deducting in one place
only produces an invoice that does not add up — and the order screen shows the
deposit as its own line, because a total smaller than the lines above it reads
as a broken calculation.

> **This paragraph described an intention, not the code.** The deduction happened;
> the capture did not. Nothing settled the winner's hold, so on every completed
> auction the buyer paid `total − deposit`, the deposit expired back to their card,
> and the ledger credited the seller that much less than they had sold for.
>
> Measured on a real walk before the fix (`ORD-2026-1023`): hammer 96,000, buyer
> paid 91,350, **ledger credited the seller 91,000** while their own earnings page
> said 96,000 — short by exactly the 5,000 deposit, whose payment was still `HELD`.
> After the fix (`ORD-2026-1024`): hammer 55,000, `deposit.captured` posts 5,000
> into escrow, the seller is credited 55,000, and both figures agree.
>
> A document that describes a path does not prove there is a door.

### `402`, not `409`

A first bid without a card returns `402 DEPOSIT_METHOD_REQUIRED` with the
amount. It is a step, not a failure: the screen opens the card picker instead of
saying "bid failed". A 3-D Secure challenge returns `402 DEPOSIT_REQUIRES_ACTION`
with the URL to finish — and **the bid is not recorded until the hold exists**.

The card is asked for at the first bid, not on page load: most visitors never
bid, and asking for a card before they decide drives them away.
