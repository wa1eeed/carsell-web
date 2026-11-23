# Production on SCCC — `carz.sa`

_Last updated: 2026-11-23_

Staging is `carsell.one` on Coolify. **Production is `carz.sa` on an SCCC
(Alibaba Cloud, Riyadh) ECS**, with a managed PostgreSQL instance beside it.
This file is what was actually built on 2026-11-23, measured as it was built.

---

## 1. What runs where

| Piece | Where | Detail |
|---|---|---|
| App | ECS `i-l4vhcnkp5og9f3fc9ou5`, Riyadh Zone B | `ecs.t6-c1m2.large` · 2 vCPU · 3.5 GiB usable · 50 GB ESSD · **5 Mbps** |
| Database | ApsaraDB RDS `pgm-l4vw70i6v79b21f8` | PostgreSQL 16 Basic · 2 vCPU · 4 GiB · 20 GB · private VPC only |
| Media | Cloudflare R2 | prefix `production/`, set by `r2Key()` |
| Backups | *(not yet)* OSS bucket in Riyadh | `scripts/ops/backup.sh` reads `BACKUP_*` |
| TLS + proxy | Caddy container | Let's Encrypt, auto-renewing |

Both sit in VPC `vpc-l4vp4vqdyuz0y54au4jms` on vSwitch
`vsw-l4vd94nh5ei3ftdu7tsqq`, so the app reaches the database over the private
network. **The database has no public endpoint**; its whitelist holds the VPC
CIDR and nothing else.

### Why the database is small

Measured on the fully seeded development database — 62 listings, 13 orders, 84
bids, the whole 42-brand catalogue, 428 image rows, the ledger and the invoices:
**22 MB**. Images live on R2, so the database holds their keys only.

Projected at 10,000 listings · 50,000 users · 5,000 orders · 5,000 inspection
reports: **6–8 GB**, and most of that is logs — notifications, audit rows,
webhook payloads — not business data. 20 GB with automatic expansion enabled is
therefore generous, and expansion is online. Starting at the console's default
of 100 GB would have cost 425 SAR/month instead of 295 for storage nobody needs.

---

## 2. The boot sequence

`docker-entrypoint.sh`, in order, and it stops at the first failure:

1. **Required variables** — `DATABASE_URL`, `JWT_SECRET` (≥32), `OTP_PEPPER`,
   `SECRETS_KEY` (≥32), `CRON_SECRET`. All are checked and **all missing ones
   are printed at once**; stopping at the first would cost a deploy cycle each.
2. **`prisma migrate deploy`** — from inside `/opt/prisma`, because
   `prisma.config.ts` imports `prisma/config` and will not resolve from `/app`.
3. **`prisma/admin-sync.ts`** — reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` on every
   boot, so changing the variable and redeploying changes the password.
4. **`prisma/plant-reference.ts`** — the reference bootstrap (§39 of the
   roadmap). Inserts what is missing, never updates. Safe on every boot.
5. `node server.js`.

The first production boot printed exactly this:

```
All migrations have been successfully applied.
→ مزامنة حساب الأدمن…
✓ مزامنة الأدمن: أُنشئ الحساب — waleed.7x@gmail.com
→ البيانات المرجعية…
✓ زُرعت البيانات المرجعية الناقصة:
   42 ماركة · 303 طراز · 360 فئة · 39 ميزة · 14 قاعدة ضريبية
   8 خدمات · 45 قالب إشعار · 4 بوابات دفع · 6 مسارات · 24 سؤالًا
   8 مستندات قانونية · 3 باقات · 2 قاعدة عمولة
