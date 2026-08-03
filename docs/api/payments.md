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
explaining the consequence, not a block.

**The warning is data, not a prebuilt string.** `eligibility` returns
`{ maxHoldDays, neededDays }` and the screen renders it with `Quantity`. A
sentence assembled in the domain produced *"6 يومًا"* — a Latin numeral and the
wrong Arabic plural inside an Arabic sentence — and the domain cannot fix that,
because it does not know the language and has no access to `Quantity`. A test
asserts the domain returns **no Arabic characters at all**.

`minHoldDays` is derived, not estimated: 24h payment + 7-day transfer ceiling +
7-day return window = 15, and 22 with the single permitted extension — so the
threshold is 21. See decision 38.

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

### `MoyasarAdapter` — built, **never tested against the provider**

The statement is in the file header and repeated here because it is the one
thing a reader must not miss: this adapter has **never touched Moyasar**. It is
built from published documentation while test keys are awaited.

Its tests run against a **fake gateway implementing the same interface**, so
every path is covered without a network call — but **field-name agreement
remains unproven**. If Moyasar returns `transactionUrl` where this expects
`transaction_url`, the tests pass and production fails. Only real keys close
that gap.

What the tests *do* prove, and would prove for any adapter:

- **Amounts convert to halalas.** The most dangerous line in the file: `100`
  means one riyal, not one hundred. An error here charges a hundredfold or a
  hundredth, and no type catches it because both are numbers. Round-trip tested
  across whole riyals, half riyals, and single-digit fractions (`12.5` is half a
  riyal, not five halalas).
- **A dropped network returns `PENDING`, not `FAILED`.** The request may have
  arrived and executed; calling it a failure makes the domain retry and charge
  twice. `PENDING` leaves the decision to the webhook or to `status()`.
- **A status other than `authorized` stays `PENDING`.** The domain waits on the
  state, not on the call.
- Gateway vocabulary appears **only inside this file** — gate 15 exempts
  `src/lib/payments/adapters/` and nothing else.

- `TapAdapter` and the bank trust gateway are not built. See § 7b for how the
  bank adapter must be shaped when it arrives.

## 8b · The path is wired — and guarded from birth

`POST /api/v1/payments` → `startHold` → route → gateway adapter. The gateway is
resolved **per purpose**, and each `Payment` stores its `gatewayKey` and
`environment` as a snapshot, so a hold is always released through the gateway
that created it.

### Rule 12 · release needs two approvers — built with the path, not after it

The release path and its quorum were built in the same commit. **What needs a
guard is built guarded**: between building and guarding there is a window in
which it runs unguarded, and one deploy inside that window is enough.

`POST /api/v1/admin/orders/{ref}/settle` — without `requestId` it opens a
request; with one it is the second approval, and **only that call reaches the
gateway**.

Checked before the request is even created, and **again** at execution:

| Condition | Result |
|---|---|
| No held payment | `NO_HELD_PAYMENT` |
| Return window still open | `RETURN_WINDOW_OPEN` **with `until`** |
| Order disputed | `DISPUTED` |
| Requester approving own request | `SELF_APPROVAL` (403) |

The dispute re-check exists for exactly one case: a dispute opened *between* the
request and the approval. A test covers it.

### Rule 12b · half a quorum is not a quorum — gate 19

Rule 12 was honoured where it was written and broken in three places where it
was only *half* written. All three were the same defect wearing different
clothes, and all three shipped while every test passed:

| Where | What was built | What was missing |
|---|---|---|
| Key rotation | request, approve, route, screen | the routes checked `integrations.view`, which **`OPS` holds** — so two `OPS` admins satisfied a quorum reserved for `SUPER_ADMIN` |
| Payment-route switch | request writing `requiredApprovals: 2`, screen saying "awaiting a second member" | **no approver function existed at all** — no request could ever be applied |
| Tax-rule change | request, approve, route | **no control anywhere** called the approve endpoint, so a change stayed `PENDING` until it expired |
| Dispute resolution | request, approve, both tested | **no route and no screen** — the whole module was unreachable |

The screen promising a second approver while the system has no way to accept one
is not a missing feature. It is a system reporting that it did something it did
not do, and an operator waiting for an approval that has nowhere to happen.

`checkApprovalQuorum` in `scripts/check-tokens.mjs` now asserts three things for
every approval kind created in the domain with `requiredApprovals >= 2`:

1. an `approve*` function exists in the same file,
2. some API route calls it by name,
3. every permission in `DUAL_APPROVAL` is checked by name in some route.

**Its limit is deliberate and worth knowing**: check 3 asks "does *a* route check
this permission?", not "does *this* route check the right one." Binding a route
to its intended permission is not derivable from the source. The gate catches
what actually happened — a quorum permission that nothing enforces — and a
negative test drives it in both directions before it was enabled.

### Verified live, with no gateway keys configured

| Request | Result |
|---|---|
| No `Idempotency-Key` | **400** — tolerating it means the first customer on a bad connection pays twice |
| With key, gateway unconfigured | **502** `GATEWAY_FAILED` — "your card was not charged" |
| Same key, same body | **201**, first response replayed verbatim, no second execution |
| Same key, different body | **409** `REUSED_WITH_DIFFERENT_BODY` |
| Second approver, no keys | `GATEWAY_FAILED` / `GATEWAY_NOT_CONFIGURED`, escrow still `HELD`, request still `PENDING` |

That last row is the point of the whole design: with no provider configured the
system **refuses loudly and changes nothing** — it does not half-release, and the
approval request survives for a retry once keys arrive.

A failed attempt is deliberately **not** memoised: `FAILED` means we know the
hold did not happen, so retrying is safe. A dropped network returns `PENDING`
instead, and that is never retried blindly.

### The webhook's one leak, and why it is rate-limited rather than fixed

The gateway is derived from the transaction's `holdRef`, so an unknown reference
returns **404 before** the signature is checked — we cannot verify a signature
without knowing which gateway's secret to use. That distinguishes "not found"
from "found, bad signature".

Fixing it properly would mean **one platform-wide webhook secret** instead of one
per gateway per environment — which destroys the environment separation of
decision 33. That is a real risk traded for a theoretical leak against random
identifiers the provider generates.

So the leak stays, and guessing is made impractical instead: **60 requests per
minute per IP**, checked *before* any body read or query, so a guesser gets no
free lookups. Verified live — the 61st request returns 429.

The limiter is in-memory and therefore **per instance, and lost on restart**. It
is stated as a nuisance-blocker, not a security boundary; a real limit needs
Redis, which already exists for the live channel.

## 9 · Tax is not decided here

No tax is computed on vehicle value anywhere, and no document calls itself a
vehicle invoice, until the tax classification arrives — see task 35 and A21. The
VAT rate lives in `src/lib/domain/vat.ts` alone, enforced by **gate 16**.
