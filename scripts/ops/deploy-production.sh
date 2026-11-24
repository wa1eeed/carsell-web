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

# ═══ و«الحالي» ما يعمل لا ما في الشجرة ═══
#
# `git reset --hard` يقع **قبل** البناء، فبناءٌ يسقط يترك الشجرة على
# الالتزام الجديد والحاويةَ على القديم. والتشغيلُ التالي يقارن الشجرة
# بـ`origin/main` فيجدهما سواءً، فيقول «لا جديد» **ويخرج بصفر** —
# والموقعُ ما زال على ما قبله. فيُقرأ الفشلُ نجاحًا، ويقف النشر حتى
# يمرّ أحدٌ بـ`--force` لا يعرف أنه يحتاجه.
#
# وقع فعلًا ٢٠٢٦-١١-٢٥: سقط البناء لامتلاء القرص، فأعدتُ النشر
# **مرّتين** وكلتاهما قالت «لا جديد».
#
# فالمقارنةُ بوسم الحاوية العاملة — وهو وحده يقول ما يصل الزائر.
RUNNING_TAG="$(printf '%s' "$PREVIOUS" | sed 's/^.*://')"
if [ "$RUNNING_TAG" = "$AFTER" ] && [ "${1-}" != "--force" ]; then
  echo "لا جديد — الحاوية تعمل على $AFTER. (--force لإعادة البناء)"
  exit 0
fi

if [ "$BEFORE" = "$AFTER" ] && [ "$RUNNING_TAG" != "$AFTER" ]; then
  echo "· الشجرة على $AFTER والحاوية على ${RUNNING_TAG:-—} — يُعاد البناء."
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

    # ═══ وتُحذف الصورُ المتجاوَزة — وإلّا نفد القرص ═══
    #
    # كلُّ نشرةٍ تترك صورةً بـ١٫٥٧ غيغابايت ولا يحذفها شيء. وقِيس بعد
    # عشرين نشرة: القرصُ ٩٨٪ (١٫٤ غ فارغة من ٤٩)، و**سقط البناءُ عند
    # استخراج طبقة** برسالةٍ تتّهم الطبقة لا القرص:
    # "failed to extract layer … write". والحاويةُ القديمة نجت بحقّ،
    # فالنشرُ لا يتقدّم وسببُه غيرُ مذكور في رسالته.
    #
    # **وتُبقى السابقةُ**: هي هدفُ التراجع أدناه، وحذفُها يجعل فشلَ
    # النشرة التالية بلا رجعة. والحذفُ بعد نجاح الفحص لا قبله.
    PREV_TAG="$(printf '%s' "$PREVIOUS" | sed 's/^.*://')"
    docker images --format '{{.Repository}}:{{.Tag}}' \
      | grep "^${NAME}:" \
      | grep -Ev "^${NAME}:(${AFTER}|${PREV_TAG:-__none__}|latest)$" \
      | xargs -r docker rmi -f >/dev/null 2>&1 || true
    docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
    echo "· نُظّفت الصورُ المتجاوَزة — الفارغ على القرص $(df -h / | awk 'NR==2 {print $4}')"
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
