import { Prisma } from '@/generated/prisma/client';
import type { AuctionStatus, ListingStatus, OfferStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';

/**
 * ═══ شاشات المراقبة — A16 · A22 · A23 · A27 ═══
 *
 * أربع شاشات تجمعها صفة واحدة: **تُقرأ ولا تُكتب**. المزاد يُدار من
 * قواعده، والعرض من طرفيه، والإعلان من طابور مراجعته، والتدقيق **لا
 * يُعدَّل ولا يُحذف** بحكم تعريفه.
 *
 * فلا مسار كتابةٍ لأيٍّ منها — وزرٌّ يُغري بالتدخّل في مفاوضةٍ بين
 * طرفين هو أوّل ما يُساء استعماله. التصميم يقولها في عنوان A23:
 * **«مراقبة لا تدخّل»**.
 *
 * ═══ والحالة المخزَّنة لا تكفي متى كان لها وقت ═══
 *
 * مزادٌ حالتُه `LIVE` وقد انقضى وقتُه ليس جاريًا، وعرضٌ `PENDING`
 * فاتت مهلتُه ليس نشطًا — والوظيفة الدورية تمرّ كل خمس دقائق. فالفرز
 * هنا **بالحالة وانقضاء الوقت معًا**، وإلّا عرضت الشاشة عددًا يكذب.
 */

const minutesSince = (from: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));

// ═══════════════════════════════════════════════════════════
//  A27 — كل الإعلانات
// ═══════════════════════════════════════════════════════════

export type ListingRow = {
  ref: string;
  title: string;
  year: number;
  sellerName: string;
  askPrice: string;
  type: string;
  status: ListingStatus;
  city: string;
  offerCount: number;
  viewCount: number;
  publishedAt: string | null;
};

export type ListingCounts = {
  total: number;
  published: number;
  pendingReview: number;
  reserved: number;
  sold: number;
  suspended: number;
  /** نصيب المنشور من الإجمالي — والانخفاض يعني طابورًا أو إيقافات */
  activeSharePct: number;
};

export async function allListings(
  status: ListingStatus | null = null,
  take = 100,
): Promise<ListingRow[]> {
  const rows = await db.listing.findMany({
    where: status === null ? {} : { status },
    orderBy: { publishedAt: { sort: 'desc', nulls: 'last' } },
    take,
    select: {
      ref: true,
      askPrice: true,
      type: true,
      status: true,
      city: true,
      viewCount: true,
      publishedAt: true,
      seller: { select: { name: true, phone: true } },
      vehicle: { select: { brandName: true, modelName: true, trimName: true, year: true } },
      _count: { select: { offers: true } },
    },
  });

  return rows.map((row) => ({
    ref: row.ref,
    title: [row.vehicle.brandName, row.vehicle.modelName, row.vehicle.trimName]
      .filter((part) => part !== null && part !== '')
      .join(' '),
    year: row.vehicle.year,
    sellerName: row.seller.name ?? row.seller.phone,
    askPrice: row.askPrice.toFixed(2),
    type: row.type,
    status: row.status,
    city: row.city,
    offerCount: row._count.offers,
    viewCount: row.viewCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  }));
}

export async function listingCounts(): Promise<ListingCounts> {
  const grouped = await db.listing.groupBy({ by: ['status'], _count: true });
  const at = (status: ListingStatus): number =>
    grouped.find((row) => row.status === status)?._count ?? 0;

  const total = grouped.reduce((sum, row) => sum + row._count, 0);
  const published = at('PUBLISHED');

  return {
    total,
    published,
    pendingReview: at('PENDING_REVIEW'),
    reserved: at('RESERVED'),
    sold: at('SOLD'),
    suspended: at('SUSPENDED'),
    activeSharePct: total === 0 ? 0 : Math.round((published / total) * 100),
  };
}

// ═══════════════════════════════════════════════════════════
//  A22 — المزادات
// ═══════════════════════════════════════════════════════════

export type AuctionRow = {
  listingRef: string;
  title: string;
  year: number;
  sellerName: string;
  /** أعلى مزايدة — و`null` حين لا مزايد */
  topBid: string | null;
  /** **بلغ الاحتياطي؟** — والاحتياطي نفسه لا يخرج في استجابة عامة */
  reserveMet: boolean;
  bidderCount: number;
  bidCount: number;
  status: AuctionStatus;
  /** ثوانٍ حتى الإغلاق — وسالبٌ يعني انقضى ولم تمرّ الوظيفة بعد */
  secondsLeft: number;
  endsAt: string;
};

export type AuctionCounts = {
  live: number;
  scheduled: number;
  unmet: number;
  ended: number;
  /** مجموع أعلى المزايدات في الجارية */
  liveValue: string;
  /** نصيب ما بلغ احتياطيه من المنتهية */
  clearancePct: number;
};

