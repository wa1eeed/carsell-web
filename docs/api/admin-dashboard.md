# Admin: dashboard and integrations (task 25)

Screens `A1` (dashboard, growth and counts) and `A11` (integrations and API keys)
in `design/CarSell Admin.dc.html`. Domain:
`src/lib/domain/admin-dashboard.ts`, `src/lib/domain/admin-integrations.ts`,
`src/lib/crypto/secrets.ts`.

## A1 · every number comes from the database

The acceptance criterion, and it is harder than it sounds. A hard-coded number
does not arrive as a literal in the markup — it arrives as "a placeholder until
the source data exists". So the rule here is that **anything with no source is
not shown**: not as zero, not as an estimate. A missing card is a question
someone asks; a lying card is an answer someone believes.

Proved by **re-derivation**: every card total is compared against an independent
query in `tests/admin-dashboard.test.ts`. A literal would diverge from its query
the first time the data changed. A second test greps the page source for
`value={<digits>}` and asserts none exist.

### Segments must sum to their total

Users are split four ways — suspended, then of the rest: dealers, sellers,
buyers. **Disjoint by construction.** The first version counted suspended users
*and* also counted them as buyers, so the breakdown did not add up to the number
directly above it, and the card contradicted itself in two adjacent lines. A
test now asserts the sum for users, listings, orders and auctions.

### The comparison window is equal and adjacent

Thirty days compared against the calendar month before it produces a jump or a
drop that never happened. `previousWindow` takes the same span, ending where the
current one begins.

`deltaPct` returns `null` when the previous value is zero — "0%" reads as
"unchanged", which is a lie when there was nothing to change from.

### Repeat customers are cumulative, not windowed

A car is not bought twice in a month, so counting repeat buyers within thirty
days makes every customer non-repeat. That card has `previous: null` — it is not
comparable to a window, and a zero delta would read as a decline.

### Cities count the same population as the listings card

The city chart originally filtered to `status: 'PUBLISHED'` while the listings
card counted everything published in the window. Two numbers under the same word
on one screen, disagreeing — and the chart's own caption said "published in the
range" while excluding anything published and since sold. Both now count the
same set, and a test asserts they are equal, not merely close.

The "rest of cities" row is summed, never dropped: a list that shows five and
goes quiet about the remainder makes the total disagree with what is above it.

### Two cards from the design are absent

`المستخدم النشط` (DAU/WAU/MAU) needs an activity log; `مصدر التسجيل` needs a
`source` column on `User`. Neither exists. The screen says so in a line at the
bottom rather than showing plausible numbers. Recorded in
`docs/OPEN-QUESTIONS.md`.

## A11 · keys are encrypted and never displayed

Two acceptance criteria, and three mechanisms:

### 1 · AES-256-GCM, not CBC

GCM detects tampering; CBC decrypts altered ciphertext into garbage without
complaining. A payment provider key that has been tampered with must fail
loudly, not become a random string sent to a bank. `decryptSecret` **throws**
rather than returning null — an empty value passed to a provider comes back as
"invalid key", and the bug then gets hunted at their end while it is at ours.

The stored format is `v1.<iv>.<tag>.<ciphertext>`, version first so the
algorithm can be rotated later.

### 2 · Display never decrypts

What the screen shows is a **hint** — `sk_live_········` — derived at write time
and stored as plain text alongside the encrypted blob. A screen that decrypted
fourteen secrets to show four characters of each would have put every secret in
server memory for the sake of a cosmetic, and leaked them all with the page
payload.

Verified live: the served HTML contains the hint, and neither the raw secret nor
its ciphertext. `listIntegrations` returns no field that could carry one.

### 3 · Rotation takes two members, and the requester is not one of them

`requestRotation` encrypts the new secret into the **approval request**, not the
integration. Writing it to the integration immediately would make the rotation a
fact before anyone approved it, and the approval a signature on a completed act.

`approveRotation` rejects the requester (`SELF_APPROVAL`, HTTP 403) — without
that, "two members" is one member clicking twice and the whole rule is
decoration. The requester counts as one; the second approver completes the
quorum and the swap executes inside the same transaction.

Verified live with two real admin sessions:

| Step | Result | Stored secret |
|---|---|---|
| Requester asks | 200, `PENDING`, required 2 | still empty |
| Requester approves own request | **403 `SELF_APPROVAL`** | still empty |
| Second member approves | 200, `EXECUTED` | `v1.9qal…` ciphertext |

The audit log carries hints and actor ids — `rotation_requested` then `rotated`
with `requestedBy` and `approvedBy` — and never the secret.

A pending request also blocks a second one on the same key, and an expired
request cannot be approved: the window is 48 hours, and lapsing marks it
`EXPIRED` rather than silently executing later.

### The connection check never claims success

There is no provider yet, so `checkConnection` writes `lastCheckOk: null`, never
`true`. A green result with no real connection is worse than no check at all,
because it reassures.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/admin/integrations/{key}/rotate` | Request a rotation (no write to the integration) |
| `POST` | `/api/v1/admin/integrations/{key}/approve` | Second approval; executes on quorum |

`SELF_APPROVAL` returns **403, not 422** — it is a limit on authority, not a
malformed input, and the UI reads the code to explain it.

## Two bugs the type system could not catch

Both were invented enum member names — `PAYMENTS` for `PAYMENT`,
`CONNECTED`/`WARNING` for `ACTIVE`/`DEGRADED`. Because the lookup key was typed
`string`, they compiled cleanly and then produced a zeroed summary card and two
group headings rendered as raw enum values on screen.

Fixed by typing the maps as `Record<IntegrationCategory, string>` and
`'ACTIVE' | 'DEGRADED' | 'INACTIVE'`, which turns a wrong name into a compile
error and makes an added enum member a missing-key error.

## Test hygiene

Tests write to the real development database and clean up in `afterAll` — which
does not run when an assertion throws first. Eighteen test admin accounts had
accumulated that way and were showing up as if they were staff.

`tests/global-setup.ts` now deletes them once before every run, matching on the
**shape** (`letters + timestamp @carsell.one`) rather than a list of prefixes —
a prefix list is exactly what let eighteen accumulate. Seeded accounts are words
with no digits (`super`, `ops`, `finance`) and cannot match.

## Deviations from the design

- **No 12-month growth chart, customer pie, or registration-source chart** on
  A1 — the first needs a charting approach not yet chosen; the third has no
  column behind it.
- **No test/production environment toggle** on A11: `Integration` holds one
  configuration per key. Two environments means either two rows or a second
  secrets column, which is a schema decision.
- **No per-integration health percentages or monthly cost** — both need a
  provider reporting real numbers.
