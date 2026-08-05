import { db } from '@/lib/db';

/**
 * ═══ قرّاء التفاصيل الباقون ═══
 *
 * ثمانُ قوائم تعرض صفوفًا ولا تفتحها: المزاد والعرض والنزاع والبلاغ
 * وطلب الخدمة والتوثيق والمعرض والتسوية.
 *
 * ═══ وكلٌّ يُقرأ بما يُتصرَّف به فيه ═══
 *
 * لا بما يمكن جرُّه: صفحةُ نزاعٍ تحتاج رسائله وطرفيه ومهلته، ولا تحتاج
 * كل حقلٍ في الطلب. و`include` مفتوحٌ يجرّ ما لا يُعرض ويُبطئ ما يُعرض.
 */

// ═══════════════════════════════════════════════════════════
//  المزاد
// ═══════════════════════════════════════════════════════════

export type AdminAuctionDetail = {
  listingRef: string;
  title: string;
  city: string;
  status: string;
  /** انقضى الوقت ولم تمرّ الوظيفة — والحالة وحدها لا تكفي متى كان لها وقت */
  timeElapsed: boolean;
  startPrice: string;
  bidIncrement: string;
  depositAmount: string;
  buyNowPrice: string | null;
  startsAt: string;
  endsAt: string;
  extendedCount: number;
  sellerDecisionDueAt: string | null;
  /** أعلى مزايدة — ولا حقل يخزّنها */
  topBid: string | null;
  seller: { id: string; name: string };
  bids: { id: string; amount: string; bidderName: string; isAuto: boolean; at: string }[];
  deposits: { id: string; amount: string; status: string; userName: string }[];
};

export async function adminAuctionDetail(
  listingRef: string,
  now: Date = new Date(),
): Promise<AdminAuctionDetail | null> {
  const auction = await db.auction.findFirst({
    where: { listing: { ref: listingRef } },
    include: {
      listing: {
        select: {
          ref: true,
          city: true,
          seller: { select: { id: true, name: true, phone: true } },
          vehicle: { select: { brandName: true, modelName: true, year: true } },
        },
      },
      bids: {
        orderBy: { amount: 'desc' },
        take: 50,
        include: { bidder: { select: { name: true, phone: true } } },
      },
      deposits: { include: { user: { select: { name: true, phone: true } } } },
    },
  });

  if (auction === null) return null;

  /** الاسم مختصرٌ في القنوات العامة — وهذه لوحةُ أدمن، فالاسم كاملًا. */
  const nameOf = (user: { name: string | null; phone: string }): string => user.name ?? user.phone;

  return {
    listingRef: auction.listing.ref,
    title: `${auction.listing.vehicle.brandName} ${auction.listing.vehicle.modelName}`,
    city: auction.listing.city,
    status: auction.status,
    /**
     * **الوقت والحالة معًا.** الشاشة كانت تقرأ `status === 'LIVE'`
     * والوظيفة لم تمرّ، فتعرض «مباشر» ويردّ الخادم «انتهى المزاد».
     */
    timeElapsed: auction.endsAt.getTime() <= now.getTime(),
    startPrice: auction.startPrice.toFixed(2),
    bidIncrement: auction.bidIncrement.toFixed(2),
    depositAmount: auction.depositAmount.toFixed(2),
    buyNowPrice: auction.buyNowPrice?.toFixed(2) ?? null,
    startsAt: auction.startsAt.toISOString(),
    endsAt: auction.endsAt.toISOString(),
    extendedCount: auction.extendedCount,
    sellerDecisionDueAt: auction.sellerDecisionDueAt?.toISOString() ?? null,
    // **ولا يُعرض `reservePrice` هنا ولا في غيرها.**
    topBid: auction.bids[0]?.amount.toFixed(2) ?? null,
    seller: { id: auction.listing.seller.id, name: nameOf(auction.listing.seller) },
    bids: auction.bids.map((bid) => ({
      id: bid.id,
      amount: bid.amount.toFixed(2),
      bidderName: nameOf(bid.bidder),
      isAuto: bid.isAuto,
      at: bid.createdAt.toISOString(),
    })),
    deposits: auction.deposits.map((deposit) => ({
      id: deposit.id,
      amount: deposit.amount.toFixed(2),
      status: deposit.status,
      userName: nameOf(deposit.user),
    })),
  };
}

