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
SEED_ADMIN_PASSWORD=<a strong password you keep>
```

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

Add a scheduled job in Coolify, every 5 minutes:

```bash
curl -fsS -X POST https://staging.carsell.one/api/cron/run \
  -H "authorization: Bearer $CRON_SECRET"
```

It returns `500` when any job fails, so the scheduler can alert. Without
`CRON_SECRET` set, the route answers `503` and does nothing — it fails closed,
not open.

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
5. **Seed** (first deploy only):
   ```bash
   npm run db:seed
   ```
   It creates the admin user with `SEED_ADMIN_PASSWORD` and TOTP. Keep both.
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
