import type { ReviewReason } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import {
  approveReviewedListing,
  returnListingToSeller,
  suspendListing,
} from './listing-state';
import { MIN_REVIEW_NOTE, REVIEW_REASONS } from './review-rules';

export { MIN_REVIEW_NOTE } from './review-rules';

/**
 * ═══ A15 — طابور مراجعة الإعلانات ═══
 *
 * قرار ٣٣ يُدخل الإعلان المرشَّح آليًّا إلى `PENDING_REVIEW`، **ولا
 * شاشة تقرأ الطابور**. فكل إعلانٍ رُشّح يقف بلا نهاية: لا يُعتمد ولا
 * يُردّ، وصاحبه ينتظر شيئًا لن يقع.
 *
 * ═══ والطابور للمرشَّح آليًّا وحده ═══
 *
 * التصميم يقولها صراحةً: «٩٣٪ من الإعلانات تُنشر بلا مراجعة، ولو صار
 * كل إعلان يمرّ به لتوقّف السوق». فالنسبة المعروضة ليست زينةً — هي
 * **مقياس صحّة قواعد الترشيح**: ارتفاعُ الطابور يعني أن قاعدةً صارت
 * واسعة، لا أن المراجعين تأخّروا.
 *
 * ═══ والدليل بياناتٌ لا جُملًا ═══
 *
 * «صورة مكرّرة ٩٤٪» جملةٌ تُصاغ في الشاشة. والنطاق يعيد النسبة والمرجع
 * — فلا يعرف لغةً ولا يبني «٩٤٪» بيده (البوابة ١٧).
 */

export type ReviewEvidence =
  | { kind: 'DUPLICATE_IMAGE'; matchPct: number; otherRef: string | null }
  | { kind: 'PRICE_OUTLIER'; belowPct: number; marketP25: string | null }
  | { kind: 'NEW_ACCOUNT_BURST'; accountAgeDays: number; listingCount: number }
  | { kind: 'USER_REPORT'; reportCount: number };

export type ReviewRow = {
  ref: string;
  title: string;
  year: number;
  sellerId: string;
  sellerName: string;
  reason: ReviewReason;
  evidence: ReviewEvidence;
  askPrice: string;
  /** منذ متى وهو ينتظر — بالدقائق، والصياغة في الشاشة */
  waitingMinutes: number;
};

export type ReviewStats = {
  queued: number;
  /** أقدم ما في الطابور — و`null` حين يكون فارغًا */
  oldestMinutes: number | null;
  approvedToday: number;
  returnedToday: number;
  publishedDirectToday: number;
  /** نصيب ما نُشر بلا مراجعة من إعلانات اليوم */
  directSharePct: number;
  reviewedSharePct: number;
  byReason: Record<ReviewReason, number>;
};

const minutesSince = (from: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));