// ═══════════════════════════════════════════════════════════
//  العرض وسلسلة المقابلات
// ═══════════════════════════════════════════════════════════

export type AdminOfferDetail = {
  id: string;
  amount: string;
  status: string;
  autoRejected: boolean;
  expiresAt: string;
  expired: boolean;
  createdAt: string;
  buyer: { id: string; name: string };
  listing: { ref: string; title: string; askPrice: string; sellerName: string };
  /** السلسلة كاملةً من الجذر — والمقابل يحتفظ بـ`buyerId` الأصليّ */
  chain: { id: string; amount: string; status: string; fromBuyer: boolean; at: string }[];
};

export async function adminOfferDetail(
  id: string,
  now: Date = new Date(),
): Promise<AdminOfferDetail | null> {
  const offer = await db.offer.findUnique({
    where: { id },
    include: {
      buyer: { select: { id: true, name: true, phone: true } },
      listing: {
        select: {
          ref: true,
          askPrice: true,
          seller: { select: { id: true, name: true, phone: true } },
          vehicle: { select: { brandName: true, modelName: true } },
        },
      },
    },
  });

  if (offer === null) return null;

  /**
   * السلسلة كلّها على الإعلان نفسه من المشتري نفسه — **والمُرسِل لا
   * يُشتقّ من الدور**: المقابل يحتفظ بـ`buyerId` الأصليّ، فكان البائع
   * يرى مقابلَه في «واردة» وفوقه «اقبل».
   */
  const chain = await db.offer.findMany({
    where: { listingId: offer.listingId, buyerId: offer.buyerId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, amount: true, status: true, parentOfferId: true, createdAt: true },
  });

  const nameOf = (user: { name: string | null; phone: string }): string => user.name ?? user.phone;

  return {
    id: offer.id,
    amount: offer.amount.toFixed(2),
    status: offer.status,
    autoRejected: offer.autoRejected,
    expiresAt: offer.expiresAt.toISOString(),
    // المهلة والزمن معًا — وعرضٌ انقضت مهلتُه ليس «قائمًا»
    expired: offer.expiresAt.getTime() <= now.getTime(),
    createdAt: offer.createdAt.toISOString(),
    buyer: { id: offer.buyer.id, name: nameOf(offer.buyer) },
    listing: {
      ref: offer.listing.ref,
      title: `${offer.listing.vehicle.brandName} ${offer.listing.vehicle.modelName}`,
      askPrice: offer.listing.askPrice.toFixed(2),
      sellerName: nameOf(offer.listing.seller),
    },
    chain: chain.map((row) => ({
      id: row.id,
      amount: row.amount.toFixed(2),
      status: row.status,
      // الجذر من المشتري، وكل مقابلٍ يعكس الطرف
      fromBuyer: row.parentOfferId === null,
      at: row.createdAt.toISOString(),
    })),
  };
}

// ═══════════════════════════════════════════════════════════
//  النزاع
// ═══════════════════════════════════════════════════════════

export type AdminDisputeDetail = {
  id: string;
  reason: string;
  status: string;
  slaDueAt: string | null;
  slaBreached: boolean;
  resolution: string | null;
  resolutionAmount: string | null;
  resolvedAt: string | null;
  openedAt: string;
  openedByName: string;
  order: { ref: string; stage: string; agreedPrice: string; buyerName: string; sellerName: string };
  /**
   * **الرسائل عمودُ `Json[]` لا علاقة.** وشكلُها
   * `{ authorId, body, at }` كما يكتبها `addDisputeMessage` — ولا
   * `id` فيها، فالمفتاح موضعُها.
   */
  messages: { index: number; body: string; authorSide: 'buyer' | 'seller' | 'admin'; at: string }[];
};

