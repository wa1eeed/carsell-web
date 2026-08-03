# Admin: campaigns and push (task 26)

Screens `A9` (marketing campaigns) and `A10` (push notifications) in
`design/CarSell Admin.dc.html`. Domain: `src/lib/domain/admin-campaigns.ts`,
`src/lib/domain/push-channels.ts`.

Task 26 is scoped as **structures activated with the app**: the schema, the
rules, and the admin screens are real; only the transport is deferred.

## A9 · the segment is computed at send time

The acceptance criterion. Saving the list of matching users is the natural
mistake — faster, simpler, and wrong within the hour.

Someone who withdraws marketing consent between save and send stays on a saved
list and receives the message they just revoked permission for. Someone who
completes a purchase gets "finish your purchase". A saved segment does not show
that; it shows a number that was true the day it was written.

`Segment` stores **rules, not members**. `resolveSegment` runs them at request
time and at send time.

Proved by mutating data between two measurements without touching the segment:

| | matched | consented |
|---|---|---|
| before | 15 | 7 |
| after one user revokes consent | 15 | 6 |

Also proved end-to-end: a campaign created against a segment, then one member
revokes consent, then the campaign sends — that member has no `CampaignSend`
row. And proved live through the rendered page, where "will actually reach"
moved 7 → 6 on reload with no edit to the segment.

### Three numbers, not one

`matched` / `consented` / `reachable`. The gap between them is the information:
"8,920 match and 5,940 will be reached" says a third of the segment is blocked,
which one number cannot say.

`reachable` subtracts two things: the 72-hour cooldown, and anyone at the
4-per-month marketing cap. Both are checked again at send time, not trusted from
the preview.

### The rule fields are a closed list

Eight fields, each mapping to a Prisma condition. An unknown field returns a
condition matching **nobody** — a typo must not silently widen the audience of a
marketing send. `validRules` rejects a segment containing one before it is saved.

Negation is `NOT` around the same condition, not a hand-inverted second query —
the two drift the moment either changes.

### Percentages are computed from `CampaignSend`

No `opened` column on `Campaign`. Open rate is
`rows with openedAt / rows sent`, and a campaign with nothing sent shows `—`,
never `0%` — zero reads as failure, and not-yet-sent is not failure.

## A10 · critical notifications cannot be switched off

The acceptance criterion, enforced in the **domain**, not the screen. A disabled
toggle in the UI is bypassed by one request, and someone who loses an auction
because they muted a notification they thought was marketing does not care where
the check lived.

Three layers:

1. **`setPreference` refuses** with `CRITICAL_CHANNEL` — named, not silent. A
   mute that appears to succeed and is then ignored makes the user believe they
   muted it, and blame the platform when it arrives.
2. **`isChannelEnabled` never reads the preference** for a critical channel. It
   returns `true` before the lookup. Reading a value and then ignoring it leaves
   a one-line bug away from silencing payment notifications for everyone.
3. **`updateChannel` does not accept `userControllable`.** Making a critical
   channel mutable is a product decision, not an operational setting, and a
   button for it in the admin console makes it happen in a meeting.

Tested by writing `enabled: false` **directly into the table**, bypassing the
function entirely — `isChannelEnabled` still returns `true`.

Two of the six seeded channels are critical: auctions the user is bidding in,
and orders and payment. Marketing defaults **off** — consent is asked for, not
assumed.

## Schema added

`Segment`, `Campaign`, `CampaignSend`, `PushChannel`, `NotificationPreference`,
`DeviceToken`, plus `User.marketingConsent` / `marketingConsentAt`.

Migration `20260803010000_campaigns_push` ships with `migration.down.sql`, and
the rollback was **run**: six tables and two columns dropped, then re-applied
cleanly. A rollback nobody executed is not a rollback.

## Deviations from the design

- **No campaign composer or segment builder UI.** The rules engine, the counts
  and the send path exist and are tested; building the drag-and-drop rule editor
  before there is anything to send would be building the least certain part
  first.
- **No A/B split, no "best time per user", no reports tab.** All three need send
  history to be meaningful, and nothing has been sent.
- **No device-token registration endpoint** — that is the app's side of the
  contract, and this task is the admin's side.
- **No delivery, open, or opt-out rates on A10** — same rule as A8: they come
  from a provider that does not exist, and a computed-looking percentage with
  nothing behind it is worse than a blank.

## A recurring failure, closed

`npm run build` writes to `.next` — the same directory the dev server serves
from — corrupting its cache and producing
`Cannot find module './vendor-chunks/@formatjs.js'` errors that name nothing to
do with the cause. This happened twice.

`npm run build:check` now sets `BUILD_DIR=.next-check`, and `next.config.ts`
reads it into `distDir`. Verification builds and the running dev server no
longer share a directory.

One caveat worth knowing: `next build` rewrites `next-env.d.ts` and
`tsconfig.json` to point at whichever `distDir` it used, so a check-build leaves
both files edited. Neither edit should be committed — `git checkout` them, or run
`npm run dev` once, which rewrites them back to `.next`. The real build
(`npm run build`) does not touch them, because it writes where they already
point.
