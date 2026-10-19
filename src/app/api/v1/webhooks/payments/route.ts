import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  WEBHOOK_STATUS,
  closeWebhook,
  countRepeat,
  openWebhook,
  recordBadSignature,
} from '@/lib/domain/webhooks';
import { clientIp, rateLimit } from '@/lib/api/rate-limit';
import type { PaymentRefs } from '@/lib/domain/payments';
import { applyState } from '@/lib/domain/payments';
import { resolveForPayment } from '@/lib/payments/resolve';

export const runtime = 'nodejs';

/**
 * ما ترسله البوابة ⇒ ما نكتبه عندنا — **وقائمتُها في النطاق**:
 * تقرؤها الشاشةُ أيضًا لتقول «نوعٌ لا يقابله حالٌ عندنا»، ونسختان
 * تتباعدان أوّلَ نوعٍ يُضاف.
 */

/**
 * `POST /api/v1/webhooks/payments` — ويبهوك البوابة.
 *
 * ثلاث حمايات، وكلٌّ لخطأ يكلّف مالًا:
 *   ١. **التوقيع أوّلًا** — بلا تحقّق يستطيع أيّ أحد أن يعلن دفعةً ناجحة.
 *   ٢. **المعرّف يُخزَّن قبل المعالجة** — البوابة تعيد الإرسال عند أيّ شكّ.
 *   ٣. **الانتقال يُفحص** — ويبهوك متأخّر لا يقلب فشلًا إلى نجاح.
 *
 * ويعود ٢٠٠ لِما تحقّق توقيعه ولو رُفض منطقيًّا: البوابة تعيد المحاولة
 * على أيّ رمز غير ٢٠٠، وإعادةُ ما لن يُقبل أبدًا طابورٌ لا ينتهي.
 */
/** ستّون في الدقيقة لكل عنوان — تخمينٌ يحتاج آلافًا يصير غير عمليّ. */
const WEBHOOK_LIMIT = 60;
const WEBHOOK_WINDOW_SECONDS = 60;

export async function POST(request: NextRequest) {
  /**
   * الحدّ **قبل أي عمل**: مسارٌ يقرأ الجسم ويستعلم عن المعاملة قبل
   * الحدّ يمنح المُخمِّن استعلامًا مجّانيًّا لكل محاولة.
   *
   * وهو يمنع أيضًا التمييز بين ٤٠٤ و٤٠١ من كثرة المحاولات — وذاك
   * التسريب النظريّ الوحيد في المسار (راجع payments.md § 8b).
   */
  const verdict = rateLimit(
    `webhook:${clientIp(request.headers)}`,
    WEBHOOK_LIMIT,
    WEBHOOK_WINDOW_SECONDS,
  );
  if (!verdict.allowed) {
    return new Response('too many requests', {
      status: 429,
      headers: { 'retry-after': String(verdict.retryAfterSeconds) },
    });
  }

  const raw = await request.text();
  const signature = request.headers.get('x-signature') ?? '';

  let event: { id?: string; type?: string; data?: { id?: string } };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return new Response('bad payload', { status: 400 });
  }

  const holdRef = event.data?.id;
  if (event.id === undefined || event.type === undefined || holdRef === undefined) {
    return new Response('missing id, type or reference', { status: 400 });
  }

  // البوابة تُستنتج من المعاملة نفسها — لا من التوجيه الجاري
  const payment = await db.payment.findFirst({ where: { holdRef } });
  if (payment === null) return new Response('unknown reference', { status: 404 });

  const gateway = await resolveForPayment(payment.gatewayKey, payment.environment);
  const envelope = {
    id: event.id,
    provider: payment.gatewayKey,
    type: event.type,
    paymentId: payment.id,
    payload: JSON.parse(raw) as object,
  };

  if (!gateway.verifySignature(raw, signature)) {
    /**
     * ═══ ولا يُعالَج — لكنّه يُسجَّل ═══
     *
     * كان يُردّ ٤٠١ **قبل** التخزين، فعمودُ `signatureOk` الذي وُضع
     * لتسجيل الرفض لم يسجّل رفضًا قطّ. **وسلسلةُ رفضٍ هي بعينها شكلُ
     * مفتاحٍ دُوِّر خطأً أو من يُجرّب** — ولا شيء كان يُريها.
     *
     * والتسجيلُ محدود: المرجعُ يطابق دفعةً عندنا، ولكلّ دفعةٍ سقف.
     */
    await recordBadSignature(envelope);
    return new Response('invalid signature', { status: 401 });
  }

  const opened = await openWebhook(envelope);
  // **وإعادةُ الإرسال تُعدّ** — كانت تُردّ ٢٠٠ بلا أثر في مكان
  if (!opened) {
    await countRepeat(event.id).catch(() => null);
    return new Response('duplicate', { status: 200 });
  }

  const target = WEBHOOK_STATUS[event.type];
  if (target !== undefined) {
    /**
     * ═══ والتحصيل يُحفظ بمرجعه ═══
     *
     * `payment_captured` و`payment_paid` يُفضيان إلى `SETTLED`، وكان
     * النداء يمرّ **بلا مراجع** — فتُكتب الحال ويبقى `settleRef` فارغًا.
     * والمطابقة اليومية تقرأ `settleRef ?? holdRef`، فتُطابق بمرجع
     * الحجز وتقرير البوّابة يحمل مرجع التحصيل: فرقٌ يوميّ لا سبب له.
     *
     * وقد أُصلح هذا في تسوية الطلبات والتسوية اليدوية، **وبقي مسار
     * الويبهوك** — وهو المسار الذي تمرّ منه البوّابة الحقيقية. والبوّابة
     * تُخاطبنا بمرجع الحجز (به وجدنا الدفعة)، فهو مرجع التحصيل عندها.
     *
     * **وما تقوله البوّابة لا ما نتذكّره**: المبلغ المُحصَّل من
     * `status` لا من حمولة الويبهوك — فحمولةٌ منقوصةٌ تُنتج رقمًا
     * ناقصًا في الدفتر.
     */
    let refs: PaymentRefs | undefined;
    if (target === 'SETTLED' || target === 'PARTIALLY_SETTLED') {
      const live = await gateway.status(holdRef).catch(() => null);
      refs = {
        settleRef: holdRef,
        ...(live?.settledAmount === null || live?.settledAmount === undefined
          ? {}
          : { settledAmount: live.settledAmount }),
      };
    }
    const result = await applyState(
      payment.id,
      target,
      'gateway',
      new Date(),
      { webhookId: event.id },
      refs,
    );

    /**
     * ═══ ونتيجةُ `applyState` تُسجَّل ═══
     *
     * كانت تُهمَل: البوّابة تقول «حُصِّل»، وويبهوكٌ متأخّر يُرفض
     * انتقالُه، ويُكتب الصفُّ «معالَجًا» — **ولا أثرَ للرفض في مكان**،
     * فيقف المشغّل أمام دفعةٍ لم تتحرّك بلا سببٍ مكتوب.
     */
    await closeWebhook(
      event.id,
      result.ok ? 'APPLIED' : 'REFUSED',
      result.ok ? result.status : null,
      result.ok ? null : result.reason,
    );
  } else {
    // نوعٌ لا يقابله حالٌ عندنا — وصل وسُجّل ولم يُغيّر شيئًا
    await closeWebhook(event.id, 'UNMAPPED', null, null);
  }

  return new Response('ok', { status: 200 });
}
