import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { grantMarginScheme } from '@/lib/domain/admin-tax';

export const runtime = 'nodejs';

const Body = z.object({
  approved: z.boolean(),
  ref: z.string().max(60).nullable(),
});

const REASON: Record<string, string> = {
  NOT_FOUND: 'لا عميل بهذا المعرّف.',
  NOT_REGISTERED: 'الهامش يتبع التسجيل الضريبيّ — والعميل غير مسجَّل.',
  REF_REQUIRED: 'مرجع مستند الهيئة إلزاميّ عند المنح.',
};

/**
 * `POST /api/v1/admin/users/{id}/margin-scheme` — منحُ هامش الربح وسحبُه.
 *
 * **ولم يكن له باب.** `grantMarginScheme` مبنيّةٌ بمرجعها الإلزاميّ
 * وأثرها ولا ينادِيها شيء — فبائعٌ مسجَّلٌ يستحقّ احتساب الضريبة على
 * الهامش تُحتسب عليه على **كامل السعر** إلى الأبد. وصفحةُ المعرض تعرض
 * «مرجع هامش الربح» متى مُنح: تعرض ما لا سبيل إلى منحه.
 *
 * ═══ ولمَ `wallet.adjust` ═══
 *
 * المنحُ يغيّر ما يُحتسب على كل بيعةٍ لهذا البائع — أثرٌ ماليّ دائم لا
 * تعديلُ بيانات. فصلاحيّتُه صلاحيةُ المال لا `users.view`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request, 'wallet.adjust');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return fail(ERRORS.VALIDATION({ [typeof field === 'string' ? field : 'body']: 'INVALID' }), 422);
  }

  const { id } = await params;
  const result = await grantMarginScheme(
    guard.admin,
    id,
    { approved: parsed.data.approved, ref: parsed.data.ref },
    guard.ip,
  );

  if (!result.ok) {
    return fail(
      {
        code: `MARGIN_${result.reason}`,
        messageAr: REASON[result.reason] ?? 'تعذّر الحفظ.',
        messageEn: result.reason,
      },
      result.reason === 'NOT_FOUND' ? 404 : 422,
    );
  }

  return ok({ approved: result.approved });
}
