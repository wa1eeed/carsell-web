import { db } from '@/lib/db';
import type { OrderStage } from '@/generated/prisma/enums';

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
  return db.$transaction(async (tx) => {
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
        ...(input.to === 'DONE' ? { status: 'COMPLETED' as const } : {}),
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

    return { ok: true, stage: input.to };
  });
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
    transferFee: string;
    vat: string;
    total: string;
  };
  escrow: { status: string; amount: string; heldAt: string | null; releasedAt: string | null } | null;
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
  const viewerIsBuyer = order.buyerId === viewerId;
  const other = viewerIsBuyer ? order.seller : order.buyer;
  const dispute = order.disputes[0] ?? null;

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
      // المزوّد لاحقًا — والمرجع يبقى فارغًا حتى ذلك الحين لا مزوَّرًا
      providerRef: null,
    },
  });
  return { ok: true };
}
