import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { requestEnvSwitch } from '@/lib/domain/admin-integrations';

export const runtime = 'nodejs';

const Body = z.object({ to: z.enum(['TEST', 'LIVE']) });

/**
 * `POST /api/v1/admin/integrations/{key}/environment` — **طلب** تبديل
 * بيئة التكامل، بعضوين.
 *
 * **ولم يكن له باب.** `requestEnvSwitch` مبنيّة ومختبَرة ولا ينادِيها
 * شيء — والانتقال من الاختبار إلى الإنتاج هو **الخطوة الأخيرة قبل أن
 * تمسّ المنصّة مالًا حقيقيًّا**، فبقاؤها بلا باب يعني أن الإطلاق نفسه
 * يحتاج تعديل صفٍّ في القاعدة بيد.
 *
 * والاعتماد يمرّ بمسار الموافقة القائم (`/approve`) — والنطاق يفحص
 * `INTEGRATION_ENV` باسمها، فلا يعتمدها من لا يملكها.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  /**
   * **`rotateKeys` لا `view`.** تبديل البيئة يجعل نداءً حقيقيًّا يخرج
   * إلى مزوّدٍ بمالٍ حقيقيّ — وهي صلاحية من يملك السرّ لا من يقرأ
   * الشاشة. (والدرس مسجَّل في `/rotate`: نصابٌ من غير أهله ليس نصابًا.)
   */
  const guard = await requireAdmin(request, 'integrations.rotateKeys');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ to: 'INVALID' }), 422);

  const { key } = await params;
  const result = await requestEnvSwitch(guard.admin, key, parsed.data.to, guard.ip);

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(
      {
        code: result.reason,
        messageAr:
          /**
           * **والقيد يُشرح لا يُقال «ممنوع».** خارج الإنتاج القراءة
           * مقيَّدة بـ`TEST` في الكود، فالتبديل هناك لا أثر له —
           * ورسالةٌ عامّة تجعل المشغّل يبحث عن صلاحيةٍ ناقصة.
           */
          result.reason === 'ENV_FORBIDDEN'
            ? 'هذه البيئة مقيَّدة بالاختبار في الكود — التبديل لا أثر له فيها.'
            : result.reason === 'ALREADY_PENDING'
              ? 'على هذا التكامل طلبٌ قائم — اعتمده أو انتظر انقضاءه.'
              : 'تعذّر تسجيل طلب تبديل البيئة.',
        messageEn:
          result.reason === 'ENV_FORBIDDEN'
            ? 'This environment is pinned to TEST in code — switching has no effect here.'
            : result.reason === 'ALREADY_PENDING'
              ? 'A request is already pending for this integration.'
              : 'Could not record the environment switch request.',
      },
      result.reason === 'ENV_FORBIDDEN' ? 403 : 409,
    );
  }

  return ok(result);
}
