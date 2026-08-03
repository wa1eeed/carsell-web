# Runbook

**Commands, not explanations.** Copy, paste, read the output.

Every procedure here assumes `.env` is loaded:

```bash
set -a; . ./.env; set +a
```

---

## Backups

Daily at 00:00 UTC (03:00 Riyadh), 30-day retention.

```bash
./scripts/ops/backup.sh
```

Cron entry on the host:

```bash
0 0 * * * cd /app && set -a && . ./.env && set +a && ./scripts/ops/backup.sh >> /var/log/carsell-backup.log 2>&1
```

The script **verifies before uploading**: a dump under 10 KB or one `pg_restore --list`
cannot read is rejected. An empty dump uploads successfully and is discovered a month later.

Old copies are deleted **after** the upload succeeds — a failed upload must never leave you
with no backups.

### Restore drill — the only proof a backup works

```bash
./scripts/ops/restore-drill.sh              # newest from R2
./scripts/ops/restore-drill.sh /tmp/x.dump  # a specific file
```

Restores into a throwaway database, **counts rows**, drops it. It never touches production.
Row counting matters: `pg_restore` exits 0 on an empty database.

**Run monthly. Paste the output below with its date.**

#### Last drill — 2026-08-02 · PASSED

```
── الصفوف المستعادة ──
  User                 26
  Listing              60
  Vehicle              60
  Order                13
  Offer                3
  InspectionReport     2
✓ الاستعادة نجحت
```

---

## Site is down

```bash
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' https://carsell.one/ar
docker ps --filter name=carsell --format '{{.Names}}\t{{.Status}}'
docker logs --tail 200 carsell-web
docker restart carsell-web
```

Still down — is it the database?

```bash
psql "$DATABASE_URL" -tAc 'select 1'
```

Roll back to the previous image:

```bash
docker ps -a --filter name=carsell-web --format '{{.Image}}'
docker stop carsell-web && docker rm carsell-web
docker run -d --name carsell-web --env-file .env -p 3000:3000 <previous-image-tag>
```

---

## Database is down

```bash
psql "$DATABASE_URL" -tAc 'select 1'
docker logs --tail 200 carsell-db
df -h /var/lib/postgresql          # full disk is the usual cause
```

```bash
docker restart carsell-db
sleep 5 && psql "$DATABASE_URL" -tAc 'select now()'
```

Connections exhausted:

```bash
psql "$DATABASE_URL" -c "select count(*), state from pg_stat_activity group by state;"
psql "$DATABASE_URL" -c "select pg_terminate_backend(pid) from pg_stat_activity
                          where state = 'idle' and state_change < now() - interval '10 minutes';"
```

---

## Redis is down

**The site keeps serving.** Redis carries realtime publishing only (one-way, Next → realtime
service); truth is in Postgres. Auctions fall back to REST polling — see
`docs/architecture/realtime.md`.

```bash
redis-cli -u "$REDIS_URL" ping
docker logs --tail 100 carsell-redis
docker restart carsell-redis
```

Confirm publishing resumed:

```bash
redis-cli -u "$REDIS_URL" --timeout 5 subscribe 'auction:*'
```

---

## Restore a backup into production

**Destructive. Take a fresh dump first.**

```bash
pg_dump --format=custom --no-owner --file=/tmp/pre-restore.dump "$DATABASE_URL"

aws s3 ls "s3://$R2_BUCKET/backups/production/" \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" | sort | tail -5

aws s3 cp "s3://$R2_BUCKET/backups/production/<file>.dump" /tmp/restore.dump \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
```

Prove it before applying it:

```bash
./scripts/ops/restore-drill.sh /tmp/restore.dump
```

Then:

```bash
docker stop carsell-web
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" /tmp/restore.dump
npx prisma migrate status
docker start carsell-web
```

---

## Rotate a leaked key

Order matters: **new key first, old key revoked last.** Revoking first is an outage.

### Database password

```bash
psql "$ADMIN_DATABASE_URL" -c "ALTER USER carsell WITH PASSWORD '<new>';"
# update DATABASE_URL in the environment, then
docker restart carsell-web
psql "$DATABASE_URL" -tAc 'select 1'
```

### R2 keys

1. Create a new API token in the Cloudflare dashboard.
2. Update `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`, restart, verify:

```bash
aws s3 ls "s3://$R2_BUCKET/" --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" | head
```

3. Delete the old token.

### Session signing secret (`AUTH_SECRET`)

**Rotating it signs every user out.** That is the intended effect when a leak is suspected.

```bash
openssl rand -base64 48
# set AUTH_SECRET, then
docker restart carsell-web
```

Admin sessions are separate and also invalidated — expected, and desirable here.

### If the key reached a git commit

The secret is compromised **permanently**; rotation is mandatory, not optional. Removing it
from history does not un-leak it, and history rewriting breaks every clone. Rotate, then:

```bash
git log --all --oneline -S '<fragment>' | head
```

Document what leaked, when, and when it was rotated.

---

## Environments

| | `staging` | `main` |
|---|---|---|
| Branch role | **working branch** | production, **manual merge only** |
| `APP_ENV` | `staging` | `production` |
| Database | `carsell_staging` | `carsell_production` |
| R2 prefix | `staging/` | `production/` |
| Banner | shown atop the admin panel | none |

```bash
git checkout staging       # work here
git checkout main && git merge --no-ff staging && git push origin main   # deliberate promotion
```

Never `git push origin main` from a feature branch. The `--no-ff` keeps the promotion
visible as one commit in history.
