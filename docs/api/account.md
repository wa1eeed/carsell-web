# Sign-in and account (Wm · Wf)

## Wm — one step, not two

Signing in and signing up are the same action: the first successful verification
of an unknown number creates the account. That is not a shortcut, it is the
security property — **two separate screens would have to tell the visitor which
one is theirs**, which leaks whether the number is registered.

`tests/account.test.ts` asserts the request endpoint returns the **same shape**
for a registered and an unregistered number. The difference appears *after*
verification, never before.

### Two limits, one status code

`429` covers both the 30-second cooldown and the 5-per-hour cap. They stay
distinguishable by error **code** (`OTP_COOLDOWN` vs `OTP_RATE_LIMITED`) — proven
live: the second immediate request is a cooldown, and only the **sixth** send
within the hour is rate-limited.

Conflating them would have made the limit look like it fired at 2, which is
exactly what a first reading of the live output suggested.

### Input details that decide whether someone gets in

- The phone field **accepts any paste format** (`٠٥٥…`, `+96655…`, spaced) and
  normalises it. Refusing paste forces someone to read their own number off a
  message and retype it — the most error-prone thing on the screen.
- The OTP boxes are `dir="ltr"` **even in Arabic**: the code is copied from a
  Latin message and compared box by box. Reversing them in RTL puts the first
  digit typed into the last box.
- `autocomplete="one-time-code"` lets the OS offer the code from the SMS.
- Digits are Latin here — the same exception as counters and identifiers
  (rule 5). The reader is comparing against their phone screen, which is Latin.

## Wf — missing fields are prominent

The acceptance criterion, and the reason for the design: email, ID verification
and IBAN are needed **before the first transaction, not at sign-up**. So the
reminder has to arrive before the moment of need — not as an error when someone
presses "Buy", which is the worst moment to discover you have work to do.

It is a card at the top of the page that **names what is missing and says what it
blocks** ("you cannot buy until…"), not a badge in a corner. "Complete your
profile" alone moves nobody.

IBAN blocks selling but not buying — it is for receiving money, not sending it.

### Data boundaries

"Offers received" means offers **others made on your vehicles**, not offers you
made. A test asserts the seller is you and the bidder is not.

An inspection report whose listing was withdrawn **stays listed without a link**
rather than disappearing. You paid for the report; the listing going away does
not take it with it.

## Schema gap found here

`Order` had no `createdAt`. `stageEnteredAt` resets on every stage transition, so
it cannot order "my orders" by when they were placed and cannot support any
time-based measurement. Added, backfilled from `stageEnteredAt` — the closest
available approximation, since an order was created at or before it entered its
current stage, never after.
