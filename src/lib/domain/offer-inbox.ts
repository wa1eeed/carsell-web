import { db } from '@/lib/db';
import { sendListingToReview } from './listing-state';
import { nextReportRef } from './refs';
import { ACTIVE_STATUSES } from './offers';
import { canonicalPath } from './listing-detail';
import type { OfferStatus } from '@/generated/prisma/enums';
import type { Prisma } from '@/generated/prisma/client';

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
  /** أنا أرسلتُه — والمقابل يرسله البائع لا المشتري. */
  sentByMe: boolean;
  counterOf: string | null;
  listing: {
    ref: string;
    title: string;
    year: number;
    askPrice: string;
    city: string;
    path: string;
    /**
     * ═══ الحدُّ الأدنى المخفيّ — **لصاحبه وحده** ═══
     *
     * ترميز `Wl` يعرضه للبائع فوق عروضه («الحد الأدنى المخفي
     * ١٣٥٬٠٠٠»)، وهو الرقمُ الذي يقرّر به. وكان **لا يُعرض له قطّ**:
     * يكتبه مرّةً في معالج البيع ثمّ يفاوض وهو لا يرى أرضيّته.
     *
     * **ولا يدخل كائنَ المشتري أصلًا** — لا يُخفى في التصيير: ما
     * يُجلَب يُسلسَل ولو لم يُرسَم، وحمولةُ RSC تحمله إلى المتصفّح.
     * فهو `null` لكلّ صفٍّ لستُ بائعَه.
     */
    minAcceptPrice: string | null;
  };

  /**
   * ═══ موضعُ العرض من سعر البائع وأرضيّته ═══
   *
   * الترميز يكتبه بجوار كل عرض: «أعلى من سعرك بـ ١٬٠٠٠» · «فوق الحد
   * الأدنى» — فالبائع يقرّر بلا حساب في رأسه.
   *
   * **ويُحسب هنا لا في الشاشة**: `above_ask` · `above_floor` ·
   * `below_floor` · `no_floor` مفاتيح، والصياغةُ في الشاشة (البوابة ١٧).
   * و`null` لعرضٍ لستُ بائعَه — الموضعُ من أرضيّةٍ لا أملكها لا معنى له.
   */
  standing: 'above_ask' | 'above_floor' | 'below_floor' | 'no_floor' | null;

  /** الفرق عن السعر المطلوب بالريال — موجبٌ فوقه، وسالبٌ دونه. */
  vsAsk: number | null;
};

const OFFER_INCLUDE = {
  listing: {
    select: {
      ref: true, city: true, askPrice: true, sellerId: true, minAcceptPrice: true,
      vehicle: {
        select: {
          brandName: true, modelName: true, trimName: true, year: true,
          brand: { select: { slug: true } },
          model: { select: { nameEn: true } },
        },
      },
    },
  },
} as const;

/**
 * موضعُ العرض من سعر البائع وأرضيّته — **مفاتيح لا جُملًا** (البوابة ١٧).
 *
 * و`no_floor` حالةٌ تُقال: بائعٌ لم يضع حدًّا أدنى لا يُقال عنه «فوق
 * الحد الأدنى»، فالسكوتُ عنه يُقرأ أنّ العرض دونه.
 */
function standingOf(
  offer: {
    amount: Prisma.Decimal;
    listing: { sellerId: string; askPrice: Prisma.Decimal; minAcceptPrice: Prisma.Decimal | null };
  },
  userId: string,
): { standing: InboxOffer['standing']; vsAsk: number | null } {
  if (offer.listing.sellerId !== userId) return { standing: null, vsAsk: null };

  const amount = Number(offer.amount);
  const ask = Number(offer.listing.askPrice);
  const vsAsk = Math.round(amount - ask);

  if (amount >= ask) return { standing: 'above_ask', vsAsk };
  if (offer.listing.minAcceptPrice === null) return { standing: 'no_floor', vsAsk };
  return {
    standing: amount >= Number(offer.listing.minAcceptPrice) ? 'above_floor' : 'below_floor',
    vsAsk,
  };
}

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
    /**
     * **من أرسل هذا العرض؟** — و`role` وحدها لا تقولها.
     *
     * العرض المقابل يحتفظ بـ`buyerId` الأصليّ (الطرفان لم يتغيّرا)،
     * فكان البائع يرى مقابلَه هو في «واردة عليك» وفوقه زرّ «اقبل»
     * — يقبل عرض نفسه. والمشتري يراه في «مُرسَلة منك» وهو لم يرسله.
     *
     * والمقابل يرسله البائع دائمًا (`counterOffer` تفحص `sellerId`).
     */
    sentByMe:
      offer.parentOfferId === null
        ? offer.buyerId === userId
        : offer.listing.sellerId === userId,
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
      /** **لصاحبه وحده** — ولا يدخل كائنَ المشتري. */
      minAcceptPrice:
        offer.listing.sellerId === userId
          ? (offer.listing.minAcceptPrice?.toString() ?? null)
          : null,
    },
    ...standingOf(offer, userId),
  }));

  /**
   * الحالة المخزَّنة **وانقضاء المهلة معًا**: الأولى وحدها تُدخل عرضًا
   * فات وقته في «نشطة» بين مرور الوظيفة الدورية ومرورها التالي.
   */
  const isActive = (offer: InboxOffer): boolean =>
    ACTIVE_STATUSES.includes(offer.status) && !offer.lapsed;

  return {
    // «واردة» — ما أرسله غيري، وهو ما يحتاج قرارًا منّي
    active: mapped.filter((offer) => isActive(offer) && !offer.sentByMe),
    // «مُرسَلة» — ما أرسلتُه أنا، وهو ما أنتظر ردًّا عليه
    sent: mapped.filter((offer) => isActive(offer) && offer.sentByMe),
    closed: mapped.filter((offer) => !isActive(offer)),
  };
}

