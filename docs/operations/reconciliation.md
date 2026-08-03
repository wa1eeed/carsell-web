# Daily reconciliation

`src/lib/domain/reconciliation.ts`. Surfaced on `/admin/payments`.

Our ledger is a mirror, and **a mirror that is never held against the original
is not a mirror**. Until a gateway's settlement is read and compared, all we know
is that our books agree with themselves.

## What it writes

One `ReconciliationRun` per `(gatewayKey, date)`. Re-running updates the row
rather than adding another, so a retry never doubles the record.

| Status | Meaning |
|---|---|
| `MATCHED` | Totals agree **and** the entry list agrees |
| `DIFFERS` | Something disagrees — the row carries the differing transactions |
| `UNAVAILABLE` | The gateway's settlement could not be read |

### `UNAVAILABLE` is not `MATCHED`

A gateway that was not read was not reconciled. Collapsing the absence into a
match makes a provider's silence look like health — the worst thing a
reconciliation report can say.

### Matching is two conditions, not one

Equal totals with two offsetting errors is an arithmetic match and a bookkeeping
error. A run is `MATCHED` only when the totals agree **and** no entry differs,
which is exactly what a totals-only comparison lets through.

## The difference is an event to work, not a number to contemplate

The row stores the **differing transactions**, each with its reference and both
amounts. A total that says "420 short" tells an operator that something is wrong
and not where, so the alert gets closed without being worked. The list says which
reference and by how much, and the screen opens it on demand — a day with a
thousand differences does not belong in a table that is scanned by eye.

Three kinds are distinguished: present here and not there, present there and not
here, and amount differs. They have different causes and different fixes.

## Reading never writes money

`reconcileGateway` compares and records. It does not correct the ledger and it
does not move an amount. Correction is a decision a person makes after seeing
which transaction differed — and a function that sweeps a set touching money must
not write.

Grouping is by `Payment.gatewayKey`, never by the current route: on a switching
day both gateways are responsible and no single route describes that day.

## Not built yet

`settlementFor` on the Moyasar adapter **declares itself absent**
(`SETTLEMENT_API_NOT_WIRED`). The shape of their payouts response is not
confirmed from the published documentation alone, and building it on a guess
produces a reconciliation that reassures without reconciling anything.

When the test keys arrive: match every field by name, run one day end to end
against a known settlement, and only then let a green line mean anything.
