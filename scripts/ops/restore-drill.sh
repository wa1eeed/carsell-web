#!/usr/bin/env bash
# استعادة تجريبية — **الدليل الوحيد على أن النسخة تعمل**.
#
# يستعيد أحدث نسخة إلى قاعدة مؤقّتة، ويتحقّق من أن الصفوف وصلت،
# ثم يحذفها. لا يمسّ قاعدة الإنتاج بحال.
#
# يُشغَّل شهريًا، وناتجه يُلصق في RUNBOOK بتاريخه.
set -Eeuo pipefail

: "${DATABASE_URL:?}"
DRILL_DB="${DRILL_DB:-carsell_drill}"
SOURCE="${1:-}"

if [ -z "$SOURCE" ]; then
  : "${R2_ACCOUNT_ID:?}"; : "${R2_BUCKET:?}"
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION=auto
  ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  APP_ENV="${APP_ENV:-production}"

  LATEST="$(aws s3 ls "s3://${R2_BUCKET}/backups/${APP_ENV}/" --endpoint-url "$ENDPOINT" \
            | sort | tail -1 | awk '{print $4}')"
  [ -z "$LATEST" ] && { echo "✗ لا نسخ في التخزين" >&2; exit 1; }
  SOURCE="/tmp/${LATEST}"
  aws s3 cp "s3://${R2_BUCKET}/backups/${APP_ENV}/${LATEST}" "$SOURCE" --endpoint-url "$ENDPOINT"
fi

ADMIN_URL="${DATABASE_URL%/*}/postgres"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${DRILL_DB}\";"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DRILL_DB}\";"

DRILL_URL="${DATABASE_URL%/*}/${DRILL_DB}"
pg_restore --no-owner --no-privileges --dbname="$DRILL_URL" "$SOURCE"

# **التحقّق بالصفوف لا بخروج الأمر**: pg_restore يخرج بنجاح على قاعدة فارغة
echo "── الصفوف المستعادة ──"
FAIL=0
for table in User Listing Vehicle Order Offer InspectionReport; do
  N="$(psql "$DRILL_URL" -tAc "SELECT count(*) FROM \"${table}\";" 2>/dev/null || echo 0)"
  printf '  %-20s %s\n' "$table" "$N"
  [ "$N" -eq 0 ] && FAIL=1
done

psql "$ADMIN_URL" -c "DROP DATABASE \"${DRILL_DB}\";" >/dev/null

if [ "$FAIL" -eq 1 ]; then
  echo "✗ جدول واحد على الأقل فارغ — النسخة غير صالحة" >&2
  exit 1
fi
echo "✓ الاستعادة نجحت من ${SOURCE}"
