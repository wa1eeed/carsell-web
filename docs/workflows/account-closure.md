# Closing an account

Until this was built there was **no way out**: no screen, no route, no domain
function. Whoever registered stayed registered.

## The owner's decision

> «يُجهَّل الحساب وتبقى فواتيره وعقوده.» — 16 October 2026

Personal data is erased; the financial record stays. A tax invoice and a sale
contract are documents kept for years, and erasing the person behind them empties
them.

**What makes the decision possible was measured first.** `TaxInvoice` snapshots
`customerName` and `customerVatNo` at issue; `VehicleSaleAgreement` snapshots
`buyerName` and `sellerName`. Both are independent rows that never read `User`
again — so anonymising the account does not hollow them out. Had they read the
name live, "anonymise" would have been "erase the documents" by another route,
and the snapshot would have had to come first.

## What goes, what stays

| Erased | Kept |
|---|---|
| name · phone · email · avatar · city · address | tax invoices and settlement sheets |
| identity, its encrypted number, status and note | sale contracts, with the parties' names as issued |
| IBAN · bank name · VAT number · margin-scheme approval | orders, ledger entries, reconciliation |
| favourites · saved searches · notifications · device tokens | the customer number (`CUS-…`) |

The customer number stays on purpose: the record remains traceable without being
identifiable.

**The phone is replaced, not emptied.** The column is unique and not nullable, and
a fixed constant would stop a second account from ever closing. It becomes
`closed:<id>` — not E.164, so no code can be sent to it, and no collision.

## A state of its own

`UserStatus.CLOSED`, not `BANNED`. One is our decision, the other is theirs, and
the admin list must tell them apart. `closedAt` records when.

## Nothing closes over a live obligation

Refused, and **said before the button is pressed**, not after:

| Blocker | Why |
|---|---|
| a live order | finish or cancel it; the other party is waiting |
| held escrow | money is sitting on an unsettled deal |
| a live auction on their listing | bidders are mid-auction |
| a held deposit | it is released when that auction closes |
| a payout in flight | wait for it to land |
| a wallet balance | the money is theirs — withdraw it first |

The screen reads the blockers when it opens and shows them as sentences, each
saying what to do. Discovering "you have something to do" **after** pressing is
the worst moment, and the repository's rule says the reminder precedes the need.

## What else happens

Published and under-review listings are **paused** through `pauseListing` — the
single entry point (gate 21). A live listing from a seller who no longer exists
would keep taking offers nobody will ever answer. Drafts with no history are
deleted. Vehicles stay: they are a separate entity, now with no listing, so
invisible.

The session cookie is cleared on the way out, and `currentUser` refuses any
non-`ACTIVE` account from that moment — the block bites immediately, not when the
token expires.

An `AuditLog` row records `account.closed` with the previous status and the
optional reason **as the person wrote it** — no name, no phone copied into a log
that is kept for years.

## Where it is

`/ar/account/profile`, at the bottom. Domain:
`src/lib/domain/account-closure.ts`. Route: `POST /api/v1/me/close`, with `GET`
on the same path returning the blockers. Tests: `tests/account-closure.test.ts`.
