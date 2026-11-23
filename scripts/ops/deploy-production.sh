#!/usr/bin/env bash
# نشرُ الإنتاج — من `main` وحده.
#
# ═══ والصورةُ تُوسَم بالتزامها ═══
#
# `latest` وحدها تعني أنّ الرجوع إلى ما قبل العطل **إعادةُ بناءٍ**
# عشرين دقيقة، والموقع ساقطٌ طوالها. فكلُّ نشرةٍ تحمل وسمَ التزامها،
# والرجوع تبديلُ حاويةٍ في ثوان.
#
# ═══ ولا يُعلَن النجاح إلّا بعد أن يردّ الخادم ═══
#
# حاويةٌ تقلع ثمّ تموت على أوّل طلب تُبقي السكربت فرحًا والموقعَ ساقطًا.
# فالفحص بعد التشغيل، والرجوعُ تلقائيٌّ إن سقط.
set -Eeuo pipefail

APP_DIR=/opt/carz
NAME=carz
NET=carz-net
HEALTH=http://127.0.0.1:3000/api/health

cd "$APP_DIR"

PREVIOUS="$(docker inspect --format '{{.Config.Image}}' "$NAME" 2>/dev/null || echo '')"
BEFORE="$(git rev-parse --short HEAD)"
git fetch --quiet origin
AFTER="$(git rev-parse --short origin/main)"

if [ "$BEFORE" = "$AFTER" ] && [ "${1-}" != "--force" ]; then
  echo "لا جديد على main — الحالي $BEFORE. (--force لإعادة البناء)"
  exit 0
fi

echo "→ $BEFORE ⟶ $AFTER"
git reset --hard "origin/main" --quiet

echo "→ البناء (يأخذ ٢٠–٣٥ دقيقة على نواتين)…"
docker build -t "${NAME}:${AFTER}" -t "${NAME}:latest" . >/tmp/deploy-build.log 2>&1 || {
  echo "✗ سقط البناء — آخر السجلّ:" >&2
  tail -25 /tmp/deploy-build.log >&2
  echo "  والحاوية القديمة ما زالت تعمل: لم يُلمَس شيء." >&2
  exit 1
}

echo "→ تبديل الحاوية…"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --restart unless-stopped \
  --env-file "$APP_DIR/.env.secrets" --env-file "$APP_DIR/.env.config" \
  --network "$NET" -p 127.0.0.1:3000:3000 "${NAME}:${AFTER}" >/dev/null

echo "→ الفحص…"
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 "$HEALTH" >/dev/null 2>&1; then
    echo "✓ نُشر ${AFTER} — ردّ الخادم بعد $((i*3)) ثانية"
    docker logs "$NAME" 2>&1 | grep -E "البيانات المرجعية|مزامنة الأدمن|Ready in" | tail -4
    exit 0
  fi
  sleep 3
done

echo "✗ لم يردّ الخادم خلال ٩٠ ثانية — سجلّه:" >&2
docker logs --tail 30 "$NAME" >&2

if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "${NAME}:${AFTER}" ]; then
  echo "→ الرجوع إلى ${PREVIOUS}…" >&2
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --restart unless-stopped \
    --env-file "$APP_DIR/.env.secrets" --env-file "$APP_DIR/.env.config" \
    --network "$NET" -p 127.0.0.1:3000:3000 "$PREVIOUS" >/dev/null
  echo "✓ رجعنا إلى ${PREVIOUS}" >&2
fi
exit 1
