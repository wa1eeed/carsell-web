import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { MIN_PROVIDER_PASSWORD, changeProviderPassword } from '@/lib/domain/provider-staff';

export const runtime = 'nodejs';

const Body = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(MIN_PROVIDER_PASSWORD).max(200),
});

/**
 * `PUT /api/v1/provider/account/password` — المزوّد يغيّر كلمته.
 *
 * **وكان الشرطُ مفروضًا بلا باب**: `mustChangePassword` يُرفع عند
 * الإنشاء ويُردّ في كل دخول، ولا مسار يغيّرها — فيُقال له «غيّر
 * كلمتك» ولا سبيل.
 */
export async function PUT(request: NextRequest) {
  const user = await currentProviderUser();
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ password: 'INVALID' }), 422);

  const result = await changeProviderPassword({
    providerUserId: user.id,
    current: parsed.data.current,
    next: parsed.data.next,
  });

  if (!result.ok) return fail(ERRORS.VALIDATION({ password: result.reason }), 422);
  return ok({ changed: true });
}
