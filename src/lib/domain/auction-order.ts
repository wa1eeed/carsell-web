import { db } from '@/lib/db';
import { notifyMany } from './notifications';
import { Prisma } from '@/generated/prisma/client';
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
 * ولا يفحص العربون: القاعدة ٩ تُسوّيه في `settleDeposits`، ونصيب
 * الفائز يبقى `APPLIED`.
 *
 * ⚠️ **و`APPLIED` اليوم وسمٌ لا خصم.** المبلغ المطلوب هنا كامل، ولا
 * ينقص منه العربون — **وهذا هو الصواب ما دام الحجز دفتريًّا**:
 * `holdDeposit` تكتب `HELD` بيدها ولا تمرّ ببوابة، فلا مال محجوز
 * يُخصم منه. ولو خصمناه اليوم لدفع المشتري أقلّ ولم يصل البائع فرقٌ
 * من أحد.
 *
 * فحين يمرّ العربون بالبوابة فعلًا (الغرض `AUCTION_DEPOSIT` موجَّه
 * ومضبوط ولا يناديه أحد) **يُخصم في الموضعين معًا**: من المبلغ
 * المطلوب هنا، ومن حجز البوابة هناك. وخصمُ أحدهما وحده يُنشئ فرقًا
 * في فاتورة. والشاشة لا تذكر العربون اليوم، فلا وعدَ مُخلَف — ويوم
 * يُخصم تُذكر السطرَ صراحةً.
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

  /**
   * ═══ وعربون الفائز يُخصم من المطلوب ═══
   *
   * الحجز قائمٌ عند البوابة باسمه، فمطالبتُه بالإجمالي كاملًا تجعله
   * يدفع العربون مرّتين. **والخصم في الموضعين معًا**: من المطلوب هنا،
   * ومن الحجز هناك حين يُحصَّل — وخصمُ أحدهما وحده يُنشئ فرقًا في
   * فاتورة.
   *
   * **والدفتريّ القديم لا يُخصم**: لا مال خلفه، وخصمُه يجعل المشتري
   * يدفع أقلّ ولا يصل البائع فرقٌ من أحد.
   */
  const winnerDeposit = await tx.deposit.findFirst({
    where: {
      auctionId: auction.id,
      userId: top.bidderId,
      status: { in: ['HELD', 'APPLIED'] },
      paymentId: { not: null },
    },
    select: { amount: true },
  });

  const depositApplied = winnerDeposit?.amount ?? new Prisma.Decimal(0);
  const dueAmount = amounts.totalAmount.minus(depositApplied);
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
      // الإجمالي يبقى للتدقيق، والمطلوب هو الفرق
      totalAmount: dueAmount,
      depositApplied,
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

  /**
   * **ولا طرفَ يعلم هنا.** المزاد يُغلقه مُجدوِلٌ لا إنسان: فالفائز
   * ليس أمام شاشة، والبائع أولى — نافذتُه انتهت وصار له طلبٌ ومهلة
   * ومشترٍ، ولا شيء كان يقول له.
   */
  const { notifyOrderCreated } = await import('./order-notify');
  await notifyOrderCreated(
    tx,
    {
      ref,
      buyerId: top.bidderId,
      sellerId: auction.listing.sellerId,
      amount: top.amount.toString(),
    },
    { buyer: true },
  );

  return { ok: true, orderRef: ref, buyerId: top.bidderId, amount: top.amount.toString() };
}

/** خارج معاملة — للمسارات التي لا تملك `tx`. */
export async function createAuctionOrderStandalone(
  auctionId: string,
  now: Date = new Date(),
): Promise<AuctionOrderResult> {
  return db.$transaction((tx) => createAuctionOrder(tx, { auctionId }, now));
}

export type BuyNowFailure =
  | 'AUCTION_NOT_FOUND'
  | 'NOT_LIVE'
  | 'BUY_NOW_UNAVAILABLE'
  | 'OWN_LISTING'
  | 'PROFILE_INCOMPLETE'
  | 'TAX_STATUS_REQUIRED'
  | 'ORDER_EXISTS'
  | 'LISTING_UNAVAILABLE';

export type BuyNowResult =
  | { ok: true; orderRef: string; amount: string }
  | { ok: false; reason: BuyNowFailure };

