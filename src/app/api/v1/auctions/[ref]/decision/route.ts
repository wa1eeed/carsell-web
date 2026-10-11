import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { resolveSellerDecision } from '@/lib/domain/auctions';

export const runtime = 'nodejs';

const Body = z.object({ accept: z.boolean() });

/**
 * `POST /api/v1/auctions/{ref}/decision` — قرار البائع بعد إغلاقٍ
 * باحتياطي غير مبلوغ.
 *
 * ═══ ولم يكن له وجود ═══
 *
 * `resolveSellerDecision` مبنيّة منذ المهمة ١٩ وتُنشئ الطلب وتخصم
 * العربون، **ولا ينادي فرعَ القبول أحد في المنتج كلّه**: الوحيد الذي
 * يناديها هو `expireSellerDecisions` وتمرّر `false` دائمًا.
 *
 * فكل مزادٍ لم يبلغ احتياطيَه ينتهي **بالردّ حتمًا** مهما أراد البائع —
 * والمهلة المعروضة له في الشاشة تعدّ ساعاتٍ لقرارٍ لا باب له. وهو
 * الصنف الذي أُصلح في غيره: «الطرف الثاني يُبنى مع الأوّل».
 *
 * ═══ والبائع وحده ═══
 *
 * الفحص هنا لا في الشاشة — حارسٌ في العميل ليس حارسًا. وغير البائع
 * يرى ٤٠٤ لا ٤٠٣: أن يعرف غريبٌ أن لهذا المزاد قرارًا معلَّقًا معلومةٌ
 * لا تلزمه.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const { ref } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ accept: 'INVALID' }), 422);

  const auction = await db.auction.findFirst({
    where: { listing: { ref } },
    select: { id: true, status: true, listing: { select: { sellerId: true } } },
  });

  if (auction === null || auction.listing.sellerId !== user.id) {
    return fail(ERRORS.NOT_FOUND, 404);
  }

  /**
   * **والحالة تُفحص هنا أيضًا.** `resolveSellerDecision` تردّ
   * `{ ok: false }` لكل ما ليس `ENDED_UNMET`، ورمزٌ واحد لثلاث حالات
   * مختلفة يجعل الشاشة تقول «تعذّر» ولا تقول لماذا.
   */
  if (auction.status !== 'ENDED_UNMET') {
    return fail(ERRORS.AUCTION_NO_DECISION, 409);
  }

  const result = await resolveSellerDecision(auction.id, parsed.data.accept);

  /**
   * **وانقضاء المهلة يُقال صراحةً.** `resolveSellerDecision` تردّ
   * العربون وتُبقي `ENDED_UNMET` حين تنقضي المهلة ولو ضغط البائع
   * «أقبل» — فالردّ `ok` والنتيجة عكس ما طلب. والصمت هنا يجعله ينتظر
   * طلبًا لن يُنشأ.
   */
  if (!result.ok) {
    return fail(ERRORS.AUCTION_DECISION_CLOSED, 409);
  }

  /**
   * ═══ والمرجع مرجعُ ما وقع الآن ═══
   *
   * كان يأخذ **أوّل طلبٍ على الإعلان أيًّا كان** — فمركبةٌ بِيعت مرّةً
   * ثمّ أُلغي طلبها وعادت إلى المزاد تُعطي البائع مرجعَ الطلب الملغى
   * من أغسطس. وقِيس: الردّ `ORD-2026-1013` (ملغى) والمُنشأ
   * `ORD-2026-1025`.
   *
   * **ومرجعٌ خاطئ بعد فعلٍ ماليّ أسوأ من غيابه**: صاحبه يفتحه فيرى
   * طلبًا ملغًى، فيحسب أنّ قبولَه أُلغي.
   */
  const after = await db.auction.findUnique({
    where: { id: auction.id },
    select: {
      status: true,
      listing: {
        select: {
          orders: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { ref: true },
          },
        },
      },
    },
  });

  const orderRef = after?.listing.orders[0]?.ref ?? null;

  return ok({
    accepted: after?.status === 'ENDED_MET',
    // `null` حين رفض — والشاشة تفحص النوع لا الغياب
    orderRef: typeof orderRef === 'string' ? orderRef : null,
  });
}
