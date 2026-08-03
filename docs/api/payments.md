# Payments: purpose-based routing, escrow interface, capabilities

Decisions 30, 33, 34, 35. Screen `A20` in `design/CarSell Admin.dc.html`.

> **Status.** This document defines the contract. The schema, the interface and
> the capability model are specified here **before** any adapter is written —
> so the adapter is measured against the contract rather than the contract being
> reverse-engineered from whichever gateway was integrated first.
>
> A previous version of this file described a single-gateway, card-vocabulary
> design. That design was cancelled. It is not patched here — a file describing a
> cancelled structure is worse than no file, because the reader trusts it.

## 1 · The platform never holds other people's money

Holding third-party funds in Saudi Arabia requires a SAMA licence. We are a
marketplace, not a payment institution. Escrow is therefore **a hold at the
gateway** or **a trust account at a bank** — never a balance in our account.

| Moment | What happens | Where the money is |
|---|---|---|
| Order created | `hold` | reserved on the buyer's card |
| Ownership transferred | `settle` → payout to seller | leaves the card, reaches the seller |
| Cancelled · dispute for buyer | `cancel` | never moved — **not a refund** |

**Our ledger is a mirror, not a source.** Every entry corresponds to a state at
the gateway; it records what happened, not what we own.

**The one exception:** auction deposits and wallet balances are small prepaid
amounts. Those are a **liability we owe**, and must be backed by real segregated
funds that are not spent.

## 2 · One gateway per purpose, not one gateway

```
VEHICLE_ESCROW    hold → settle after ownership transfer
AUCTION_DEPOSIT   temporary hold, returned or deducted
WALLET_TOPUP      immediate collection, no hold
SERVICE_PURCHASE  inspection · report · shipping · photography
TRANSFER_FEE      collected with the order amount
SUBSCRIPTION      disabled — all plans are free today
```

A super-admin switches a purpose's gateway from A20 **without a deploy**.

## 3 · The interface speaks escrow, not card

```ts
hold(purpose, ref, amount)     → HoldResult
settle(holdRef, amount?)       → SettleResult   // partial allowed
cancel(holdRef)                → CancelResult
partialReturn(settleRef, amt)  → ReturnResult
status(ref)                    → HoldStatus
```

The arrangement may change **structurally, not just nominally**. If we later
contract with a licensed entity or a bank trust account, money is genuinely
transferred rather than reserved, and releasing it becomes a transfer that takes
a day rather than an instant call.

A screen that named the concept `authorize` becomes false that day — and the
compiler will not catch it, because the name still translates.

### Rule 1 · Results are asynchronous by contract

Every function returns `PENDING` | `CONFIRMED` | `FAILED`. Never an immediate
success.

Today a card confirms instantly; a trust account stays `PENDING` until the
webhook lands. **The domain waits on the state, not on the call.** Written this
way from the start, the bank model needs no new code path — only a gateway whose
results stay `PENDING` longer.

### Rule 2 · Capabilities are declared, and the domain reads them

Each gateway declares:

| Capability | Meaning |
|---|---|
| `supportsHold` | can reserve without collecting |
| `supportsPartialSettle` | can settle less than the held amount |
| `supportsRefund` | can return after settlement |
| `maxHoldDays` | how long a hold survives |
| `settlementDelayHours` | how long until money reaches the seller |
| `feePct` · `feeFixed` | cost per transaction |

Each purpose declares its `requiredCapabilities`.

**A gateway missing a required capability does not appear in the list at all** —
it is not shown and then rejected. Offering a choice and refusing it teaches the
operator that the list is unreliable.

If `maxHoldDays` is **less than the purpose needs**, that is an amber warning
explaining the consequence, not a block. A20's wording: dropping from 30 days to
6 means an order still in transfer at day five converts from a hold to an early
collection — *which changes what escrow means to the buyer*.

The domain must never assume a hold lasts forever.