✓ Ready in 171ms
```

Without step 4 the database would have held 10 notification templates, 7 push
channels, one inspection template and two SEO templates — and nothing else.

---

## 3. Two defects the first clean build found

Neither could have surfaced before, because **nothing had ever built without an
orchestrator injecting the environment**: Next reads `.env` locally, Coolify
passes its runtime variables into the build, and CI sets `DATABASE_URL` because
the seed needs it.

**`src/lib/db.ts` threw at module scope.** `next build` imports every route to
collect page data, so the first route touching the database killed the build —
and Next blamed whichever route the collector reached first, a name that changed
between runs. The client is now built on first use; the message is unchanged;
`docker-entrypoint.sh` remains the real guard. See `tests/db-import.test.ts`.

**`robots.txt` was prerendered.** It is a static route, so Next baked the
build-time environment into `.next/server/app/robots.txt.body` — 27 bytes saying
`Disallow: /`. The container said `APP_ENV=production` and the file said
otherwise, and **nothing would ever have reported it**. `sitemap.xml` is dynamic,
so the two contradicted each other in the same release. Now `force-dynamic`. See
`tests/robots-dynamic.test.ts`.

---

## 4. Deploying an update

`main` is production. `staging` is Coolify. CI runs the seed, `npm run verify`
and `build:check` on both branches, so nothing red gets merged.

```
work → commit on staging → Coolify deploys → check carsell.one
     → merge staging into main → deploy here
```

On the server, one command:

```sh
carz-deploy          # fetches main, builds, swaps, health-checks
carz-deploy --force  # rebuild the same commit
```

It is `scripts/ops/deploy-production.sh`, installed to `/usr/local/bin`. It:

- refuses to do anything when `main` has not moved;
- **tags the image with the commit** (`carz:4a0957f`), so a rollback is a
  container swap in seconds instead of a twenty-minute rebuild with the site
  down meanwhile;
- leaves the running container untouched if the build fails;
- polls `/api/health` for ninety seconds after the swap and **rolls back to the
  previous image by itself** if nothing answers — a container that boots and
  then dies on the first request would otherwise leave the script happy and the
  site down.

The build takes 20–35 minutes on two cores. **4 GB of swap is why it finishes**
— `next build` does not fit in 3.5 GiB.

### Rolling back by hand

```sh
docker images carz                      # the tags are commits
docker rm -f carz
docker run -d --name carz --restart unless-stopped \
  --env-file /opt/carz/.env.secrets --env-file /opt/carz/.env.config \
  --network carz-net -p 127.0.0.1:3000:3000 carz:<commit>
```

A rollback does **not** undo a migration. Migrations run forward at boot and are
written to be additive; a release that needs a schema reversal needs a new
migration, not a rollback.

---

## 5. Where the secrets live

`/opt/carz/.env.secrets` (mode 600, generated on the server, never copied) and
`/opt/carz/.env.config` (not secret). Both are passed with `--env-file`.

The four application secrets were generated with `openssl rand` **on the server**
and differ from staging's on purpose: a shared secret means a leak in a test
environment opens production.

---

## 6. What is still missing

| Missing | What it blocks | Fails how |
|---|---|---|
| `R2_*` | Listing images | `storeObject` returns `null`; the seller stops at step 4 of the wizard |
| Moyasar live keys | Every payment | `/admin/payments` already says so on its first card |
| `BACKUP_*` + OSS bucket | Backups | Nothing yet — and that is the point |
| Cloudflare CDN | Nothing today | 5 Mbps is the ceiling until then (roadmap §"Also open") |

**The database has no backup today.** `scripts/ops/backup.sh` is written and
reads `BACKUP_*` independently of `R2_*` so the dump does not land in the public
media bucket. It needs an OSS bucket in Riyadh and a cron entry.

---

## 7. Pre-launch checklist

- [ ] R2 bucket and keys for production, separate from staging's
- [ ] Moyasar live keys, and `/admin/payments` routed off `bank_escrow`
- [ ] OSS backup bucket, `BACKUP_*` set, `backup.sh` on a daily cron
- [ ] One restore drill (`scripts/ops/restore-drill.sh`) with its output in
      `docs/RUNBOOK.md` — a backup never restored is not a backup
- [ ] Cloudflare in front, **Full (Strict)** with an origin certificate
- [ ] Tag the release before the first public traffic
- [ ] Confirm `robots.txt` says `Allow: /` on the live site, not in the source
