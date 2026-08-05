import type { OrderStage, OrderStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { netToSeller } from './money';

/**
 * ═══ تفاصيل الطلب في اللوحة ═══
 *
 * القائمة كانت تعرض صفًّا ولا تفتحه: من رأى طلبًا متعثّرًا لا يستطيع أن
 * يعرف **لماذا** — لا مبالغه ولا قيوده ولا سجلّ مراحله ولا نزاعه.
 *
 * ═══ ولا يُعرض ما لا يُعرض للعامّة ═══
 *
 * `reservePrice` و`minAcceptPrice` ممنوعان في أي استجابة عامة. **وهذه
 * ليست عامّة** — لكنّ القاعدة أن يُقرأ عن قصدٍ لا عرَضًا، فلا يُجرّ
 * الإعلانُ كاملًا بـ`include` مفتوح.
 *
 * ═══ والمال يُقرأ من قاعدةٍ واحدة ═══
 *
 * صافي البائع من `netToSeller` نفسها التي يقرؤها كشف التسوية وصفحة
 * أرباحه — وحسابُه هنا يُنتج قاعدةً ثالثة كانت لها صيغتان تتباعدان.
 */

export type OrderParty = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  idVerified: boolean;
  /** كم طلبًا سابقًا له — سياقٌ لمن يقرّر في نزاع */
  previousOrders: number;
};

export type OrderTimelineEntry = {
  id: string;
  type: string;
  fromStage: OrderStage | null;
  toStage: OrderStage | null;
  actorType: string;
  at: string;
};

export type OrderMoney = {
  agreedPrice: string;
  settlementAmount: string | null;
  buyerCommission: string;
  sellerCommission: string;
  transferFee: string;
  transferAdminFee: string;
  processingFee: string;
  processingFeeBearer: string;
  vatAmount: string;
  totalAmount: string;
  /** ما يصل البائع — من `netToSeller`، لا محسوبًا هنا */
  netToSeller: string;
};

export type OrderLedgerLine = {
  id: string;
  account: string;
  direction: string;
  amount: string;
  event: string;
  at: string;
};

export type AdminOrderDetail = {
  ref: string;
  stage: OrderStage;
  status: OrderStatus;
  source: string;
  createdAt: string;
  stageEnteredAt: string;
  /** المهلة النافذة للمرحلة الحالية — و`null` حين لا مهلة لها */
  dueAt: string | null;
  /** انقضت المهلة ولم تمرّ الوظيفة الدورية — والحالة وحدها لا تكفي */
  overdue: boolean;
  /**
   * سقف النقل — **ويُمدَّد مرّة واحدة بسببٍ مكتوب**.
   *
   * والحقول الثلاثة تخرج معًا: بلا `extendedAt` تعرض الشاشة زرًّا
   * يُرفض بعد الضغط، وبلا السبب يقرأ من يفتح الطلب بعد شهر تاريخًا
   * مؤجَّلًا لا يعرف من أجّله ولا لماذا.
   */
  transferDeadlineAt: string | null;
  transferExtendedAt: string | null;
  transferExtensionReason: string | null;
  cancelReason: string | null;

  buyer: OrderParty;
  seller: OrderParty;

  listing: { ref: string; title: string; city: string; askPrice: string; status: string };
  money: OrderMoney;

  escrow: { status: string; amount: string; heldAt: string | null; releasedAt: string | null } | null;
  payments: { id: string; purpose: string; status: string; amount: string; at: string }[];
  ledger: OrderLedgerLine[];
  timeline: OrderTimelineEntry[];
  dispute: { id: string; status: string; reason: string; openedAt: string } | null;
  documents: { kind: string; ref: string; at: string }[];
};

