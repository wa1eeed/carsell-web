# Auction bidding — proxy bids and cancellation

_Last updated: 2026-11-25_

Rules 6–10 live in `src/lib/domain/auctions.ts`. This page covers the two
added on 2026-11-25 by owner decision: **rule 11, proxy bidding**, and
**bid cancellation**.

## Rule 11 — proxy bidding (`مزايدة تلقائية حتى سقف`)

A bidder may attach a **cap** to a bid: bid now, and let the system raise on
their behalf up to that ceiling.

| Question | Answer | Why |
|---|---|---|
| By how much does the system raise? | `auction.bidIncrement` — the auction's own step | It pays what the bidder would have paid by hand. A larger step makes the proxy spend more than its principal; a smaller one makes proxying cheaper than bidding, penalising whoever bids manually. |
| Is the cap visible? | **No.** Secret like `reservePrice` (decision 29) | If it showed, a rival would bid one riyal under it and the cap would become a weapon against its owner. `Bid.maxAmount` never enters a public response; `tests/proxy-bidding.test.ts` asserts it over the whole serialised payload. |
| Is the deposit taken on the cap? | **No — on the bid**, as before | A cap of 500,000 carries the same exposure as a manual bid of 500,000, so there is no new risk. And a deposit scaled to a secret cap would leak its size. |
| Two caps collide? | The higher cap wins at `min(higherCap, lowerCap + increment)` | Standard ascending-auction resolution. |
| Two equal caps? | The **earlier** one wins, at the cap | The rival's cap stood before this bid; equality does not take it away. |

### It settles in one step, not a loop

A loop ("while either side can raise") terminates — each pass raises the price
by at least one increment — but writes dozens of rows when two caps are far
apart, and a log of forty machine bids between two people cannot be read. The
outcome is computed directly.

### The response describes what settled

`placeBid` returns the **settled** amount and `leading`, not what was sent. A
bidder whose rival's higher cap overtakes them in the same instant would
otherwise read "your bid was placed at 190,000" while the price says 195,000 —
success on screen, failure in fact.

## Bid cancellation

| Question | Answer | Why |
|---|---|---|
| Who may cancel? | Admins holding `bids.cancel` (SUPER_ADMIN, OPS) | A bidder who could withdraw at will empties the auction of meaning — that is what the deposit exists to prevent (rule 9). Cancellation is for cause: terms breached, an impersonated account, a figure typed with an extra digit. |
| Which permission? | Its own — not `listings.review`, not `users.suspend` | Cancelling **moves the displayed price**. Borrowing another key grants the power to people who were never granted it. |
| When? | While the auction is **live** only | After close a bid has consequences in the world — a winner announced, deposits settled, possibly an order. Undoing it there is unwinding a transaction, not deleting a row; that path is the dispute. |
| What happens to the price? | It falls back to the next standing bid | The cancelled bid leaves every calculation. |
| What happens to the deposit? | **Nothing** | Cancellation targets a bid, not a bidder: the deposit stands and they may bid again. Someone who deserves suspension goes through `users.suspend`; mixing the two turns a typo into a penalty on an account. |
| Is a reason required? | Yes, at least 6 characters | It is shown to the bidder in their bell **and in the public auction log** (`ملغاة · إخلال بالشروط`). Whoever cancels writes what the bidder will read. |

### The row moves; it is not flagged

Thirty-eight places in `src/` read bids — highest price, bidder count, next
minimum, the admin panel, the reports. A flag on `Bid` would oblige all
thirty-eight to remember a filter, and **one forgotten reader shows a cancelled
bid as the price**. So the row is moved to `CancelledBid`: every existing
reader stays correct with no change, and only the screen that *wants* the
cancelled bids — the log — asks for them.

### What is written

- `CancelledBid` — amount, bidder, `placedAt` (so the log keeps its order), who cancelled, the reason
- `AuctionEvent { kind: BID_CANCELLED }` — the line the log prints between bids
- `AuditLog { action: 'bid.cancel' }` — with the price before and after
- `auction.bid_cancelled` to the bidder, and `auction.lead_restored` to whoever regained the lead

> The second template exists because the first draft sent `auction.outbid`
> ("you have been outbid") to someone who had just **regained** the lead — a
> message that says the opposite of what happened, and would make them leave
> the auction exactly when they are winning it.
