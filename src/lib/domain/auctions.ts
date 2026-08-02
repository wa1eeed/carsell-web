import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

/**
 * المزاد — القواعد ٦–١٠ من القسم ٧.
 *
 * ٦.  المزايدة ≥ أعلى + `bidIncrement`
 * ٧.  مزايدة في آخر دقيقة ⇒ تمديد ٥ دقائق بحدٍّ أقصى معلن
 * ٨.  `reservePrice` لا يظهر ولا يُستنتج من نصّ
 * ٩.  العربون: يُرد لغير الفائزين، يُخصم للفائز، يُصادَر عند الانسحاب
 * ١٠. «اشترِ الآن» يختفي متى بلغت المزايدات الاحتياطي
 */

/** القاعدة ٧ — التمديد ونافذته وحدّه. */
export const EXTEND_WINDOW_SECONDS = 60;
export const EXTEND_BY_SECONDS = 5 * 60;
// DESIGN-Q ٥: الحدّ مشترك لا لكل مزايد
export const MAX_EXTENSIONS = 10;

export type BidFailure =
  | 'AUCTION_NOT_FOUND'
  | 'NOT_LIVE'
  | 'ENDED'
  | 'OWN_AUCTION'
  | 'BELOW_MINIMUM'
  | 'NO_DEPOSIT';

export type BidResult =
  | {
      ok: true;
      amount: string;
      minimumNext: string;
      extended: boolean;
      endsAt: Date;
      bidCount: number;
    }
  | { ok: false; reason: BidFailure; minimumNext?: string };

/**
 * ═══ القاعدة ٦ ═══ الحدّ الأدنى للمزايدة التالية.
 *
 * أوّل مزايدة = سعر الافتتاح بلا خطوة. وما بعدها = أعلى + خطوة.
 * وإضافة الخطوة إلى الافتتاح تجعل أوّل مزايد يدفع أكثر مما أعلنه البائع.
 */
export function minimumBid(
  startPrice: number,
  highest: number | null,
  increment: number,
): number {
  return highest === null ? startPrice : highest + increment;
}

/**
 * ═══ القاعدة ١٠ ═══ «اشترِ الآن» يختفي متى بلغت المزايدات الاحتياطي.
 *
 * **الراية وحدها تخرج، لا المبلغ** (قاعدة ٨). وسبب الاختفاء: بعد بلوغ
 * الاحتياطي صارت المركبة تُباع حتمًا، فـ«اشترِ الآن» يسحبها من المزايدين
 * بسعر قد يكون أقلّ مما سيبلغونه.
 */
export function buyNowAvailable(
  buyNowPrice: number | null,
  reserveMet: boolean,
): boolean {
  return buyNowPrice !== null && !reserveMet;
}

/**
 * ═══ القاعدة ٨ ═══ الاحتياطي لا يظهر ولا يُستنتج.
 *
 * **يُحسب هنا ولا يُعاد**: الدالة تأخذ المبلغ السرّي وتعيد راية. ولا
 * مسار ولا مُسلسِل يلمس `reservePrice` — وهذا ما يجعل التسريب مستحيلًا
 * بالبناء لا ممنوعًا بالمراجعة.
 */
export function isReserveMet(reservePrice: Prisma.Decimal | null, highest: number | null): boolean {
  if (reservePrice === null) return true; // بلا احتياطي فالبيع حتميّ
  return highest !== null && highest >= Number(reservePrice);
}

/**
 * تقديم مزايدة.
 *
 * **العربون شرط مسبق** (القاعدة ٩): مزايدةٌ بلا عربون تعني مزايدًا بلا
 * كلفة انسحاب، وهو ما يُفرغ المزاد من معناه. والفحص هنا لا في الشاشة.
 */