export async function auctionMonitor(
  filter: 'live' | 'scheduled' | 'unmet' | 'ended' | null = null,
  now: Date = new Date(),
): Promise<AuctionRow[]> {
  const rows = await db.auction.findMany({
    where:
      filter === 'live'
        ? { status: 'LIVE', endsAt: { gt: now } }
        : filter === 'scheduled'
          ? { status: 'SCHEDULED' }
          : filter === 'unmet'
            ? { status: 'ENDED_UNMET' }
            : filter === 'ended'
              ? { status: { in: ['ENDED_MET', 'ENDED_UNMET'] } }
              : {},
    orderBy: { endsAt: 'asc' },
    take: 100,
    select: {
      id: true,
      status: true,
      endsAt: true,
      reservePrice: true,
      listing: {
        select: {
          ref: true,
          seller: { select: { name: true, phone: true } },
          vehicle: { select: { brandName: true, modelName: true, year: true } },
        },
      },
      bids: { orderBy: { amount: 'desc' }, take: 1, select: { amount: true } },
      _count: { select: { bids: true } },
    },
  });

  /**
   * عدد **المزايدين** لا المزايدات — والفرق كبير: تسع عشرة مزايدة من
   * ثلاثة أشخاص سوقٌ ضيّق، ومن تسعة عشر سوقٌ حيّ.
   *
   * و`groupBy` لا يعطي `distinct` داخل التجميع، فتُقرأ الأزواج مرّةً
   * ويُعدّ الفريد في الشيفرة — استعلامٌ واحد لا استعلامٌ لكل صفّ.
   */
  const auctionIds = rows.map((row) => row.id);
  const bidPairs =
    auctionIds.length === 0
      ? []
      : await db.bid.findMany({
          where: { auctionId: { in: auctionIds } },
          select: { auctionId: true, bidderId: true },
          distinct: ['auctionId', 'bidderId'],
        });

  const bidderCounts = new Map<string, number>();
  for (const pair of bidPairs) {
    bidderCounts.set(pair.auctionId, (bidderCounts.get(pair.auctionId) ?? 0) + 1);
  }

  return rows.map((row) => {
    const top = row.bids[0]?.amount ?? null;
    return {
      listingRef: row.listing.ref,
      title: `${row.listing.vehicle.brandName} ${row.listing.vehicle.modelName}`,
      year: row.listing.vehicle.year,
      sellerName: row.listing.seller.name ?? row.listing.seller.phone,
      topBid: top === null ? null : top.toFixed(2),
      /**
       * **`reserveMet` لا `reservePrice`.** الاحتياطي سرّ البائع، وقد
       * حُرس في الاستجابة العامّة — فتسريبُه في لوحة الأدمن يجعله
       * يمرّ في لقطة شاشة أو تصدير.
       */
      reserveMet: top !== null && row.reservePrice !== null && top.greaterThanOrEqualTo(row.reservePrice),
      bidderCount: bidderCounts.get(row.id) ?? 0,
      bidCount: row._count.bids,
      status: row.status,
      secondsLeft: Math.floor((row.endsAt.getTime() - now.getTime()) / 1000),
      endsAt: row.endsAt.toISOString(),
    };
  });
}

export async function auctionCounts(now: Date = new Date()): Promise<AuctionCounts> {
  const [live, scheduled, unmet, met, liveRows] = await Promise.all([
    // **الحالة وانقضاء الوقت معًا** — و`LIVE` وحدها تعدّ المنتهي جاريًا
    db.auction.count({ where: { status: 'LIVE', endsAt: { gt: now } } }),
    db.auction.count({ where: { status: 'SCHEDULED' } }),
    db.auction.count({ where: { status: 'ENDED_UNMET' } }),
    db.auction.count({ where: { status: 'ENDED_MET' } }),
    db.auction.findMany({
      where: { status: 'LIVE', endsAt: { gt: now } },
      select: { bids: { orderBy: { amount: 'desc' }, take: 1, select: { amount: true } } },
    }),
  ]);

  const liveValue = liveRows.reduce(
    (sum, row) => sum.plus(row.bids[0]?.amount ?? 0),
    new Prisma.Decimal(0),
  );
  const ended = met + unmet;

  return {
    live,
    scheduled,
    unmet,
    ended,
    liveValue: liveValue.toFixed(2),
    clearancePct: ended === 0 ? 0 : Math.round((met / ended) * 100),
  };
}

// ═══════════════════════════════════════════════════════════
//  A23 — العروض والمفاوضات
// ═══════════════════════════════════════════════════════════

export type OfferRow = {
  id: string;
  listingRef: string;
  title: string;
  buyerName: string;
  sellerName: string;
  amount: string;
  askPrice: string;
  status: OfferStatus;
  autoRejected: boolean;
  isCounter: boolean;
  /** انقضت مهلته وإن بقيت حالته نشطة في الجدول */
  lapsed: boolean;
  waitingMinutes: number;
};

export type OfferCounts = {
  active: number;
  countered: number;
  accepted: number;
  autoRejected: number;
  /** بلا ردّ أكثر من يوم — وهي التي تسقط تلقائيًّا */
  stale: number;
  acceptancePct: number;
};

