# The ledger

A double-entry, append-only book that answers two questions nothing else in the
product can answer:

- **For the seller** — what am I owed, what was deducted and why, and when does
  it reach me?
- **For us** — what is our revenue, what VAT do we owe, and how much does the
  provider hold in the name of our transactions?

---

## 1. A ledger, not a wallet

This distinction governs everything below.

| | Wallet | This ledger |
|---|---|---|
| Holds money | Yes | **No** |
| User can withdraw | Yes | No |
| Regulated financial service | Yes | No |
| Answers "how did this number get here?" | Rarely | **Always** |

**The platform does not hold other people's money.** Escrow sits with a licensed
payment provider, and the split happens there. The ledger is a *statement of
rights*: it records what each party is owed, never a balance anyone can draw on.

`ESCROW_AT_PROVIDER` measures what the provider holds against our transactions.
It is a clearing account, not our cash.

---

## 2. Why not just aggregate the orders?

Before this, the admin finance screen derived every figure by aggregating orders
on demand. That answers *how much*, but never *why it changed* — because the
current state has forgotten its history.

When a seller asks "why is my payout 47,200 when it was 48,000?", aggregation
re-derives from today's rows. A refund, a forfeited deposit or a manual
correction leaves no readable trace. The ledger keeps what happened.

---

## 3. The three rules

### 3.1 Append only

Entries are never updated or deleted. A correction is a **reversing entry**.
Editing a row erases the history the ledger exists to preserve.

### 3.2 Every transaction balances

Debits equal credits for every `txnId`, without exception. This is checked
**at write time** by `postEntries` — a book that accepts unbalanced entries and
is audited later is a book you cannot trust between audits.

`unbalancedTransactions()` returns any transaction that violates this. It must
always be empty; if it is not, some writer bypassed `postEntries`.

**Gate 20** (`scripts/check-tokens.mjs`) rejects any direct
`ledgerEntry.create/update/delete` outside `ledger.ts`, so bypassing is not
possible by accident.

### 3.3 The vehicle value is not revenue

The single most important accounting rule in this product.

- **Vehicle value** passes from buyer to seller. Not our revenue.
- **Government transfer fee** is a disbursement made on the customer's behalf.
  Neither revenue nor expense — it flows through `GOVT_FEES_CLEARING`.
- **Our revenue** is the commission, the transfer admin fee and the processing
  fee. Nothing else.

This is the same distinction `src/lib/domain/fees.ts` already draws. The ledger
makes it binding rather than descriptive. Mixing them shows a platform selling
billions and losing money.

---

## 4. The accounts

| Account | Nature | Meaning |
|---|---|---|
| `ESCROW_AT_PROVIDER` | Clearing (debit) | What the provider holds for our transactions. Returns to zero as each deal completes. |
| `BUYER_ADVANCE` | Liability | Collected but not yet earned — the return window has not closed. |
| `SELLER_PAYABLE` | Liability | The seller's right after deductions. Zeroed on payout. |
| `PLATFORM_REVENUE` | Revenue | Commission and our fees only. |
| `VAT_PAYABLE` | Liability | Owed to ZATCA on our own supplies — **a real debt even though we hold no cash**. |
| `GATEWAY_FEES_CLEARING` | Clearing | Passes from the seller to the provider. |
| `GOVT_FEES_CLEARING` | Clearing | The transfer fee, paid on the customer's behalf. |
| `PLATFORM_CASH` | Asset | What has actually reached us. |
| `PROVIDER_PAYABLE` | Liability | What we owe a service provider for work delivered. Not the vehicle seller — a different party, paid on a different schedule. |
| `PROVIDER_COST` | Expense | The provider's own price: **our cost of sale**, because on services we are the supplier. |

---

## 5. The four money moments

Worked with the agreed example: **1,000 SAR · 10% commission · 15% VAT on the
commission · 20 gateway fee borne by the seller → seller nets 865**.

### 5.1 `order.paid` — the buyer paid, the provider holds

