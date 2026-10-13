import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { saveProvider, toggleProvider } from '@/lib/domain/admin-providers';

export const runtime = 'nodejs';

const Toggle = z.object({ active: z.boolean() });

/**
 * **وzod تحرس الشكل والحجم، والمعنى في النطاق.** كان `min(1)` على
 * الاسمين هنا، فاستمارةٌ تُركت فارغةً كلُّها تُردّ بحقلٍ واحد ورسالة
 * «الصيغة غير صحيحة» — وصوابُها «مطلوب»، والمحرّر يُصلح حقلًا ثم
 * يُفاجأ بالتالي. والتحقّق كلُّه في `validate` فيعود دفعةً واحدة.
 */
const Edit = z.object({
  nameAr: z.string().max(120),
  nameEn: z.string().max(120),
  type: z.string().max(40),
  contactPhone: z.string().max(30).nullable().optional(),
  contactEmail: z.string().max(160).nullable().optional(),
  commissionPct: z.string().max(10).nullable().optional(),
  slaHours: z.string().max(10).nullable().optional(),
  cities: z.array(z.string().max(60)).optional(),
});

/**
 * `PATCH /api/v1/admin/providers/{id}` — تعديلُ مزوّد أو تفعيلُه/تعطيله (A28).
 *
 * **والجسدان لا يجتمعان**: `{active}` قرارُ إسنادٍ له أثرُه على الجاري،
 * وبقيّةُ الحقول تصحيحُ بيانات. ودمجُهما يجعل حفظَ رقم هاتفٍ يُعطّل
 * شركةً بالسهو — لأن استمارةً لا ترسل `active` كانت ستُقرأ «عطِّل».
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);

  const edit = Edit.safeParse(body);
  if (edit.success) {
    const saved = await saveProvider({
      providerId: id,
      draft: edit.data,
      adminId: guard.admin.id,
      ip: guard.ip,
    });
    if (!saved.ok) {
      return saved.reason === 'VALIDATION'
        ? fail(ERRORS.VALIDATION(saved.fields), 422)
        : fail(ERRORS.NOT_FOUND, 404);
    }
    return ok({ id: saved.id });
  }

  const parsed = Toggle.safeParse(body);
  if (!parsed.success) return fail(ERRORS.VALIDATION({ active: 'INVALID' }), 422);

  const result = await toggleProvider({
    providerId: id,
    active: parsed.data.active,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);

  // العدد يُعاد كي تقوله الشاشة: ما زال عليه طلباتٌ يُكملها
  return ok({ active: result.active, openRequests: result.openRequests });
}
