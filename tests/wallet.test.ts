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
  /**
   * ═══ ونصابُ الواحد: طالبُه يُتمّه (قرار المالك ٢٠٢٦-١٠-١٤) ═══
   *
   * **واختبارٌ يثبّت قاعدةً أُلغيت يجعل تنفيذَ القرار يبدو كسرًا** —
   * فهذا يقيس القاعدة النافذة: نداءٌ واحد يحرّك الرصيد، والأثرُ
   * مكتوبٌ باسم من حرّكه.
   */
  it('طالبُه يُتمّه — والرصيد يتحرّك بنداءٍ واحد', async () => {
    const id = await subject();
    const asked = await requestWalletAdjustment({
      userId: id, direction: 'CREDIT', amount: 250, reason: 'تعويض عن تأخّر الشحن',
      adminId: ASKER, ip: null,
    });
    expect(asked.ok, JSON.stringify(asked)).toBe(true);
    if (!asked.ok) return;

    expect(await walletBalance(id)).toBe('250.00');

    /** **والأثرُ هو الحارس الباقي** بعد العضو الثاني. */
    const log = await db.auditLog.findFirst({
      where: { entity: 'User', entityId: id },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.actorId).toBe(ASKER);
  });

  /**
   * **و«طلبٌ ثانٍ لا يُفتح والأوّل معلّق» سقطت بسقوط سببها**: لم يعد
   * يبقى معلَّقٌ أصلًا. والحارسُ القائم مكانَها أن الخصم لا يتجاوز
   * الرصيد — وهو يُقاس **بتجاوزه**.
   */
  it('والخصم فوق الرصيد يُرفض', async () => {
    const id = await subject();
    const over = await requestWalletAdjustment({
      userId: id, direction: 'DEBIT', amount: 9_000, reason: 'خصمٌ يتجاوز الرصيد',
      adminId: ASKER, ip: null,
    });
    expect(over.ok).toBe(false);
    expect(await walletBalance(id)).toBe('250.00');
  });

  /**
   * ═══ والدفتر يتوازن مع كل حركة ═══
   *
   * قيدٌ مزدوج فيه معاملةٌ لا تتوازن ليس مزدوجًا. فالمنحة مصروفٌ علينا
   * (مدين) والتزامٌ للعميل (دائن) — ومجموعهما صفر.
   */
  it('الموافقة تكتب الرصيد والقيدين المتوازنين معًا', async () => {
    const id = await subject();
    // الطلبُ كتب الثلاثة في معاملةٍ واحدة — ولا معلَّقَ بعده
    expect(await pendingAdjustment(id)).toBeNull();

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

    // الطلبُ نفّذ — فلا موافقةَ ثانية
    expect(await walletBalance(id)).toBe('150.00');

    const view = await walletView(id);
    // الأحدث أوّلًا، والرصيد المتراكم يُحسب من الأقدم
    expect(view.lines[0]?.amount).toBe('-100.00');
    expect(view.lines[0]?.runningBalance).toBe('150.00');
    expect(view.lines[1]?.runningBalance).toBe('250.00');
  });
});
