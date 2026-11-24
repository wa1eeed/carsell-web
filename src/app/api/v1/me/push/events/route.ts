import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth/session';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { recordEvent } from '@/lib/domain/push-delivery';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/me/push/events` — وصلَ الإشعارُ، أو فُتح.
 *
 * مصدرُ بطاقتَي «معدّل التسليم» و«معدّل الفتح» وعمودَيهما في جدول
 * القنوات. ولا يعرفهما إلا الجهاز: المزوّد يقول «قبلتُه»، والتسليمُ
 * والفتحُ يقعان بعده.
 *
 * ═══ والتسجيلُ من الخارج يُحدّ ═══
 *
 * المرجع يطابق صفًّا عندنا **ولصاحبه** — لا يكفي أن يكون موجودًا،
 * فمن عرف معرّفًا واحدًا يُعلّمه «فُتح» لغيره. والفحصُ في النطاق لا
 * هنا وحده.
 *
 * **وأوّلُ حدثٍ هو الحدث**: إعادةُ الإرسال لا تبدّل وقتًا مسجَّلًا،
 * فلا ينمو الصفّ بعدد ما يُرسله الجهاز.
 */
const Body = z.object({
  sendId: z.string().min(1).max(64),
  event: z.enum(['delivered', 'opened']),
});

export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ sendId: 'REQUIRED' }), 422);

  const result = await recordEvent(parsed.data.sendId, parsed.data.event, {
    ownerId: user.id,
  });

  /**
   * **ومرجعٌ ليس لصاحبه يُردّ ٤٠٤ لا ٤٠٣**: أنّ الإرسالة قائمةٌ لسواه
   * معلومةٌ في نفسها، وهو مسلكُ صفحة الطلب نفسُه.
   */
  if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);

  return ok({ recorded: true });
}