/**
 * ═══ «اشترِ الآن» — زرٌّ كان يقول «قريبًا» ═══
 *
 * البائع يضبط سعر الشراء الفوري في معالج البيع، ويُخزَّن، والقاعدة ١٠
 * تحكم متى يظهر (`buyNowAvailable`)، **والزرّ معروضٌ في لوحة المزايدة
 * منذ بُنيت** — وضغطُه يُخرج رسالة «الشراء الفوري قريبًا». و
 * `OrderSource.BUY_NOW` معرَّفٌ في المخطّط بلا كاتب.
 *
 * فبائعٌ يضبط سعرًا فوريًّا يُوعَد ببيعٍ لا يقع، ومشترٍ يراه يُوعَد
 * بشراءٍ لا يقع — **وهو الزرّ الميّت على مسار مال**.
 *
 * ═══ وحالُ المزاد بعده ═══
 *
 * `ENDED_MET` لا `ENDED_UNMET`: الثانية تفتح مهلةَ قرارِ البائع في
 * أعلى مزايدة، والمركبة قد بِيعت — فمهلةٌ تجري على قرارٍ لا معنى له.
 * ولا قيمةَ ثالثة تُضاف للتعداد: «انتهى ببيع» هو المعنى، وهو صادق.
 *
 * ═══ والعرابين تُسوّى في اللحظة ═══
 *
 * من زايد ولم يشترِ يُرَدّ عربونه **الآن** لا حين ينقضي وقتُ المزاد:
 * المركبة خرجت، وحبسُ ماله بعدها احتجازٌ بلا سبب.
 */
