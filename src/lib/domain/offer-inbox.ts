import { db } from '@/lib/db';
import { ACTIVE_STATUSES } from './offers';
import { canonicalPath } from './listing-detail';
import type { OfferStatus } from '@/generated/prisma/enums';

/**
 * صندوق العروض — Wl.
 *
 * **لا عرض مرفوض في «نشطة»** (معيار القبول). و«نشط» ليس رأيًا: هو
 * `PENDING` أو `COUNTERED` **ولم تنتهِ مهلته**. عرضٌ فاتت ساعته وبقي
 * `PENDING` في العمود لأن الوظيفة الدورية لم تمرّ بعد ليس نشطًا، وعرضُه
 * كذلك يجعل المشتري ينتظر ردًّا لن يأتي.
 */

export type InboxTab = 'active' | 'sent' | 'closed';

export type InboxOffer = {
  id: string;
  status: OfferStatus;
  amount: string;
  createdAt: string;
  expiresAt: string;
  /** `true` إن انتهت مهلته وإن بقيت حالته المخزَّنة نشطة. */
  lapsed: boolean;
  autoRejected: boolean;
  /** الطرف الآخر — أنا المشتري أم البائع. */
  role: 'buyer' | 'seller';
  counterOf: string | null;
  listing: {
    ref: string;
    title: string;
    year: number;
    askPrice: string;
    city: string;
    path: string;
  };
};

const OFFER_INCLUDE = {
  listing: {
    select: {
      ref: true, city: true, askPrice: true, sellerId: true,
      vehicle: {
        select: {
          brandName: true, modelName: true, trimName: true, year: true,
          brand: { select: { slug: true } },
        },
      },
    },
  },
} as const;

export async function getOfferInbox(
  userId: string,
  locale: string,
  now: Date = new Date(),
): Promise<{ active: InboxOffer[]; sent: InboxOffer[]; closed: InboxOffer[] }> {
  const rows = await db.offer.findMany({
    where: { OR: [{ buyerId: userId }, { listing: { sellerId: userId } }] },
    orderBy: { createdAt: 'desc' },
    include: OFFER_INCLUDE,
  });

  const mapped: InboxOffer[] = rows.map((offer) => ({
    id: offer.id,
    status: offer.status,
    amount: offer.amount.toString(),
    createdAt: offer.createdAt.toISOString(),
    expiresAt: offer.expiresAt.toISOString(),
    lapsed: offer.expiresAt <= now,
    autoRejected: offer.autoRejected,
    role: offer.buyerId === userId ? 'buyer' : 'seller',
    counterOf: offer.parentOfferId,
    listing: {
      ref: offer.listing.ref,
      title: [offer.listing.vehicle.brandName, offer.listing.vehicle.modelName, offer.listing.vehicle.trimName]
        .filter((part) => part !== null && part !== '')
        .join(' '),
      year: offer.listing.vehicle.year,
      askPrice: offer.listing.askPrice.toString(),
      city: offer.listing.city,
      path: canonicalPath(locale, offer.listing).path,
    },
  }));

  /**
   * الحالة المخزَّنة **وانقضاء المهلة معًا**: الأولى وحدها تُدخل عرضًا
   * فات وقته في «نشطة» بين مرور الوظيفة الدورية ومرورها التالي.
   */
  const isActive = (offer: InboxOffer): boolean =>
    ACTIVE_STATUSES.includes(offer.status) && !offer.lapsed;

  return {
    // «واردة» — عروض الآخرين عليّ، وهي ما يحتاج قرارًا منّي
    active: mapped.filter((offer) => isActive(offer) && offer.role === 'seller'),
    // «مُرسَلة» — عروضي على غيري، وهي ما أنتظر ردًّا عليه
    sent: mapped.filter((offer) => isActive(offer) && offer.role === 'buyer'),
    closed: mapped.filter((offer) => !isActive(offer)),
  };
}

export type ReportInput = {
  reporterId: string;
  targetType: 'listing' | 'user';
  targetId: string;
  reason: string;
  details?: string;
};

export type ReportResult =
  | { ok: true; reportId: string; underReview: boolean }
  | { ok: false; reason: 'TARGET_NOT_FOUND' | 'OWN_TARGET' | 'ALREADY_REPORTED' };

/** أسباب البلاغ — قائمة مغلقة، فالحرّ منها يُنتج طابورًا لا يُفرَز. */
export const REPORT_REASONS = [
  'fraud', 'wrong_data', 'sold_elsewhere', 'offensive', 'duplicate', 'other',
] as const;

/**
 * بلاغ على إعلان أو مستخدم.
 *
 * **البلاغ يُدخل الإعلان المراجعة ولا يحذفه** (قرار ٣٣): الحذف بمجرّد
 * بلاغ يجعل البلاغ سلاحًا بيد منافس. والمراجعة بشرية والقرار لها.
 *
 * وبلاغ واحد لكل (مبلِّغ، هدف): تكرار الشخص نفسه لا يزيد وزن البلاغ
 * ويُغرق الطابور.
 */
export async function fileReport(
  input: ReportInput,
  now: Date = new Date(),
): Promise<ReportResult> {
  return db.$transaction(async (tx) => {
    if (input.targetType === 'listing') {
      const listing = await tx.listing.findUnique({
        where: { id: input.targetId },
        select: { id: true, sellerId: true, status: true },
      });
      if (listing === null) return { ok: false, reason: 'TARGET_NOT_FOUND' };
      if (listing.sellerId === input.reporterId) return { ok: false, reason: 'OWN_TARGET' };
    } else {
      const user = await tx.user.findUnique({
        where: { id: input.targetId },
        select: { id: true },
      });
      if (user === null) return { ok: false, reason: 'TARGET_NOT_FOUND' };
      if (input.targetId === input.reporterId) return { ok: false, reason: 'OWN_TARGET' };
    }

    const duplicate = await tx.report.findFirst({
      where: {
        reporterId: input.reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        status: 'open',
      },
      select: { id: true },
    });
    if (duplicate !== null) return { ok: false, reason: 'ALREADY_REPORTED' };

    const report = await tx.report.create({
      data: {
        reporterId: input.reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        ...(input.details === undefined ? {} : { details: input.details }),
        attachments: [],
        status: 'open',
        createdAt: now,
      },
    });

    // قرار ٣٣ — بلاغ وارد يُدخل الإعلان المراجعة، ولا يخفيه
    let underReview = false;
    if (input.targetType === 'listing') {
      const { count } = await tx.listing.updateMany({
        where: { id: input.targetId, status: 'PUBLISHED' },
        data: { status: 'PENDING_REVIEW', reviewReason: 'USER_REPORT' },
      });
      underReview = count > 0;
    }

    return { ok: true, reportId: report.id, underReview };
  });
}
