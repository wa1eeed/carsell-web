# Blocking an account

## The lock that had no key

Every piece of this was built except the one that acts:

| Piece | Where | Built |
|---|---|---|
| OTP sign-in refuses `SUSPENDED` / `BANNED` | `domain/auth.ts` | from day one |
| Password sign-in answers 403 on anything but `ACTIVE` | `api/v1/auth/login` | from day one |
| `users.suspend` permission, granted to `SUPER_ADMIN` and `OPS` | `domain/permissions.ts` | from day one |
| «موقوفون» / «محظورون» segments with their counters | `/admin/users` | from day one |
| **Anything that writes `User.status`** | — | **nothing** |

So both counters read zero forever, both queues were empty forever, and **a
fraudulent seller could not be stopped**: a report could be filed, read, and then
nothing. The thirteenth instance in this repository of a schema value with no
writer.

**The policy is the owner's; the capability was already declared.** When an
account is blocked is an operating decision. That the platform *can* block one is
written in the schema, in the guard, in the permission and on the screen — so
building it completes what was announced rather than inventing a rule.

## Two degrees, not one

| Status | Meaning |
|---|---|
| `SUSPENDED` | Temporary. Lifted when the matter is settled. This is what an investigation uses. |
| `BANNED` | Permanent. Lifted only by a second explicit decision. |

**A reason is required for both**, at least 10 characters. A record that says
"blocked" with no reason is read months later and nobody can tell whether it was
fraud or a mistake — and it is the first thing asked when the owner appeals.

## A ban does not fall on live money

`BANNED` is refused while the account has an `ACTIVE` order or a `HELD` escrow,
and the screen says so: *«عليه طلبٌ حيٌّ أو ضمانٌ محجوز — احسم الصفقة أوّلًا، أو
أوقفه مؤقّتًا»*. Cutting the session would leave that person with no door to
finish through and none to cancel through, while their money sits at the gateway
and a car sits reserved. Suspension is allowed in that state; it is the
investigation tool.

## The block bites the live session, not only the next sign-in

`currentUser` — the entry point of **every API route that writes** — returned the
row without looking at its status. A session token lives thirty days, so an
account blocked today kept buying, selling and bidding for a month, and nothing
said the block had not taken effect.

It now refuses any non-`ACTIVE` user, so every action fails immediately. Pages
read through `currentUserFromCookies`, which still returns the row: whoever is
blocked can open their account and see why, and can do nothing.

## What is written

1. `User.status`.
2. An `AuditLog` row — `user.suspended` / `user.banned` / `user.active` — carrying
   the previous status, the reason and the admin's IP. *(Every admin action writes
   one; that is a repository rule.)*
3. A `critical` notification to the account's owner: `account.blocked` or
   `account.restored`. The guard turns them away with a generic message, so
   without this they would read it as a fault and try again. **The templates ship
   as a migration**, not only in the seed — reference data added to a seed file
   reaches a fresh environment and never reaches a running one.

The notification is sent after the write and its failure is swallowed: telling
someone is an effect, not a condition, and a broken broadcast must not leave a
fraudulent account open.

## Where it is

`/admin/users/{id}?tab=access` — «الوصول: ما يفتح الحساب وما يغلقه».
Domain: `src/lib/domain/admin-user-status.ts`. Route:
`POST /api/v1/admin/users/{id}/status`. Tests: `tests/admin-user-status.test.ts`.
