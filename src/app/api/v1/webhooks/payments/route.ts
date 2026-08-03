import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/api/rate-limit';
import { applyState } from '@/lib/domain/payments';
import { resolveForPayment } from '@/lib/payments/resolve';
import type { PaymentStatus } from '@/generated/prisma/enums';

export const runtime = 'nodejs';

/** ما ترسله البوابة ⇒ ما نكتبه عندنا — بلغة الضمان. */
const MAPPING: Record<string, PaymentStatus> = {
  payment_authorized: 'HELD',
  payment_captured: 'SETTLED',
  payment_paid: 'SETTLED',
  payment_voided: 'CANCELLED',
  payment_refunded: 'RETURNED',
  payment_failed: 'FAILED',
};

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
  if (!gateway.verifySignature(raw, signature)) {
    // لا يُخزَّن ولا يُعالَج — ومن لا توقيع له ليس البوابة
    return new Response('invalid signature', { status: 401 });
  }

  const stored = await db.webhookEvent
    .create({
      data: {
        id: event.id,
        provider: payment.gatewayKey,
        type: event.type,
        signatureOk: true,
        payload: JSON.parse(raw) as object,
      },
    })
    .catch(() => null);

  if (stored === null) return new Response('duplicate', { status: 200 });

  const target = MAPPING[event.type];
  if (target !== undefined) {
    await applyState(payment.id, target, 'gateway', new Date(), { webhookId: event.id });
  }
  await db.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });

  return new Response('ok', { status: 200 });
}
