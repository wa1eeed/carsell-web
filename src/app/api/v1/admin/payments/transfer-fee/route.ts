import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { setTransferFee } from '@/lib/domain/payment-routing';

export const runtime = 'nodejs';

const Body = z.object({
  /** الرسمُ الحكوميّ — يُمرَّر كما هو، و`0` صيغةٌ قائمة. */
  fee: z.number().min(0).max(100_000),
  adminFeeEnabled: z.boolean(),
  adminFee: z.number().min(0).max(100_000),
});

/**
 * `PUT /api/v1/admin/payments/transfer-fee` — رسمُ نقل الملكية ورسمُنا
 * فوقه.
 *
 * والاستجابة تعيد **عدد الطلبات القائمة**: الرسمُ لقطةٌ على الطلب، فما
 * تحت التنفيذ يبقى برسمه — والمشغّل يستحقّ أن يرى كم قبل أن يسأل.
 */
export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ fee: 'INVALID' }), 422);

  const result = await setTransferFee(guard.admin, parsed.data, guard.ip);
  if (!result.ok) return fail(ERRORS.VALIDATION({ adminFee: 'INVALID' }), 422);

  return ok({ ...result.row, openOrders: result.openOrders });
}
