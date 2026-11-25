import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerAuctionId } from '@/lib/domain/dealer-auctions';
import { resolveSellerDecision } from '@/lib/domain/auctions';

export const runtime = 'nodejs';

const Body = z.object({ accept: z.boolean() });

/**
 * ═══ قرارُ المعرض في مزادٍ لم يبلغ احتياطيَه ═══
 *
 * **وفرعُ القبول كان ميّتًا.** `resolveSellerDecision(id, true)` مبنيّةٌ
 * مختبَرة، **ونادِيها الوحيد وظيفةٌ دورية تمرّر `false`** — فكلُّ مزادٍ
 * من هذا النوع كان ينتهي بالردّ حتمًا مهما أراد البائع. (مسجَّل في
 * `NOTES` بوصفه أخطرَ ما أخرجه قياسُ الدوالّ بلا باب.) والمسارُ العامّ
 * يسأل «أأنت البائع؟»، ومديرُ المعرض ليس بائعًا — فهذا بابُه.
 *
 * **والقاعدةُ واحدة**: الدالّة نفسُها، لا نسخةٌ منها.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  /** **والقرارُ ماليّ** — فللمالك والمدير وحدهما (مصفوفة `D9`). */
  if (actor.role !== 'OWNER' && actor.role !== 'MANAGER') return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ accept: 'INVALID' }), 422);

  const { ref } = await params;
  const auctionId = await dealerAuctionId(actor.dealerId, actor.branchId, ref);
  if (auctionId === null) return fail(ERRORS.NOT_FOUND, 404);

  const result = await resolveSellerDecision(auctionId, parsed.data.accept);
  if (!result.ok) return fail(ERRORS.AUCTION_NO_DECISION, 409);

  /**
   * **والقبولُ بلا طلبٍ يُقال.** كان النداء يبتلع فشلَه، فتقول
   * الشاشةُ «قبلتُ أعلى مزايدة» **وقد خُصم العربون ولا طلبَ** — فلا
   * المشتري يدفع ولا البائع يسلّم، ولا أحدَ يعلم.
   */
  return ok({
    accepted: parsed.data.accept,
    orderRef: result.orderRef,
    orderFailed: result.orderFailed,
  });
}
