import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { setProviderFeePlan } from '@/lib/domain/provider-fees';

export const runtime = 'nodejs';

/**
 * **والحدُّ مئةٌ لا واحد.** المخزَّن مئويّةٌ يقرؤها المشغّل، والبوّابة
 * تحدّ الكسر بواحد — فحدٌّ بواحدٍ هنا يمنع «١٬٧٠٪» وهي الشرط الشائع.
 */
const Body = z.object({
  madaPct: z.number().min(0).max(100),
  madaFixed: z.number().min(0).max(100_000),
  madaCap: z.number().min(0).max(100_000).nullable(),
  madaRefundFixed: z.number().min(0).max(100_000),
  cardPct: z.number().min(0).max(100),
  cardFixed: z.number().min(0).max(100_000),
  cardRefundFixed: z.number().min(0).max(100_000),
  taxInclusive: z.boolean(),
});

/**
 * `PUT /api/v1/admin/payments/provider-fees` — مصفوفةُ رسوم بوّابة المزوّدين.
 *
 * قرار المالك: «الرسوم تُضبط من لوحة الأدمن ولا نضعها داخل الكود».
 * والاستجابة تعيد **عدد الحسابات المفتوحة**: الرسوم تُرسَل لحظةَ فتح
 * الحساب وتبقى عند البوّابة، فما فُتح يبقى بشروطه.
 */
export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ madaPct: 'INVALID' }), 422);

  const result = await setProviderFeePlan(guard.admin, parsed.data, guard.ip);
  if (!result.ok) return fail(ERRORS.VALIDATION({ madaPct: 'INVALID' }), 422);

  return ok({ ...result.row, openAccounts: result.openAccounts });
}
