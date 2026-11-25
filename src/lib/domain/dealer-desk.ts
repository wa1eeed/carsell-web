import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import type { OfferStatus, OrderStage } from '@/generated/prisma/enums';

/**
 * ═══ مكتبُ المعرض — `D5` العروض و`D6` الطلبات ═══
 *
 * **وكلاهما قراءةٌ لما بُني في كارز بعينِ المعرض**: العرضُ والطلبُ
 * موجودان بقواعدهما، والجديدُ أنّ المعرضَ يراهما **على مركباته
 * وفرعِه** لا على حسابٍ واحد.
 *
 * **والحصرُ بالفرع في الاستعلام لا في العرض** (مصفوفة `D9`): ترشيحٌ
 * بعد الجلب يُسلسل صفوفَ فرعٍ آخر إلى المتصفّح — وهو مسلكُ
 * `reservePrice` نفسُه: ما لا يدخل الكائن لا يتسرّب منه.
 */

function scope(dealerId: string, branchId: string | null) {
  return { dealerId, ...(branchId === null ? {} : { branchId }) };
}

export type DeskOffer = {
  id: string;
  buyerName: string | null;
  amount: string;
  listingRef: string;
  vehicle: string;
  year: number;
  /** الساعاتُ منذ وصوله — والترميز يرتّب بالأقدم. */
  hours: number;
  status: OfferStatus;
  /** أهو الأعلى على هذه المركبة؟ — الترميزُ يسِمه «الأعلى». */
  top: boolean;
  /**
   * أفوق أرضيّةِ البائع هو؟ — و`null` حين لا أرضيّةَ موضوعة.
   *
   * **والسكوتُ عن أرضيّةٍ غير موضوعة يُقرأ «العرضُ دونها»** — قاعدةٌ
   * مسجَّلة في هذا المستودع.
   */
  aboveFloor: boolean | null;
};

export async function deskOffers(
  dealerId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<DeskOffer[]> {
  const rows = await db.offer.findMany({
    where: {
      status: { in: ['PENDING', 'COUNTERED'] },
      listing: { vehicle: scope(dealerId, branchId) },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: {
      id: true, amount: true, status: true, createdAt: true,
      buyer: { select: { name: true } },
      listing: {
        select: {
          ref: true, minAcceptPrice: true,
          vehicle: { select: { year: true, brand: { select: { nameAr: true } }, model: { select: { nameAr: true } } } },
          offers: { where: { status: { in: ['PENDING', 'COUNTERED'] } }, select: { amount: true } },
        },
      },
    },
  });

  return rows.map((row) => {
    const highest = row.listing.offers.reduce(
      (max, o) => (o.amount.greaterThan(max) ? o.amount : max),
      new Prisma.Decimal(0),
    );
    return {
      id: row.id,
      buyerName: row.buyer.name,
      amount: row.amount.toFixed(2),
      listingRef: row.listing.ref,
      vehicle: `${row.listing.vehicle.brand.nameAr} ${row.listing.vehicle.model.nameAr}`,
      year: row.listing.vehicle.year,
      hours: Math.max(0, Math.floor((now.getTime() - row.createdAt.getTime()) / 3_600_000)),
      status: row.status,
      top: row.amount.greaterThanOrEqualTo(highest),
      aboveFloor:
        row.listing.minAcceptPrice === null
          ? null
          : row.amount.greaterThanOrEqualTo(row.listing.minAcceptPrice),
    };
  });
}

export type DeskOrder = {
  ref: string;
  vehicle: string;
  buyerName: string | null;
  stage: OrderStage;
  /** حالُ الطلب — **والمرحلةُ لا تكفي متى كان له حال** (قاعدةٌ مسجَّلة). */
  live: boolean;
  /** أيّامٌ في المرحلة الحالية. */
  inStageDays: number;
  amount: string;
  /** حالُ الضمان — «محتجز» أو «أُفرج». */
  escrowHeld: boolean;
  transferAt: string | null;
};

export async function deskOrders(
  dealerId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<DeskOrder[]> {
  const rows = await db.order.findMany({
    where: { listing: { vehicle: scope(dealerId, branchId) } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      ref: true, stage: true, status: true, agreedPrice: true,
      stageEnteredAt: true, createdAt: true, transferAppointmentAt: true,
      buyer: { select: { name: true } },
      listing: {
        select: {
          vehicle: { select: { year: true, brand: { select: { nameAr: true } }, model: { select: { nameAr: true } } } },
        },
      },
      escrow: { select: { status: true } },
    },
  });

  return rows.map((row) => {
    const since = row.stageEnteredAt ?? row.createdAt;
    return {
      ref: row.ref,
      vehicle: `${row.listing.vehicle.brand.nameAr} ${row.listing.vehicle.model.nameAr} ${String(row.listing.vehicle.year)}`,
      buyerName: row.buyer.name,
      stage: row.stage,
      /**
       * **والمرحلةُ تُعرض مع حالها دائمًا** (البوابة ٣٩): طلبٌ أُلغي
       * عند الدفع تبقى مرحلتُه `PAYMENT` إلى الأبد — فيُقرأ «ينتظر
       * الدفع» وهو ميّت.
       */
      live: row.status === 'ACTIVE',
      inStageDays: Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000)),
      amount: row.agreedPrice.toFixed(2),
      escrowHeld: row.escrow?.status === 'HELD',
      transferAt: row.transferAppointmentAt?.toISOString() ?? null,
    };
  });
}

export type DeskCounts = {
  offersWaiting: number;
  offersActive: number;
  ordersLive: number;
  ordersDoneThisMonth: number;
};

export async function deskCounts(
  dealerId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<DeskCounts> {
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const where = { listing: { vehicle: scope(dealerId, branchId) } };

  const [waiting, active, live, done] = await Promise.all([
    db.offer.count({ where: { ...where, status: 'PENDING' } }),
    db.offer.count({ where: { ...where, status: { in: ['PENDING', 'COUNTERED'] } } }),
    db.order.count({ where: { ...where, status: 'ACTIVE', stage: { not: 'DONE' } } }),
    db.order.count({ where: { ...where, status: 'ACTIVE', stage: 'DONE', createdAt: { gte: month } } }),
  ]);

  return { offersWaiting: waiting, offersActive: active, ordersLive: live, ordersDoneThisMonth: done };
}
