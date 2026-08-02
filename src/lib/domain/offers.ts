import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { Offer, OfferStatus } from '@/generated/prisma/client';

/**
 * العروض — القواعد ١–٥ من القسم ٧.
 *
 * **القواعد هنا لا في المسار.** مسار API واحد لا يحرس قاعدة: الشاشة
 * تستدعيه، والأدمن يستدعيه، والوظيفة المجدولة تستدعيه، والتطبيق
 * لاحقًا. وقاعدةٌ مكتوبة في مسار تُنسى في المسار الثاني — وأثرها
 * ماليّ لا تجميليّ.
 *
 * وكل قاعدة تُقابلها دالة واحدة واختبار باسمها في `tests/offers.test.ts`.
 */

/** القاعدة ٣ — العرض يسقط بعد ٤٨ ساعة. */
export const OFFER_TTL_HOURS = 48;

/** القاعدة ٤ — مهلة الدفع بعد القبول. */
export const PAYMENT_WINDOW_HOURS = 24;

/** الحالات التي تُعدّ «نشطة» — عرضٌ ينتظر ردًّا أو رُدّ عليه بمقابل. */
export const ACTIVE_STATUSES: readonly OfferStatus[] = ['PENDING', 'COUNTERED'];

export type OfferFailure =
  | 'LISTING_NOT_FOUND'
  | 'LISTING_NOT_OPEN'
  | 'NOT_NEGOTIABLE'
  | 'OWN_LISTING'
  | 'ACTIVE_OFFER_EXISTS'
  | 'AMOUNT_INVALID';

export type CreateOfferResult =
  | { ok: true; offer: Offer; autoRejected: boolean }
  | { ok: false; reason: OfferFailure };

/**
 * إشعار — يُسجَّل دائمًا، ولا يُرسَل من هنا.
 *
 * الفصل مقصود: الإرسال يعتمد على مزوّد قد يفشل، والقاعدة تشترط أن
 * **يقع الإشعار** لا أن يصل. فالسجلّ داخل المعاملة مع الحدث الذي
 * سبّبه، والإرسال يقرأ منه لاحقًا.
 */
async function notify(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    templateKey: string;
    priority?: string;
    payload?: Prisma.InputJsonValue;
    entityType?: string;
    entityId?: string;
  },
): Promise<void> {
  await tx.notification.create({
    data: {
      userId: input.userId,
      templateKey: input.templateKey,
      priority: input.priority ?? 'normal',
      ...(input.payload === undefined ? {} : { payload: input.payload }),
      ...(input.entityType === undefined ? {} : { entityType: input.entityType }),
      ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
    },
  });
}

/**
 * ═══ القاعدة ١ ═══ عرض دون `minAcceptPrice` يُرفض تلقائيًا مع إشعار.
 * ═══ القاعدة ٢ ═══ عرض واحد نشط لكل (مشتري، إعلان).
 * ═══ القاعدة ٣ ═══ صلاحية ٤٨ ساعة.
 *
 * الرفض التلقائي **يُسجَّل عرضًا مرفوضًا** ولا يُبتلع: البائع يحتاج أن
 * يرى كم عرضًا وصل تحت حدّه ليقرّر خفضه، والمشتري يحتاج أن يعرف أن
 * عرضه وصل ورُفض لا أنه ضاع.
 *
 * والحدّ الأدنى **لا يخرج** في النتيجة ولا يُشتقّ منها: الرد واحد سواء
 * كان الحدّ ١٠٠ أو ١٢٠ (قرار ٢٩).
 */
