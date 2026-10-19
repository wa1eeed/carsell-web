import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { updateSeoTemplate } from '@/lib/domain/seo';

export const runtime = 'nodejs';

/**
 * **والمفتاحُ والسطحُ لا يُحرَّران من هنا.** السطحُ يقابل صفحةً في
 * المنتج، فتبديلُه يحوّل نصًّا كُتب لصفحةٍ إلى صفحةٍ أخرى. وما يملكه
 * المشغّل هو **النصّ**: عنوانُه ومقدّمتُه وخاتمتُه، وأيعرضها أصلًا.
 */
const Body = z.object({
  titleAr: z.string().max(200).optional(),
  titleEn: z.string().max(200).optional(),
  introAr: z.string().max(1200).optional(),
  introEn: z.string().max(1200).optional(),
  outroAr: z.string().max(1200).optional(),
  outroEn: z.string().max(1200).optional(),
  active: z.boolean().optional(),
});

const MESSAGE: Record<string, string> = {
  NOT_FOUND: 'لا يوجد قالب بهذا المفتاح.',
  UNKNOWN_SURFACE: 'سطح هذا القالب لا تقابله صفحة في المنتج.',
  TOO_LONG: 'النص أطول مما يقبله الحقل.',
  UNKNOWN_VARIABLE: 'متغير لا تملؤه الصفحة، والفقرة كلها لن تظهر: ',
};

/** `PATCH /api/v1/admin/seo/{key}` — نصُّ سطحٍ واحد وحالُه. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const { key } = await context.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ seoTemplate: 'INVALID' }), 422);

  const result = await updateSeoTemplate(guard.admin, key, parsed.data, guard.ip);
  if (!result.ok) {
    const base = MESSAGE[result.reason] ?? 'تعذر الحفظ.';
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'UNKNOWN_VARIABLE' ? `${base}${result.detail}` : base,
        messageEn: 'Could not save the template.',
      },
      result.reason === 'NOT_FOUND' ? 404 : 422,
    );
  }

  return ok(result.template);
}
