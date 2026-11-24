import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { setIntegrationCost } from '@/lib/domain/admin-integrations';

export const runtime = 'nodejs';

/**
 * `PATCH /api/v1/admin/integrations/{key}/cost` — كلفةُ الشهر وصلاحيةُ
 * المفتاح.
 *
 * بطاقتا A11 «تكلفة الشهر» و«مفاتيح تنتهي قريبًا» بلا مصدرٍ يُجلب —
 * الكلفةُ عقدٌ، وتاريخُ الانتهاء يُقرأ في لوحة المزوّد. فمدخلُهما هنا.
 *
 * **ولا نصابَ لهما**: لا يفتحان بابًا ولا يُبدّلان سرًّا، بخلاف
 * التدوير وتبديل البيئة. وحصرُ كل تحريرٍ خلف نصابٍ يجعله طقسًا.
 */
const Body = z.object({
  monthlyCost: z.string().max(12).nullable(),
  expiresAt: z.record(z.enum(['TEST', 'LIVE']), z.string().max(40).nullable()),
});

const MESSAGES: Record<string, string> = {
  NOT_FOUND: 'لا تكامل بهذا المفتاح.',
  BAD_COST: 'الكلفة رقم غير سالب، أو اتركها فارغة.',
  BAD_DATE: 'تاريخ غير صالح.',
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'integrations.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ monthlyCost: 'INVALID' }), 422);

  const { key } = await params;
  const result = await setIntegrationCost(
    guard.admin,
    key,
    { monthlyCost: parsed.data.monthlyCost, expiresAt: parsed.data.expiresAt },
    guard.ip,
  );

  if (!result.ok) {
    const reason = result.reason ?? 'NOT_FOUND';
    return fail(
      { code: reason, messageAr: MESSAGES[reason] ?? 'تعذر الحفظ.', messageEn: 'Could not save.' },
      reason === 'NOT_FOUND' ? 404 : 422,
    );
  }

  return ok({ saved: true });
}
