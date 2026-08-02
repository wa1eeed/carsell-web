# Payments, escrow and 3DS (task 27)

Domain: `src/lib/domain/payments.ts`, `src/lib/payments/provider.ts`.
Routes: `POST /api/v1/payments`, `POST /api/v1/webhooks/payments`.

**Status: the machinery is built and tested; no provider is wired.** Choosing
between Moyasar and HyperPay and obtaining credentials is a money decision that
has not been made — see "What is still open" below.

## The interface first, the provider after

The design names «Moyasar / HyperPay» without choosing. Building the logic around
one name makes switching a rewrite, while everything underneath it — states,
idempotency, signature verification, escrow — is identical for both.

`PaymentProvider` is four methods. `PENDING_PROVIDER` implements them all as
explicit failures.

### Payment failure is loud, unlike every other integration

`CLAUDE.md` says an integration behind a flag fails **silently**. That rule is
for deferred *helpers* — VIN lookup fails and the user types the fields by hand.
Payment has no fallback path. A silent failure is a spinner that never resolves
and a user who does not know whether they were charged.

So `PENDING_PROVIDER.charge` returns `PROVIDER_NOT_CONFIGURED`, the attempt is
written as a `FAILED` payment row with its reason, and the API answers 502 with
"your card was not charged".

## Every attempt gets a row, not every success

"I paid and it didn't arrive" is a complaint that cannot be answered with "we see
nothing". `Payment` records the attempt at creation; `PaymentEvent` records every
transition **with its source** — user, provider, admin, or system.

## The state machine is an explicit table

```
CREATED      → REQUIRES_3DS · AUTHORIZED · FAILED · CANCELLED
REQUIRES_3DS → AUTHORIZED · FAILED · CANCELLED
AUTHORIZED   → CAPTURED · FAILED · CANCELLED
CAPTURED     → REFUNDED
FAILED · CANCELLED · REFUNDED → (terminal)
```

`FAILED → CAPTURED` looks impossible until a late webhook arrives after the
payment window closed, flipping a failure into a success and handing money to an
order that was already relisted. The table is written out rather than derived so
that case is visibly absent.

## The amount comes from the order, never from the request

A price sent by the browser and charged to the card is a door to paying one riyal
for a car. `Order.totalAmount` is a snapshot taken when the order was created.

Also refused: a payer who is not the buyer, an order not in the `PAYMENT` stage,
a lapsed payment window, an order already captured, and — importantly — a second
attempt while one is live. Two live attempts is a double charge.

## Capture holds escrow in the same transaction

Money captured and not held is money in our account with no entry saying whose it
is. `advancePayment(…, 'CAPTURED')` creates or flips the escrow to `HELD`,
advances the order to `TRANSFER`, and writes the order event — all atomically.

## Rule 12 · escrow release needs two approvals

The last unimplemented rule from §7. It reuses the same `ApprovalRequest`
mechanism as key rotation — one mechanism for every two-person action, because a
second one beside it means two rules that drift.

Three preconditions before a release can even be requested:

- **The money is actually held** — no releasing what was never captured.
- **The order reached transfer** — the promise to the buyer is that their money
  does not reach the seller before ownership does.
- **No open dispute** — a dispute freezes; releasing during one empties the thing
  being argued over.

The dispute check runs **twice**: at request and again at execution. A dispute
opened between the two is exactly the case the second check exists for, and a
test covers it.

The requester cannot approve their own request. Without that, "two members" is
one member clicking twice.

## Idempotency is mandatory for payments

§6 requires `Idempotency-Key` on every `POST` and mandates it for payments. The
network retries without the user knowing; the browser retries on refresh. Without
the key table the card is charged twice — the worst possible bug in a product
that sells cars.

- Same key, same body → the **first response is replayed verbatim**, no second
  execution.
- Same key, **different** body → 409. That is a client bug, and replaying
  silently hides it.
- Missing key → 400. Tolerating its absence means the first customer on a bad
  connection pays twice.

## The webhook has three protections

Each one exists for a failure that costs money. Verified live:

| Request | Response |
|---|---|
| No signature | 401 |
| Wrong signature | 401 |
| Valid signature, first delivery | 200, stored and processed |
| Same event id again | 200 `duplicate`, **not reprocessed** |
| Tampered body, original signature | 401 |

1. **Signature first.** Without verification anyone can declare a payment
   successful. HMAC-SHA256 compared with `timingSafeEqual` — `===` returns on the
   first differing byte, and the timing difference leaks the signature character
   by character.
2. **The event id is stored before processing**, as a primary key. Providers
   redeliver whenever they are unsure, and processing twice releases money twice.
3. **The transition is checked**, so a late redelivery cannot flip a terminal
   state.

A signature-valid event that is logically rejected still returns **200**:
providers retry on anything else, and retrying something that will never be
accepted is a queue that never drains.

## What is still open — a money decision, not a technical one

Everything above is provider-agnostic and tested. These are not mine to decide:

1. **Which provider** — Moyasar or HyperPay. They differ in settlement timing,
   fees, and which payment methods they cover.
2. **Who holds the funds.** "Escrow" here is our own ledger entry. A real escrow
   is either a provider feature or a partner bank account, and that determines
   whether release is an API call or a bank transfer.
3. **Refund policy on an abandoned 3DS challenge.** Currently the attempt simply
   fails and the buyer retries within the window; if the window lapses, rule 5
   relists the vehicle. That is derived from existing rules, not decided.

Until 1 and 2 are answered, `providerFor` returns `PENDING_PROVIDER` and no real
money moves — which is the correct behaviour for an unconfigured payment system.