export async function createOffer(
  input: { listingRef: string; buyerId: string; amount: number },
  now: Date = new Date(),
): Promise<CreateOfferResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, reason: 'AMOUNT_INVALID' };
  }

  return db.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { ref: input.listingRef },
      select: { id: true, sellerId: true, status: true, type: true, minAcceptPrice: true },
    });

    if (listing === null) return { ok: false, reason: 'LISTING_NOT_FOUND' };
    if (listing.status !== 'PUBLISHED') return { ok: false, reason: 'LISTING_NOT_OPEN' };
    if (listing.type !== 'NEGOTIATION') return { ok: false, reason: 'NOT_NEGOTIABLE' };
    // البائع لا يزايد على نفسه — يرفع السعر بلا مشترٍ حقيقي
    if (listing.sellerId === input.buyerId) return { ok: false, reason: 'OWN_LISTING' };

    // القاعدة ٢ — عرض نشط واحد
    const active = await tx.offer.findFirst({
      where: {
        listingId: listing.id,
        buyerId: input.buyerId,
        status: { in: [...ACTIVE_STATUSES] },
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (active !== null) return { ok: false, reason: 'ACTIVE_OFFER_EXISTS' };

    // القاعدة ١ — دون الحدّ الأدنى ⇒ رفض تلقائي
    const floor = listing.minAcceptPrice === null ? null : Number(listing.minAcceptPrice);
    const autoRejected = floor !== null && input.amount < floor;

    const expiresAt = new Date(now.getTime() + OFFER_TTL_HOURS * 3600 * 1000);

    const offer = await tx.offer.create({
      data: {
        listingId: listing.id,
        buyerId: input.buyerId,
        amount: new Prisma.Decimal(input.amount),
        status: autoRejected ? 'REJECTED' : 'PENDING',
        autoRejected,
        expiresAt,
        createdAt: now,
      },
    });

    if (autoRejected) {
      await notify(tx, {
        userId: input.buyerId,
        templateKey: 'offer.auto_rejected',
        // المبلغ الذي قدّمه هو وحده — لا الحدّ الذي رُفض دونه
        payload: { amount: input.amount },
        entityType: 'Offer',
        entityId: offer.id,
      });
    } else {
      await notify(tx, {
        userId: listing.sellerId,
        templateKey: 'offer.received',
        payload: { amount: input.amount },
        entityType: 'Offer',
        entityId: offer.id,
      });
    }

    return { ok: true, offer, autoRejected };
  });
}

export type CounterResult =
  | { ok: true; offer: Offer }
  | { ok: false; reason: 'OFFER_NOT_FOUND' | 'NOT_SELLER' | 'NOT_ACTIVE' | 'AMOUNT_INVALID' };

/**
 * عرض مقابل من البائع.
 *
 * الأصل يصير `COUNTERED` والمقابل عرضٌ جديد **بمهلة جديدة**: المشتري
 * يردّ على رقم جديد، ووراثة المهلة القديمة قد تُسقط عرضًا وُلد قبل
 * دقيقة.
 */
export async function counterOffer(
  input: { offerId: string; sellerId: string; amount: number },
  now: Date = new Date(),
): Promise<CounterResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, reason: 'AMOUNT_INVALID' };
  }

  return db.$transaction(async (tx) => {
    const original = await tx.offer.findUnique({
      where: { id: input.offerId },
      include: { listing: { select: { id: true, sellerId: true } } },
    });

    if (original === null) return { ok: false, reason: 'OFFER_NOT_FOUND' };
    if (original.listing.sellerId !== input.sellerId) return { ok: false, reason: 'NOT_SELLER' };
    if (!ACTIVE_STATUSES.includes(original.status) || original.expiresAt <= now) {
      return { ok: false, reason: 'NOT_ACTIVE' };
    }

    await tx.offer.update({
      where: { id: original.id },
      data: { status: 'COUNTERED' },
    });

    const counter = await tx.offer.create({
      data: {
        listingId: original.listingId,
        buyerId: original.buyerId,
        amount: new Prisma.Decimal(input.amount),
        status: 'PENDING',
        parentOfferId: original.id,
        expiresAt: new Date(now.getTime() + OFFER_TTL_HOURS * 3600 * 1000),
        createdAt: now,
      },
    });

    await notify(tx, {
      userId: original.buyerId,
      templateKey: 'offer.countered',
      payload: { amount: input.amount },
      entityType: 'Offer',
      entityId: counter.id,
    });

    return { ok: true, offer: counter };
  });
}

export type WithdrawResult =
  | { ok: true }
  | { ok: false; reason: 'OFFER_NOT_FOUND' | 'NOT_BUYER' | 'NOT_ACTIVE' };