function startOfDay(now: Date): Date {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

/**
 * الطابور — **الأقدم أوّلًا**.
 *
 * لا الأحدث ولا الأعلى سعرًا: من انتظر أطول يُخدَم أوّلًا، وإلّا بقي
 * إعلانٌ في القاع بينما يمرّ فوقه الوافدون.
 */
export async function reviewQueue(
  filter: ReviewReason | null = null,
  now: Date = new Date(),
): Promise<ReviewRow[]> {
  const listings = await db.listing.findMany({
    where: {
      status: 'PENDING_REVIEW',
      ...(filter === null ? {} : { reviewReason: filter }),
    },
    orderBy: { reviewQueuedAt: 'asc' },
    take: 200,
    select: {
      ref: true,
      askPrice: true,
      reviewQueuedAt: true,
      reviewReason: true,
      sellerId: true,
      seller: { select: { name: true, phone: true, createdAt: true } },
      vehicle: {
        select: { brandName: true, modelName: true, trimName: true, year: true, modelId: true },
      },
      images: { select: { phash: true }, take: 1 },
    },
  });

  const rows: ReviewRow[] = [];

  for (const listing of listings) {
    const reason = listing.reviewReason ?? 'USER_REPORT';
    rows.push({
      ref: listing.ref,
      title: [listing.vehicle.brandName, listing.vehicle.modelName, listing.vehicle.trimName]
        .filter((part) => part !== null && part !== '')
        .join(' '),
      year: listing.vehicle.year,
      sellerId: listing.sellerId,
      sellerName: listing.seller.name ?? listing.seller.phone,
      reason,
      evidence: await evidenceFor(reason, listing, now),
      askPrice: listing.askPrice.toFixed(2),
      waitingMinutes:
        listing.reviewQueuedAt === null ? 0 : minutesSince(listing.reviewQueuedAt, now),
    });
  }

  return rows;
}

/**
 * لماذا رُشّح — **يُعاد حسابه عند العرض لا يُخزَّن**.
 *
 * لأن الدليل يتقادم: الإعلان المطابق قد يُحذف، والسوق يتحرّك فيصير
 * السعر عاديًّا. ودليلٌ مخزَّن يقول للمراجع «٩٤٪ تطابق» ولا شيء
 * يطابقه اليوم — فيقرّر على شيءٍ لم يعد قائمًا.
 */
async function evidenceFor(
  reason: ReviewReason,
  listing: {
    ref: string;
    askPrice: { toFixed: (n: number) => string };
    sellerId: string;
    seller: { createdAt: Date };
    images: { phash: string | null }[];
    vehicle: { modelId: string; year: number };
  },
  now: Date,
): Promise<ReviewEvidence> {
  if (reason === 'NEW_ACCOUNT_BURST') {
    const listingCount = await db.listing.count({ where: { sellerId: listing.sellerId } });
    return {
      kind: 'NEW_ACCOUNT_BURST',
      accountAgeDays: Math.floor(
        (now.getTime() - listing.seller.createdAt.getTime()) / 86_400_000,
      ),
      listingCount,
    };
  }

  if (reason === 'USER_REPORT') {
    const reportCount = await db.report.count({
      where: { targetType: 'listing', targetId: listing.ref, status: { not: 'DISMISSED' } },
    });
    return { kind: 'USER_REPORT', reportCount };
  }

  if (reason === 'PRICE_OUTLIER') {
    const stat = await db.priceStat.findFirst({
      where: { modelId: listing.vehicle.modelId, year: listing.vehicle.year },
      select: { p25: true },
    });
    const price = Number(listing.askPrice.toFixed(2));
    const p25 = stat === null ? null : Number(stat.p25);
    return {
      kind: 'PRICE_OUTLIER',
      belowPct: p25 === null || p25 === 0 ? 0 : Math.round((1 - price / p25) * 100),
      marketP25: stat === null ? null : stat.p25.toFixed(2),
    };
  }

  const phash = listing.images[0]?.phash ?? null;
  const other =
    phash === null
      ? null
      : await db.listingImage.findFirst({
          where: { phash, listing: { ref: { not: listing.ref } } },
          select: { listing: { select: { ref: true } } },
        });

  return {
    kind: 'DUPLICATE_IMAGE',
    // البصمة تُقارَن بمسافة هامينغ في الرفع؛ والمعروض هنا التطابق التامّ
    matchPct: other === null ? 0 : 100,
    otherRef: other?.listing.ref ?? null,
  };
}

/** بطاقات الرأس وعدّادات التابز — من الطابور واليوم معًا. */
export async function reviewStats(now: Date = new Date()): Promise<ReviewStats> {
  const today = startOfDay(now);

  const [queued, oldest, perReason, approvedToday, returnedToday, directToday] = await Promise.all([
    db.listing.count({ where: { status: 'PENDING_REVIEW' } }),
    db.listing.findFirst({
      where: { status: 'PENDING_REVIEW', reviewQueuedAt: { not: null } },
      orderBy: { reviewQueuedAt: 'asc' },
      select: { reviewQueuedAt: true },
    }),
    db.listing.groupBy({
      by: ['reviewReason'],
      where: { status: 'PENDING_REVIEW' },
      _count: true,
    }),
    db.listing.count({
      where: { reviewedAt: { gte: today }, status: { in: ['PUBLISHED', 'RESERVED', 'SOLD'] } },
    }),
    db.listing.count({ where: { reviewedAt: { gte: today }, status: 'DRAFT' } }),
    db.listing.count({
      where: { publishedAt: { gte: today }, reviewReason: null },
    }),
  ]);

  const reviewed = approvedToday + returnedToday;
  const total = directToday + reviewed;

  const byReason = Object.fromEntries(REVIEW_REASONS.map((reason) => [reason, 0])) as Record<
    ReviewReason,
    number
  >;
  for (const row of perReason) {
    if (row.reviewReason !== null) byReason[row.reviewReason] = row._count;
  }

  return {
    queued,
    oldestMinutes:
      oldest?.reviewQueuedAt == null ? null : minutesSince(oldest.reviewQueuedAt, now),
    approvedToday,
    returnedToday,
    publishedDirectToday: directToday,
    directSharePct: total === 0 ? 0 : Math.round((directToday / total) * 100),
    reviewedSharePct: reviewed === 0 ? 0 : Math.round((approvedToday / reviewed) * 100),
    byReason,
  };
}

export type ReviewDecision = 'APPROVE' | 'RETURN' | 'REJECT';

export type DecideFailure =
  | 'LISTING_NOT_FOUND'
  | 'NOT_IN_QUEUE'
  | 'NOTE_REQUIRED'
  | 'SUSPEND_NOT_ALLOWED';

export type DecideResult = { ok: true; status: string } | { ok: false; reason: DecideFailure };

/**
 * قرار المراجعة — **واحدٌ من ثلاثة، ولكلٍّ أثره**.
 *
 * · **اعتمد** ⇒ يُنشر، وتُمحى راية الترشيح فلا يعود إلى الطابور.
 * · **أعِده** ⇒ مسودّة **بملاحظة**: إرجاعٌ صامت يجعل البائع يعيد نشره
 *   كما هو فيعود، ودورةٌ لا تنتهي بين الطرفين.
 * · **ارفض وأوقف** ⇒ الإعلان يُعلَّق وصاحبه يُوقَف — وهي وحدها تحتاج
 *   `users.suspend`، فالمراجع لا يوقف حسابًا لأنه يراجع إعلانًا.
 */
export async function decideReview(
  input: {
    ref: string;
    decision: ReviewDecision;
    note: string | null;
    adminId: string;
    ip: string | null;
    canSuspend: boolean;
  },
  now: Date = new Date(),
): Promise<DecideResult> {
  const listing = await db.listing.findUnique({
    where: { ref: input.ref },
    select: { id: true, status: true, sellerId: true, reviewReason: true },
  });

  if (listing === null) return { ok: false, reason: 'LISTING_NOT_FOUND' };
  if (listing.status !== 'PENDING_REVIEW') return { ok: false, reason: 'NOT_IN_QUEUE' };

  const note = input.note?.trim() ?? '';
  if (input.decision !== 'APPROVE' && note.length < MIN_REVIEW_NOTE) {
    return { ok: false, reason: 'NOTE_REQUIRED' };
  }
  if (input.decision === 'REJECT' && !input.canSuspend) {
    return { ok: false, reason: 'SUSPEND_NOT_ALLOWED' };
  }

  if (input.decision === 'APPROVE') {
    await approveReviewedListing(db, listing.id, { adminId: input.adminId }, now);
  } else if (input.decision === 'RETURN') {
    await returnListingToSeller(db, listing.id, { note, adminId: input.adminId }, now);
  } else {
    await suspendListing(db, listing.id, 'review.rejected', now);
    await db.user.update({ where: { id: listing.sellerId }, data: { status: 'SUSPENDED' } });
  }

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'Listing',
      entityId: input.ref,
      action: `listing.review.${input.decision.toLowerCase()}`,
      before: { status: 'PENDING_REVIEW', reviewReason: listing.reviewReason },
      after: { decision: input.decision, note: note === '' ? null : note },
      ip: input.ip,
      createdAt: now,
    },
  });

  const status =
    input.decision === 'APPROVE' ? 'PUBLISHED' : input.decision === 'RETURN' ? 'DRAFT' : 'SUSPENDED';
  return { ok: true, status };
}
