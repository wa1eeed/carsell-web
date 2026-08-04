import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { computeOrderAmounts } from './order-amounts';
import { deadline } from './deadlines';
import { reserveListing } from './listing-state';
import { nextOrderRef } from './refs';

/**
 * ═══ الطلب من رسوّ المزاد — الحلقة التي لم تكن موجودة ═══
 *
 * `OrderSource.AUCTION` معرَّفٌ في المخطّط منذ اليوم الأول، **ولا شيء
 * كان يُنشئ طلبًا به**. فالمزاد يُغلق، وتُسوّى العرابين، ويُعلَن فائز —
 * **ثم لا شيء**: لا طلب ولا دفع ولا نقل ملكية.
 *
 * فالمزايد يربح ولا يستلم، والبائع يبيع ولا يقبض. وهو الشكل نفسه الذي
 * وُجد في الدفع والعروض والنشر والنزاع: نطاقٌ مبنيّ بلا حلقةٍ أخيرة.
 *
 * ═══ وقاعدة المال واحدة ═══
 *
 * المبالغ من `computeOrderAmounts` نفسها التي تخدم البيع المباشر وقبول
 * العرض — **لا حساب ثالث**. وثلاثة حسابات تتباعد أوّل تغيير، والفرق
 * يظهر في فاتورة.
 */

export type AuctionOrderFailure =
  | 'AUCTION_NOT_FOUND'
  | 'NO_WINNER'
  | 'ORDER_EXISTS'
  | 'LISTING_UNAVAILABLE';

export type AuctionOrderResult =
  | { ok: true; orderRef: string; buyerId: string; amount: string }
  | { ok: false; reason: AuctionOrderFailure };

/**
 * يُنشئ طلب الفائز.
 *
 * **ويقبل `tx`** ليُكتب داخل معاملة الإغلاق نفسها: مزادٌ يُغلق وطلبٌ
 * لا يُنشأ يترك فائزًا بلا شيء، ولا يقول شيءٌ إن الحلقة انكسرت.
 *
 * ولا يفحص العربون: القاعدة ٩ تُسوّيه في `settleDeposits` — ونصيب
 * الفائز يبقى `APPLIED` ليُخصم من هذا الطلب لا ليُردّ ثم يُدفع.
 */
export async function createAuctionOrder(
  tx: Prisma.TransactionClient,
  input: { auctionId: string },
  now: Date = new Date(),
): Promise<AuctionOrderResult> {
  const auction = await tx.auction.findUnique({
    where: { id: input.auctionId },
    include: {
      listing: { select: { id: true, sellerId: true, status: true } },
      bids: { orderBy: { amount: 'desc' }, take: 1 },
    },
  });

  if (auction === null) return { ok: false, reason: 'AUCTION_NOT_FOUND' };

  const top = auction.bids[0];
  if (top === undefined) return { ok: false, reason: 'NO_WINNER' };

  /**
   * **إعلانٌ محجوزٌ سلفًا لا يُباع مرّتين.** ومزادٌ يُغلق مرّتين
   * (وظيفةٌ دورية تتكرّر، أو إغلاقٌ يدويّ يعقبها) يجب ألّا يُنشئ طلبين.
   */
  const existing = await tx.order.findFirst({
    where: { listingId: auction.listing.id, status: 'ACTIVE' },
    select: { id: true },
  });
  if (existing !== null) return { ok: false, reason: 'ORDER_EXISTS' };

  if (auction.listing.status !== 'PUBLISHED' && auction.listing.status !== 'RESERVED') {
    return { ok: false, reason: 'LISTING_UNAVAILABLE' };
  }

  const amounts = await computeOrderAmounts(tx, Number(top.amount), now);
  const paymentWindow = await deadline('paymentWindowHours');
  const ref = await nextOrderRef(tx, now);

  await tx.order.create({
    data: {
      ref,
      listingId: auction.listing.id,
      buyerId: top.bidderId,
      sellerId: auction.listing.sellerId,
      source: 'AUCTION',
      stage: 'PAYMENT',
      ...amounts,
      createdAt: now,
      stageEnteredAt: now,
      paymentDueAt: new Date(now.getTime() + paymentWindow * 3600 * 1000),
    },
  });

  // الإعلان يُحجز — وبقاؤه معروضًا بعد الرسوّ يبيع المركبة مرّتين
  await reserveListing(tx, auction.listing.id, 'auction.won', now);

  await tx.orderEvent.create({
    data: {
      orderId: (await tx.order.findUniqueOrThrow({ where: { ref }, select: { id: true } })).id,
      type: 'order.created',
      toStage: 'PAYMENT',
      actorType: 'system',
      createdAt: now,
    },
  });

  return { ok: true, orderRef: ref, buyerId: top.bidderId, amount: top.amount.toString() };
}

/** خارج معاملة — للمسارات التي لا تملك `tx`. */
export async function createAuctionOrderStandalone(
  auctionId: string,
  now: Date = new Date(),
): Promise<AuctionOrderResult> {
  return db.$transaction((tx) => createAuctionOrder(tx, { auctionId }, now));
}