/** سحب المشتري لعرضه — ما دام نشطًا ولم يُقبل. */
export async function withdrawOffer(
  input: { offerId: string; buyerId: string },
  now: Date = new Date(),
): Promise<WithdrawResult> {
  return db.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { id: input.offerId },
      include: { listing: { select: { sellerId: true } } },
    });

    if (offer === null) return { ok: false, reason: 'OFFER_NOT_FOUND' };
    if (offer.buyerId !== input.buyerId) return { ok: false, reason: 'NOT_BUYER' };
    if (!ACTIVE_STATUSES.includes(offer.status) || offer.expiresAt <= now) {
      return { ok: false, reason: 'NOT_ACTIVE' };
    }

    await tx.offer.update({ where: { id: offer.id }, data: { status: 'WITHDRAWN' } });

    await notify(tx, {
      userId: offer.listing.sellerId,
      templateKey: 'offer.withdrawn',
      entityType: 'Offer',
      entityId: offer.id,
    });

    return { ok: true };
  });
}

export type AcceptResult =
  | { ok: true; orderRef: string; closedOffers: number }
  | { ok: false; reason: 'OFFER_NOT_FOUND' | 'NOT_SELLER' | 'NOT_ACTIVE' };

/** رقم الطلب — سنة وتسلسل، يُقتبَس في مكالمة. */
async function nextOrderRef(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const year = now.getFullYear();
  const count = await tx.order.count({ where: { ref: { startsWith: `ORD-${year}-` } } });
  return `ORD-${year}-${String(1000 + count + 1)}`;
}

/**
 * ═══ القاعدة ٤ ═══ قبول عرض ⇒ إغلاق الباقي + سحب الإعلان + مهلة دفع ٢٤ ساعة.
 *
 * الأربعة **في معاملة واحدة**: قبولٌ ينجح وإغلاقُ الباقي يفشل يترك
 * سيارةً واحدة مبيعةً مرّتين. وهذا ليس احتمالًا نظريًّا — هو ما يقع
 * حين يقبل بائعٌ عرضين في ثانيتين متتاليتين.
 *
 * والعمولة **لقطة** في الطلب (قاعدة ١١): تعديل الباقة غدًا لا يمسّ
 * صفقة اليوم.
 */
export async function acceptOffer(
  input: { offerId: string; sellerId: string },
  now: Date = new Date(),
): Promise<AcceptResult> {
  return db.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { id: input.offerId },
      include: { listing: { select: { id: true, ref: true, sellerId: true, status: true } } },
    });

    if (offer === null) return { ok: false, reason: 'OFFER_NOT_FOUND' };
    if (offer.listing.sellerId !== input.sellerId) return { ok: false, reason: 'NOT_SELLER' };
    if (
      !ACTIVE_STATUSES.includes(offer.status) ||
      offer.expiresAt <= now ||
      offer.listing.status !== 'PUBLISHED'
    ) {
      return { ok: false, reason: 'NOT_ACTIVE' };
    }

    await tx.offer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED' } });

    // بقيّة العروض تُغلق — لا سيارة تُباع مرّتين
    const others = await tx.offer.findMany({
      where: {
        listingId: offer.listingId,
        id: { not: offer.id },
        status: { in: [...ACTIVE_STATUSES] },
      },
      select: { id: true, buyerId: true },
    });

    await tx.offer.updateMany({
      where: { id: { in: others.map((other) => other.id) } },
      data: { status: 'REJECTED' },
    });

    for (const other of others) {
      await notify(tx, {
        userId: other.buyerId,
        templateKey: 'offer.lost',
        entityType: 'Listing',
        entityId: offer.listingId,
      });
    }

    // الإعلان يُسحب من العرض العام فورًا
    await tx.listing.update({
      where: { id: offer.listingId },
      data: { status: 'RESERVED', closedAt: now, closeReason: 'offer.accepted' },
    });

    const [platform, commissionRule] = await Promise.all([
      tx.platformSetting.findUnique({ where: { id: 'default' } }),
      tx.commissionRule.findFirst({
        where: { scope: 'global', activeFrom: { lte: now } },
        orderBy: { activeFrom: 'desc' },
      }),
    ]);

    const price = Number(offer.amount);
    const commissionPct = commissionRule === null ? 0 : Number(commissionRule.pct);
    const commissionAmount =
      commissionRule === null
        ? 0
        : Math.min(
            Math.max(
              (price * commissionPct) / 100 + Number(commissionRule.fixedFee),
              Number(commissionRule.minFee ?? 0),
            ),
            Number(commissionRule.maxFee ?? Number.MAX_SAFE_INTEGER),
          );

    const transferFee = Number(platform?.transferFee ?? 0);
    const total = price + commissionAmount + transferFee;
    // الضريبة **مضمَّنة** — ١٥/١١٥ من الإجمالي لا مضافة إليه (قرار ١٧)
    const vatPct = Number(platform?.vatPct ?? 15);
    const vatAmount = (total * vatPct) / (100 + vatPct);

    const ref = await nextOrderRef(tx, now);

    await tx.order.create({
      data: {
        ref,
        listingId: offer.listingId,
        buyerId: offer.buyerId,
        sellerId: offer.listing.sellerId,
        source: 'OFFER',
        stage: 'PAYMENT',
        agreedPrice: new Prisma.Decimal(price),
        commissionPct: new Prisma.Decimal(commissionPct),
        commissionAmount: new Prisma.Decimal(commissionAmount),
        transferFee: new Prisma.Decimal(transferFee),
        vatAmount: new Prisma.Decimal(vatAmount.toFixed(2)),
        totalAmount: new Prisma.Decimal(total),
        createdAt: now,
        stageEnteredAt: now,
        paymentDueAt: new Date(now.getTime() + PAYMENT_WINDOW_HOURS * 3600 * 1000),
      },
    });

    await notify(tx, {
      userId: offer.buyerId,
      templateKey: 'offer.accepted',
      // مهلة الدفع حرجة: فواتها يُلغي الصفقة (قاعدة ١٧)
      priority: 'critical',
      payload: { ref, amount: price },
      entityType: 'Order',
      entityId: ref,
    });

    return { ok: true, orderRef: ref, closedOffers: others.length };
  });
}

