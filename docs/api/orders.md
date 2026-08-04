# Orders, stages, escrow and disputes (task 18)

## Stages move forward, one step

Skipping a stage means an order reaching "transfer" without payment. **Going back
is forbidden**: a stage that passed left a financial trace — a payment, a hold, a
traffic-department appointment — and reversing the stage does not reverse the
trace. Correction is cancel-and-recreate, never a silent rewind.

`stageEnteredAt` measures time **in the current stage** and resets on every
transition. `createdAt` measures the age of the **order**. They look synonymous
until you need the second one, and by then it is too late to backfill accurately.

**Dwell time is computed, never stored.** "3 days ago" written into a column lies
an hour later.

## Disputes — three binding rules

### 1 · Opening a dispute freezes the order

It neither advances nor lapses while the dispute is open. The freeze happens **in
the same transaction** as the opening: a dispute that opens and then freezes in a
second step leaves a window in which the cancellation timer can lapse the order —
which is precisely the moment a buyer opens a dispute.

Tested from both directions: a frozen order rejects `advanceStage` with
`ORDER_FROZEN`, and `timeoutUnpaidOrders` skips it.

### 2 · Resolution needs two approvers, then executes itself

The proposal **does not execute**. It creates an `ApprovalRequest` requiring two
approvals; execution happens automatically when they complete — no manual
transfer afterwards.

Separating proposal from execution is what makes "two members" a real
constraint. If the proposer executed and approval were requested afterwards,
approval would be a record of what already happened.

**The proposer cannot approve their own proposal.** Two members means two
independent pairs of eyes, not two clicks from one person.

| Resolution | Escrow | Order |
|---|---|---|
| Full refund | `REFUNDED` | `CANCELLED` |
| Partial settlement (amount) | `PARTIAL_REFUND` | `CANCELLED` |
| Release to seller | `RELEASED` | `COMPLETED` |

A partial settlement equal to or above the total is not partial and is rejected.

### 3 · The 48-hour window runs from opening, not from the last message

`addDisputeMessage` deliberately does not touch `slaDueAt`. If messages extended
the window, anyone wanting to drag a dispute out would post daily, and anyone
wanting to ignore one would stay silent and have the window extended for them.
**Silence must not pay.**

An overdue dispute appears in the operations queue and is **never auto-resolved**.
A financial decision does not issue because an hour passed.

## Escrow — simulated first

No payment provider yet. That does not mean skipping it: the states, transitions
and accounting effects are all real and recorded. When a provider arrives,
`providerRef` is filled — the logic does not change.

`providerRef` stays `null` rather than being given a fake value. A fabricated
reference is worse than an empty one: it looks reconciled.

## Wj — the order page

The escrow card says **where the money is now**, not "processing". The buyer paid
and wants to know their money is held and has not reached the seller; the seller
wants to know it is actually held rather than promised.

A dispute leads the page. While it is open it is the order's condition, not a
footnote.

Someone who is not a party to the order gets **404, not 403** — the existence of
the order is itself information.


## Deal documents on the order page (`Wj`)

`getOrder` returns two additional fields, both derived from
`src/lib/domain/documents.ts`.

### `documents: OrderDocument[]`

Every order lists three document slots — **issued and upcoming together**. A slot
that does not exist yet carries `state: 'PENDING'` and an `availableAt` naming the
moment it will appear (`TRANSFER_CONFIRMED` or `SETTLED`), which the screen renders
as "issued when ownership transfer is confirmed".

An empty section reads as *something was lost*. Naming the moment is the fix.

Tax invoices appear one row per issued invoice, each with its number and
`supplyType`. The number is rendered `dir="ltr"` — it is copied and compared
digit by digit.

Returns `null` for anyone who is not a party to the order.

### `settlement: SettlementFigures | null`

**Seller only.** The buyer receives `null`; the seller's net is not the buyer's
business.

Before settlement the figures are computed live and carry `preview: true`; the
screen marks them estimated and draws a dashed border. After issuance they are
read from the stored `SettlementStatement` and `preview` is `false`.

Deduction rows render only when greater than zero: a gateway fee shown as `0`
before a gateway is chosen claims "no fee" when it means "not yet known".

| Field | Note |
|---|---|
| `vehicleValue` | `settlementAmount` when a partial settle fixed a lower price, else `agreedPrice` |
| `commission` | 0 % at launch — see `docs/tax-model.md` § 9 |
| `gatewayFee` | From the gateway's declared capabilities; estimated until the gateway settles |
| `servicesTotal` | **Disclosed, not deducted** — services are paid in their own transaction |
| `netToSeller` | `vehicleValue − commission − gatewayFee` |

The statement header states it is not a tax invoice.

## Direct purchase — `POST /api/v1/orders`

Creates an order at stage `PAYMENT` from a published, non-auction listing.

`Idempotency-Key` is required. A double click or a network retry would otherwise
create two orders on one vehicle.

### One live order per listing

Two would mean two payment windows running against a single car: whoever pays
first gets it and whoever pays second is refunded. The guard sits **inside the
transaction** alongside the order creation, the listing reservation, and the
closing of outstanding offers — a creation that succeeds while the reservation
fails leaves a sold car on display.

The live-order check runs **before** the status check, deliberately. The first
purchase reserves the listing, so a status-first order would tell the second
buyer "not available" when the truthful answer is "there is a live order on it"
— the first ends their hope, the second tells them it may come back.

### `428 TAX_STATUS_REQUIRED` is not a rejection

A buyer who has never stated their tax status is stopped **before** the order
exists — discovering it afterwards leaves a dangling order with a payment window
running against someone who never finished.

The screen opens the one-time dialog and **retries the purchase automatically**
once it is saved. Someone who answered is not asked to press buy again.

### Amounts

Computed by `computeOrderAmounts` — the same function `acceptOffer` uses. There
is one money rule, not one per order source, and a test asserts a direct order's
amounts equal that function's output field by field.
