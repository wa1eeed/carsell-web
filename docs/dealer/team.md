# Dealer panel — team and branches (`D9`)

_Last updated: 2026-11-25_

The permission matrix and the branch model are in
[`foundation.md`](./foundation.md). This page covers what sits on top: the
session, the invites, and the seats.

## 1 · A third session, not a flag on the shop's

`carsell_dealer`, path `/dealer`, 12 hours, `sameSite: strict`.

Signing in to the panel is a **second question**, not a second password:
identity was proved at `/api/v1/auth/otp`; `openDealerSession` asks only «is
this person a member of an approved dealer?». Merging the two would make a
second door to authentication, and a second door is a second thing to breach.

Membership is re-read on **every request** (`resolveDealerSession`), never
baked into the cookie. A revoked member keeps a valid cookie; only a live read
locks them out the moment the owner revokes them.

## 2 · An invite is a state before membership

The invited person may have no account at all. Writing a role onto a user row
that does not exist means **creating an account on someone's behalf**.

So an invite is recorded against a **phone**, and becomes membership at that
person's first sign-in with their own code — automatically, not by a button:
an «accept invite» button needs a screen they do not know exists.

## 3 · A pending invite holds a seat

Seats come from `team_seats` in the dealer's plan. If pending invites did not
count, a showroom could invite past its seats and the **rejection would land on
the invited person**, after they had already been told they were welcome. A
door opened and then shut in someone's face is worse than one never opened.

## 4 · `branchId: null` means every branch — so SALES must carry one

A sales member invited without a branch would see the **whole showroom's
stock**, while the `D9` matrix says "their branch". Nothing errors; nobody
complains about having too much access. `SALES_NEEDS_BRANCH` is refused at
invite time whenever the dealer has active branches.

This was measured by breaking it: opening the hole made its test fail.

## 5 · Nafath is built behind a flag

The owner's decision on 2026-11-25: «ابنه ولاحقًا نقوم بتنفيذه». The adapter,
the route, the screen with its random number and its polling, and the state
writer all exist. **One HTTP call is missing**, the day the keys arrive — no
screen and no route changes.

- The flag **and** the key are both required. A flag without a key shows a door
  that returns an error; a key without a flag opens a route nobody decided to
  open.
- `identityReviewedBy` stays `null`. There is no human reviewer in this path,
  and writing an id there would make the record claim a person looked.
- No ID photo is collected — fields only (owner's decision). Four texts that
  promised one, the privacy policy among them, were corrected in the same
  commit.
