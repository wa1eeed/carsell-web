import { db } from '@/lib/db';
import type { OrderDocument, SettlementFigures } from './documents';
import type { OrderStage } from '@/generated/prisma/enums';
import { returnWindowFrom, transferDeadlineFrom } from './transfer-windows';

/**
 * الطلب ومراحله الستّ — المهمة ١٨.
 *
 * **المرحلة من قاعدة البيانات ومدّة البقاء محسوبة** (معيار Wj): تخزين
 * «منذ ٣ أيام» يجعلها تكذب بعد ساعة. و`stageEnteredAt` يتصفّر عند كل
 * انتقال فيقيس البقاء في المرحلة الحالية، و`createdAt` يقيس عمر الطلب —
 * حقلان لا مترادفان.
 */

export const STAGES: readonly OrderStage[] = [
  'REQUEST', 'APPROVED', 'INSPECTION', 'PAYMENT', 'TRANSFER', 'DONE',
];

/**
 * الانتقالات المسموحة — **إلى الأمام خطوةً واحدة**.
 *
 * القفز فوق مرحلة يعني طلبًا وصل «نقل الملكية» بلا دفع. والرجوع ممنوع:
 * مرحلةٌ مضت تركت أثرًا ماليًّا (دفعة، حجز، موعد مرور)، وإرجاعها لا
 * يُرجع أثرها. التصحيح يكون بإلغاء وإنشاء، لا برجوع صامت.
 */
export function canAdvance(from: OrderStage, to: OrderStage): boolean {
  const at = STAGES.indexOf(from);
  const next = STAGES.indexOf(to);
  return at >= 0 && next === at + 1;
}

export type StageFailure =
  | 'ORDER_NOT_FOUND'
  | 'NOT_PARTY'
  | 'INVALID_TRANSITION'
  | 'ORDER_FROZEN'
  | 'ORDER_CLOSED';

export type AdvanceResult = { ok: true; stage: OrderStage } | { ok: false; reason: StageFailure };

/**
 * **النزاع يجمّد الطلب في مرحلته.**
 *
 * لا يتقدّم ولا يسقط ما دام مفتوحًا. وبلا هذا التجميد يتقدّم الطلب إلى
 * «تمّ» بينما النزاع قائم، أو يسقط بمهلة الدفع فيخسر المشتري حقّه في
 * نزاعٍ هو من فتحه.
 */
export function isFrozen(status: string): boolean {
  return status === 'DISPUTED';
}

export async function advanceStage(
  input: { orderRef: string; actorId: string; to: OrderStage },
  now: Date = new Date(),
): Promise<AdvanceResult> {
  let orderId: string | null = null;

  const result = await db.$transaction(async (tx): Promise<AdvanceResult> => {
    const order = await tx.order.findUnique({
      where: { ref: input.orderRef },
      select: { id: true, stage: true, status: true, buyerId: true, sellerId: true },
    });

    if (order === null) return { ok: false, reason: 'ORDER_NOT_FOUND' };
    if (order.buyerId !== input.actorId && order.sellerId !== input.actorId) {
      return { ok: false, reason: 'NOT_PARTY' };
    }
    if (isFrozen(order.status)) return { ok: false, reason: 'ORDER_FROZEN' };
    if (order.status !== 'ACTIVE') return { ok: false, reason: 'ORDER_CLOSED' };
    if (!canAdvance(order.stage, input.to)) return { ok: false, reason: 'INVALID_TRANSITION' };

    await tx.order.update({
      where: { id: order.id },
      data: {
        stage: input.to,
        stageEnteredAt: now,
        /**
         * القاعدتان تُفتحان هنا لأنه **نقطة الانتقال الوحيدة**:
         * دخولُ النقل يبدأ سقفه، وتأكيدُه يبدأ نافذة الاسترجاع.
         */
        ...(input.to === 'TRANSFER' ? { transferDeadlineAt: transferDeadlineFrom(now) } : {}),
        ...(input.to === 'DONE'
          ? { status: 'COMPLETED' as const, returnWindowEndsAt: returnWindowFrom(now) }
          : {}),
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'stage.advanced',
        fromStage: order.stage,
        toStage: input.to,
        actorId: input.actorId,
        actorType: 'user',
        createdAt: now,
      },
    });

    orderId = order.id;
    return { ok: true, stage: input.to };
  });

  /**
   * عقد البيع **عند تأكيد النقل** — وهو اللحظة التي صار فيها للمشتري
   * مركبةٌ باسمه. وقبلها العقد وعدٌ لا واقعة.
   *
   * وخارج المعاملة: انتقال المرحلة واقعةٌ لا تُلغى لأن مستندًا تعثّر.
   */
  if (result.ok && input.to === 'DONE' && orderId !== null) {
    // انتقال المرحلة وقع — وفشلُ العقد يُبلَّغ ولا يُبطله
    try {
      const { issueSaleAgreement } = await import('./documents');
      await issueSaleAgreement(orderId, now);
    } catch (error) {
      const { reportError } = await import('@/lib/observability/report');
      reportError(error, { where: 'orders.advanceStage.issueAgreement', extra: { orderId } });
    }
  }

  return result;
}

