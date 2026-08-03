# Admin: service requests and services (task 23)

Screens `A6` (service requests) and `A7` (services and pricing) in
`design/CarSell Admin.dc.html`. Domain layer: `src/lib/domain/admin-services.ts`.

## A7 · a price change never touches an open request

This is the acceptance criterion, and the protection is **structural, not
behavioural**. `ServiceRequest.amount` is its own column, filled at creation time,
and no query reads the price back from `Service` afterwards. A customer who
ordered an inspection at 450 pays 450 after the price rises to 500 — changing the
contract after it is struck is not pricing.

The alternative — joining to `Service` at read time — would be correct only for
as long as every future query author remembers to snapshot. Discipline that has
to be remembered is a defect waiting for a deadline.

Verified live: price 450 → 500 with four requests on the service; all four still
read 450 afterwards, and the audit entry recorded both prices plus
`untouchedRequests: 1`.

### The count is shown before the click, not after

The `الطلبات` column carries the open-request count under the total, and the
price field in the drawer repeats it as a hint. A confirmation that says "saved"
tells the editor what happened; this tells them what is about to.

`changeServicePrice` returns `untouchedRequests`, and the `PATCH` response
carries it through to the toast.

### Editing happens in a drawer, not in the row

The first build put a price `<input>` in every row. Two problems: a table meant to
be **scanned** became a table where every row is one stray keystroke from a price
change, and the inputs rendered Latin digits in a column of Arabic-Indic ones.
The design's row action is a single `تحرير` button — following it fixed both.

### Ordering is a mode, not a per-row control

The design shows drag handles and a `ترتيب العرض` button. Arrows replace drag:
drag needs a pointer, arrows work from the keyboard and read correctly to a
screen reader. They appear only while the mode is on, because two arrows in every
row of a table nobody is reordering is noise.

`moveService` **swaps two neighbours** rather than renumbering the list. It also
forces the category filter off while ordering: a swap is against the full list, so
reordering inside a filter would make a row jump over rows the editor cannot see.

### A new service is created hidden

It is born incomplete — no provider, no image, no cities. Publishing it at
creation time puts it in the customer-facing services directory before anyone
finishes it. `active: false` until someone presses `نشر`.

The `key` is restricted to `^[a-z][a-z0-9_]{2,39}$`: it appears in URLs and in
code, so it is not a display name and never changes after creation.

### Nothing changed ⇒ nothing logged

Saving the drawer sends every field whether or not it was touched. An audit entry
whose `before` equals its `after` makes the log that gets read during an
investigation longer than the part of it that matters. `editService` compares
first and returns early; `changeServicePrice` does the same for an identical
price.

### Revenue is summed, never stored

The `الإيراد` column is `SUM(amount)` over that service's `DONE` requests. A
stored total would lie the first time a request is cancelled — the same rule that
governs the wallet: every money figure is computed from its entries.

## A6 · overdue is prominent three ways

Colour, sort order, and a filter button — because each one alone hides:

- **Colour alone** is lost in a long table.
- **Sort alone** fades the moment the editor sorts by another column.
- **A filter alone** requires knowing there is something to filter for.

`overdue` is `open && now > dueAt`. A completed request is never overdue: its
lateness ended when it was completed. `overdueHours` stays available on closed
rows for reporting, but does not colour them.

### The sort says what the colour says

Overdue first, worst at the top, then open by nearest deadline, then completed by
recency. The first build sorted by `dueAt` alone and put three *completed*
requests with old deadlines above every overdue one — the calmest rows in the
table sitting in the loudest position.

### Open requests are never truncated

Two queries, not one. Open requests come back whole; only completed history is
capped at 200. A request open for six months is exactly the one that most needs
to appear, and a single `take` ordered by recency would drop it.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/admin/services` | Create a service (starts hidden) |
| `PATCH` | `/api/v1/admin/services/{key}` | Price, visibility, ordering, or content |

Both require the `services.manage` permission. Every write records an `AuditLog`
entry: `service.created`, `service.price_changed`, `service.edited`,
`service.reordered`, `service.activated`, `service.deactivated`.

`PATCH` dispatches on the body: `active` toggles visibility, `move` reorders,
and any content field edits. `price` is handled last and separately so that a
price change is never buried inside a content edit in the audit trail.

Rejected with 422: a non-Latin or malformed key, a duplicate key, and a negative
price. Moving the top service up returns 200 and writes nothing — an edge is not
an error.

## Fixed here, from task 18

Order event labels rendered as raw key paths (`order.event.stage.changed`).
Two causes, both now closed:

1. **A dot inside a translation key** — next-intl reads `.` as nesting, so a flat
   `"stage.advanced"` key is never found. It throws in development and is
   **silent in production**, printing the key path to the user. Now a gate in
   `scripts/check-tokens.mjs` and a test in `tests/messages.test.ts`.
2. **Two names for one event.** The seed wrote `stage.changed` while
   `advanceStage` writes `stage.advanced`. Renamed in the seed and backfilled;
   `tests/messages.test.ts` now reads the event types the domain actually writes
   and asserts each resolves in both locales.

The renderer also falls back to `event.other` for an unknown type, because the
key is derived from a database value and a value with no message must never reach
the screen as a key path.

## Deviations from the design

- **No image column.** `Service` has no image field; the design shows a thumbnail
  per row. Recorded in `docs/OPEN-QUESTIONS.md`.
- **Arrows instead of drag handles** for ordering, for the reason above.
- **No provider shares, cities, display conditions, requester fields, or
  cancellation policy** in the editor — the design lists them under "what the
  admin controls per service" but the schema has no columns for them yet.
