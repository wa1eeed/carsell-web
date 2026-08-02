import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  checkIdempotency,
  rememberIdempotency,
  startPayment,
} from '@/lib/domain/payments';
import { providerFor } from '@/lib/payments/provider';

export const runtime = 'nodejs';

const Body = z.object({
  orderRef: z.string().min(3).max(40),
  method: z.enum(['mada', 'visa', 'mastercard', 'applepay']),
  returnUrl: z.string().url().max(500),
});

/**
 * `POST /api/v1/payments` — بدء دفعة.
 *
 * **`Idempotency-Key` إلزامي** (القسم ٦). الشبكة تُعيد الطلب بلا أن
 * يعرف المستخدم، والمتصفّح يُعيده بضغطة تحديث — وبلا المفتاح تُخصم
 * البطاقة مرّتين. وغيابه رفضٌ بـ٤٠٠ لا تسامحٌ: التسامح هنا يعني أن أوّل
 * عميل بشبكة سيّئة يدفع مرّتين.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const key = request.headers.get('idempotency-key');
  if (key === null || key.length < 8 || key.length > 200) {
    return fail(ERRORS.VALIDATION({ 'idempotency-key': 'REQUIRED' }), 400);
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return fail(ERRORS.VALIDATION({ orderRef: 'INVALID' }), 422);

  const seen = await checkIdempotency(key, 'payment.create', raw);
  if (seen.kind === 'conflict') {
    return fail(ERRORS.VALIDATION({ 'idempotency-key': 'REUSED_WITH_DIFFERENT_BODY' }), 409);
  }
  if (seen.kind === 'replay') {
    // الاستجابة الأولى حرفيًّا — لا تنفيذ ثانٍ
    return ok(seen.response, undefined, { status: seen.status });
  }

  const integration = await db.integration.findUnique({ where: { key: 'payments' } });
  const provider = providerFor(integration?.secretsEncrypted ?? null);

  const result = await startPayment(
    { ...parsed.data, buyerId: user.id, idempotencyKey: key },
    provider,
  );

  if (!result.ok) {
    const status = result.reason === 'ORDER_NOT_FOUND' ? 404
      : result.reason === 'NOT_BUYER' ? 403
      : result.reason === 'PROVIDER_FAILED' ? 502
      : 409;
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'PROVIDER_FAILED'
            ? 'تعذّر بدء الدفع الآن. لم يُخصم من بطاقتك شيء.'
            : 'لا يمكن بدء الدفع لهذا الطلب.',
        messageEn:
          result.reason === 'PROVIDER_FAILED'
            ? 'Could not start the payment. Your card was not charged.'
            : 'This order cannot be paid right now.',
      },
      status,
    );
  }

  const payload = {
    paymentId: result.paymentId,
    status: result.status,
    threeDsUrl: result.threeDsUrl,
  };
  await rememberIdempotency(key, 'payment.create', raw, payload, 201);
  return ok(payload, undefined, { status: 201 });
}
