import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { saveDealerProfile } from '@/lib/domain/dealer-profile';

export const runtime = 'nodejs';

const Body = z.object({
  nameAr: z.string().max(120),
  nameEn: z.string().max(120),
  aboutAr: z.string().max(1000),
  address: z.string().max(200),
  phone: z.string().max(20),
});

const MESSAGES: Record<string, string> = {
  NAME_REQUIRED: 'اسم المعرض بالعربية والإنجليزية مطلوب — وهو ما يظهر للمشترين.',
  ABOUT_TOO_LONG: 'النبذة طويلة — اختصرها دون ست مئة حرف.',
  NOT_FOUND: 'لم يعد هذا المعرض موجودا.',
};

/** **والملفُّ العامّ للمالك والمدير** (مصفوفة `D9`). */
export async function PATCH(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (actor.role !== 'OWNER' && actor.role !== 'MANAGER') return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ nameAr: 'REQUIRED' }), 422);

  const result = await saveDealerProfile({
    dealerId: actor.dealerId,
    actorId: actor.userId,
    ...parsed.data,
  });

  if (!result.ok) {
    return fail(
      { code: result.reason, messageAr: MESSAGES[result.reason] ?? '', messageEn: result.reason },
      422,
    );
  }
  return ok({ saved: true });
}