export async function offerMonitor(
  filter: 'active' | 'countered' | 'accepted' | 'auto' | null = null,
  now: Date = new Date(),
): Promise<OfferRow[]> {
  const rows = await db.offer.findMany({
    where:
      filter === 'active'
        ? { status: 'PENDING', expiresAt: { gt: now } }
        : filter === 'countered'
          ? { status: 'COUNTERED' }
          : filter === 'accepted'
            ? { status: 'ACCEPTED' }
            : filter === 'auto'
              ? { autoRejected: true }
              : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      amount: true,
      status: true,
      autoRejected: true,
      parentOfferId: true,
      createdAt: true,
      expiresAt: true,
      buyer: { select: { name: true, phone: true } },
      listing: {
        select: {
          ref: true,
          askPrice: true,
          seller: { select: { name: true, phone: true } },
          vehicle: { select: { brandName: true, modelName: true, year: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    listingRef: row.listing.ref,
    title: `${row.listing.vehicle.brandName} ${row.listing.vehicle.modelName} ${String(row.listing.vehicle.year)}`,
    buyerName: row.buyer.name ?? row.buyer.phone,
    sellerName: row.listing.seller.name ?? row.listing.seller.phone,
    amount: row.amount.toFixed(2),
    askPrice: row.listing.askPrice.toFixed(2),
    status: row.status,
    autoRejected: row.autoRejected,
    isCounter: row.parentOfferId !== null,
    lapsed: row.expiresAt <= now,
    waitingMinutes: minutesSince(row.createdAt, now),
  }));
}

export async function offerCounts(now: Date = new Date()): Promise<OfferCounts> {
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const [active, countered, accepted, autoRejected, stale, decided] = await Promise.all([
    // **نشط = الحالة ولم تنقضِ المهلة** — والحالة وحدها تعدّ الميّت حيًّا
    db.offer.count({ where: { status: 'PENDING', expiresAt: { gt: now } } }),
    db.offer.count({ where: { status: 'COUNTERED' } }),
    db.offer.count({ where: { status: 'ACCEPTED' } }),
    db.offer.count({ where: { autoRejected: true } }),
    db.offer.count({
      where: { status: 'PENDING', expiresAt: { gt: now }, createdAt: { lt: dayAgo } },
    }),
    db.offer.count({ where: { status: { in: ['ACCEPTED', 'REJECTED'] }, autoRejected: false } }),
  ]);

  return {
    active,
    countered,
    accepted,
    autoRejected,
    stale,
    // النسبة من العروض التي نظر فيها البائع — والمرفوض آليًّا لم ينظر فيه
    acceptancePct: decided === 0 ? 0 : Math.round((accepted / decided) * 100),
  };
}

// ═══════════════════════════════════════════════════════════
//  A16 — سجل التدقيق
// ═══════════════════════════════════════════════════════════

export type AuditRow = {
  id: string;
  actorId: string;
  /** `null` للنظام — والشاشة تصوغ اسمه */
  actorName: string | null;
  actorRole: string;
  actorType: string;
  action: string;
  entity: string;
  entityId: string;
  ip: string | null;
  createdAt: string;
};

/** أصناف الإجراءات الحسّاسة — والتصفية بها لا بالبحث النصّيّ. */
export const AUDIT_LENSES = {
  money: ['escrow.', 'payout.', 'commission.', 'deadline.', 'finance.'],
  identity: ['identity.', 'user.identity'],
  permissions: ['admin.', 'team.', 'role.'],
} as const;

export type AuditLens = keyof typeof AUDIT_LENSES;

export async function auditTrail(
  lens: AuditLens | null = null,
  take = 120,
): Promise<AuditRow[]> {
  const rows = await db.auditLog.findMany({
    where:
      lens === null
        ? {}
        : { OR: AUDIT_LENSES[lens].map((prefix) => ({ action: { startsWith: prefix } })) },
    orderBy: { createdAt: 'desc' },
    take,
  });

  const adminIds = [...new Set(rows.filter((r) => r.actorType === 'admin').map((r) => r.actorId))];
  const admins =
    adminIds.length === 0
      ? []
      : await db.adminUser.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true, role: true },
        });

  return rows.map((row) => {
    const admin = admins.find((entry) => entry.id === row.actorId) ?? null;
    return {
      id: row.id,
      actorId: row.actorId,
      /**
       * **`null` لا جملة.** النظام فاعلٌ أيضًا، وتسميتُه صياغةٌ
       * تخصّ الشاشة — والنطاق لا يعرف لغةً (البوابة ١٧).
       */
      actorName: admin?.name ?? (row.actorType === 'system' ? null : row.actorId),
      actorRole: admin?.role ?? row.actorType.toUpperCase(),
      actorType: row.actorType,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      ip: row.ip,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function auditCounts(): Promise<Record<string, number>> {
  const [total, money, identity, permissions] = await Promise.all([
    db.auditLog.count(),
    db.auditLog.count({
      where: { OR: AUDIT_LENSES.money.map((p) => ({ action: { startsWith: p } })) },
    }),
    db.auditLog.count({
      where: { OR: AUDIT_LENSES.identity.map((p) => ({ action: { startsWith: p } })) },
    }),
    db.auditLog.count({
      where: { OR: AUDIT_LENSES.permissions.map((p) => ({ action: { startsWith: p } })) },
    }),
  ]);

  return { total, money, identity, permissions };
}
