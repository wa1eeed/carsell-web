#!/usr/bin/env bash
# نسخة احتياطية يومية لقاعدة البيانات إلى R2، باحتفاظ ٣٠ يومًا.
#
# **نسخة لم تُستعَد مرّة ليست نسخة.** انظر restore-drill.sh — يُشغَّل
# شهريًا على الأقل، وناتجه يُثبَّت في RUNBOOK.
#
# التشغيل: cron يومي ٠٣:٠٠ بتوقيت الرياض (٠٠:٠٠ UTC).
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL غير مضبوط}"
: "${R2_ACCOUNT_ID:?}"; : "${R2_ACCESS_KEY_ID:?}"; : "${R2_SECRET_ACCESS_KEY:?}"; : "${R2_BUCKET:?}"
APP_ENV="${APP_ENV:-production}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="carsell-${APP_ENV}-${STAMP}.dump"
LOCAL="/tmp/${NAME}"
KEY="backups/${APP_ENV}/${NAME}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# -Fc: صيغة مضغوطة تسمح بالاستعادة الانتقائية لجدول واحد
pg_dump --format=custom --no-owner --no-privileges --file="$LOCAL" "$DATABASE_URL"

# **يُتحقّق من الملف قبل رفعه**: dump فارغ يُرفع بنجاح ويكتشَف بعد شهر
SIZE="$(wc -c <"$LOCAL")"
if [ "$SIZE" -lt 10240 ]; then
  echo "✗ الملف ${SIZE} بايت — أصغر من أن يكون نسخة صحيحة" >&2
  exit 1
fi
pg_restore --list "$LOCAL" >/dev/null || { echo "✗ الملف غير قابل للقراءة" >&2; exit 1; }

aws s3 cp "$LOCAL" "s3://${R2_BUCKET}/${KEY}" --endpoint-url "$ENDPOINT"
rm -f "$LOCAL"

# الحذف بعد الرفع لا قبله — فشلُ الرفع لا يترك المرء بلا نسخ
CUTOFF="$(date -u -d "${RETENTION_DAYS} days ago" +%Y%m%d 2>/dev/null || date -u -v-"${RETENTION_DAYS}"d +%Y%m%d)"
aws s3 ls "s3://${R2_BUCKET}/backups/${APP_ENV}/" --endpoint-url "$ENDPOINT" \
| awk '{print $4}' | while read -r old; do
  [ -z "$old" ] && continue
  DAY="$(printf '%s' "$old" | sed -n 's/.*-\([0-9]\{8\}\)T.*/\1/p')"
  [ -z "$DAY" ] && continue
  if [ "$DAY" -lt "$CUTOFF" ]; then
    aws s3 rm "s3://${R2_BUCKET}/backups/${APP_ENV}/${old}" --endpoint-url "$ENDPOINT"
  fi
done

echo "✓ ${KEY} · ${SIZE} بايت · الاحتفاظ ${RETENTION_DAYS} يومًا"
