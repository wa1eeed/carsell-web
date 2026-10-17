import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUserFromCookies } from '@/lib/domain/account';
import { requestViewing } from '@/lib/domain/viewings';
import { VIEWING_MESSAGES } from '@/lib/api/viewing-messages';

export const runtime = 'nodejs';

const Body = z.object({
  listingRef: z.string().min(1).max(40),
  /** `yyyy-mm-dd` — واليومُ وفترتُه لا ساعةٌ بالدقيقة */
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period: z.enum(['MORNING', 'NOON', 'AFTERNOON', 'EVENING']),
  note: z.string().max(500).nullable(),
});


/**
 * `POST /api/v1/viewings` — طلبُ معاينة.
 *
 * **والمعاينةُ ليست خدمةَ مزوّد**: لقاءٌ بين مشترٍ وبائع، فلا مال ولا
 * طرفَ ثالث ولا رسوم.
 */
export async function POST(request: NextRequest) {
  const user = await currentUserFromCookies();
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const result = await requestViewing({ ...parsed.data, buyerId: user.id });
  if (!result.ok) {
    const message = VIEWING_MESSAGES[result.reason];
    return fail(
      { code: result.reason, messageAr: message.ar, messageEn: message.en },
      message.status,
    );
  }
  return ok({ ref: result.value.ref });
}
