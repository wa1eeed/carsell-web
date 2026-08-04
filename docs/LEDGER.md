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
that money is owed when it has already arrived.

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
| **`payout.sent` has no caller** | Nothing transfers to sellers yet, so the entry is never posted. It arrives with the payment provider's split API. |
| **Refunds are not wired** | `recordRefund` is written and tested but no dispute resolution calls it yet. |
| **Discounts and coupons** | No model at all. |
| **`PLATFORM_CASH`** | Declared, unused until the provider reports what actually reached us. |

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
