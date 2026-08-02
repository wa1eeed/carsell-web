import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { advancePayment } from '@/lib/domain/payments';
import { providerFor } from '@/lib/payments/provider';
import type { PaymentStatus } from '@/generated/prisma/enums';

export const runtime = 'nodejs';

/** ما يرسله المزوّد ⇒ ما نكتبه عندنا. */
const MAPPING: Record<string, PaymentStatus> = {
  'payment.authorized': 'AUTHORIZED',
  'payment.captured': 'CAPTURED',
  'payment.failed': 'FAILED',
  'payment.refunded': 'REFUNDED',
};

/**
 * `POST /api/v1/webhooks/payments` — ويب هوك المزوّد.
 *
 * ثلاث حمايات، وكلٌّ منها لخطأ يكلّف مالًا:
 *   ١. **التوقيع أوّلًا**: بلا تحقّق يستطيع أيّ أحد أن يعلن دفعةً ناجحة.
 *   ٢. **المعرّف يُخزَّن قبل المعالجة**: المزوّد يعيد الإرسال عند أيّ شكّ،
 *      والمعالجة مرّتين تُفرج عن المال مرّتين.
 *   ٣. **الانتقال يُفحص**: ويب هوك متأخّر لا يقلب فشلًا إلى نجاح.
 *
 * ويعود ٢٠٠ لِما تحقّق توقيعه ولو رُفض منطقيًّا — المزوّد يعيد المحاولة
 * على أيّ رمز غير ٢٠٠، وإعادةُ ما لن يُقبل أبدًا طابورٌ لا ينتهي.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get('x-signature') ?? '';

  const integration = await db.integration.findUnique({ where: { key: 'payments' } });
  const provider = providerFor(integration?.secretsEncrypted ?? null);

  if (!provider.verifySignature(raw, signature)) {
    // لا يُخزَّن ولا يُعالَج — ومن لا توقيع له ليس المزوّد
    return new Response('invalid signature', { status: 401 });
  }

  let event: { id?: string; type?: string; paymentId?: string };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return new Response('bad payload', { status: 400 });
  }

  const id = event.id;
  if (id === undefined || event.type === undefined) {
    return new Response('missing id or type', { status: 400 });
  }

  // ═══ الحماية من الإعادة: المعرّف مفتاحٌ أساسيّ ═══
  const stored = await db.webhookEvent
    .create({
      data: {
        id,
        provider: provider.name,
        type: event.type,
        signatureOk: true,
        payload: JSON.parse(raw) as object,
      },
    })
    .catch(() => null);

  if (stored === null) return new Response('duplicate', { status: 200 });

  const target = MAPPING[event.type];
  if (target === undefined || event.paymentId === undefined) {
    await db.webhookEvent.update({ where: { id }, data: { processedAt: new Date() } });
    return new Response('ignored', { status: 200 });
  }

  await advancePayment(event.paymentId, target, 'provider', new Date(), { webhookId: id });
  await db.webhookEvent.update({ where: { id }, data: { processedAt: new Date() } });

  return new Response('ok', { status: 200 });
}