/**
 * ═══ القاعدة ٣ ═══ العرض يسقط بعد ٤٨ ساعة.
 *
 * يُشغَّل دوريًّا. والانتهاء **يُكتب** ولا يُستنتج من التاريخ عند
 * القراءة: عرضٌ منتهٍ يجب أن يظهر منتهيًا في كل قارئ — الشاشة والأدمن
 * والتقرير — لا في من تذكّر مقارنة التاريخ.
 */
export async function expireOffers(now: Date = new Date()): Promise<number> {
  const { count } = await db.offer.updateMany({
    where: { status: { in: [...ACTIVE_STATUSES] }, expiresAt: { lte: now } },
    data: { status: 'EXPIRED' },
  });
  return count;
}

/**
 * ═══ القاعدة ٥ ═══ عدم الدفع في المهلة ⇒ إعادة نشر + إخطار المتقدّمين.
 *
 * «المتقدّمون» هم من رُفضت عروضهم بسبب القبول — لا كل من قدّم عرضًا
 * يومًا. من انسحب أو انتهى عرضه بنفسه اختار الخروج، وإخطاره ضجيج.
 */
export async function timeoutUnpaidOrders(now: Date = new Date()): Promise<number> {
  const overdue = await db.order.findMany({
    where: { stage: 'PAYMENT', status: 'ACTIVE', paymentDueAt: { lte: now } },
    select: { id: true, ref: true, listingId: true, buyerId: true },
  });

  for (const order of overdue) {
    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        /**
         * **الإلغاء حالة لا مرحلة**: الطلب يبقى عند المرحلة التي مات
         * فيها، فيُقرأ لاحقًا «أُلغي عند الدفع» لا «أُلغي». والمخطط
         * محقّ في ألّا يجعل `CANCELLED` مرحلة.
         */
        data: {
          status: 'CANCELLED',
          cancelledBy: 'system',
          cancelReason: 'payment.timeout',
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'payment.timeout',
          fromStage: 'PAYMENT',
          actorType: 'system',
          createdAt: now,
        },
      });

      // الإعلان يعود إلى العرض العام
      await tx.listing.update({
        where: { id: order.listingId },
        data: { status: 'PUBLISHED', closedAt: null, closeReason: null },
      });

      const contenders = await tx.offer.findMany({
        where: { listingId: order.listingId, status: 'REJECTED', autoRejected: false },
        select: { buyerId: true },
        distinct: ['buyerId'],
      });

      for (const contender of contenders) {
        if (contender.buyerId === order.buyerId) continue;
        await notify(tx, {
          userId: contender.buyerId,
          templateKey: 'listing.relisted',
          entityType: 'Listing',
          entityId: order.listingId,
        });
      }

      await notify(tx, {
        userId: order.buyerId,
        templateKey: 'order.payment_timeout',
        priority: 'critical',
        entityType: 'Order',
        entityId: order.ref,
      });
    });
  }

  return overdue.length;
}