export async function buyNow(
  input: { listingRef: string; buyerId: string },
  now: Date = new Date(),
): Promise<BuyNowResult> {
  const { buyNowAvailable, isReserveMet, settleDeposits } = await import('./auctions');
  const { profileCompletion } = await import('./profile');

  const auction = await db.auction.findFirst({
    where: { listing: { ref: input.listingRef } },
    include: {
      listing: { select: { id: true, ref: true, sellerId: true, status: true } },
      bids: { orderBy: { amount: 'desc' }, take: 1 },
    },
  });

  if (auction === null) return { ok: false, reason: 'AUCTION_NOT_FOUND' };
  if (auction.buyNowPrice === null) return { ok: false, reason: 'BUY_NOW_UNAVAILABLE' };

  /**
   * **والحالة والوقت معًا.** `LIVE` مخزَّنةٌ لمزادٍ انقضى حتى تمرّ
   * الوظيفة الدورية — وقبولُ شراءٍ فوريّ بعد انقضاء الوقت يبيع مركبةً
   * خرجت من السوق.
   */
  const open = auction.status === 'LIVE'
    && auction.startsAt.getTime() <= now.getTime()
    && auction.endsAt.getTime() > now.getTime();
  if (!open) return { ok: false, reason: 'NOT_LIVE' };

  if (auction.listing.sellerId === input.buyerId) return { ok: false, reason: 'OWN_LISTING' };

  /**
   * **والقاعدة ١٠ تُفرَض في الخادم.** الشاشة تُخفي الزرّ متى بلغت
   * المزايداتُ الاحتياطيَّ، ونداءٌ مباشر بعدها يسحب المركبة من
   * مزايدين تجاوزوا هذا السعر — وحارسٌ في العميل ليس حارسًا.
   */
  const highest = auction.bids[0] === undefined ? null : Number(auction.bids[0].amount);
  if (!buyNowAvailable(
    Number(auction.buyNowPrice),
    isReserveMet(auction.reservePrice, highest),
    highest !== null,
  )) {
    return { ok: false, reason: 'BUY_NOW_UNAVAILABLE' };
  }

  const buyer = await db.user.findUnique({ where: { id: input.buyerId } });
  if (buyer === null) return { ok: false, reason: 'PROFILE_INCOMPLETE' };
  // القاعدة في `profileCompletion` وحدها — تتبعها الشاشة والحارس معًا
  if (!profileCompletion(buyer).canBuy) return { ok: false, reason: 'PROFILE_INCOMPLETE' };
  // أوّل إجراءٍ ماليّ هو لحظة السؤال — كما في الشراء المباشر
  if (buyer.taxStatus === null) return { ok: false, reason: 'TAX_STATUS_REQUIRED' };

  const price = Number(auction.buyNowPrice);

  const created = await db.$transaction(async (tx) => {
    const existing = await tx.order.findFirst({
      where: { listingId: auction.listing.id, status: 'ACTIVE' },
      select: { id: true },
    });
    if (existing !== null) return { ok: false as const, reason: 'ORDER_EXISTS' as const };

    if (auction.listing.status !== 'PUBLISHED' && auction.listing.status !== 'RESERVED') {
      return { ok: false as const, reason: 'LISTING_UNAVAILABLE' as const };
    }

    const amounts = await computeOrderAmounts(tx, price, now);

    /** عربونُ المشتري إن كان قد زايد — يُخصم كما في رسوّ المزاد. */
    const own = await tx.deposit.findFirst({
      where: {
        auctionId: auction.id,
        userId: input.buyerId,
        status: { in: ['HELD', 'APPLIED'] },
        paymentId: { not: null },
      },
      select: { amount: true },
    });

    const depositApplied = own?.amount ?? new Prisma.Decimal(0);
    const paymentWindow = await deadline('paymentWindowHours');
    const ref = await nextOrderRef(tx, now);

    await tx.order.create({
      data: {
        ref,
        listingId: auction.listing.id,
        buyerId: input.buyerId,
        sellerId: auction.listing.sellerId,
        source: 'BUY_NOW',
        stage: 'PAYMENT',
        ...amounts,
        totalAmount: amounts.totalAmount.minus(depositApplied),
        depositApplied,
        createdAt: now,
        stageEnteredAt: now,
        paymentDueAt: new Date(now.getTime() + paymentWindow * 3600 * 1000),
      },
    });

    const order = await tx.order.findUniqueOrThrow({
      where: { ref },
      select: { id: true },
    });

    await reserveListing(tx, auction.listing.id, 'auction.buy_now', now);

    /** والمزاد يُغلق في المعاملة نفسها — ومزادٌ مفتوح على مركبةٍ بيعت يقبل مزايدة. */
    await tx.auction.update({
      where: { id: auction.id },
      data: { status: 'ENDED_MET', endsAt: now },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'order.created',
        actorType: 'user',
        actorId: input.buyerId,
        createdAt: now,
        payload: { source: 'BUY_NOW', auctionId: auction.id, price: String(price) },
      },
    });

    /** و«اشترِ الآن» تُنهي مزاد البائع فجأةً — فهو أحوج الناس إلى الخبر. */
    const { notifyOrderCreated } = await import('./order-notify');
    await notifyOrderCreated(
      tx,
      {
        ref,
        buyerId: input.buyerId,
        sellerId: auction.listing.sellerId,
        amount: String(price),
      },
      { buyer: true },
    );

    return { ok: true as const, ref, amount: amounts.totalAmount.minus(depositApplied).toString() };
  });

  if (!created.ok) return { ok: false, reason: created.reason };

  /**
   * **والعرابين بعد المعاملة لا فيها.** `settleDeposits` تنادي
   * البوابة لكل مزايد، ونداءُ شبكةٍ داخل معاملةٍ يحبس الصفوف حتى
   * يردّ طرفٌ بعيد — وتعثّرُه يُسقط طلبًا أُنشئ بنجاح.
   */
  await settleDeposits(auction.id, input.buyerId, now);

  /**
   * **ومن زايد يُخبَر.** مزادٌ يختفي من تحت مزايدٍ بلا كلمة يُقرأ
   * عطلًا — وقد خسر وقتَه وحجز مالَه.
   */
  const bidders = await db.bid.findMany({
    where: { auctionId: auction.id, bidderId: { not: input.buyerId } },
    select: { bidderId: true },
    distinct: ['bidderId'],
  });

  if (bidders.length > 0) {
    await notifyMany(
      bidders.map((bid) => ({
        userId: bid.bidderId,
        /**
         * **والمفتاح من القوالب المزروعة.** `auction.bought_now`
         * ليس فيها، وإشعارٌ بمفتاحٍ بلا قالب يصل فارغًا — فيُرى
         * سطرٌ أبيض في صندوق الوارد. و`auction.lost` نصُّها «انتهى
         * المزاد» وهو صادقٌ هنا حرفيًّا.
         */
        templateKey: 'auction.lost',
        priority: 'normal',
        entityType: 'Auction' as const,
        entityId: auction.id,
      })),
    );
  }

  return { ok: true, orderRef: created.ref, amount: created.amount };
}
