import { Prisma } from '@/generated/prisma/client';
import type { OrderStage } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { netToSeller } from './money';
import { canSettle } from './transfer-windows';

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

export type SettlementBlock = 'NOT_TRANSFERRED' | 'DISPUTED';

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
      payments: { where: { status: 'HELD' }, select: { amount: true } },
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
    const guard =
      order.disputes.length > 0
        ? ({ allowed: false, reason: 'DISPUTED' } as const)
        : canSettle(order);

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
