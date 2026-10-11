import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { setCampaignPaused } from '@/lib/domain/ads';

export const runtime = 'nodejs';

const Body = z.object({ paused: z.boolean() });

/**
 * `PATCH /api/v1/admin/ads/campaigns/{id}` — إيقافٌ واستئناف.
 *
 * **ودالّةٌ بلا منادٍ صنعتُها في المهمّة السابقة.** بُنيت
 * `setCampaignPaused` مع الإنشاء ولم يبلغها زرّ — وهو الصنف نفسه الذي
 * فُتح من أجله هذا الملفّ كلّه. فأُغلق في أوّل قياسٍ كشفه.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ paused: 'INVALID' }), 422);

  const { id } = await params;
  const result = await setCampaignPaused(guard.admin, id, parsed.data.paused);

  if (!result.ok) {
    return fail(
      {
        code: 'AD_CAMPAIGN_NOT_PAUSABLE',
        // والمنتهية لا تُستأنف — نافذتُها مضت، وزرٌّ يقول غير ذلك يَعِد بما لا يقع
        messageAr: 'الحملة غير موجودة أو انتهت نافذتها.',
        messageEn: 'Campaign missing or window ended.',
      },
      422,
    );
  }

  return ok({ paused: parsed.data.paused });
}
