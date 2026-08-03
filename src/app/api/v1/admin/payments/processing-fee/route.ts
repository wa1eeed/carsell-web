import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { setProcessingFee } from '@/lib/domain/payment-routing';

export const runtime = 'nodejs';

const Body = z.object({
  enabled: z.boolean(),
  bearer: z.enum(['SELLER', 'BUYER']),
  /** نسبةٌ بخانتين — و`0` مسموحة فالثابت وحده صيغةٌ قائمة */
  pct: z.number().min(0).max(100),
  fixed: z.number().min(0).max(100_000),
});

/**
 * `PUT /api/v1/admin/payments/processing-fee` — سياسة رسوم المعالجة.
 *
 * والاستجابة تعيد **عدد الطلبات القائمة**: لقطةُ الرسم على الطلب تعني
 * أن ما تحت التنفيذ يبقى بسياسته، والمشغّل يستحقّ أن يرى كم قبل أن
 * يسأل عنه.
 */
export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ pct: 'INVALID' }), 422);

  const result = await setProcessingFee(guard.admin, parsed.data, guard.ip);
  if (!result.ok) return fail(ERRORS.VALIDATION({ pct: 'INVALID' }), 422);

  return ok({ ...result.row, openOrders: result.openOrders });
}