export async function adminDisputeDetail(
  id: string,
  now: Date = new Date(),
): Promise<AdminDisputeDetail | null> {
  const dispute = await db.dispute.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          ref: true,
          stage: true,
          agreedPrice: true,
          buyerId: true,
          sellerId: true,
          buyer: { select: { name: true, phone: true } },
          seller: { select: { name: true, phone: true } },
        },
      },
    },
  });

  if (dispute === null) return null;

  const nameOf = (user: { name: string | null; phone: string }): string => user.name ?? user.phone;

  return {
    id: dispute.id,
    reason: dispute.reason,
    status: dispute.status,
    slaDueAt: dispute.slaDueAt?.toISOString() ?? null,
    /** المهلة والزمن معًا — ونزاعٌ فات موعدُه وهو مفتوح متجاوز */
    slaBreached:
      dispute.slaDueAt !== null &&
      dispute.slaDueAt.getTime() < now.getTime() &&
      dispute.resolvedAt === null,
    resolution: dispute.resolution,
    resolutionAmount: dispute.resolutionAmount?.toFixed(2) ?? null,
    resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
    openedAt: dispute.openedAt.toISOString(),
    // من فتحه — والمقارنة بـ`buyerId` لا بدورٍ مُستنتَج
    openedByName:
      dispute.openedBy === dispute.order.buyerId
        ? nameOf(dispute.order.buyer)
        : nameOf(dispute.order.seller),
    order: {
      ref: dispute.order.ref,
      stage: dispute.order.stage,
      agreedPrice: dispute.order.agreedPrice.toFixed(2),
      buyerName: nameOf(dispute.order.buyer),
      sellerName: nameOf(dispute.order.seller),
    },
    messages: dispute.messages.map((raw, index) => {
      const message = raw as { authorId?: string; body?: string; at?: string } | null;
      return {
        index,
        body: message?.body ?? '',
        /**
         * **والمُرسِل يُقارن بمعرّفه لا يُشتقّ.** قارنتُ أوّلًا
         * `authorId === orderId` سهوًا — مقارنةٌ لا تصدق أبدًا، فكل
         * رسالةٍ كانت تُنسب إلى الإدارة بلا خطأ يظهر.
         *
         * والنطاق يعيد الجانب مفتاحًا، والاسم في الشاشة (البوابة ١٧).
         */
        authorSide:
          message?.authorId === dispute.order.buyerId
            ? ('buyer' as const)
            : message?.authorId === dispute.order.sellerId
              ? ('seller' as const)
              : ('admin' as const),
        at: message?.at ?? '',
      };
    }),
  };
}

// ═══════════════════════════════════════════════════════════
//  البلاغ
// ═══════════════════════════════════════════════════════════

export type AdminReportDetail = {
  ref: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  attachments: string[];
  status: string;
  createdAt: string;
  reporter: { id: string; name: string };
  /** الهدف بمرجعه حين نستطيع قراءته — ومعرّفٌ خام لا يُتصرَّف به */
  targetRef: string | null;
};

export async function adminReportDetail(ref: string): Promise<AdminReportDetail | null> {
  const report = await db.report.findUnique({
    where: { ref },
    include: { reporter: { select: { id: true, name: true, phone: true } } },
  });

  if (report === null) return null;

  /**
   * **المعرّف الخام لا يُتصرَّف به.** ومن يقرأ بلاغًا على `cm...` لا
   * يعرف على ماذا بُلِّغ — فيُقرأ مرجعُ الهدف حين يكون له مرجع.
   */
  /**
   * **والقيمة صغيرة الحروف** — `'listing' | 'user'` كما يكتبها
   * `fileReport`. قارنتُ بـ`'LISTING'` أوّلًا فما طابقت قطّ، فبقي مرجع
   * الهدف `null` دائمًا **بلا خطأ يظهر** — وهو الصنف نفسه الذي جعل
   * حالة البلاغ تُقارن بـ`'DISMISSED'` والكاتبُ يكتب `'open'`.
   */
  let targetRef: string | null = null;
  if (report.targetType === 'listing') {
    const listing = await db.listing.findUnique({
      where: { id: report.targetId },
      select: { ref: true },
    });
    targetRef = listing?.ref ?? null;
  } else if (report.targetType === 'user') {
    const user = await db.user.findUnique({
      where: { id: report.targetId },
      select: { name: true, phone: true },
    });
    targetRef = user === null ? null : (user.name ?? user.phone);
  }

  return {
    ref: report.ref,
    targetType: report.targetType,
    targetId: report.targetId,
    reason: report.reason,
    details: report.details,
    attachments: report.attachments,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
    reporter: {
      id: report.reporter.id,
      name: report.reporter.name ?? report.reporter.phone,
    },
    targetRef,
  };
}

// ═══════════════════════════════════════════════════════════
//  طلب الخدمة
// ═══════════════════════════════════════════════════════════

