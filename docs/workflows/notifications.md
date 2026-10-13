# Who gets told, and when

A notification is a row in `Notification` keyed by `templateKey`; the text comes
from `NotificationTemplate`, seeded from
`prisma/seed-data/notification-templates.json`. Writing one is `notify()` in
`src/lib/domain/notifications.ts`, which also broadcasts over the realtime
channel so the bell count moves without a reload.

Two rules decide everything below.

**The one who acted does not need telling.** They pressed the button and saw the
result. The one waiting is the one who does not know. So every helper in
`src/lib/domain/order-notify.ts` takes the actor and skips them.

**The domain does not compose sentences.** The payload carries keys and numbers;
the wording lives in the template (gate 17). A template that needs a stage name
in its body would force the domain to translate an enum, so the order-journey
bodies are written to be complete without one.

## The order journey

Wired in this commit. Before it, every one of these moments was silent: a seller
could list a car, have it ordered, have 60,850 held in escrow against it, have
ownership transferred and the money released — and never receive a single line.

| Moment | Key | Who receives it | Written in |
| --- | --- | --- | --- |
| Order created | `order.received` | **seller** | `orders.buyDirect`, `offers.acceptOffer`, `auction-order` (×2) |
| Order created | `order.created` | buyer | same, except where a more precise message already went to the buyer in the same transaction (`offer.accepted`, `auction.won`) |
| Stage advanced | `order.stage_changed` | the party who did **not** move it | `orders.advanceStage` |
| Money reached escrow | `escrow.held` | **seller** | `payments.applyState`, on `HELD` |
| Money released | `escrow.released` | **seller** | `payments.applyState`, on `SETTLED` |
| Deal complete | `listing.sold` | **seller** | `orders.advanceStage`, on `DONE` |
| Order cancelled | `order.cancelled` | the party who did **not** cancel | `order-cancel.cancelOrder` |

`order.received` did not exist. `order.created`'s text is written in the buyer's
voice («أُنشئ طلبك»), so sending it to a seller would have read wrong — the
seller's own template is new, and mirrors `offer.received`, which has always
been wired.

### Where each write sits

Inside the transaction that causes the fact, except two:

- `listing.sold` fires **after** the transaction, beside the sale agreement and
  the escrow release, because a completed transfer is not undone by a bell that
  failed to ring.
- `escrow.released` is inside, because its transaction is the ledger entry that
  recognises the revenue — if that rolls back, nothing was released.

## Entity links

`entityType: 'Order'` with `entityId` set to the order's **ref** (not its id).
`destinations()` in `notifications.ts` turns that into
`/{locale}/account/orders/{ref}`, so every line in the bell opens the order it
is about. A notification without a destination is a line the reader cannot act
on.

## Cleaning up after a walk

A notification is a side effect on a shared entity, so both restore paths follow
it:

- `tests/helpers/order-fixture.ts` — `restoreOrder` deletes notifications for
  the order's ref created after the snapshot.
- `scripts/trial-reset.ts` — `removeOrder` deletes them by ref before the order
  row goes.

Without the second, one manual walk left five bells ringing in a seeded seller's
account about a deal that no longer existed. That happened, and was cleaned.

## What is still silent

22 seeded templates still have no writer — auctions (including
`auction.outbid`, which an auction format depends on), payment-deadline
reminders, identity decisions, listing review outcomes, deposits, and three
`offer.*` keys. The full table, with what each silence costs, is in
`docs/BACKLOG.md` § G.

A gate that requires every template to have a writer is the right close for this
class, but 22 alarms is far past the repo's ten-alarm threshold — so the
remaining groups get wired first, then the gate.
