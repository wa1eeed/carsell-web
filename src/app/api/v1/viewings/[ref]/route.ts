import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUserFromCookies } from '@/lib/domain/account';
import { cancelViewing, respondToViewing } from '@/lib/domain/viewings';
import { VIEWING_MESSAGES } from '../route';

export const runtime = 'nodejs';

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('accept'),
    meetingPoint: z.string().min(1).max(300),
  }),
  z.object({
    action: z.literal('decline'),
    reason: z.string().min(1).max(500),
  }),
  /** **والإلغاء لكلا الطرفين** — ظروفُ الناس تتغيّر */
  z.object({ action: z.literal('cancel') }),
]);

/**
 * `POST /api/v1/viewings/{ref}` — ردُّ البائع أو إلغاءُ أيٍّ من الطرفين.
 *
 * **والحارس هنا لا في الشاشة**: الشاشة تعرض ما تقبله الحال، ونداءٌ
 * مباشر يقبل موعدَ غيره أو يردّ على ما رُدّ عليه.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await currentUserFromCookies();
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  /** **والمرجع يصل مُرمَّزًا من Next** — فيُفكّ حيث يُقارَن */
  const { ref } = await params;
  const decoded = decodeURIComponent(ref);

  const result =
    parsed.data.action === 'cancel'
      ? await cancelViewing({ ref: decoded, userId: user.id })
      : await respondToViewing({
          ref: decoded,
          sellerId: user.id,
          accept: parsed.data.action === 'accept',
          meetingPoint: parsed.data.action === 'accept' ? parsed.data.meetingPoint : null,
          reason: parsed.data.action === 'decline' ? parsed.data.reason : null,
        });

  if (!result.ok) {
    const message = VIEWING_MESSAGES[result.reason];
    return fail(
      { code: result.reason, messageAr: message.ar, messageEn: message.en },
      message.status,
    );
  }
  return ok(result.value);
}
