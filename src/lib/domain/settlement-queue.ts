import { Prisma } from '@/generated/prisma/client';
import type { OrderStage } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { netToSeller } from './money';
import { canSettle } from './transfer-windows';
import { gatewayImplemented } from '@/lib/payments/resolve';

/**
 * ═══ طابور الإفراج — الباب الذي لم يكن موجودًا ═══
 *
 * `requestSettle` و`approveSettle` مبنيّتان ومختبَرتان
 * (`tests/settle-quorum.test.ts`)، والمسار قائم بنصابه وصلاحيته
 * (`POST /api/v1/admin/orders/{ref}/settle`) — **ولا شاشة في المنتج
 * كلّه تناديه**. وجدول الطلبات في اللوحة ستّة أعمدة للقراءة، بلا زرّ.
 *
 * فالمال يدخل الضمان ولا سبيل لإخراجه إلى البائع. وهو الشكل نفسه
 * الذي وُجد في الدفع والعروض والمزايدة والنشر والنزاع — **ثامنُ
 * مرّة، وأخطرها**: السابقة تُعطّل ميزة، وهذه تحبس مال الناس.
 *
 * ═══ ولماذا يُعرض المحجوب أيضًا ═══
 *
 * طابورٌ يُظهر الجاهز وحده يجيب «ماذا أفعل الآن» ولا يجيب «أين مال
 * فلان». والبائع يسأل الثانية، والمشغّل يحتاج أن يرى السبب — نافذة
 * استرجاعٍ لم تنقضِ، أو نقلٌ لم يُؤكَّد، أو نزاعٌ قائم — لا أن يجد
 * الصفّ غائبًا فيظنّه ضائعًا.
 */

/**
 * **وبوابةٌ بلا وصلة سببُ حجبٍ ثالث.** `status: ACTIVE` صفٌّ في القاعدة
 * والمُهايئ شيفرة: كلُّ المحجوز اليوم (٢٥٤٬٥٧٠) على `bank_escrow` ولا
 * وصلة لها — فالصفّ كان يُعرض «جاهز للإفراج»، ويطلب موافقة شخصين،
 * **ثمّ يفشل النداء**. وموافقتان تُنفَقان على ما لا يقع.
 */
export type SettlementBlock = 'NOT_TRANSFERRED' | 'DISPUTED' | 'GATEWAY_UNAVAILABLE';

export type PendingApproval = {
  id: string;
  requestedById: string;
  requestedByName: string;
  approvedBy: readonly string[];
  /** الطالب يُحسب واحدًا — فالمعروض يقول كم بلغ النصاب لا كم وافق */
  approvals: number;
  required: number;
  expiresAt: string;
};

export type SettlementRow = {
  orderRef: string;
  stage: OrderStage;
  buyer: string;
  seller: string;
  sellerId: string;
  /** ما هو محجوز لدى المزوّد باسم هذه الصفقة */
  heldAmount: string;
  /** ما يصل البائع بعد العمولة والضريبة والرسوم — قاعدة `money.ts` */
  netToSeller: string;
  /** `null` تعني: جاهز للإفراج */
  blockedBy: SettlementBlock | null;
  approval: PendingApproval | null;
};

export type SettlementQueue = {
  ready: readonly SettlementRow[];
  awaitingApproval: readonly SettlementRow[];
  blocked: readonly SettlementRow[];
  /** مجموع ما ينتظر الإفراج — والمحجوب داخله */
  totalHeld: string;
};

/**
 * كل طلبٍ عليه دفعةٌ محجوزة.
 *
 * **والحجز هو المعيار لا المرحلة**: طلبٌ عند `DONE` أُفرج عنه لا يعود
 * إلى الطابور، وآخر عند `TRANSFER` بمالٍ محجوز يجب أن يُرى.
 */
