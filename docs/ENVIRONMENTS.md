# The two environments

_Last updated: 2026-11-24_

| | staging | production |
|---|---|---|
| URL | `carsell.one` | `carz.sa` |
| Host | VPS, Coolify | SCCC ECS, Riyadh |
| Branch | `staging` | `main` |
| Deploy | **Deploy button in the Coolify panel** | `carz-deploy` over SSH on the server |
| Database | Coolify Postgres | ApsaraDB RDS, private VPC |
| Data | **seeded and fictional** — 62 listings, invented prices and VINs | real |
| Media prefix on R2 | `staging/` | `production/` |
| Payment gateway | forced `TEST` | live keys (pending) |
| Indexed by search engines | no | yes |
| Secrets | its own | **different ones, generated separately** |

## Until launch, the order is reversed — *owner's decision 2026-11-24*

> «بحكم اننا نكمل التطويرات ولم ننته من المشروع فالافضل ان تنشر في sccc
> وتستمر في نشر تعديلاتك … اما staging … متى ما اردت انا استطيع عمل ديبلوي»

While the platform is being built:

- **Production is deployed by the assistant on the owner's behalf**, straight
  after each piece of work: merge `staging` into `main`, then `carz-deploy`.
- **Staging is an on-demand snapshot.** The branch always carries the latest;
  the owner presses Deploy in Coolify when they want to look at it.
- **After launch** the order returns, and production moves behind a **button in
  GitHub** — an action the owner triggers, which runs `carz-deploy` remotely.
  No SSH, and still a deliberate press.

**What this suspends, and why it is affordable today.** Rule 2 below says
nothing reaches `main` that has not run on staging; it is suspended on purpose.
The guard it provides is a rehearsal of the **migrations** on data someone else
seeded, and today production holds the reference catalogue and one admin
account — no listing, no order, no user. A migration that goes wrong there
costs a re-seed.

**It stops being affordable the day a real seller publishes a real car**, and
two things must be in place before that: the rule comes back, and the database
gets the backup it still does not have («Also open» in the roadmap). Both are
sequenced before launch, not after.

## How a change reaches each one

**Both are deliberate button presses. Neither follows a push on its own** —
measured 2026-11-24, when three commits had sat on `staging` for over an hour
and `carsell.one` was still serving the previous build. This table said
«automatic on push» until that measurement; it was written from intention, not
from the panel.

```
commit → push to `staging`
       → Coolify: press Deploy        → check carsell.one
       → merge `staging` into `main`
       → on the SCCC box: carz-deploy → check carz.sa
```

**What a deploy does in both:** pulls the branch, builds the image, and the
container's entrypoint runs `prisma migrate deploy` **before** the server
starts. So migrations land with the code that needs them, and a failed
migration stops the boot instead of serving a half-migrated schema.

**Coolify can be made to deploy on push** — a webhook in its panel — and the
owner has not asked for it. The production side stays a deliberate command
either way: a push should not be able to change `carz.sa` without someone
meaning it.

**The code is identical.** Everything above except the branch is an environment
variable. There is no staging copy of anything: a second copy of the code is two
copies that drift, and the first change someone forgets in one of them makes it
impossible to say which is correct.

The setup details are in [`DEPLOY-STAGING.md`](DEPLOY-STAGING.md) and
[`DEPLOY-PRODUCTION.md`](DEPLOY-PRODUCTION.md). This page is the working rule.

---

## The cycle

```
work → commit on `staging`
     → Coolify deploys        → try it on carsell.one
     → owner approves
     → merge `staging` → `main`
     → carz-deploy            → carz.sa
```

CI runs the seed, `npm run verify` and `build:check` on both branches, so a red
branch never reaches either site. The owner's only step is trying it on
`carsell.one` and saying yes.

---

## Three rules

### 1 · The data is never mixed

Production holds real customers: encrypted national IDs, IBANs, order history.
**It is never copied into staging** so that someone can "try it with real data",
and staging's fictional listings are never seeded into production.

The code enforces the second half: `prisma/seed.ts` refuses to run when
`APP_ENV=production`, and refuses outside `development` without an explicit
`ADMIN_PASSWORD`. Nothing enforces the first half — that one is discipline, and
it is the one that leaks personal data when it is broken.

What *does* travel to production is the reference data — brands, services, tax
rules, notification templates — through `prisma/plant-reference.ts`, which runs
on every boot and inserts only what is missing. See roadmap §39.

### 2 · Nothing reaches `main` that has not run on staging

> ⏸ **Suspended until launch** by the owner's decision of 2026-11-24 — see
> «Until launch, the order is reversed» above. The reason it is affordable now,
> and the two things that must be true before it stops being, are written
> there. This rule comes back on.


Migrations apply automatically at boot, in both environments. That is safe
because of the order, not in spite of it: a migration lands on `carsell.one`
days before `carz.sa`, so a mistake in it surfaces on fictional data first.

Merging a branch straight into `main` throws that away. **Push to `staging`
first, always** — including for "one-line" changes, which are the ones that get
pushed straight through.

### 3 · A rollback does not undo a migration

`carz-deploy` tags every image with its commit, so rolling back the *application*
is a container swap in seconds. The *schema* does not move with it: migrations
only run forward.

So a release that needs a column back writes a new migration. And a migration
that drops or rewrites data is the one case where the deploy is not reversible —
it gets a backup taken immediately before it, by hand, and a note in
[`RUNBOOK.md`](RUNBOOK.md).

---

## What each environment proves

Staging answers **"does it work?"** — on dense, varied, deliberately awkward
data: cancelled orders, unmet auctions, disputed payments, a seller with no
listings. Production has none of that on day one, and will not for weeks.

Production answers **"does it work with nothing in it?"** — which is a different
question, and the one that found three defects on the first deploy (roadmap
§39). An empty database is a state staging can never show you.
