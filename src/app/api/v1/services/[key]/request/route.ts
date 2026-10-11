import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import {
  purchaseService,
  type ServicePurchaseFailure,
} from '@/lib/domain/service-purchase';

export const runtime = 'nodejs';

const Body = z.object({
  vehicleId: z.string().min(1).max(40),
  city: z.string().min(1).max(60),
  scheduledAt: z.string().datetime().nullable(),
  method: z.enum(['mada', 'visa', 'mastercard', 'applepay']),
  returnUrl: z.string().url().max(500),
});

const MESSAGES: Record<ServicePurchaseFailure, { ar: string; en: string; status: number }> = {
  SERVICE_UNKNOWN: { ar: 'هذه الخدمة غير متاحة.', en: 'This service is unavailable.', status: 404 },
  VEHICLE_NOT_YOURS: {
    ar: 'اختر مركبةً من مركباتك.',
    en: 'Choose one of your own vehicles.',
    status: 403,
  },
  CITY_NOT_COVERED: {
    ar: 'المزوّد لا يغطّي هذه المدينة بعد.',
    en: 'The provider does not cover this city yet.',
    status: 422,
  },
  DATE_IN_PAST: {
    ar: 'الموعد مضى — اختر وقتًا قادمًا.',
    en: 'That time has passed — pick a future one.',
    status: 422,
  },
  NO_ROUTE: {
    ar: 'الدفع غير متاح الآن.',
    en: 'Payment is unavailable right now.',
    status: 503,
  },
  ROUTE_DISABLED: {
    ar: 'شراء الخدمات متوقّف مؤقّتًا.',
    en: 'Service purchases are paused.',
    status: 503,
  },
  GATEWAY_FAILED: {
    ar: 'لم تُقبل البطاقة — جرّب وسيلةً أخرى.',
    en: 'The card was declined — try another method.',
    status: 402,
  },
  REQUIRES_ACTION: {
    ar: 'يلزم تأكيد البطاقة.',
    en: 'Card verification is required.',
    status: 402,
  },
};

/**
 * `POST /api/v1/services/{key}/request` — شراء خدمة.
 *
 * **ولم يكن له وجود.** تسع خدماتٍ تُعرض وطابورٌ كامل في اللوحة، ولا
 * شيء يُنشئ `ServiceRequest` إلّا البذرة — فصفحة الخدمة تقول «تُطلب
 * من صفحة المركبة» وصفحةُ المركبة لا زرّ فيها. **دائرةٌ مغلقة بلا
 * مدخل**، وخطُّ إيرادٍ كامل لا يدخله ريال.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  /**
   * **`Idempotency-Key` إلزامي** (القسم ٦): الشبكة تُعيد الطلب بلا أن
   * يعرف المستخدم، فيُحجز المال مرّتين ويصل المزوّد طلبان.
   */
  const key = request.headers.get('idempotency-key');
  if (key === null || key.trim() === '') {
    return fail(ERRORS.VALIDATION({ 'idempotency-key': 'REQUIRED' }), 422);
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const { key: serviceKey } = await params;
  const result = await purchaseService({
    ...parsed.data,
    serviceKey,
    userId: user.id,
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

  return ok({ ref: result.ref, total: result.total });
}
