# Deploying staging to a VPS with Coolify

This is the checklist for putting `staging.carsell.one` on a VPS. It is written
in English per the documentation rule; the reasoning behind each guard is in the
source comments (Arabic).

---

## 1. What the code enforces on its own

You do not need to configure these — they are guaranteed by `APP_ENV`:

| Guard | Behaviour on `APP_ENV=staging` |
|---|---|
| OTP code in the API response | **Not returned.** Only `development` returns `devCode`. A leaked code means anyone can impersonate any phone number. |
| Payment gateway environment | **Forced to `TEST`.** `effectiveEnvironment()` ignores the stored value unless `APP_ENV=production`. |
| Sandbox gateway | **Allowed.** It throws only when `APP_ENV=production`. |
| Local disk storage | **Refused.** Container disks vanish on redeploy, so staging needs real R2. |

⚠️ **All four read `APP_ENV`, never `NODE_ENV`.** `NODE_ENV` equals
`production` on staging too, so guarding on it is wrong in both directions.
`tests/env-guards.test.ts` fails the build if that regresses.

---

## 2. Required environment variables

Set these in Coolify. **The deployment is not safe without every one of them.**

### Secrets — generate fresh, never reuse production values

```
APP_ENV=staging
NODE_ENV=production

DATABASE_URL=postgresql://user:pass@host:5432/carsell_staging
JWT_SECRET=<openssl rand -base64 48>
OTP_PEPPER=<openssl rand -base64 32>
SECRETS_KEY=<openssl rand -base64 32>
CRON_SECRET=<openssl rand -base64 32>

ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<openssl rand -base64 24 — keep it>
```

**The seed refuses to run outside development without `ADMIN_PASSWORD`.**
Its development default is written in the repository, and deploying with it would
put an admin account with a publicly known password on a public URL.

### The admin account is synced on every boot

`ADMIN_EMAIL` and `ADMIN_PASSWORD` used to be read **only by the seed**. Anyone
who changed the password in the deployment panel afterwards believed they had
changed it — the database still held the old hash, and re-seeding was not an
alternative because it wipes what has been built. A change you believe happened
and did not is worse than one that is refused: the refused one is fixed
immediately, the other is discovered on the day you need it.

The entrypoint now runs `prisma/admin-sync.ts` after migrations and before the
server. Change `ADMIN_PASSWORD` in Coolify, redeploy, and the password is the one
you typed.

| Situation | What happens |
| --- | --- |
| Neither variable set | Skipped, boot continues — it is opt-in |
| Password unchanged | Nothing written, no audit row |
| Password changed | Hash replaced, lockout cleared |
| Email not seen before | New SUPER_ADMIN created |
| Password under 12 chars, or bad email | **Boot fails** with the reason on the first line |

Three properties are deliberate:

- **It touches nothing else.** One account, matched by email. A typo creates a
  second admin rather than destroying the first.
- **It never promotes an existing account.** An address already registered as
  `OPS` stays `OPS` even when named in `ADMIN_EMAIL` — raising privilege from an
  environment variable makes a role change a side effect of a password change,
  which is the last place anyone reviews it.

A weak password or malformed email stops the boot rather than degrading quietly:
a server that runs while its panel cannot be entered is a fault found late, and a
short password on a public URL is worse than downtime.

The password is **never printed**, in any environment. Container logs are
readable by everyone with deployment-panel access and they persist; whoever set
the value already knows it.

`SECRETS_KEY` encrypts gateway credentials and IBANs at rest. **Losing it makes
every stored secret unreadable**; rotating it requires re-entering them all.

### Storage — without this no listing can be published

```
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET=carsell-staging
R2_PUBLIC_URL=https://media-staging.carsell.one
```

Use a **separate bucket** from production. Media keys are prefixed by
environment (`staging/…`) but a shared bucket still mixes billing and lifetime
rules, and a wrong delete hits both.

### Application

```
APP_URL=https://staging.carsell.one
NEXT_PUBLIC_WS_URL=wss://staging.carsell.one/ws
REDIS_URL=redis://…            # live auction updates; without it they poll every 30s
```

### Optional — degrade silently when absent

`SENTRY_DSN` · `RESEND_API_KEY` · `SMS_PROVIDER_KEY` · `VIN_LOOKUP_*` ·
`MOJAZ_API_*`. Every integration behind a flag fails as a grey line, not an
error — the platform stays usable without them.

