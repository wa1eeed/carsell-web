import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { createOffer } from '@/lib/domain/offers';

export const runtime = 'nodejs';

const Body = z.object({
  listingRef: z.string().min(1).max(40),
  amount: z.number().int().positive().max(100_000_000),
});

/**
 * `POST /api/v1/offers` — تقديم عرض.
 *
 * **الرفض التلقائي ليس خطأ**: يعود ٢٠١ مع `autoRejected: true`. رمز خطأ
 * هنا يجعل الشاشة تعرض «تعذّر إرسال عرضك» وهو خلاف الواقع — العرض
 * وصل، والبائع وضع حدًّا دونه. والفرق يقرّر ما يفعله المشتري بعدها.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ amount: 'INVALID' }), 422);

  const result = await createOffer({ ...parsed.data, buyerId: user.id });

  if (!result.ok) {
    switch (result.reason) {
      case 'LISTING_NOT_FOUND':
        return fail(ERRORS.NOT_FOUND, 404);
      case 'ACTIVE_OFFER_EXISTS':
        return fail(ERRORS.OFFER_ACTIVE_EXISTS, 409);
      case 'OWN_LISTING':
        return fail(ERRORS.OFFER_OWN_LISTING, 403);
      case 'NOT_NEGOTIABLE':
        return fail(ERRORS.OFFER_NOT_NEGOTIABLE, 409);
      case 'LISTING_NOT_OPEN':
        return fail(ERRORS.OFFER_LISTING_CLOSED, 409);
      default:
        return fail(ERRORS.VALIDATION({ amount: 'INVALID' }), 422);
    }
  }

  return ok(
    {
      id: result.offer.id,
      amount: result.offer.amount.toString(),
      status: result.offer.status,
      autoRejected: result.autoRejected,
      expiresAt: result.offer.expiresAt.toISOString(),
    },
    undefined,
    { status: 201 },
  );
}
