# Admin: operations, orders, customers (tasks 21–22)

## A2 · stage metrics against a target line

**A count alone says nothing.** Twenty orders in "payment" is normal if they
entered today and a crisis if the oldest has been there a week. So the metric is
**average dwell against the stage's target**, with the count as context.

## A4 · dwell time and the double-the-target alert

"Double" means double **that stage's published target**, not a single number for
all stages. Inspection targets 72 hours and payment 24; one shared threshold
shouts at a stage that is slow by nature and stays silent about one that stalled.

| Stage | Target |
|---|---|
| Request · Approved · Payment | 24h |
| Inspection | 72h |
| Transfer | 120h |

Amber past the target, red past double. Red is what needs a human.

## A5 · identity behind a permission, every access logged

**The table shows no identity at all.** Showing it and then masking parts makes
every page load a bulk access to a hundred customers. Access is a **deliberate
act** on one customer, with a written reason.

### Three properties that make the log worth having

1. **Logged before anything is returned.** If it were logged afterwards, a read
   could succeed and the log fail — an access with no trace. That is exactly what
   makes an access log worthless: a trace that may or may not exist.
2. **`POST`, not `GET`.** A `GET` is stored in browser history, replayed by the
   back button and fired by prefetch — so the access happens unintentionally and
   is logged repeatedly for no reason.
3. **A reason is required** (10 characters minimum). A log saying "X looked" with
   no *why* cannot distinguish handling a dispute from curiosity.

The ID image and full ID number are never returned. Name, status and verification
date are enough for someone processing a request. The IBAN comes back as its last
four digits — enough to match against, not enough to transfer with.

## Two boundary defects found here

Both are the same family as the `CategoryFilter` bug, and both are now rules in
`CLAUDE.md`:

- **A function cannot cross the boundary.** `DataTable` takes `cell` render
  functions; passing them from a server component crashes the page. The table
  moves to the client and only data crosses.
- **What crosses the boundary reaches the browser.** The first version passed
  Prisma user rows straight through, putting a hundred **full phone numbers**
  into the page payload even though the column rendered only the last four.
  Masking at render is not masking. Rows are now prepared server-side and
  verified: zero full numbers in the payload.
