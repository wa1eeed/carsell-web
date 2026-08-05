import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import {
  approveWalletAdjustment,
  pendingAdjustment,
  requestWalletAdjustment,
  walletBalance,
  walletView,
} from '@/lib/domain/wallet';

/**
 * ═══ محفظة العميل — والمال لا يمسّه واحد ═══
 *
 * `Wallet` و`WalletEntry` مزروعان منذ اليوم الأوّل ولا شيء يكتبهما.
 * وما يُبنى الآن يمسّ مال عميل، **فيُبنى محروسًا**: طلبٌ ثم موافقةُ
 * ثانٍ، وقيدٌ متوازن في الدفتر مع كل حركة.
 */

const stamp = String(Date.now()).slice(-9);
const ASKER = `adm-ask-${stamp}`;
const APPROVER = `adm-ok-${stamp}`;

let userId: string;

async function subject(): Promise<string> {
  if (userId !== undefined) return userId;
  const user = await db.user.create({
    data: { phone: `+96650${stamp}`, name: 'اختبار المحفظة' },
  });
  userId = user.id;
  return userId;
}

afterAll(async () => {
  if (userId === undefined) return;
  // **الاختبار يعيد ما صنعه** — والقيود تُحذف قبل صاحبها
  const wallet = await db.wallet.findUnique({ where: { userId }, select: { id: true } });
  if (wallet !== null) {
    await db.walletEntry.deleteMany({ where: { walletId: wallet.id } });
    await db.wallet.delete({ where: { id: wallet.id } });
  }
  /**
   * **والقيد يُحذف بمعاملته لا بصاحبه.** حذفتُه بـ`userId` أوّلًا فمُحي
   * طرفُ المحفظة وحده — وهو الوحيد الذي يحمله — وبقي طرفُ المصروف
   * يتيمًا، فصارت معاملةٌ غير متوازنة في الدفتر **أسقطت اختبارات
   * جارةً** تفحص أنّ كل معاملةٍ تتوازن. ونظافةُ الاختبار جزءٌ منه.
   */
  const mine = await db.ledgerEntry.findMany({
    where: { event: { in: ['wallet.admin_credit', 'wallet.admin_debit'] }, userId },
    select: { txnId: true },
  });
  if (mine.length > 0) {
    await db.ledgerEntry.deleteMany({
      where: { txnId: { in: mine.map((entry) => entry.txnId) } },
    });
  }
  await db.approvalRequest.deleteMany({ where: { entityType: 'User', entityId: userId } });
  await db.auditLog.deleteMany({ where: { actorId: { in: [ASKER, APPROVER] } } });
  await db.user.delete({ where: { id: userId } });
});

describe('طلب تعديل الرصيد', () => {
  it('يرفض مبلغًا غير موجب', async () => {
    const id = await subject();
    for (const amount of [0, -50]) {
      const result = await requestWalletAdjustment({
        userId: id, direction: 'CREDIT', amount, reason: 'تعويض عن تأخّر الشحن',
        adminId: ASKER, ip: null,
      });
      expect(result).toEqual({ ok: false, reason: 'BAD_AMOUNT' });
    }
  });

  /**
   * **والسبب مكتوبٌ لا اختياريّ.** ومنحةٌ بلا سببٍ يُقرأ بعد سنةٍ على
   * أنها خطأ — أو أسوأ: على أنها محاباة.
   */
  it('يرفض سببًا أقصر من الحدّ', async () => {
    const id = await subject();
    const result = await requestWalletAdjustment({
      userId: id, direction: 'CREDIT', amount: 100, reason: 'تعويض',
      adminId: ASKER, ip: null,
    });
    expect(result).toEqual({ ok: false, reason: 'REASON_TOO_SHORT' });
  });

  it('يرفض خصمًا يتجاوز الرصيد', async () => {
    const id = await subject();
    const result = await requestWalletAdjustment({
      userId: id, direction: 'DEBIT', amount: 500, reason: 'تصحيح قيد مزدوج',
      adminId: ASKER, ip: null,
    });
    expect(result).toEqual({ ok: false, reason: 'INSUFFICIENT_BALANCE' });
  });
});

