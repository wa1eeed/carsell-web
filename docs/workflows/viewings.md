# Viewings — an appointment between two parties, not a provider service

Built 2026-10-17. The owner was asked whether a viewing is a direct
buyer↔seller appointment or a provider service, and answered:

> «افعل ما تراه احترافي و يناسب السوق السعودي»

## What was there

`viewing` was a row in `Service` — zero price, `providerType: null`. So
`cityPool` returned nothing and `requestService` answered
`CITY_NOT_COVERED` **for every request ever made**. The button on the car
page said «قريبًا» and pointed the buyer at the order page *after*
purchase, which answers a different question than the one being asked.

It was one of two services measured as advertised-but-unbuyable; the other
(ownership transfer) was fixed the same day by giving it a provider type.
A viewing can't be fixed that way, because **no third party performs it**.

## The decision

A viewing is a meeting between the two sides of a deal. No provider, no
money, no commission, no SLA. So it is its own entity, and the `Service`
row is retired (migration `20261017170100`; deactivated rather than
deleted, because `ServiceRequest.serviceId` references it with `Restrict`
and deleting it would erase what was once requested).

## Why a day and a period, not a timestamp

**Appointments here are set against prayers, not against the clock.**
«بعد العصر» and «بعد المغرب» are what people say and what they agree on.
Four periods, with their hour ranges shown underneath for anyone who wants
them:

| key | label | hours (Riyadh) |
| --- | --- | --- |
| `MORNING` | صباحًا | 08–12 |
| `NOON` | بعد الظهر | 12–16 |
| `AFTERNOON` | بعد العصر | 16–18 |
| `EVENING` | بعد المغرب | 18–22 |

Minute precision would be a claim we can't keep: both sides adjust by
phone anyway, and a buyer asked to choose 4:37 picks a number that means
nothing to them. The conversion lives in `viewing-rules.ts`; Saudi Arabia
has no daylight saving, so the offset is a constant +3.

## The flow

```
            requestViewing
                  │
              REQUESTED ──── respondToViewing(accept)  ──→ CONFIRMED
                  │     ├─── respondToViewing(decline) ──→ DECLINED
                  │     └─── counterViewing ──→ COUNTERED ──┐
                  │                                 │       │
                  │                    acceptCounter (buyer)┘
                  │                                 └──────────→ CONFIRMED
                  │
  cancelViewing (either side, any open state) ───────────────→ CANCELLED
                  │
   closePastViewings (scheduler, slot has passed)
          ├── was REQUESTED or COUNTERED ────────────────────→ EXPIRED
          └── was CONFIRMED ─────────────────────────────────→ COMPLETED

   remindUpcomingViewings (scheduler) — both parties, once,
   `viewingReminderHours` before a CONFIRMED slot starts.
```

### The counter — why it is not optional

A decline alone **ends the conversation**. A seller who cannot do Saturday
but can do Sunday had to refuse, and then wait for the buyer to ask again —
and most do not. A possible agreement died because there was no door.

The counter carries the meeting point, so it is a whole proposal rather than
half of one: the buyer's acceptance ends the exchange instead of starting a
third round. The turn moves with it — `REQUESTED` is the seller's, `COUNTERED`
is the buyer's — and `viewingsAwaiting` counts both, because a counter that
reads as "nothing to do" is a counter nobody answers.

What the buyer first asked for is kept in `originalDate` / `originalPeriod`,
so the screen can say «طلبتَ الاثنين بعد العصر، ويقترح البائع الخميس بعد
العصر». Without it the buyer sees a day they never chose and has no way to
know it was changed.

A rejected counter is a cancel. There is no third status for one thing.

### Who sees the meeting point

The seller **wrote** it, so they always see it — withholding someone's own
words from them is not privacy. The buyer sees it once the viewing is
`CONFIRMED` or `COMPLETED`, which is the promise printed on the car page.
Phone numbers are gated for both sides until confirmation.

Every status has a writer. `EXPIRED` and `COMPLETED` are kept apart on
purpose: **the difference is what measures a seller** — one who never
answers is not one who answers and shows up.

## What the rules enforce

- **The slot, not the day.** A request for «صباحًا» placed at noon is
  rejected; the same day is still bookable for a later period, which is
  the most common case — someone sees a car in the morning and wants it
  after Maghrib.
- **A 21-day horizon.** Further out and the car is likely sold, so the
  seller gets a request for something that is no longer theirs. The limit
  is rendered in the form through `Quantity`, never interpolated into a
  sentence.
- **One open request per buyer per listing.** Ten requests from one person
  is not keener interest; it is a queue that makes a seller ignore all of
  them.
- **A decline carries a reason** (`MIN_DECLINE_REASON`), because «رُفض»
  alone leaves the buyer not knowing whether to propose another time or
  move on.
- **An accept carries a meeting point** (`MIN_MEETING_POINT`). «جدة» is
  not somewhere you meet.

## Privacy — the promise was already on the screen

The car page has always said the exact location is revealed only after the
appointment is confirmed. That promise is now enforced where the data is
**fetched**, not where it is rendered: `meetingPoint` and the other party's
phone are `null` on the returned object until the status is `CONFIRMED` or
`COMPLETED`. Same discipline as `reservePrice` — what never enters the
object cannot leak from it, including through the RSC payload.

## Where it shows

| Surface | What |
| --- | --- |
| `/cars/…` | the request dialog, replacing the «قريبًا» toast |
| `/account/viewings` | both sides in one screen — requests you made, requests on your listings |
| `/account` | an urgent banner and a section entry, shown with a count |
| `/admin/listings/[ref]` | every viewing on the listing, for when either side complains |
| notifications | four templates on their own push channel (`viewings_mine`) |

One screen, not two: someone who both buys and sells does not want two
doors to the same thing, and twin screens drift the first time one is
edited.

## Seeding

All seven statuses are seeded (`VIW-2026-9100`–`9106`), on the same account
that holds an order with documents and a service request — so a single
sign-in exercises every account surface. **What is not seeded is not seen**:
a status no screen ever opens is where defects live for months.

Viewings are created through the real ref generator, so nothing
distinguishes a test row from a seeded one by shape. `tests/global-setup.ts`
therefore **counts** them rather than deleting them (a manual click-through
creates real rows worth keeping), and `npm run trial:reset` removes
everything past the seeded seven.
