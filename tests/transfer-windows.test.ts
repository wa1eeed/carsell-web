import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { advanceStage } from '@/lib/domain/orders';
import {
  RETURN_WINDOW_DAYS,
  TRANSFER_DEADLINE_DAYS,
  canSettle,
  extendTransferDeadline,
  overdueTransfers,
  returnWindowFrom,
  settleableOrders,
  transferDeadlineFrom,
} from '@/lib/domain/transfer-windows';
import { withOrder } from './helpers/order-fixture';

afterAll(async () => {
  await db.$disconnect();
});

const DAY = 86_400_000;

let seq = 0;
async function admin() {
  seq += 1;
  return db.adminUser.create({
    data: {
      email: `twn${String(Date.now()).slice(-8)}${String(seq)}@carsell.one`,
      name: 'مشغّل', role: 'OPS', passwordHash: 'x',
    },
  });
}

describe('═══ القاعدة ١ ═══ سقف النقل — الدفع + ٧ أيام', () => {
  it('دخول مرحلة النقل يفتح السقف', async () => {
    await withOrder(async (order) => {
      await db.order.update({
        where: { id: order.id },
        data: { stage: 'PAYMENT', status: 'ACTIVE', transferDeadlineAt: null },
      });

      const now = new Date();
      const moved = await advanceStage(
        { orderRef: order.ref, actorId: order.buyerId, to: 'TRANSFER' },
        now,
      );
      expect(moved.ok).toBe(true);

      const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.transferDeadlineAt?.getTime()).toBe(transferDeadlineFrom(now).getTime());
      expect(TRANSFER_DEADLINE_DAYS).toBe(7);
    });
  });

  it('المتجاوز يظهر مرشَّحًا للاسترجاع — ولا يُلمس ماله هنا', async () => {
    await withOrder(async (order) => {
      const now = new Date();
      await db.order.update({
        where: { id: order.id },
        data: {
          stage: 'TRANSFER', status: 'ACTIVE',
          transferDeadlineAt: new Date(now.getTime() - 2 * DAY),
        },
      });

      const row = (await overdueTransfers(now)).find((entry) => entry.ref === order.ref);
      expect(row).toBeDefined();
      expect(row?.hoursLate).toBeGreaterThanOrEqual(47);
      expect(row?.extended).toBe(false);

      // والدالّة تقرأ ولا تكتب — الحالة كما هي
      const untouched = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(untouched.status).toBe('ACTIVE');
    });
  });

  it('التمديد مرّة واحدة بسبب مكتوب — والثانية تُرفض', async () => {
    const operator = await admin();
    await withOrder(async (order) => {
      const base = new Date();
      await db.order.update({
        where: { id: order.id },
        data: {
          stage: 'TRANSFER', transferDeadlineAt: base,
          transferDeadlineExtendedAt: null, transferExtensionReason: null,
        },
      });

      // سببٌ قصير يُرفض — من يؤخّر مال المشتري يُسمّي لماذا
      const noReason = await extendTransferDeadline(operator, order.ref, 'تأخير', null);
      expect(noReason.ok).toBe(false);
      if (!noReason.ok) expect(noReason.reason).toBe('REASON_REQUIRED');

      const first = await extendTransferDeadline(
        operator, order.ref, 'تعذّر حضور البائع لظرف موثَّق', null,
      );
      expect(first.ok).toBe(true);
      if (first.ok) expect(new Date(first.deadlineAt).getTime()).toBe(base.getTime() + 7 * DAY);

      // ═══ والثانية تُرفض — وإلّا صارت القاعدة زينة ═══
      const second = await extendTransferDeadline(
        operator, order.ref, 'تأخّر ثانٍ بسبب آخر موثَّق', null,
      );
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.reason).toBe('ALREADY_EXTENDED');

      const entry = await db.auditLog.findFirstOrThrow({ where: { actorId: operator.id } });
      expect((entry.after as { reason?: string }).reason).toBe('تعذّر حضور البائع لظرف موثَّق');
    });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });
});

