import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { payServiceRequest, type PayFailure } from '@/lib/domain/service-lifecycle';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/service-requests/{ref}/pay` — السداد **بعد الإذن**.
 *
 * وفُصل عن الطلب بقرار المالك: دفعةٌ تُؤخذ قبل إذنٍ قد لا يأتي تحبس
 * مالًا على بطاقةٍ لصفقةٍ لم تبدأ.
 */
const Body = z.object({
  method: z.enum(['mada', 'visa', 'mastercard', 'applepay']),
  returnUrl: z.string().url().max(500),
});

const MESSAGES: Record<PayFailure, { ar: string; en: string; status: number }> = {
  REQUEST_NOT_FOUND: { ar: 'لم نجد هذا الطلب.', en: 'Request not found.', status: 404 },
  NOT_REQUESTER: { ar: 'هذا الطلب ليس لك.', en: 'This request is not yours.', status: 403 },
  NOT_AWAITING_PAYMENT: {
    ar: 'الطلب لا ينتظر سدادًا الآن.',
    en: 'This request is not awaiting payment.',
    status: 409,
  },
  NO_ROUTE: { ar: 'لا توجد بوابة دفع مضبوطة.', en: 'No payment route configured.', status: 503 },
  ROUTE_DISABLED: { ar: 'بوابة الدفع معطّلة مؤقتًا.', en: 'The payment route is disabled.', status: 503 },
  GATEWAY_FAILED: { ar: 'تعذّر حجز المبلغ — جرّب وسيلة أخرى.', en: 'The hold failed — try another method.', status: 402 },
  REQUIRES_ACTION: { ar: 'يلزم إكمال التحقّق من بطاقتك.', en: 'Your card needs verification.', status: 402 },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  /**
   * **`Idempotency-Key` إلزامي**: الشبكة تُعيد الطلب بلا أن يعرف
   * المستخدم، فيُحجز المال مرّتين على طلبٍ واحد.
   */
  const key = request.headers.get('idempotency-key');
  if (key === null || key.trim() === '') {
    return fail(ERRORS.VALIDATION({ 'idempotency-key': 'REQUIRED' }), 422);
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const { ref } = await params;
  const result = await payServiceRequest({
    ref,
    requesterId: user.id,
    method: parsed.data.method,
    returnUrl: parsed.data.returnUrl,
    idempotencyKey: key,
  });

  if (!result.ok) {
    const message = MESSAGES[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: message.ar,
        messageEn: message.en,
        ...(result.actionUrl === undefined ? {} : { actionUrl: result.actionUrl }),
      },
      message.status,
    );
  }

  return ok({ paymentId: result.paymentId, total: result.total });
}