---

## 3. The scheduler — the step most likely to be forgotten

**Without it, no deadline in the product is ever enforced.** Offers never
expire, unpaid orders hold a car forever, auctions never close, deposits are
never returned.

Add a Scheduled Task in Coolify, every 5 minutes, with this command:

```bash
node /app/scripts/ops/cron-tick.mjs
```

**Absolute path on purpose.** The image sets `WORKDIR /app`, so the relative
form usually works — but "usually" depends on how the scheduler execs into the
container, and that is not ours to assume. The script imports nothing relative,
so the absolute path costs nothing and removes the question.

**Not `curl`.** The runtime image is bare `node:22-alpine` with no `apk add` at
all, so `curl` is not in it — a task starting with `curl` dies as
`curl: not found`, and Coolify reports only "failed" without saying why. The
Dockerfile already knew this: its healthcheck uses busybox `wget` and says so.
busybox `wget` is no good here either — `--post-data` support varies by build,
and this is a POST with an auth header. `node` is certain: it is what runs the
server.

The script calls `127.0.0.1:$PORT` rather than the public URL — no egress, no
TLS, no dependency on DNS being ready — and it **prints the response body**, so
a failed run names the job that failed instead of leaving you with the word
"failed". It exits non-zero on `500` (any job failed) and on a missing
`CRON_SECRET`, which is what makes the scheduler alert.

Without `CRON_SECRET` set the route answers `503` and does nothing — it fails
closed, not open, and the script says so in one line.

---

## 3b. What CI already proves before you deploy

`.github/workflows/ci.yml` runs on every push to `main` and `staging`:

- types · lint · **all seventeen gates** · generated docs · 527 tests
- **`npm run build:check`** — the real production build. `verify` does not
  build, so without this a production-only error stays invisible until launch.
  The build blocker in this repo was resolved but **its cause was never
  identified**, so this step is the only thing that catches its return.
- a check that `build:check` did not leave `next-env.d.ts` / `tsconfig.json`
  modified.

Tests run against a real Postgres service container, not a mock — a mocked
database hides query errors, which is the class of bug that reaches production.

---

## 3c. Build-time pitfalls (both hit on the first deploy)

**Set the branch to `staging`.** Coolify defaults to `main`, and it will happily
build a months-old commit while you wonder why your fix is not there. The log
line to check is `Starting deployment of <repo>:<branch>` — read the branch and
the commit sha before diagnosing anything else.

**`NODE_ENV=production` at build time breaks the build.** Coolify passes runtime
variables into the build, and `npm ci` then skips `devDependencies` — so
`@tailwindcss/postcss` is missing and the build dies with `Cannot find module`,
a message that never mentions the real cause.

The `Dockerfile` is now immune: the deps and build stages set
`ENV NODE_ENV=development` and install with `npm ci --include=dev`, so the build
works regardless of what the orchestrator injects. You may still mark secrets as
runtime-only in Coolify to silence the `SecretsUsedInArgOrEnv` warnings, but it
is no longer required for the build to succeed.

---

## 3d. Runtime pitfalls (hit on the first successful build)

**The Prisma CLI cannot be copied selectively.** Copying
`node_modules/prisma` and `node_modules/@prisma` looks sufficient and is not:
`@prisma/config` needs `effect`, `c12`, `deepmerge-ts` and their own transitive
dependencies, so the container boots and dies on
`Cannot find module 'effect'` — a message naming a package you have never heard
of.

It is now installed into **`/opt/prisma`**, deliberately outside `/app`: the
`standalone` tree is traced precisely by Next, and running `npm install` inside
it can rearrange it and break the server itself — fixing the migration while
breaking what already worked.

**The migration runs entirely inside `/opt/prisma`.** `prisma.config.ts`
imports `prisma/config`, which cannot resolve from `/app` because the tool is
not there — it fails with `Cannot find module 'prisma/config'`, naming a module
that exists, in another directory. So the schema and the config are copied next
to the tool and the command runs with that as its working directory: everything
finds what it imports beside it.

Verified against a replica of the container layout, applying all 31 migrations
to an empty database.

**The health check needs `wget` or `curl` in the image.** `node:22-alpine`
ships busybox `wget`, so this works — but if you ever switch to a distroless
base, the health check silently starts failing and Coolify rolls back every
deploy with no error that explains why.