```
DEBIT   ESCROW_AT_PROVIDER   1,000
CREDIT  BUYER_ADVANCE        1,000
```

**No revenue is recognised here.** The service is not complete and the return
window has not run. Recognising revenue on collection shows profits that are
refunded next month.

Posted inside the same transaction that creates the `Escrow` row — an escrow
created without a ledger entry silently loses a deal from the book, and that
only surfaces when an accountant looks for money that is not there.

### 5.2 `order.earned` — ownership transferred and the return window closed

```
DEBIT   BUYER_ADVANCE            1,000
CREDIT  SELLER_PAYABLE             865
CREDIT  PLATFORM_REVENUE           100
CREDIT  VAT_PAYABLE                 15
CREDIT  GATEWAY_FEES_CLEARING       20
```

**This is the only place revenue is recognised.**

The three conditions — transferred, return window elapsed, no open dispute —
come from `canSettle()` in `transfer-windows.ts`. They are **not re-implemented**
anywhere. Two copies of a condition drift on the first change, and then the same
question has two answers: one on the screen and another at release.

Posted only when the escrow row actually moved from `HELD` to `RELEASED`
(`released.count > 0`), because settlement can be invoked twice — a repeated
webhook, a retried release — and the entry must be written once. Written twice,
revenue silently doubles.

### 5.3 `payout.sent` — transferred to the seller

```
DEBIT   SELLER_PAYABLE       865
CREDIT  ESCROW_AT_PROVIDER   865
```

Without this entry `SELLER_PAYABLE` stays positive forever, and the seller reads
that money is owed when it has already arrived. That was literally the case until
task 103: the function was written and tested from the day the book was built, and
nothing in the product called it. Every seller's earnings page showed
*"transferred to you: 0.00"* no matter how much they had sold.

**Written by the second approver, not by settlement.** Settlement (`order.earned`)
recognises the revenue and creates the seller's right; the bank transfer that
discharges it happens later and by hand, from finance's bank to the seller's IBAN.
So the entry is posted by `approvePayout` in `src/lib/domain/payouts.ts`, in the
same transaction that marks the `Payout` row `SENT` and writes the audit log.
Splitting them would leave a transfer with no entry explaining it.

**Quorum of two.** Money leaving to an account outside the system cannot be sent
by one person, and unlike a wallet adjustment it cannot be undone by a contra
entry. One admin opens the request (`requestPayout`), a different one records the
transfer (`approvePayout`); the requester is refused by `SELF_APPROVAL`.

**A bank reference is required, not optional.** A transfer with no reference
cannot be reconciled against the bank statement, so the book would assert money
left with no way to prove it. `approvePayout` refuses with `BANK_REF_REQUIRED`.

**The seller's right is re-checked at approval, not only at request.** Between the
two, a refund or a dispute may reduce the balance, which would otherwise let an
approved transfer exceed what is owed.

### 5.4 `refund.*` — returned to the buyer

**Before earning** — nothing was recognised, so nothing is reversed:

```
DEBIT   BUYER_ADVANCE        1,000
CREDIT  ESCROW_AT_PROVIDER   1,000
```

**After earning** — what was recognised is reversed, by a **reversing entry, not
an edit**, so the book still shows that it was earned and then returned:

```
DEBIT   PLATFORM_REVENUE       100
DEBIT   VAT_PAYABLE             15
DEBIT   SELLER_PAYABLE         885
CREDIT  ESCROW_AT_PROVIDER   1,000
```

Who bore the refund is stated by the split, not by a single contra account: our
commission comes back from us, its VAT reduces our debt to ZATCA, and the rest
comes from the seller's right.

---

### 5.5 The two service moments

A paid service wrote **nothing at all** to the ledger until 2026-10-16. The
customer paid, the money was held at the gateway, and no line recorded it: no
revenue waiting to be earned, no debt to the provider, no VAT accrued. Measured:
`ledgerEntry` held no account that concerned services.