export async function placeBid(
  input: { auctionId: string; bidderId: string; amount: number; isAuto?: boolean },
  now: Date = new Date(),
): Promise<BidResult> {
  return db.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({
      where: { id: input.auctionId },
      include: { listing: { select: { sellerId: true } } },
    });

    if (auction === null) return { ok: false, reason: 'AUCTION_NOT_FOUND' };
    if (auction.status !== 'LIVE') return { ok: false, reason: 'NOT_LIVE' };
    if (auction.endsAt <= now) return { ok: false, reason: 'ENDED' };
    // البائع لا يزايد على مركبته — يرفع السعر بلا مشترٍ حقيقي
    if (auction.listing.sellerId === input.bidderId) return { ok: false, reason: 'OWN_AUCTION' };

    const deposit = await tx.deposit.findFirst({
      where: { auctionId: auction.id, userId: input.bidderId, status: 'HELD' },
      select: { id: true },
    });
    if (deposit === null) return { ok: false, reason: 'NO_DEPOSIT' };

    const top = await tx.bid.aggregate({
      where: { auctionId: auction.id },
      _max: { amount: true },
      _count: { _all: true },
    });
    const bidCount = top._count._all;
    const highest = top._max.amount === null ? null : Number(top._max.amount);
    const minimum = minimumBid(
      Number(auction.startPrice),
      highest,
      Number(auction.bidIncrement),
    );

    if (input.amount < minimum) {
      return { ok: false, reason: 'BELOW_MINIMUM', minimumNext: String(minimum) };
    }

    await tx.bid.create({
      data: {
        auctionId: auction.id,
        bidderId: input.bidderId,
        amount: new Prisma.Decimal(input.amount),
        isAuto: input.isAuto ?? false,
        createdAt: now,
      },
    });

    /**
     * ═══ القاعدة ٧ ═══ مزايدة في آخر دقيقة تمدّد خمس دقائق.
     *
     * والحدّ الأقصى **معلن**: بلا حدٍّ يمدّ مزايدان المزاد إلى ما لا
     * نهاية بمزايدة كل دقيقة، فيصير الانتظار سلاحًا. وبالحدّ ينتهي
     * المزاد في وقت يعرفه الجميع.
     */
    const remaining = (auction.endsAt.getTime() - now.getTime()) / 1000;
    const shouldExtend =
      remaining <= EXTEND_WINDOW_SECONDS && auction.extendedCount < MAX_EXTENSIONS;

    const endsAt = shouldExtend
      ? new Date(now.getTime() + EXTEND_BY_SECONDS * 1000)
      : auction.endsAt;

    if (shouldExtend) {
      await tx.auction.update({
        where: { id: auction.id },
        data: { endsAt, extendedCount: { increment: 1 } },
      });
    }

    return {
      ok: true,
      amount: String(input.amount),
      minimumNext: String(input.amount + Number(auction.bidIncrement)),
      extended: shouldExtend,
      endsAt,
      bidCount: bidCount + 1,
    };
  });
}

/**
 * ينشر ما وقع — **بعد الحفظ لا قبله**.
 *
 * منفصل عن `placeBid` عمدًا: النشر يعتمد على Redis وقد يفشل، والمزايدة
 * محفوظة بالفعل. وضمّه داخل المعاملة يجعل تعطُّل Redis يُفشل مزايدة
 * ناجحة — وهو أسوأ ما يمكن أن يفعله ناقل إشعارات.
 *
 * ولا اسم كامل ولا معرّف في الرسالة (قرار الوقت الحقيقي).
 */
export async function publishBid(
  result: Extract<BidResult, { ok: true }>,
  auctionId: string,
  bidderName: string | null,
): Promise<void> {
  const { publish } = await import('@/lib/realtime/publish');

  await publish({
    type: 'bid.placed',
    auctionId,
    amount: result.amount,
    bidderMasked: maskName(bidderName),
    bidCount: result.bidCount,
  });

  if (result.extended) {
    await publish({
      type: 'auction.extended',
      auctionId,
      newEndsAt: result.endsAt.toISOString(),
    });
  }
}

/** «خالد العتيبي» ⇒ «خالد ع.» — يكفي للمتابعة ولا يكشف أحدًا. */
export function maskName(name: string | null): string {
  const clean = (name ?? '').trim();
  if (clean === '') return 'مزايد';
  const parts = clean.split(/\s+/);
  const first = parts[0] ?? '';
  const rest = parts[1];
  return rest === undefined ? first : `${first} ${rest.slice(0, 1)}.`;
}

