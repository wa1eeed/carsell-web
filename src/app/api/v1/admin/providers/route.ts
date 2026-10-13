import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { saveProvider } from '@/lib/domain/admin-providers';

export const runtime = 'nodejs';

/**
 * **وzod تحرس الشكل والحجم، والمعنى في النطاق.** كان `min(1)` على
 * الاسمين هنا، فاستمارةٌ تُركت فارغةً كلُّها تُردّ بحقلٍ واحد ورسالة
 * «الصيغة غير صحيحة» — وصوابُها «مطلوب»، والمحرّر يُصلح حقلًا ثم
 * يُفاجأ بالتالي. والتحقّق كلُّه في `validate` فيعود دفعةً واحدة.
 */
const Body = z.object({
  nameAr: z.string().max(120),
  nameEn: z.string().max(120),
  type: z.string().max(40),
  contactPhone: z.string().max(30).nullable().optional(),
  contactEmail: z.string().max(160).nullable().optional(),
  commissionPct: z.string().max(10).nullable().optional(),
  slaHours: z.string().max(10).nullable().optional(),
  cities: z.array(z.string().max(60)).optional(),
});

/** `POST /api/v1/admin/providers` — مزوّد خدمة جديد (A28). */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ nameAr: 'INVALID' }), 422);

  const result = await saveProvider({
    providerId: null,
    draft: parsed.data,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    return result.reason === 'VALIDATION'
      ? fail(ERRORS.VALIDATION(result.fields), 422)
      : fail(ERRORS.NOT_FOUND, 404);
  }

  return ok({ id: result.id });
}