### Rule 3 · Gateway vocabulary never crosses the adapter

No `authorize`, `capture`, or `void` in any domain file or screen. `MoyasarAdapter`
translates internally:

```
hold → authorize · settle → capture · cancel → void · partialReturn → refund
```

Enforced by **gate 15** in `scripts/check-tokens.mjs`, which scans
`src/lib/domain`, `src/app` and `src/components` and exempts only
`src/lib/payments/adapters/`.

## 4 · Switching a gateway — four binding rules

1. **In-flight transactions stay on their gateway.** A hold is released from
   where it was created — balances are never moved between gateways. This is why
   `gatewayKey` is stored **on each transaction** and read from there, never from
   the current configuration.
2. A switch applies to new transactions only, from the moment it executes.
3. A purpose with in-flight transactions **cannot be disabled** — new
   transactions stop, existing ones continue to completion.
4. A switch needs an `ApprovalRequest` with two approvers and is logged with
   both gateway names.

## 5 · Environments

Every gateway holds two key sets (`test` · `live`), and every purpose has an
effective environment. **Staging is restricted to `test` in code, not by
discipline** — see `docs/api/admin-dashboard.md` § Environment separation.
Switching a production purpose to test needs two approvers.

## 6 · Monthly volume is two columns, both from our ledger

| Column | Definition |
|---|---|
| Settled this month | `settle` confirmed within the month |
| Held now | `hold` outstanding, neither settled nor cancelled |

One number would blend them: in an escrow purpose most money is held and
unsettled, so "2.41M" could mean *passed through us* or *reached sellers*.

**There is deliberately no third "per the gateway" column.** Two adjacent numbers
with no stated reason for the difference get misread. The difference is handled
by **daily reconciliation** (task 36): a job reads each gateway's settlement,
compares it to our ledger, and writes
`ReconciliationRun(gatewayKey, date, ourTotal, gatewayTotal, diff, status)`.
Match ⇒ a green line. Difference ⇒ an alert listing **the differing transactions
only**, not the totals.

> A difference is an event to be worked, not a number to be contemplated. That is
> what "our ledger is a mirror" means — a mirror never compared to the original
> is not a mirror.

## 7 · Abandoned 3DS is not a refund

No money moved: the attempt fails **before** the hold.

Added by decision 32: **three consecutive failed attempts** show "try another
card or contact your bank". Silent repetition reads as a fault in the platform
rather than in the card.

## 7b · `bank_escrow` — undetermined, designed for the harder case

The bank is not chosen. The key stays as a placeholder, and its adapter is
designed against **the harder possibility, not the easier one**:

- **`status()` may be a settlement-file read, not an API call.** It returns
  `PENDING` until the file arrives, and never assumes an immediate answer.
- **File import is idempotent**: the same file read twice produces no duplicate
  entry. Settlement files get re-sent, re-downloaded and re-run by hand; a
  duplicated entry in a money ledger is not a cosmetic defect.
- **The other four may be scheduled instructions rather than live calls** — which
  is precisely why `PENDING` is a legitimate state in the contract rather than an
  error. No new code path is needed for that model; the same interface carries it.

If the bank turns out to expose a live API, an adapter built for files works
unchanged — the reverse is not true, which is why this direction was chosen.

## 8 · What does not exist yet, stated plainly

- **No adapter has been tested against a live gateway.** Moyasar test keys are
  expected within a day. `MoyasarAdapter` is built from published documentation
  and carries that statement in its file header.
- Adapter tests run against a **fake gateway implementing the same interface**,
  so every path is covered without a network call.
- `TapAdapter` and the bank trust gateway are not built.

## 9 · Tax is not decided here

No tax is computed on vehicle value anywhere, and no document calls itself a
vehicle invoice, until the tax classification arrives — see task 35 and A21. The
VAT rate lives in `src/lib/domain/vat.ts` alone, enforced by **gate 16**.
