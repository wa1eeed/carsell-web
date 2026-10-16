import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth/session';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { setPreference } from '@/lib/domain/push-channels';

export const runtime = 'nodejs';

/**
 * `PATCH /api/v1/me/notification-channels` — مفتاحُ قناةٍ واحدة.
 *
 * `setPreference` مكتوبةٌ منذ A10 **ولم يبلغها شيء**: لا شاشة ولا
 * مسار. فستّةُ مفاتيح مبنيّةٌ لا يراها صاحبُها، وصفُّ تفضيلٍ واحد لم
 * يُكتب قطّ.
 *
 * **ومفتاحٌ واحدٌ في كل نداء**: حفظُ الستّة معًا يجعل فشلَ واحدٍ
 * يُسقط الخمسة، ويخفي أيّها رُفض.
 */
const Body = z.object({
  channelKey: z.string().min(1).max(40),
  enabled: z.boolean(),
});

const MESSAGES: Record<string, { ar: string; en: string }> = {
  UNKNOWN_CHANNEL: { ar: 'قناة غير معروفة.', en: 'Unknown channel.' },
  CRITICAL_CHANNEL: {
    ar: 'هذه لا تُطفأ — فيها مواعيدُ ومبالغُ تخصّك.',
    en: 'This one cannot be muted — it carries your deadlines and your money.',
  },
};

export async function PATCH(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ channelKey: 'REQUIRED' }), 422);

  const result = await setPreference(user.id, parsed.data.channelKey, parsed.data.enabled);
  if (!result.ok) {
    const text = MESSAGES[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: text?.ar ?? 'تعذّر الحفظ.',
        messageEn: text?.en ?? 'Could not save.',
      },
      result.reason === 'UNKNOWN_CHANNEL' ? 404 : 409,
    );
  }

  return ok(result);
}