export type PublicOrder = {
  ref: string;
  stage: OrderStage;
  status: string;
  source: string;
  /** ثوانٍ منذ دخول المرحلة — **محسوبة** لا مخزَّنة. */
  dwellSeconds: number;
  createdAt: string;
  stageEnteredAt: string;
  paymentDueAt: string | null;
  transferAppointmentAt: string | null;
  amounts: {
    agreedPrice: string;
    commission: string;
    /** رسمٌ حكوميّ يُمرَّر كما هو — لا ضريبة لنا فيه */
    transferFee: string;
    /** رسمنا الإداريّ — سطرٌ مستقلّ دائمًا، ودمجُه بالأعلى يُبطل تصنيفه */
    transferAdminFee: string;
    vat: string;
    total: string;
  };
  escrow: { status: string; amount: string; heldAt: string | null; releasedAt: string | null } | null;
  /** مستندات الصفقة — الصادر والقادم معًا. */
  documents: OrderDocument[];
  /**
   * أرقام التسوية — **للبائع وحده**.
   *
   * صافي البائع معلومته هو، ولا شأن للمشتري به. و`preview: true` تعني
   * أنها تقديرٌ قبل التسوية لا كشفٌ صادر.
   */
  settlement: SettlementFigures | null;
  dispute: { id: string; status: string; slaDueAt: string; openedAt: string } | null;
  listing: { ref: string; title: string; year: number; path: string };
  counterparty: { name: string; isSeller: boolean };
  events: { type: string; fromStage: string | null; toStage: string | null; createdAt: string }[];
};

const ORDER_INCLUDE = {
  listing: {
    select: {
      ref: true,
      city: true,
      vehicle: {
        select: {
          brandName: true, modelName: true, trimName: true, year: true,
          brand: { select: { slug: true } },
        },
      },
    },
  },
  buyer: { select: { id: true, name: true } },
  seller: { select: { id: true, name: true } },
  escrow: true,
  disputes: { orderBy: { openedAt: 'desc' as const }, take: 1 },
  events: { orderBy: { createdAt: 'asc' as const } },
} as const;