**And we are the supplier, not the broker.** The `SERVICE` tax rule says
`supplierIsPlatform: true` and `invoiceIssuer: PLATFORM` — the customer buys
from us, and the provider is our subcontractor. So the whole value is revenue
and the provider's price is a cost. Booking only our fee as revenue would show a
50 SAR fee on a 450 SAR inspection as **a 500 SAR profit**, and no trial balance
would catch it: the books balance either way.

The split at the gateway does not change this. It is a **payment instruction** —
our agent pays our subcontractor directly — not a change of who supplies whom,
and the customer still receives one invoice, from us.

#### 5.5.1 `service.paid` — collected, not earned

```
  DEBIT   ESCROW_AT_PROVIDER   575.00
  CREDIT  BUYER_ADVANCE        575.00
```

Exactly like a vehicle: held, not earned. The work has not happened and may
fail.

#### 5.5.2 `service.earned` + `service.provider_due` — the work was delivered

On an inspection priced 450, our fee 50, VAT 75 on the 500:

```
  DEBIT   BUYER_ADVANCE        575
  CREDIT  PLATFORM_REVENUE     500
  CREDIT  VAT_PAYABLE           75

  DEBIT   PROVIDER_COST        450
  CREDIT  PROVIDER_PAYABLE     450
```

**Two transactions, not one.** Earning our revenue is one event; owing the
provider is another, settled on another schedule. Merging them would make paying
a provider look like refunding a customer.

**The provider's share is derived by subtraction** — total minus VAT minus our
fee — so a figure that does not balance can never be passed in. And all three
inputs are snapshots on the request (`amount`, `adminFee`, `vatAmount`): VAT used
to be derivable from the total at the rate current when it was *read*, which
would post an entry that does not match what was *paid* the day the rate changes.

**The moment of earning is the provider's completion**, not the collection of
the money. And a request with no payment posts nothing: the seed finishes
requests that were never paid, and an entry for those would invent revenue.

**And the invoice goes out with the entry.** `issueServiceInvoice` runs beside
`service.earned`, writing a `TaxInvoice` with its own sequence, rule snapshot and
QR — the same issuer the order path uses. Until then the ledger accrued
`VAT_PAYABLE` with no document behind it.

#### 5.5.3 `service.captured` — the hold became money

```
  DEBIT   PLATFORM_CASH        517.50
  CREDIT  ESCROW_AT_PROVIDER   517.50
```

**A hold is not a receipt.** Until this entry, a completed service shows revenue
recognised, VAT accrued and a tax invoice issued — while the money is still only
authorised at the gateway. Moyasar voids an uncaptured hold after seven days, so
the customer's card would be released after we delivered the work and issued
them a document for it.

**This entry touches no revenue and no VAT.** Those were earned at completion
(5.5.2); this is a treasury movement — what the gateway holds becoming what we
actually have. Posting revenue here would recognise the same service twice.

**Capture follows delivery, never precedes it.** Taking money for work that has
not happened is what the hold exists to avoid, and a capture before completion
would have to be refunded.

`captureServicePayment` runs from `applyStep` on `DONE`, right after the invoice.
If the gateway is unreachable or answers `PENDING`, the payment stays `HELD`,
**no entry is written**, and the `captureDoneServices` job retries it on the next
scheduler pass — a ledger that says "received" before the money arrives is worse
than one that is late.

**And `settleRef` is stored with it.** `reconcileYesterday` matches on
`settleRef ?? holdRef` and the gateway reports settlements by the capture's
reference, so omitting it produces a daily difference with no cause — see gate 52.

#### 5.5.4 `service.refunded` — the work could not be done

```
  DEBIT   BUYER_ADVANCE        575
  CREDIT  ESCROW_AT_PROVIDER   575
```

**No revenue is reversed**, because failure can only happen before completion
(`IN_PROGRESS → FAILED`): nothing was earned and nothing became owed to the
provider. If failure after completion ever becomes possible, that is a different
entry — written then, not guessed now.