export type AdminServiceRequestDetail = {
  ref: string;
  status: string;
  amount: string;
  adminFee: string;
  createdAt: string;
  dueAt: string | null;
  overdue: boolean;
  resultUrl: string | null;
  service: { nameAr: string; category: string };
  provider: { id: string; nameAr: string; slaHours: number | null } | null;
  customer: { id: string; name: string };
  listingRef: string | null;
  inspectionScore: number | null;
};

export async function adminServiceRequestDetail(
  ref: string,
  now: Date = new Date(),
): Promise<AdminServiceRequestDetail | null> {
  const request = await db.serviceRequest.findUnique({
    where: { ref },
    include: {
      service: { select: { nameAr: true, category: true } },
      provider: { select: { id: true, nameAr: true, slaHours: true } },
      user: { select: { id: true, name: true, phone: true } },
      listing: { select: { ref: true } },
      inspectionReport: { select: { score: true, ref: true } },
    },
  });

  if (request === null) return null;

  const OPEN = ['NEW', 'ASSIGNED', 'IN_PROGRESS'];

  return {
    ref: request.ref,
    status: request.status,
    amount: request.amount.toFixed(2),
    adminFee: request.adminFee.toFixed(2),
    createdAt: request.createdAt.toISOString(),
    dueAt: request.dueAt?.toISOString() ?? null,
    // المهلة والزمن والحالة — ومنتهٍ فات موعدُه ليس متأخّرًا: لا أحد ينتظره
    overdue:
      request.dueAt !== null &&
      request.dueAt.getTime() < now.getTime() &&
      OPEN.includes(request.status),
    resultUrl: request.resultUrl,
    service: request.service,
    provider: request.provider,
    customer: { id: request.user.id, name: request.user.name ?? request.user.phone },
    listingRef: request.listing?.ref ?? null,
    inspectionScore: request.inspectionReport?.score ?? null,
  };
}

// ═══════════════════════════════════════════════════════════
//  المعرض
// ═══════════════════════════════════════════════════════════

export type AdminDealerDetail = {
  id: string;
  slug: string;
  nameAr: string;
  city: string;
  phone: string | null;
  crNumber: string | null;
  vatNumber: string | null;
  verified: boolean;
  status: string;
  ratingAvg: string | null;
  ratingCount: number;
  createdAt: string;
  marginSchemeApproved: boolean;
  marginSchemeRef: string | null;
  members: { id: string; name: string; phone: string; role: string }[];
  counts: { vehicles: number; listings: number };
  listings: { ref: string; status: string; askPrice: string }[];
};

export async function adminDealerDetail(id: string): Promise<AdminDealerDetail | null> {
  const dealer = await db.dealer.findUnique({
    where: { id },
    include: {
      members: { select: { id: true, name: true, phone: true, role: true } },
      _count: { select: { vehicles: true } },
    },
  });

  if (dealer === null) return null;

  const memberIds = dealer.members.map((member) => member.id);

  const [listingCount, listings] = await Promise.all([
    memberIds.length === 0
      ? Promise.resolve(0)
      : db.listing.count({ where: { sellerId: { in: memberIds } } }),
    memberIds.length === 0
      ? Promise.resolve([])
      : db.listing.findMany({
          where: { sellerId: { in: memberIds } },
          orderBy: { publishedAt: 'desc' },
          take: 10,
          select: { ref: true, status: true, askPrice: true },
        }),
  ]);

  return {
    id: dealer.id,
    slug: dealer.slug,
    nameAr: dealer.nameAr,
    city: dealer.city,
    phone: dealer.phone,
    crNumber: dealer.crNumber,
    vatNumber: dealer.vatNumber,
    verified: dealer.verified,
    status: dealer.status,
    ratingAvg: dealer.ratingAvg?.toFixed(1) ?? null,
    ratingCount: dealer.ratingCount,
    createdAt: dealer.createdAt.toISOString(),
    marginSchemeApproved: dealer.marginSchemeApproved,
    marginSchemeRef: dealer.marginSchemeRef,
    members: dealer.members.map((member) => ({
      id: member.id,
      name: member.name ?? member.phone,
      phone: member.phone,
      role: member.role,
    })),
    counts: { vehicles: dealer._count.vehicles, listings: listingCount },
    listings: listings.map((listing) => ({
      ref: listing.ref,
      status: listing.status,
      askPrice: listing.askPrice.toFixed(2),
    })),
  };
}
