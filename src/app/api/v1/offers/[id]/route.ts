import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { acceptOffer, counterOffer, withdrawOffer } from '@/lib/domain/offers';

export const runtime = 'nodejs';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('withdraw') }),
  z.object({ action: z.literal('counter'), amount: z.number().int().positive().max(100_000_000) }),
]);

/**
 * `PATCH /api/v1/offers/{id}` — قبول أو مقابلة أو سحب.
 *
 * فعلٌ واحد لكل نداء، والصلاحية تُفحص في النطاق لا هنا: البائع يقبل
 * ويقابل، والمشتري يسحب. وفحصُها في المسار يعني إعادةَ كتابتها في كل
 * مسار يلمس العرض.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ action: 'INVALID' }), 422);

  const { id } = await params;

  if (parsed.data.action === 'accept') {
    const result = await acceptOffer({ offerId: id, sellerId: user.id });
    if (!result.ok) return fail(reasonToError(result.reason), statusFor(result.reason));
    return ok({ orderRef: result.orderRef, closedOffers: result.closedOffers });
  }

  if (parsed.data.action === 'withdraw') {
    const result = await withdrawOffer({ offerId: id, buyerId: user.id });
    if (!result.ok) return fail(reasonToError(result.reason), statusFor(result.reason));
    return ok({ withdrawn: true });
  }

  const result = await counterOffer({
    offerId: id,
    sellerId: user.id,
    amount: parsed.data.amount,
  });
  if (!result.ok) return fail(reasonToError(result.reason), statusFor(result.reason));

  return ok({
    id: result.offer.id,
    amount: result.offer.amount.toString(),
    expiresAt: result.offer.expiresAt.toISOString(),
  });
}

type Reason = 'OFFER_NOT_FOUND' | 'NOT_SELLER' | 'NOT_BUYER' | 'NOT_ACTIVE' | 'AMOUNT_INVALID';

function reasonToError(reason: Reason) {
  if (reason === 'OFFER_NOT_FOUND') return ERRORS.NOT_FOUND;
  if (reason === 'NOT_ACTIVE') return ERRORS.OFFER_NOT_ACTIVE;
  if (reason === 'AMOUNT_INVALID') return ERRORS.VALIDATION({ amount: 'INVALID' });
  return ERRORS.FORBIDDEN;
}

function statusFor(reason: Reason): number {
  if (reason === 'OFFER_NOT_FOUND') return 404;
  if (reason === 'NOT_ACTIVE') return 409;
  if (reason === 'AMOUNT_INVALID') return 422;
  return 403;
}