describe('الموافقة الثانية هي التي تُنفّذ', () => {
  it('لا يوافق طالبُه على نفسه — ولا رصيد يتحرّك', async () => {
    const id = await subject();
    const asked = await requestWalletAdjustment({
      userId: id, direction: 'CREDIT', amount: 250, reason: 'تعويض عن تأخّر الشحن',
      adminId: ASKER, ip: null,
    });
    expect(asked.ok).toBe(true);
    if (!asked.ok) return;

    const self = await approveWalletAdjustment({
      requestId: asked.requestId, adminId: ASKER, ip: null,
    });
    expect(self).toEqual({ ok: false, reason: 'SELF_APPROVAL' });

    // **ولا شيء وقع** — والرفض لا يترك أثرًا نصفيًّا
    expect(await walletBalance(id)).toBe('0.00');
  });

  it('وطلبٌ ثانٍ لا يُفتح والأوّل معلّق', async () => {
    const id = await subject();
    const again = await requestWalletAdjustment({
      userId: id, direction: 'CREDIT', amount: 90, reason: 'منحة ترحيبية للعميل',
      adminId: ASKER, ip: null,
    });
    expect(again).toEqual({ ok: false, reason: 'ALREADY_PENDING' });
  });

  /**
   * ═══ والدفتر يتوازن مع كل حركة ═══
   *
   * قيدٌ مزدوج فيه معاملةٌ لا تتوازن ليس مزدوجًا. فالمنحة مصروفٌ علينا
   * (مدين) والتزامٌ للعميل (دائن) — ومجموعهما صفر.
   */
  it('الموافقة تكتب الرصيد والقيدين المتوازنين معًا', async () => {
    const id = await subject();
    const pending = await pendingAdjustment(id);
    expect(pending).not.toBeNull();
    if (pending === null) return;

    const applied = await approveWalletAdjustment({
      requestId: pending.id, adminId: APPROVER, ip: null,
    });
    expect(applied).toEqual({ ok: true, balance: '250.00' });

    const view = await walletView(id);
    expect(view.balance).toBe('250.00');
    expect(view.lines[0]?.kind).toBe('admin_credit');
    expect(view.lines[0]?.runningBalance).toBe('250.00');

    const entries = await db.ledgerEntry.findMany({
      where: { event: 'wallet.admin_credit', userId: id },
    });
    expect(entries.length).toBe(1);

    // الطرفان في المعاملة نفسها، ومجموعهما صفر
    const txnId = entries[0]?.txnId ?? '';
    const both = await db.ledgerEntry.findMany({ where: { txnId } });
    expect(both.length).toBe(2);

    const net = both.reduce(
      (sum, entry) =>
        entry.direction === 'DEBIT' ? sum.plus(entry.amount) : sum.minus(entry.amount),
      new Prisma.Decimal(0),
    );
    expect(net.toFixed(2)).toBe('0.00');

    // **و`userId` على طرف المحفظة وحده** — لا على مصروفنا
    const walletSide = both.find((entry) => entry.account === 'WALLET_PAYABLE');
    const expenseSide = both.find((entry) => entry.account === 'GOODWILL_EXPENSE');
    expect(walletSide?.userId).toBe(id);
    expect(expenseSide?.userId).toBeNull();
  });

  it('ولا يُعاد تنفيذ طلبٍ نُفِّذ', async () => {
    const id = await subject();
    const request = await db.approvalRequest.findFirstOrThrow({
      where: { entityType: 'User', entityId: id, status: 'APPROVED' },
    });

    const twice = await approveWalletAdjustment({
      requestId: request.id, adminId: APPROVER, ip: null,
    });
    expect(twice).toEqual({ ok: false, reason: 'NOT_PENDING' });
    expect(await walletBalance(id)).toBe('250.00');
  });

  it('والخصم بعد الرصيد يمرّ ويُنقصه', async () => {
    const id = await subject();
    const asked = await requestWalletAdjustment({
      userId: id, direction: 'DEBIT', amount: 100, reason: 'تصحيح منحة مكرّرة',
      adminId: ASKER, ip: null,
    });
    expect(asked.ok).toBe(true);
    if (!asked.ok) return;

    const applied = await approveWalletAdjustment({
      requestId: asked.requestId, adminId: APPROVER, ip: null,
    });
    expect(applied).toEqual({ ok: true, balance: '150.00' });

    const view = await walletView(id);
    // الأحدث أوّلًا، والرصيد المتراكم يُحسب من الأقدم
    expect(view.lines[0]?.amount).toBe('-100.00');
    expect(view.lines[0]?.runningBalance).toBe('150.00');
    expect(view.lines[1]?.runningBalance).toBe('250.00');
  });
});
