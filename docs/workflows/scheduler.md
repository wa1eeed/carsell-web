# The scheduler

Twelve jobs, one entry point, one HTTP route. Until it was built, **every
time-based rule in the product was dead code**: offers did not lapse, unpaid
orders held a car forever, auctions never opened and never closed. The functions
were written and tested; nothing called them. A deadline that is never enforced
is not a deadline, and a screen promising «مهلة الدفع حتى ٤ أغسطس» was promising
something that would not happen.

## Running it

`POST /api/cron/run` with `Authorization: Bearer $CRON_SECRET`, compared in
constant time. Without `CRON_SECRET` the route refuses — and that refusal is one
of the startup checks, because a scheduler that silently never runs looks exactly
like a healthy deployment: migrations apply, the container boots, `/health`
returns `{ok:true}` because it only touches the database, and no auction ever
closes.

The orchestrator is `runJobs()` in `src/lib/jobs/run.ts`. Each job is wrapped
individually: reconciliation failing because a gateway will not answer must not
stop offers from expiring. The result reports **every** job's outcome, because
the reader needs to know *which* failed, not that "the batch" failed.

## Order, and why it is load-bearing

The order is not alphabetical and not arbitrary. It is tested
(`tests/jobs.test.ts` asserts the exact list), because each constraint below is
invisible in the code itself.

| # | Job | Why here |
| --- | --- | --- |
| 1 | `expireOffers` | **Frees first.** A lapsed offer releases a listing. |
| 2 | `timeoutUnpaidOrders` | Same: cancels and republishes the car. |
| 3 | `openScheduledAuctions` | **Opens before closing** — an auction whose window is minutes passes through both states in one run. |
| 4 | `closeEndedAuctions` | Creates the winner's order, settles deposits. |
| 5 | `expireSellerDecisions` | A below-reserve decision that lapsed. |
| 6 | `remindPaymentDue` | **After the closers, never before.** Ahead of them it would remind someone about an order the next job cancels. |
| 7 | `remindClosingAuctions` | Same reason. |
| 8 | `remindExpiringOffers` | Same reason. |
| 9 | `overdueTransfers` | Flags, does not move money. |
| 10 | `overdueDisputes` | Flags an SLA breach. |
| 11 | `releaseConfirmedOrders` | **A safety net, not a second path.** Release happens the moment transfer is confirmed; this catches what stalled — a gateway that did not answer, a container that died between the confirmation and the call. Without it a seller's money stays held with nothing saying the call never happened. |
| 12 | `reconcileYesterday` | **Last.** It reads and writes no money, so its failure delays nothing. |

## Reminders

Three jobs look at a deadline **before** it passes. Every other timed rule looks
after: `timeoutUnpaidOrders` cancels the order and *then* tells the buyer.
Discovering a deadline after it lapsed is discovering it after losing.

| Job | Who is reminded | Setting | Default |
| --- | --- | --- | --- |
| `remindPaymentDue` | the buyer | `paymentReminderHours` | 6 |
| `remindClosingAuctions` | everyone who bid | `auctionClosingReminderMinutes` | 15 |
| `remindExpiringOffers` | **both** parties to the offer | `offerReminderHours` | 6 |

Each is sent **once**. The scheduler runs every few minutes and a deadline six
hours out stays six hours out, so the marker is the notification row itself: a
key already present for that entity means it was sent. No new column, no
migration.

The hours quoted in a reminder are **computed from the deadline**, not copied
from the setting — a late pass would otherwise tell someone with two hours left
that they have six.

## Deadlines are settings, not constants

`src/lib/domain/deadlines.ts` holds every time limit with a default and a
**bound**. Without bounds the setting is a weapon: a zero-hour payment window
cancels every order on creation; a thousand-day transfer window holds buyers'
money for years. Bounds are enforced in the server, not the screen.

| Key | Default | Bounds | What it governs |
| --- | --- | --- | --- |
| `offerTtlHours` | 48 | 1–720 | How long an offer stands |
| `paymentWindowHours` | 24 | 1–168 | From order creation to cancellation |
| `transferDeadlineDays` | 7 | 1–90 | From payment to transfer |
| `transferExtensionDays` | 7 | 1–90 | One extension, with a written reason |
| `sellerDecisionHours` | 24 | 1–168 | Below-reserve decision window |
| `disputeSlaHours` | 48 | 1–336 | Support's reply window |
| `settleWindowHours` | 72 | 1–720 | Time to complete a settlement |
| `auctionExtendWindowSeconds` | 60 | 10–3600 | A bid inside this extends |
| `auctionExtendBySeconds` | 300 | 30–3600 | By how much |
| `reportValidityDays` | 90 | 7–365 | When an inspection goes stale |
| `paymentReminderHours` | 6 | 1–72 | Reminder before the payment window shuts |
| `auctionClosingReminderMinutes` | 15 | 1–720 | Reminder before an auction closes |
| `offerReminderHours` | 6 | 1–168 | Reminder before an offer lapses |

**A deadline is read at creation and stored on the row.** Changing the setting
later does not move a deadline already running: whoever was promised 24 hours
gets 24 hours. The setting governs what is created next, not what exists.

## What the scheduler cannot do

It cannot run inside the container with tools the image does not have. The job
runner is reached with `node`, not `curl` — `node:22-alpine` has no `curl`, and
the Dockerfile's own health check already says so by using `wget`. A scheduler
entry that says only `failed` with no body is usually this, not a bug in a job.
Print the response body.