describe('═══ القاعدة ٢ ═══ نافذة الاسترجاع — ولا إفراج قبلها', () => {
  it('تأكيد النقل يفتح النافذة', async () => {
    await withOrder(async (order) => {
      await db.order.update({
        where: { id: order.id },
        data: { stage: 'TRANSFER', status: 'ACTIVE', returnWindowEndsAt: null },
      });

      const now = new Date();
      await advanceStage({ orderRef: order.ref, actorId: order.buyerId, to: 'DONE' }, now);

      const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.returnWindowEndsAt?.getTime()).toBe(returnWindowFrom(now).getTime());
      expect(RETURN_WINDOW_DAYS).toBe(7);
    });
  });

  it('لا إفراج قبل انقضائها — وهي جزء من عمر الحجز', () => {
    const now = new Date();

    const open = canSettle(
      { stage: 'DONE', status: 'COMPLETED', returnWindowEndsAt: new Date(now.getTime() + DAY) },
      now,
    );
    expect(open.allowed).toBe(false);
    if (!open.allowed) {
      expect(open.reason).toBe('RETURN_WINDOW_OPEN');
      // ويقول متى — لا «ممنوع» وحدها
      expect(open.until).not.toBeUndefined();
    }

    const closed = canSettle(
      { stage: 'DONE', status: 'COMPLETED', returnWindowEndsAt: new Date(now.getTime() - DAY) },
      now,
    );
    expect(closed.allowed).toBe(true);
  });

  it('ولا إفراج قبل تأكيد النقل أصلًا', () => {
    const guard = canSettle({ stage: 'TRANSFER', status: 'ACTIVE', returnWindowEndsAt: null });
    expect(guard.allowed).toBe(false);
    if (!guard.allowed) expect(guard.reason).toBe('NOT_TRANSFERRED');
  });

  it('والنزاع يجمّد ولو انقضت النافذة', () => {
    const guard = canSettle(
      { stage: 'DONE', status: 'DISPUTED', returnWindowEndsAt: new Date(Date.now() - 10 * DAY) },
      new Date(),
    );
    expect(guard.allowed).toBe(false);
    if (!guard.allowed) expect(guard.reason).toBe('DISPUTED');
  });

  it('المنقضية بلا نزاع تُرشَّح للإفراج، والمتنازع عليها لا', async () => {
    await withOrder(async (order) => {
      const now = new Date();
      await db.escrow.deleteMany({ where: { orderId: order.id } });
      await db.escrow.create({
        data: { orderId: order.id, amount: 1000, status: 'HELD', heldAt: now },
      });
      await db.order.update({
        where: { id: order.id },
        data: { status: 'COMPLETED', returnWindowEndsAt: new Date(now.getTime() - DAY) },
      });

      expect(await settleableOrders(now)).toContain(order.ref);

      // نزاعٌ فُتح ⇒ يخرج من القائمة
      await db.order.update({ where: { id: order.id }, data: { status: 'DISPUTED' } });
      expect(await settleableOrders(now)).not.toContain(order.ref);
    });
  });
});

describe('القاعدتان لا تتقاطعان', () => {
  it('الثانية لا تبدأ إلا بحدثٍ يُنهي الأولى', async () => {
    await withOrder(async (order) => {
      await db.order.update({
        where: { id: order.id },
        data: {
          stage: 'PAYMENT', status: 'ACTIVE',
          transferDeadlineAt: null, returnWindowEndsAt: null,
        },
      });

      // دخول النقل: سقفٌ بلا نافذة
      await advanceStage({ orderRef: order.ref, actorId: order.buyerId, to: 'TRANSFER' });
      const inTransfer = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(inTransfer.transferDeadlineAt).not.toBeNull();
      expect(inTransfer.returnWindowEndsAt).toBeNull();

      // تأكيد النقل: نافذةٌ تبدأ، والسقف انتهى دوره
      await advanceStage({ orderRef: order.ref, actorId: order.buyerId, to: 'DONE' });
      const done = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(done.returnWindowEndsAt).not.toBeNull();
      // ولم يعد مرشَّحًا للاسترجاع التلقائي: خرج من مرحلة النقل
      expect((await overdueTransfers()).map((row) => row.ref)).not.toContain(order.ref);
    });
  });
});
