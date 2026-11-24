import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth/session';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { recordPermission } from '@/lib/domain/push-delivery';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/me/push/permission` — ما ردّ به نظامُ الجهاز.
 *
 * بطاقةُ «أذونات ممنوحة» في A10 نسبةٌ مقامُها **من سُئل**، ومن رفض لا
 * يترك رمزًا — فبلا هذا الصفّ لا مقامَ لها إطلاقًا، ولا تُحسب بعدّ
 * الرموز (ذاك يقول ١٠٠٪ أبدًا).
 *
 * ويُكتب مرّتين: عند السؤال (`provisional`) وعند الجواب. والمنادي هو
 * التطبيق؛ السببُ معلَنٌ في `ROUTES_WITHOUT_A_SCREEN`.
 */
const Body = z.object({
  status: z.enum(['granted', 'denied', 'provisional']),
  platform: z.enum(['ios', 'android']).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ status: 'REQUIRED' }), 422);

  await recordPermission(user.id, parsed.data.status, parsed.data.platform ?? null);
  return ok({ recorded: true });
}