export type DepositResult =
  | { ok: true; depositId: string }
  | { ok: false; reason: 'AUCTION_NOT_FOUND' | 'ALREADY_HELD' | 'NOT_OPEN' };

/** ═══ القاعدة ٩، أوّلها ═══ حجز العربون قبل المزايدة. */
export async function holdDeposit(
  input: { auctionId: string; userId: string },
  _now: Date = new Date(),
): Promise<DepositResult> {
  const auction = await db.auction.findUnique({
    where: { id: input.auctionId },
    select: { id: true, status: true, depositAmount: true },
  });
  if (auction === null) return { ok: false, reason: 'AUCTION_NOT_FOUND' };
  if (auction.status !== 'LIVE' && auction.status !== 'SCHEDULED') {
    return { ok: false, reason: 'NOT_OPEN' };
  }

  const existing = await db.deposit.findFirst({
    where: { auctionId: auction.id, userId: input.userId, status: 'HELD' },
    select: { id: true },
  });
  if (existing !== null) return { ok: false, reason: 'ALREADY_HELD' };

  const deposit = await db.deposit.create({
    data: {
      auctionId: auction.id,
      userId: input.userId,
      amount: auction.depositAmount,
      status: 'HELD',
    },
  });
  return { ok: true, depositId: deposit.id };
}

/**
 * ═══ القاعدة ٩، تمامها ═══ مصير العربون عند الإغلاق.
 *
 * · غير الفائزين ⇒ يُرد فورًا. حبسُه بعد انتهاء المزاد ليس ضمانة بل
 *   احتجاز مال بلا سبب.
 * · الفائز ⇒ يُخصم من الطلب (`APPLIED`)، لا يُرد ثم يُدفع مجدّدًا.
 * · المنسحب ⇒ يُصادَر. وهذا ما يجعل المزايدة التزامًا لا نيّة.
 */
export async function settleDeposits(
  auctionId: string,
  winnerId: string | null,
  now: Date = new Date(),
): Promise<{ refunded: number; applied: number }> {
  const held = await db.deposit.findMany({
    where: { auctionId, status: 'HELD' },
    select: { id: true, userId: true },
  });

  const losers = held.filter((deposit) => deposit.userId !== winnerId);
  const winner = held.find((deposit) => deposit.userId === winnerId);

  await db.deposit.updateMany({
    where: { id: { in: losers.map((deposit) => deposit.id) } },
    // `RELEASED` في `Deposit` تعني **الردّ إلى المزايد**، بعكس معناها
    // في `Escrow` حيث تعني الإفراج للبائع. الكلمة واحدة والاتجاه معكوس،
    // فالمفردة من المخطط والفرق موثَّق في docs/api/auctions.md.
    data: { status: 'RELEASED', releasedAt: now },
  });

  if (winner !== undefined) {
    await db.deposit.update({
      where: { id: winner.id },
      data: { status: 'APPLIED', releasedAt: now },
    });
  }

  return { refunded: losers.length, applied: winner === undefined ? 0 : 1 };
}

/** الانسحاب بعد الفوز — العربون يُصادَر. */
export async function forfeitDeposit(
  input: { auctionId: string; userId: string },
  now: Date = new Date(),
): Promise<{ ok: boolean }> {
  const { count } = await db.deposit.updateMany({
    where: { auctionId: input.auctionId, userId: input.userId, status: { in: ['HELD', 'APPLIED'] } },
    data: { status: 'FORFEITED', releasedAt: now },
  });
  return { ok: count > 0 };
}

export type PublicAuction = {
  id: string;
  listingRef: string;
  status: string;
  startPrice: string;
  bidIncrement: string;
  depositAmount: string;
  /** `null` متى بلغت المزايدات الاحتياطي — القاعدة ١٠. */
  buyNowPrice: string | null;
  startsAt: string;
  endsAt: string;
  extendedCount: number;
  maxExtensions: number;
  bidCount: number;
  bidderCount: number;
  highestBid: string | null;
  minimumBid: string;
  /** راية وحدها — لا المبلغ ولا ما يُشتقّ منه (القاعدة ٨). */
  reserveMet: boolean;
  /** المزايدون **بأسماء مستعارة** — الهوية الكاملة لا تخرج. */
  bids: { alias: string; amount: string; at: string; isAuto: boolean }[];
};