export async function adminOrderDetail(ref: string, now: Date = new Date()): Promise<AdminOrderDetail | null> {
  const order = await db.order.findUnique({
    where: { ref },
    include: {
      buyer: { select: { id: true, name: true, phone: true, email: true, idVerified: true } },
      seller: { select: { id: true, name: true, phone: true, email: true, idVerified: true } },
      listing: {
        select: {
          ref: true,
          city: true,
          askPrice: true,
          status: true,
          vehicle: { select: { brandName: true, modelName: true, year: true } },
        },
      },
      escrow: true,
      payments: { orderBy: { createdAt: 'desc' } },
      events: { orderBy: { createdAt: 'desc' }, take: 50 },
      disputes: { orderBy: { openedAt: 'desc' }, take: 1 },
      taxInvoices: { select: { number: true, issuedAt: true } },
      settlement: { select: { id: true, issuedAt: true } },
      agreement: { select: { id: true, issuedAt: true } },
    },
  });

  if (order === null) return null;

  const [buyerOrders, sellerOrders, ledger] = await Promise.all([
    db.order.count({ where: { buyerId: order.buyerId, id: { not: order.id } } }),
    db.order.count({ where: { sellerId: order.sellerId, id: { not: order.id } } }),
    db.ledgerEntry.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } }),
  ]);

  /**
   * **المهلة والزمن معًا.** والحالة المخزَّنة وحدها لا تكفي متى كان لها
   * وقت: مرحلةٌ انقضت مهلتُها والوظيفة الدورية لم تمرّ بعد تُعرض سليمةً
   * وهي متأخّرة.
   */
  const dueAt =
    order.stage === 'PAYMENT'
      ? order.paymentDueAt
      : order.stage === 'TRANSFER'
        ? order.transferDeadlineAt
        : null;

  const party = (
    user: { id: string; name: string | null; phone: string; email: string | null; idVerified: boolean },
    previousOrders: number,
  ): OrderParty => ({
    id: user.id,
    name: user.name ?? user.phone,
    phone: user.phone,
    email: user.email,
    idVerified: user.idVerified,
    previousOrders,
  });

  const documents = [
    ...order.taxInvoices.map((invoice) => ({
      kind: 'tax_invoice',
      ref: invoice.number,
      at: invoice.issuedAt.toISOString(),
    })),
    ...(order.settlement === null
      ? []
      : [
          {
            kind: 'settlement',
            ref: order.settlement.id,
            at: order.settlement.issuedAt.toISOString(),
          },
        ]),
    ...(order.agreement === null
      ? []
      : [
          {
            kind: 'agreement',
            ref: order.agreement.id,
            at: order.agreement.issuedAt.toISOString(),
          },
        ]),
  ];

  const dispute = order.disputes[0] ?? null;

  return {
    ref: order.ref,
    stage: order.stage,
    status: order.status,
    source: order.source,
    createdAt: order.createdAt.toISOString(),
    stageEnteredAt: order.stageEnteredAt.toISOString(),
    dueAt: dueAt?.toISOString() ?? null,
    overdue: dueAt !== null && dueAt.getTime() < now.getTime(),
    transferDeadlineAt: order.transferDeadlineAt?.toISOString() ?? null,
    transferExtendedAt: order.transferDeadlineExtendedAt?.toISOString() ?? null,
    transferExtensionReason: order.transferExtensionReason,
    cancelReason: order.cancelReason,

    buyer: party(order.buyer, buyerOrders),
    seller: party(order.seller, sellerOrders),

    listing: {
      ref: order.listing.ref,
      title: `${order.listing.vehicle.brandName} ${order.listing.vehicle.modelName} ${String(order.listing.vehicle.year)}`,
      city: order.listing.city,
      askPrice: order.listing.askPrice.toFixed(2),
      status: order.listing.status,
    },

    money: {
      agreedPrice: order.agreedPrice.toFixed(2),
      settlementAmount: order.settlementAmount?.toFixed(2) ?? null,
      buyerCommission: order.buyerCommission.toFixed(2),
      sellerCommission: order.sellerCommission.toFixed(2),
      transferFee: order.transferFee.toFixed(2),
      transferAdminFee: order.transferAdminFee.toFixed(2),
      processingFee: order.processingFee.toFixed(2),
      processingFeeBearer: order.processingFeeBearer,
      vatAmount: order.vatAmount.toFixed(2),
      totalAmount: order.totalAmount.toFixed(2),
      // القاعدة الواحدة — ولا تُحسب هنا
      netToSeller: netToSeller({
        agreedPrice: order.agreedPrice,
        settlementAmount: order.settlementAmount,
        sellerCommission: order.sellerCommission,
        gatewayFee: order.processingFeeBearer === 'SELLER' ? order.processingFee : null,
      }).toFixed(2),
    },

    escrow:
      order.escrow === null
        ? null
        : {
            status: order.escrow.status,
            amount: order.escrow.amount.toFixed(2),
            heldAt: order.escrow.heldAt?.toISOString() ?? null,
            releasedAt: order.escrow.releasedAt?.toISOString() ?? null,
          },

    payments: order.payments.map((payment) => ({
      id: payment.id,
      purpose: payment.purpose,
      status: payment.status,
      amount: payment.amount.toFixed(2),
      at: payment.createdAt.toISOString(),
    })),

    ledger: ledger.map((entry) => ({
      id: entry.id,
      account: entry.account,
      direction: entry.direction,
      amount: entry.amount.toFixed(2),
      event: entry.event,
      at: entry.createdAt.toISOString(),
    })),

    timeline: order.events.map((event) => ({
      id: event.id,
      type: event.type,
      fromStage: event.fromStage,
      toStage: event.toStage,
      actorType: event.actorType,
      at: event.createdAt.toISOString(),
    })),

    dispute:
      dispute === null
        ? null
        : {
            id: dispute.id,
            status: dispute.status,
            reason: dispute.reason,
            openedAt: dispute.openedAt.toISOString(),
          },

    documents,
  };
}