/**
 * ═══ «مركباتك المعروضة» — عمودُ الترميز الأيمن ═══
 *
 * الترميز يسرد مركباتِ البائع القابلة للتفاوض وعدَّ العروض على كلٍّ،
 * **ومنها ما لا عرضَ عليه** («لا عروض بعد»). وذلك هو موضعُ الفائدة:
 * صندوقُ العروض يعرض ما وصل، وهذا يقول **ما لم يصل** — فيعرف البائع
 * أيُّ سياراته لا يسأل عنها أحد.
 *
 * **ولا يُبنى من العروض وحدها**: قائمةٌ مشتقّةٌ من الصندوق تُسقط كلَّ
 * مركبةٍ بلا عرض، وهي الصفوف التي من أجلها وُضع العمود.
 */
export type OfferedVehicle = {
  ref: string;
  title: string;
  year: number;
  askPrice: string;
  minAcceptPrice: string | null;
  path: string;
  /** عددُ العروض النشطة الواردة — صفرٌ يُقال «لا عروض بعد». */
  liveOffers: number;
};

export async function getOfferedVehicles(
  userId: string,
  locale: string,
  now: Date = new Date(),
): Promise<OfferedVehicle[]> {
  const rows = await db.listing.findMany({
    where: {
      sellerId: userId,
      status: 'PUBLISHED',
      /** **والتفاوضُ وحده**: إعلانٌ بسعرٍ ثابت لا يُنتظر له عرض. */
      type: 'NEGOTIATION',
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      ref: true,
      city: true,
      askPrice: true,
      minAcceptPrice: true,
      vehicle: {
        select: {
          brandName: true, modelName: true, trimName: true, year: true,
          brand: { select: { slug: true } },
          model: { select: { nameEn: true } },
        },
      },
      offers: {
        where: { status: { in: [...ACTIVE_STATUSES] }, expiresAt: { gt: now } },
        select: { id: true, buyerId: true, parentOfferId: true },
      },
    },
  });

  return rows.map((row) => ({
    ref: row.ref,
    title: [row.vehicle.brandName, row.vehicle.modelName, row.vehicle.trimName]
      .filter((part) => part !== null && part !== '')
      .join(' '),
    year: row.vehicle.year,
    askPrice: row.askPrice.toString(),
    /** **وهذه شاشةُ البائع** — والاستعلام مقصورٌ على إعلاناته. */
    minAcceptPrice: row.minAcceptPrice?.toString() ?? null,
    path: canonicalPath(locale, { ref: row.ref, city: row.city, vehicle: row.vehicle }).path,
    /**
     * ═══ والواردُ وحده يُعَدّ — **والمُرسِل لا يُشتقّ من الدور** ═══
     *
     * العرضُ المقابل يحتفظ بـ`buyerId` الأصليّ (الطرفان لم يتغيّرا)،
     * فشرطُ «المشتري غيري» يَعُدّ **مقابلي أنا** عرضًا عليّ — فيقول
     * الرقم إنّ عليّ قرارًا وأنا من ينتظر. والمقابل يرسله البائع
     * دائمًا، فيُستثنى كلُّ ما له أبٌ.
     */
    liveOffers: row.offers.filter(
      (offer) => offer.parentOfferId === null && offer.buyerId !== userId,
    ).length,
  }));
}

export type ReportInput = {
  reporterId: string;
  targetType: 'listing' | 'user';
  targetId: string;
  reason: string;
  details?: string;
};

export type ReportResult =
  | { ok: true; reportId: string; ref: string; underReview: boolean }
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
/**
 * ═══ قرار ٥ ═══ **بلاغ واحد لا يُدخل المراجعة.**
 *
 * الإعلان يبقى منشورًا، ويُدخَل الطابور بأحد ثلاثة:
 *   · بلاغان مستقلّان أو أكثر،
 *   · بلاغ من مشترٍ له طلب على هذا الإعلان،
 *   · تقدير الأدمن.
 *
 * والسبب: نقرة واحدة تُزيل إعلان منافس أرخص من أيّ إعلان مدفوع.
 * والبلاغ المفرد يظهر في طابور A17 بلا أثر على الإعلان.
 */
export const REVIEW_REPORT_THRESHOLD = 2;

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
        // مرجعٌ يُقتبَس — والمعرّف الداخليّ لا يُقرأ في شاشة ولا مكالمة
        ref: await nextReportRef(tx, now),
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

    let underReview = false;
    if (input.targetType === 'listing') {
      const openReports = await tx.report.count({
        where: { targetType: 'listing', targetId: input.targetId, status: 'open' },
      });

      /**
       * مشترٍ له طلب على هذا الإعلان بلاغُه وحده يكفي: هو الوحيد الذي
       * رأى المركبة بعقد، وليس منافسًا يستطيع أن يكون.
       */
      const fromBuyer = await tx.order.count({
        where: { listingId: input.targetId, buyerId: input.reporterId },
      });

      if (openReports >= REVIEW_REPORT_THRESHOLD || fromBuyer > 0) {
        underReview = await sendListingToReview(tx, input.targetId, 'USER_REPORT');
      }
    }

    return { ok: true, reportId: report.id, ref: report.ref, underReview };
  });
}