export async function settlementQueue(now: Date = new Date()): Promise<SettlementQueue> {
  const orders = await db.order.findMany({
    where: { payments: { some: { status: 'HELD' } } },
    select: {
      ref: true,
      stage: true,
      status: true,
      agreedPrice: true,
      settlementAmount: true,
      commissionAmount: true,
      sellerCommission: true,
      vatAmount: true,
      transferFee: true,
      sellerId: true,
      buyer: { select: { name: true, phone: true } },
      seller: { select: { name: true, phone: true } },
      payments: { where: { status: 'HELD' }, select: { amount: true, gatewayKey: true } },
      settlement: { select: { gatewayFee: true } },
      disputes: { where: { status: { in: ['OPEN', 'INVESTIGATING'] } }, select: { id: true } },
    },
    orderBy: { ref: 'asc' },
  });

  if (orders.length === 0) {
    return { ready: [], awaitingApproval: [], blocked: [], totalHeld: '0.00' };
  }

  const pending = await db.approvalRequest.findMany({
    where: {
      kind: 'ESCROW_RELEASE',
      entityType: 'Order',
      entityId: { in: orders.map((order) => order.ref) },
      status: 'PENDING',
    },
  });

  const requesterIds = [...new Set(pending.map((request) => request.requestedBy))];
  const admins =
    requesterIds.length === 0
      ? []
      : await db.adminUser.findMany({
          where: { id: { in: requesterIds } },
          select: { id: true, name: true },
        });

  const ready: SettlementRow[] = [];
  const awaitingApproval: SettlementRow[] = [];
  const blocked: SettlementRow[] = [];
  let total = new Prisma.Decimal(0);

  for (const order of orders) {
    const held = order.payments.reduce(
      (running, payment) => running.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    total = total.plus(held);

    /**
     * **الحارس نفسه الذي يفرض الإفراج** — `canSettle` لا نسخةٌ منه،
     * وإلّا عرضت الشاشة «جاهز» وردّ الخادم بالرفض. والنزاع يُفحص
     * صراحةً: نزاعٌ في مرحلةٍ أخرى قد لا يبلغ `status`.
     */
    const ordered =
      order.disputes.length > 0
        ? ({ allowed: false, reason: 'DISPUTED' } as const)
        : canSettle(order);

    /**
     * **والبوابة تُفحص آخرًا.** سببٌ واحد يُعرض، فليكن الذي يُتصرَّف فيه
     * الآن: طلبٌ لم تُنقل ملكيّتُه فعلُه تأكيدُ النقل، والبوابة لا تعنيه
     * بعد. وكان الفحص أوّلًا فقرأ المشغّل «بوابة بلا وصلة» على ثلاثة
     * طلبات سببُها الحقيقيّ «لم تُؤكَّد الملكية» — فأخفى ما يُفعل بما
     * لا يُفعل فيه شيء.
     */
    const guard = ordered.allowed
      ? order.payments.some((payment) => !gatewayImplemented(payment.gatewayKey))
        ? ({ allowed: false, reason: 'GATEWAY_UNAVAILABLE' } as const)
        : ordered
      : ordered;

    /**
     * **والانقضاء يُفحص هنا لا في الحالة المخزَّنة.** طلبٌ مضت مهلته
     * ولم تمرّ عليه وظيفةٌ تُغيّر حالته يبقى `PENDING` في الجدول —
     * فلو قرأناها وحدها عرضنا «ينتظر موافقة» لطلبٍ ميّت، وردّ الخادم
     * `EXPIRED` عند الضغط.
     */
    const request = pending.find(
      (row) => row.entityId === order.ref && row.expiresAt.getTime() > now.getTime(),
    );

    const approval: PendingApproval | null =
      request === undefined
        ? null
        : {
            id: request.id,
            requestedById: request.requestedBy,
            requestedByName:
              admins.find((admin) => admin.id === request.requestedBy)?.name ?? request.requestedBy,
            approvedBy: request.approvedBy,
            approvals: request.approvedBy.length + 1,
            required: request.requiredApprovals,
            expiresAt: request.expiresAt.toISOString(),
          };

    const row: SettlementRow = {
      orderRef: order.ref,
      stage: order.stage,
      buyer: order.buyer.name ?? order.buyer.phone,
      seller: order.seller.name ?? order.seller.phone,
      sellerId: order.sellerId,
      heldAmount: held.toFixed(2),
      netToSeller: netToSeller({
        ...order,
        gatewayFee: order.settlement?.gatewayFee ?? null,
      }).toFixed(2),
      blockedBy: guard.allowed ? null : guard.reason,
      approval,
    };

    if (approval !== null) awaitingApproval.push(row);
    else if (guard.allowed) ready.push(row);
    else blocked.push(row);
  }

  return { ready, awaitingApproval, blocked, totalHeld: total.toFixed(2) };
}

export type SettledRow = {
  orderRef: string;
  seller: string;
  buyer: string;
  amount: string;
  at: string;
};

export type RefundedRow = {
  orderRef: string;
  buyer: string;
  amount: string;
  reason: string | null;
  at: string;
};

export type DepositRow = {
  auctionRef: string;
  bidder: string;
  amount: string;
  status: 'HELD' | 'RELEASED' | 'FORFEITED' | 'APPLIED';
  hasPayment: boolean;
};

export type SettlementHistory = {
  settled: SettledRow[];
  refunded: RefundedRow[];
  deposits: DepositRow[];
  /** مجموع ما أُفرج عنه منذ أوّل الشهر — «مُسوّى هذا الشهر» في A25 */
  settledThisMonth: string;
};

/**
 * ═══ ما خرج من الطابور — والشرائح التي أُجِّلت ═══
 *
 * التصميم يذكر شرائح «مُسوّى» و«مُسترجَع» و«عرابين»، **وتُركت عمدًا**:
 * الطابور طابورُ ما لم يُفرَج عنه بعد، ولم يكن في المنتج ما يملأ
 * الثلاث — لا إلغاءَ يُرجع مالًا، ولا عربونَ بمالٍ خلفه. وشريحةٌ
 * تفتح على فراغٍ دائم تُقرأ عطلًا لا حدًّا.
 *
 * **والسبب سقط**: صار الإلغاء يُرجع (`order-cancel`)، وصار العربون
 * يمرّ بالبوابة ويُحصَّل ويُصادَر (القاعدة ٩). فالمصدر موجود، والشريحة
 * تُفتح.
 *
 * > وتأجيلٌ مكتوبٌ بسببه يُراجَع حين يسقط سببه — وإلّا بقي قرارًا
 * > قديمًا يُقرأ قاعدةً.
 */
export async function settlementHistory(now: Date = new Date()): Promise<SettlementHistory> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [released, refunded, deposits, monthly] = await Promise.all([
    db.escrow.findMany({
      where: { status: 'RELEASED' },
      orderBy: { releasedAt: 'desc' },
      take: 50,
      select: {
        amount: true,
        releasedAt: true,
        order: {
          select: {
            ref: true,
            seller: { select: { name: true } },
            buyer: { select: { name: true } },
          },
        },
      },
    }),
    db.escrow.findMany({
      where: { status: { in: ['REFUNDED', 'PARTIAL_REFUND'] } },
      orderBy: { releasedAt: 'desc' },
      take: 50,
      select: {
        amount: true,
        releasedAt: true,
        order: {
          select: { ref: true, cancelReason: true, buyer: { select: { name: true } } },
        },
      },
    }),
    db.deposit.findMany({
      orderBy: { id: 'desc' },
      take: 50,
      select: {
        amount: true,
        status: true,
        paymentId: true,
        user: { select: { name: true } },
        auction: { select: { listing: { select: { ref: true } } } },
      },
    }),
    db.escrow.aggregate({
      where: { status: 'RELEASED', releasedAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
  ]);

  const text = (value: string | null): string => value ?? '—';

  return {
    settled: released.map((row) => ({
      orderRef: row.order.ref,
      seller: text(row.order.seller.name),
      buyer: text(row.order.buyer.name),
      amount: row.amount.toFixed(2),
      at: (row.releasedAt ?? now).toISOString(),
    })),
    refunded: refunded.map((row) => ({
      orderRef: row.order.ref,
      buyer: text(row.order.buyer.name),
      amount: row.amount.toFixed(2),
      reason: row.order.cancelReason,
      at: (row.releasedAt ?? now).toISOString(),
    })),
    deposits: deposits.map((row) => ({
      auctionRef: row.auction.listing.ref,
      bidder: text(row.user.name),
      amount: row.amount.toFixed(2),
      status: row.status,
      /** **والدفتريّ القديم يُميَّز**: وسمٌ بلا مالٍ خلفه ليس عربونًا. */
      hasPayment: row.paymentId !== null,
    })),
    settledThisMonth: (monthly._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
  };
}