/**
 * اسم مستعار ثابت للمزايد داخل مزاد واحد.
 *
 * «مزايد ٣» يكفي القارئ ليتابع من يزايد على من، ولا يكشف أحدًا. واستعمال
 * ترتيب أوّل ظهور — لا معرّفًا مقطوعًا — يمنع مطابقة نفس المزايد عبر
 * مزادين.
 */
// DESIGN-Q ٦: الترقيم بترتيب أوّل ظهور يكشف ترتيب الوصول
function aliasMap(bids: readonly { bidderId: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const bid of [...bids].reverse()) {
    if (!map.has(bid.bidderId)) map.set(bid.bidderId, map.size + 1);
  }
  return map;
}

export async function getAuction(
  listingRef: string,
  now: Date = new Date(),
): Promise<PublicAuction | null> {
  const auction = await db.auction.findFirst({
    where: { listing: { ref: listingRef } },
    include: {
      listing: { select: { ref: true } },
      bids: { orderBy: { createdAt: 'desc' }, take: 50 },
      _count: { select: { bids: true } },
    },
  });
  if (auction === null) return null;

  const highest = auction.bids[0] === undefined ? null : Number(auction.bids[0].amount);
  const reserveMet = isReserveMet(auction.reservePrice, highest);
  const aliases = aliasMap(auction.bids);

  void now;

  return {
    id: auction.id,
    listingRef: auction.listing.ref,
    status: auction.status,
    startPrice: auction.startPrice.toString(),
    bidIncrement: auction.bidIncrement.toString(),
    depositAmount: auction.depositAmount.toString(),
    // القاعدة ١٠ — يختفي، ولا يُعرض معطّلًا
    buyNowPrice: buyNowAvailable(
      auction.buyNowPrice === null ? null : Number(auction.buyNowPrice),
      reserveMet,
    )
      ? (auction.buyNowPrice?.toString() ?? null)
      : null,
    startsAt: auction.startsAt.toISOString(),
    endsAt: auction.endsAt.toISOString(),
    extendedCount: auction.extendedCount,
    maxExtensions: MAX_EXTENSIONS,
    bidCount: auction._count.bids,
    bidderCount: aliases.size,
    highestBid: highest === null ? null : String(highest),
    minimumBid: String(
      minimumBid(Number(auction.startPrice), highest, Number(auction.bidIncrement)),
    ),
    reserveMet,
    bids: auction.bids.map((bid) => ({
      alias: String(aliases.get(bid.bidderId) ?? 0),
      amount: bid.amount.toString(),
      at: bid.createdAt.toISOString(),
      isAuto: bid.isAuto,
    })),
  };
}

/**
 * إغلاق المزادات المنتهية.
 *
 * `ENDED_MET` أو `ENDED_UNMET` بحسب بلوغ الاحتياطي — والراية وحدها هي
 * ما يظهر. والعرابين تُسوّى في نفس اللحظة: تركُها معلّقة إلى وظيفة
 * ثانية يعني مالًا محتجزًا بلا سبب لكل من خسر.
 */
// DESIGN-Q ٤: العرابين تُسوّى فورًا عند احتياطي غير مبلوغ — قبل أيّ قبول لاحق
export async function closeEndedAuctions(now: Date = new Date()): Promise<number> {
  const ended = await db.auction.findMany({
    where: { status: 'LIVE', endsAt: { lte: now } },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });

  for (const auction of ended) {
    const top = auction.bids[0] ?? null;
    const highest = top === null ? null : Number(top.amount);
    const met = isReserveMet(auction.reservePrice, highest);

    await db.auction.update({
      where: { id: auction.id },
      data: { status: met ? 'ENDED_MET' : 'ENDED_UNMET' },
    });

    await settleDeposits(auction.id, met ? (top?.bidderId ?? null) : null, now);
  }

  return ended.length;
}
