import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { requestService, type RequestFailure } from '@/lib/domain/service-lifecycle';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/services/{key}/request` — **الطلب يُنشأ بلا مال**.
 *
 * قرار المالك (٢٠٢٦-١٠-١٤): «بعد قبول البائع يُطلب الدفع من المشتري،
 * حيث يوضَّح المبلغ ومتى يتمّ طلب السداد **من اللحظة الأولى للطلب**».
 *
 * فلا وسيلةَ دفعٍ هنا ولا `Idempotency-Key`: لا مال يتحرّك، وإعادةُ
 * الطلب تُنشئ صفًّا لا دفعة. والسداد في مسارٍ مستقلّ بعد الإذن.
 *
 * **والمدينة لا تُرسَل**: تُؤخذ من الإعلان — «الطلب يذهب لفاحصي نفس
 * المدينة التي فيها السيارة». ومن يطلب فحصًا لسيارةٍ في جدّة وهو في
 * الرياض كان يُرسل الفاحص إلى مدينته هو.
 */
const Body = z.object({
  vehicleId: z.string().min(1).max(40),
  scheduledAt: z.string().datetime().nullable(),
});

const MESSAGES: Record<RequestFailure, { ar: string; en: string; status: number }> = {
  SERVICE_UNKNOWN: { ar: 'هذه الخدمة غير متاحة.', en: 'This service is unavailable.', status: 404 },
  VEHICLE_NOT_FOUND: { ar: 'لم نجد هذه المركبة.', en: 'Vehicle not found.', status: 404 },
  NOT_LISTED: {
    ar: 'هذه السيارة غير معروضة للبيع، فلا يُطلب لها فحص إلّا من صاحبها.',
    en: 'This car is not on the market, so only its owner can request an inspection.',
    status: 403,
  },
  CITY_NOT_COVERED: {
    ar: 'لا مزوّد يغطّي مدينة السيارة بعد.',
    en: 'No provider covers the car’s city yet.',
    status: 422,
  },
  DATE_IN_PAST: {
    ar: 'الموعد مضى — اختر وقتًا قادمًا.',
    en: 'That time has passed — pick a future one.',
    status: 422,
  },
  OWN_LISTING_NO_CONSENT: {
    ar: 'تعذّر تحديد صاحب المركبة.',
    en: 'Could not determine the vehicle owner.',
    status: 409,
  },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const { key: serviceKey } = await params;
  const result = await requestService({
    serviceKey,
    requesterId: user.id,
    vehicleId: parsed.data.vehicleId,
    scheduledAt: parsed.data.scheduledAt,
  });

  if (!result.ok) {
    const message = MESSAGES[result.reason];
    return fail({ code: result.reason, messageAr: message.ar, messageEn: message.en }, message.status);
  }

  /**
   * **ويُعاد ما يُعرض من اللحظة الأولى**: المبلغ، ومتى يُطلب السداد،
   * ومتى تنقضي مهلة الإذن. فلا يُفاجأ الطالب بمطالبةٍ ولا بصمت.
   */
  return ok({
    ref: result.ref,
    status: result.status,
    total: result.total,
    payAt: result.payAt,
    decisionDueAt: result.decisionDueAt,
  });
}