export async function getOrder(
  ref: string,
  viewerId: string,
  locale: string,
  now: Date = new Date(),
): Promise<PublicOrder | null> {
  const order = await db.order.findUnique({ where: { ref }, include: ORDER_INCLUDE });
  if (order === null) return null;
  // الطلب خاصّ بطرفيه — ولا يُعرض لثالث
  if (order.buyerId !== viewerId && order.sellerId !== viewerId) return null;

  const { canonicalPath } = await import('./listing-detail');
  const { orderDocuments, settlementFigures } = await import('./documents');
  const viewerIsBuyer = order.buyerId === viewerId;
  const other = viewerIsBuyer ? order.seller : order.buyer;
  const dispute = order.disputes[0] ?? null;

  const [documents, settlement] = await Promise.all([
    orderDocuments(ref, viewerId),
    viewerIsBuyer ? Promise.resolve(null) : settlementFigures(order.id),
  ]);

  return {
    ref: order.ref,
    stage: order.stage,
    status: order.status,
    source: order.source,
    dwellSeconds: Math.max(
      0,
      Math.floor((now.getTime() - order.stageEnteredAt.getTime()) / 1000),
    ),
    createdAt: order.createdAt.toISOString(),
    stageEnteredAt: order.stageEnteredAt.toISOString(),
    paymentDueAt: order.paymentDueAt?.toISOString() ?? null,
    transferAppointmentAt: order.transferAppointmentAt?.toISOString() ?? null,
    amounts: {
      agreedPrice: order.agreedPrice.toString(),
      commission: order.commissionAmount.toString(),
      transferFee: order.transferFee.toString(),
      transferAdminFee: order.transferAdminFee.toString(),
      vat: order.vatAmount.toString(),
      total: order.totalAmount.toString(),
    },
    escrow:
      order.escrow === null
        ? null
        : {
            status: order.escrow.status,
            amount: order.escrow.amount.toString(),
            heldAt: order.escrow.heldAt?.toISOString() ?? null,
            releasedAt: order.escrow.releasedAt?.toISOString() ?? null,
          },
    documents: documents ?? [],
    settlement,
    dispute:
      dispute === null
        ? null
        : {
            id: dispute.id,
            status: dispute.status,
            slaDueAt: dispute.slaDueAt.toISOString(),
            openedAt: dispute.openedAt.toISOString(),
          },
    listing: {
      ref: order.listing.ref,
      title: [order.listing.vehicle.brandName, order.listing.vehicle.modelName, order.listing.vehicle.trimName]
        .filter((part) => part !== null && part !== '')
        .join(' '),
      year: order.listing.vehicle.year,
      path: canonicalPath(locale, order.listing).path,
    },
    counterparty: { name: other.name ?? '', isSeller: viewerIsBuyer },
    events: order.events.map((event) => ({
      type: event.type,
      fromStage: event.fromStage,
      toStage: event.toStage,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

/**
 * الضمان — **وهميّ أوّلًا** (المهمة ١٨): لا مزوّد دفع بعد.
 *
 * وهذا لا يعني تخطّيه: الحالات والانتقالات والأثر المحاسبي كلّها حقيقية
 * ومسجَّلة. حين يصل المزوّد يُستبدل `providerRef` وحده — لا المنطق.
 */
export async function holdEscrow(
  orderRef: string,
  now: Date = new Date(),
): Promise<{ ok: boolean }> {
  const order = await db.order.findUnique({
    where: { ref: orderRef },
    select: { id: true, totalAmount: true, escrow: true },
  });
  if (order === null || order.escrow !== null) return { ok: false };

  await db.escrow.create({
    data: {
      orderId: order.id,
      amount: order.totalAmount,
      status: 'HELD',
      heldAt: now,
      // البوابة لاحقًا — والمرجع يبقى فارغًا حتى ذلك الحين لا مزوَّرًا
      gatewayRef: null,
    },
  });
  return { ok: true };
}

export type DirectBuyFailure =
  | 'PROFILE_INCOMPLETE'
  | 'LISTING_NOT_FOUND'
  | 'NOT_BUYABLE'
  | 'OWN_LISTING'
  | 'ORDER_EXISTS'
  | 'TAX_STATUS_REQUIRED';

export type DirectBuyResult =
  | { ok: true; orderRef: string }
  | { ok: false; reason: DirectBuyFailure };

/**
 * ═══ الشراء المباشر ⇒ طلبٌ عند مرحلة الدفع ═══
 *
 * والأربعة **في معاملة واحدة** كقبول العرض: إنشاء الطلب وسحب الإعلان
 * وإغلاق العروض القائمة عليه. وإنشاءٌ ينجح وسحبٌ يفشل يترك سيارةً
 * معروضةً وقد بيعت، فيشتريها ثانٍ.
 *
 * **والوضع الضريبيّ شرطٌ قبل الشراء لا بعده**: أوّل إجراءٍ ماليّ هو
 * لحظة السؤال، واكتشافُ «عليك تحديد وضعك» بعد إنشاء الطلب يترك طلبًا
 * معلّقًا بمهلة تجري على مشترٍ لم يُكمل.
 */
export async function buyDirect(
  input: { listingRef: string; buyerId: string },
  now: Date = new Date(),
): Promise<DirectBuyResult> {
  const { PAYMENT_WINDOW_HOURS } = await import('./offers');
  const { computeOrderAmounts } = await import('./order-amounts');

  const buyer = await db.user.findUnique({ where: { id: input.buyerId } });
  if (buyer === null) return { ok: false, reason: 'LISTING_NOT_FOUND' };

  /**
   * **الشاشة تقول «لن تستطيع الشراء قبل إكمال البريد وتوثيق الهوية» —
   * فليكن.** كانت `canBuy` تُعرض ولا تُفرض: وعدٌ يقوله الحساب وينقضه
   * الشراء. والقاعدة في `profileCompletion` وحدها، فتتبعها الشاشة
   * والحارس معًا ولا تتباعدان.
   */
  const { profileCompletion } = await import('./profile');
  if (!profileCompletion(buyer).canBuy) return { ok: false, reason: 'PROFILE_INCOMPLETE' };

  // «لم يُسأل» تُوقف هنا — والشاشة تفتح النافذة ثم تعيد المحاولة
  if (buyer.taxStatus === null) return { ok: false, reason: 'TAX_STATUS_REQUIRED' };

  return db.$transaction(async (tx): Promise<DirectBuyResult> => {
    const listing = await tx.listing.findUnique({
      where: { ref: input.listingRef },
      select: { id: true, sellerId: true, status: true, type: true, askPrice: true },
    });

    if (listing === null) return { ok: false, reason: 'LISTING_NOT_FOUND' };
    if (listing.sellerId === input.buyerId) return { ok: false, reason: 'OWN_LISTING' };

    /**
     * **طلبٌ حيٌّ واحد للإعلان.** واثنان يعنيان مهلتَي دفعٍ تجريان على
     * مركبةٍ واحدة، ومن يدفع أوّلًا يأخذها ومن يدفع ثانيًا يُسترجع.
     *
     * **والفحص قبل الحالة عمدًا**: أوّل شراءٍ يحجز الإعلان، فلو سبقت
     * الحالةُ لقيل للثاني «غير متاحة» وصوابها «عليها طلب قائم» — والأولى
     * تُنهي أمله، والثانية تقول له إنها قد تعود.
     */
    const live = await tx.order.findFirst({
      where: { listingId: listing.id, status: 'ACTIVE' },
      select: { id: true },
    });
    if (live !== null) return { ok: false, reason: 'ORDER_EXISTS' };

    if (listing.status !== 'PUBLISHED') return { ok: false, reason: 'NOT_BUYABLE' };
    // المزاد يُشترى بالمزايدة أو «اشترِ الآن» — لا بهذا المسار
    if (listing.type === 'AUCTION') return { ok: false, reason: 'NOT_BUYABLE' };

    const amounts = await computeOrderAmounts(tx, Number(listing.askPrice), now);

    const year = now.getFullYear();
    const count = await tx.order.count({ where: { ref: { startsWith: `ORD-${year}-` } } });
    const ref = `ORD-${year}-${String(1000 + count + 1)}`;

    await tx.order.create({
      data: {
        ref,
        listingId: listing.id,
        buyerId: input.buyerId,
        sellerId: listing.sellerId,
        source: 'DIRECT',
        stage: 'PAYMENT',
        ...amounts,
        createdAt: now,
        stageEnteredAt: now,
        paymentDueAt: new Date(now.getTime() + PAYMENT_WINDOW_HOURS * 3600 * 1000),
      },
    });

    // الإعلان يُحجز فورًا — وبقاؤه معروضًا يبيع المركبة مرّتين
    await tx.listing.update({ where: { id: listing.id }, data: { status: 'RESERVED' } });

    await tx.offer.updateMany({
      where: { listingId: listing.id, status: { in: ['PENDING', 'COUNTERED'] } },
      data: { status: 'REJECTED' },
    });

    await tx.orderEvent.create({
      data: {
        orderId: (await tx.order.findUniqueOrThrow({ where: { ref }, select: { id: true } })).id,
        type: 'order.created',
        toStage: 'PAYMENT',
        actorId: input.buyerId,
        actorType: 'user',
        createdAt: now,
      },
    });

    return { ok: true, orderRef: ref };
  });
}
