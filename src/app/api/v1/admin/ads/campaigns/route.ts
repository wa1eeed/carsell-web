import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { createCampaign } from '@/lib/domain/ads';

export const runtime = 'nodejs';

const Body = z.object({
  advertiserName: z.string().min(1).max(120),
  slotKey: z.string().min(1).max(60),
  creativeUrl: z.string().min(1).max(2048),
  targetUrl: z.string().min(1).max(2048),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  budget: z.string().min(1).max(20),
  priority: z.number().int().min(0).max(100).optional(),
  city: z.string().max(60).nullable().optional(),
  brandId: z.string().max(40).nullable().optional(),
});

const REASON: Record<string, string> = {
  SLOT_NOT_FOUND: 'المساحة غير موجودة.',
  SLOT_INACTIVE: 'المساحة معطلة — فعلها أولا أو اختر غيرها.',
  BAD_WINDOW: 'تاريخ الانتهاء قبل البدء أو يساويه.',
  BAD_BUDGET: 'الميزانية رقم موجب.',
  BAD_URL: 'رابط الإبداع والوجهة يبدآن بـhttp أو https.',
  NO_ADVERTISER: 'اسم المعلن مطلوب.',
};

/**
 * `POST /api/v1/admin/ads/campaigns` — حملةٌ جديدة.
 *
 * **ولم يكن لها باب.** `AdCampaign` مقروءٌ في أربعة مواضع — منها
 * إيرادُ الإعلانات في A19 — ولا شيء يكتبه. فجدولٌ فارغ في A31 يُقرأ
 * «لا حملات الآن» وصوابُه «لا سبيل إلى حملة».
 *
 * ═══ و`finance.view` كتابةً ═══
 *
 * الحملة بندُ إيراد، وصلاحيةُ المالية هي التي تحكمها في هذه الشاشة
 * (كالمساحات). والخادم يفحصها ثانيةً — فحارس الشاشة اقتراح.
 */
export async function POST(request: NextRequest) {
  // و`requireAdmin` تفحص الكتابة بنفسها — `canWrite` لا `can`
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // **والحقل المُعلَّم هو الذي سقط فعلًا** — لا أوّل حقلٍ خطر ببالي
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return fail(
      ERRORS.VALIDATION({ [typeof field === 'string' ? field : 'body']: 'INVALID' }),
      422,
    );
  }

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return fail(ERRORS.VALIDATION({ startsAt: 'INVALID' }), 422);
  }

  const result = await createCampaign(guard.admin, {
    ...parsed.data,
    startsAt,
    endsAt,
  });

  if (!result.ok) {
    return fail(
      { code: `AD_${result.reason}`, messageAr: REASON[result.reason] ?? 'تعذر الإنشاء.', messageEn: result.reason },
      422,
    );
  }

  return ok({ id: result.id }, undefined, { status: 201 });
}
