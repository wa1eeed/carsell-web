# The inspection journey — three parties

The owner's rules, 2026-10-14 (`docs/DESIGN-DECISIONS.md`):

- **Whoever requests pays**, seller or buyer. One membership, two roles: a
  seller buys an inspection to put a report on their listing; a buyer buys one
  on a car before committing to it.
- **A buyer's request needs the seller's consent**, which makes this a
  three-party journey — buyer, seller, inspector.
- **Payment is asked for after the seller accepts**, and the amount and *when*
  it will be asked are shown from the first moment of the request.
- **The seller's contact and city reach the inspector after acceptance.**
- **The request goes to the inspectors in the car's city.**

## What was there before

`serviceRequest.create` appeared **once** in the whole tree and nothing updated
it: a request was born at `NEW` and stayed there forever. The admin screens were
read-only, `InspectionReport` was written only by the seed, and the buyer's money
was held on their card with no ledger entry at all.

And the most common case was **forbidden**: `purchaseService` required
`ownerId === userId`, so a buyer could not inspect a car before putting seventy
thousand riyals into it — which is the reason the service exists.

## The states

`NEW` has always meant "in the providers' queue" — which is what it meant when
payment preceded creation. So the waiting is two explicit states before it, not
an absence of one: someone waiting for consent is not someone waiting to pay,
and folding them together makes the queue count requests nobody can move.

```
                     ┌─ seller declines ──────────► DECLINED
                     │  (or the window lapses)
AWAITING_SELLER ─────┤
  (buyer's request)  └─ seller consents ─► AWAITING_PAYMENT ─► NEW ─► ASSIGNED
                                                   ▲             (queue)
AWAITING_PAYMENT ──────────────────────────────────┘
  (own car — no second party)
```

`DECLINED` carries the reason the seller wrote, or `consent.lapsed` when the
window ran out.

## The rules behind each step

**The request takes no money.** It states its amount and when payment will be
asked. Holding money before a consent that may never come would freeze a card
for a deal that never began.

**A lapsed window is a refusal, not an approval.** An inspection that proceeds
without consent sends an inspector to the door of someone who did not agree and
discloses their details to someone they did not authorise. Silence is not
consent when silence costs the silent party something. `lapseServiceConsents`
runs in the scheduler; `decideServiceRequest` **also** checks the clock, because
the job may not have run yet (gate 42).

**Disclosure waits for the queue, not for consent.** Accepting moves the request
to "awaiting payment", and no inspector is involved yet — so disclosing then
would be early. `sellerContactFor` returns `null` for every unpaid state.

**The city comes from the listing.** Someone in Riyadh asking to inspect a car
in Jeddah used to send the inspector to *their* city: the city is a property of
the car, not of whoever asks about it.

**The pool is a type, not a provider.** `Service.providerId` is one preferred
provider, so it cannot be a queue. `Service.providerType` is what the pool is
drawn from: every active provider of that type covering the city — and **with a
usable payment account**, because assigning work to a provider who cannot be
paid creates a debt with no way to settle it.

## The screens

One page, `/account/reports/[ref]`, with two faces: the requester sees the
status, the amount, when payment is due and a pay button; the seller sees what
is being asked of their car and the two decisions. Anyone else gets a 404, not a
403 — the existence of the request is itself information.

The seller's entry point is a row on the account home, shown only when something
is actually waiting. Before it, the only way in was a notification that could be
missed — and the window would lapse.

The list at `/account/reports` previously rendered every request with
`href={null}` and the words «بانتظار التقرير» whatever its state, so a rejected
requester read that they were waiting for a report that would never come. Both
are fixed, with the labels in `src/lib/labels/services.ts` read by the list and
the detail page alike.

## Notifications

| Moment | Key | Who receives it |
| --- | --- | --- |
| A request lands on your car | `service.consent_needed` | the **seller** |
| The owner agreed | `service.consent_granted` | the **requester** |
| The owner declined, or the window lapsed | `service.consent_declined` | the **requester** |

Whoever made the decision is not told of it — they saw the result on their own
screen. Every step here has a deadline running against someone, and without a
bell the window lapses on a person who never knew it had started.

Each line links to `/account/reports/[ref]`. `destinations()` resolves
`ServiceRequest:{ref}` **and requires the reader to be one of the two parties**,
so a leaked id does not open someone else's request.

**`Dispute` was declared and had no resolver.** It has been in
`NotificationEntity` since the type was written and three places write it, but
nothing turned it into a link — so «فُتح نزاعٌ على طلبك» arrived at critical
priority and could not be opened by clicking. It now resolves to the order's
page, where the dispute is shown at the top.

**The reason travels as a key, not a sentence.** The domain does not know the
display language, and a sentence it builds would be rendered inside a template
that phrases things differently (gate 17). `consent.lapsed` is the stored reason
and both the screen and the template phrase it.

## Still missing

**The provider side**: `ASSIGNED` / `IN_PROGRESS` / `DONE` still have no writer,
there is no provider surface, and the held money is never captured or split.
`docs/BACKLOG.md` § I carries the rest in build order.