---

## 4. Deployment steps

1. **Postgres**: create a `carsell_staging` database. Coolify can host it, or
   use a managed one. Set `DATABASE_URL`.
2. **New Coolify resource** → Docker build from the `staging` branch. The
   `Dockerfile` at the repo root is a three-stage build; `docker-entrypoint.sh`
   runs `prisma migrate deploy` before the server starts, so the schema is never
   behind the code.
3. **Domain**: point `staging.carsell.one` (A record) at the VPS. Coolify issues
   the Let's Encrypt certificate.
4. **Health check**: already declared in the `Dockerfile` — `GET /api/health`
   touches the database, so a container with a dead database is marked unhealthy
   instead of receiving traffic.
5. **Seed** — first deploy only, from the container terminal in Coolify:
   ```bash
   cd /opt/seed && ./node_modules/.bin/tsx prisma/seed.ts
   ```

   **Not from `/app`.** The runtime tree is the one Next traced for serving:
   it has no `@prisma/adapter-pg` and no `@node-rs/argon2`, so the seed dies
   there on `Cannot find module`. `/opt/seed` carries a complete tree, the
   schema and the generated client — it exists for exactly this one command.

   The password is **not printed** when it comes from the environment:
   container logs are readable by everyone with access to the deployment panel,
   and they persist.

   Three accounts are created: `ADMIN_EMAIL` (or `super@carsell.one`) as
   SUPER_ADMIN, plus `ops@` and `finance@`.

   **Sign-in is email and password only.** TOTP was mandatory for every role;
   the designer removed it. What remains guarding the panel is the lockout —
   five failed attempts lock the account for fifteen minutes, counted on the
   account rather than the connection so changing address does not reset it,
   and every attempt is written to `AuditLog`.

   That guards against guessing, not against a leak: whoever knows the password
   is in. A strong `ADMIN_PASSWORD` is not a recommendation here.
6. **Verify** after the first deploy — see §6.

---

## 5. Deliberately not enabled on staging

- **Real payment keys.** Staging routes to the sandbox gateway. Putting live
  Moyasar keys on staging would move real money from a test environment.
- **ZATCA reporting.** Invoicing is built; signing, XML and submission are not.
  Invoices issued on staging are internal documents only.
- **The `production` value of `APP_ENV`.** Setting it would unlock live gateway
  environments and silence the sandbox — on a machine meant for testing.

---

## 6. Post-deploy verification

Run these against the live URL. Each one has failed at least once during
development, which is why it is on the list.

```bash
# The site answers, and the database is reachable
curl -fsS https://staging.carsell.one/api/health

# Screens render rather than 404 — the account pages were 404 for a whole session
for p in / /cars /auctions /dealers /services /help /help/contact /auth; do
  printf '%s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://staging.carsell.one/ar$p"
done

# The OTP code is NOT leaked — this must print nothing
curl -s -X POST https://staging.carsell.one/api/v1/auth/otp/request \
  -H 'content-type: application/json' -d '{"phone":"0512345001"}' | grep devCode

# The scheduler is reachable and guarded
curl -s -o /dev/null -w 'no secret → %{http_code}\n' \
  -X POST https://staging.carsell.one/api/cron/run
curl -fsS -X POST https://staging.carsell.one/api/cron/run \
  -H "authorization: Bearer $CRON_SECRET"
```

Then, by hand — because **tests never open a screen**, and every defect found in
the last sessions was found by clicking:

- Sign in with a phone, complete the profile (email · identity · IBAN).
- Publish a listing with a photo. Confirm **the plate is blurred** in the result.
- Buy it from a second account, pay, confirm receipt. The order must reach
  **DONE** and the sale agreement must be issued.
- Open the admin panel and walk every screen. This is the one area never
  exercised by clicking during development.

---

## 7. Known gaps you are deploying with

| Gap | Consequence on staging |
|---|---|
| **Auction deposit is ledger-only** | `holdDeposit` writes `HELD` without calling a gateway. Forfeiting a deposit forfeits a row, not money. Do not present auctions as binding. |
| ZATCA not integrated | Tax invoices are internal documents. |
| Admin panel unverified by clicking | A permissions bug and three dead approval paths were found by reading code alone; more may remain. |
| Production build blocker | Resolved, but its cause was never identified. Keep `npm run build:check` in CI so it is caught the day it returns. |