**The refund is automatic, with no human gate.** The critical notification
already told the customer «وما دُفع يُردّ»; holding their money while we review
*the provider's* conduct confuses two matters — one between us and the customer,
the other between us and our subcontractor. If the provider claims the customer
failed to appear, that is a claim to settle with them, not a reason to hold a
third party's money. *(Recorded for the owner in `docs/OPEN-QUESTIONS.md`.)*

**And the request stays `FAILED`, not `REFUNDED`.** Both live in one enum, so
writing the second erases why the work stopped — a screen that says "refunded"
and cannot say why. It is decision 17's lesson again: **the state of the money
is not the state of the work.** The money's state lives on the `Payment`
(`CANCELLED` with `returnedAmount`), which is why `REFUNDED` has no writer and
should not get one.

**The money moves before the books.** If the gateway refuses the cancellation,
nothing is written and a second attempt finds the same state; the reverse would
leave a ledger saying "refunded" over money still held.

## 6. The seller's financial file

`sellerBook()` in `src/lib/domain/seller-book.ts`, shown at
`/[locale]/account/earnings`.

Three states, which are the three questions a seller opens the page to ask:

| State | Meaning |
|---|---|
| **Held** | Collected from the buyer, not yet earned. |
| **Ready to disburse** | Earned, not yet transferred — the seller's live right. |
| **Transferred** | Arrived. |

Plus the per-deal breakdown: sale value, commission, commission VAT, gateway
fee, transfer fee, and the net.

**The figures come from two deliberately separate sources.** Balances come from
the ledger, because that is the accounting truth. The per-deal lines come from
the orders, because that is what the seller understands — which car, and when.
Deriving the balances from the lines would reintroduce exactly the problem the
ledger exists to solve.

---

## 7. What is not built yet

| Gap | Note |
|---|---|
| **Payouts are recorded, not executed** | `approvePayout` posts the entry; the bank transfer itself is performed by finance and reconciled by `bankRef`. A provider split API would replace the manual step, not the entry. |
| **Refunds are not wired** | `recordRefund` is written and tested but no dispute resolution calls it yet. |
| **Discounts and coupons** | No model at all. |
| **`PLATFORM_CASH`** | Written by `service.captured` and `deposit.forfeited`. Vehicle orders settle through `settleOnTransferConfirmed` and still post no cash entry — their money reaches us the same way and the book does not say so, and our own commission never leaves `ESCROW_AT_PROVIDER` at all. Recorded for the owner in `docs/OPEN-QUESTIONS.md`: whether that account should split into held and settled. |

These are wiring, not design. The accounts and the invariant are settled.

---

## 8. The platform's book

`platformBook()` in `src/lib/domain/platform-book.ts`, shown at `/admin/ledger`.

Three figures are read before anything else:

- **Revenue** — commission and our fees. Never vehicle value.
- **VAT payable** — a debt to ZATCA, owed even though we hold no cash.
- **Held at the provider** — an obligation towards buyers and sellers, not our
  money.

**The imbalance check is shown at the top, not the bottom.** A number in the
footer is contemplated; a number in the header is acted on. `unbalanced` must
always be empty — if it is not, some writer bypassed `postEntries`, and no
release should happen until it is explained.

Entries are listed **grouped by transaction**, because a debit shown without its
credit is half a sentence.

---

## 9. Where to look

| | |
|---|---|
| Writer and balances | `src/lib/domain/ledger.ts` |
| The four moments | `src/lib/domain/ledger-events.ts` |
| Seller's book | `src/lib/domain/seller-book.ts` |
| Seller's screen | `src/app/[locale]/(site)/account/earnings/page.tsx` |
| Platform's book | `src/lib/domain/platform-book.ts` |
| Admin screen | `src/app/admin/ledger/page.tsx` |
| Schema | `prisma/schema.prisma` → `LedgerEntry` |
| Tests | `tests/ledger.test.ts` |
| Gate 20 | `scripts/check-tokens.mjs` |
