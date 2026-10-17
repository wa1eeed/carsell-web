import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  approveProviderAdjustment,
  pendingProviderAdjustment,
  providerBalance,
  providerLedger,
  requestProviderAdjustment,
} from '@/lib/domain/provider-ledger';
import type { AdminUser, ServiceProvider } from '@/generated/prisma/client';

/**
 * ═══ حسابُ المزوّد — وكان دَينًا بلا صاحب ولا سداد ═══
 *
 * `PROVIDER_PAYABLE` يُقيَّد عند كل خدمةٍ تُنجَز، و`LedgerEntry` كان
 * بلا `providerId` — فلا رصيدَ لواحدٍ ولا كشف. وهذه تقيس الثلاثة:
 * النسبة، والتراكم، والنصاب.
 */

let provider: ServiceProvider;
let requester: AdminUser;
let approver: AdminUser;

const made: string[] = [];

beforeAll(async () => {
  provider = await db.serviceProvider.findFirstOrThrow({ orderBy: { id: 'asc' } });
  requester = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
  approver = await db.adminUser.findFirstOrThrow({ where: { role: 'FINANCE' } });
});

/** **ما يُكتب بمعاملةٍ يُحذف بها** — والقيد المفرد يترك الدفتر غير متوازن. */
afterEach(async () => {
  const rows = await db.ledgerEntry.findMany({
    where: { event: { in: ['provider.admin_credit', 'provider.admin_debit'] } },
    select: { txnId: true },
  });
  const txnIds = [...new Set(rows.map((row) => row.txnId))];
  if (txnIds.length > 0) await db.ledgerEntry.deleteMany({ where: { txnId: { in: txnIds } } });

  if (made.length > 0) {
    await db.approvalRequest.deleteMany({ where: { id: { in: made } } });
    made.length = 0;
  }
  await db.auditLog.deleteMany({
    where: { entity: 'ServiceProvider', entityId: provider.id },
  });
});

async function ask(
  direction: 'CREDIT' | 'DEBIT',
  amount: number,
  reason = 'تسويةٌ مكتوبةٌ بسببها الكامل',
): Promise<string> {
  const result = await requestProviderAdjustment({
    providerId: provider.id,
    direction,
    amount,
    reason,
    adminId: requester.id,
    ip: null,
  });
  if (!result.ok) throw new Error(result.reason);
  made.push(result.requestId);
  return result.requestId;
}

describe('القيدُ لا يقع بيدٍ واحدة', () => {
  it('الطلبُ يُنشأ معلّقًا ولا يمسّ الرصيد', async () => {
    const before = await providerBalance(provider.id);
    const id = await ask('CREDIT', 100);

    expect(await providerBalance(provider.id)).toBe(before);
    const pending = await pendingProviderAdjustment(provider.id);
    expect(pending?.id).toBe(id);
    expect(pending?.direction).toBe('CREDIT');
  });

  it('ولا يوافق طالبُه على نفسه', async () => {
    const id = await ask('CREDIT', 100);
    const result = await approveProviderAdjustment({
      requestId: id,
      adminId: requester.id,
      ip: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('SELF_APPROVAL');
  });

  it('والثاني ينفّذه فيتحرّك الرصيد بمقداره', async () => {
    const before = Number(await providerBalance(provider.id));
    const id = await ask('CREDIT', 100);

    const result = await approveProviderAdjustment({
      requestId: id,
      adminId: approver.id,
      ip: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(Number(result.balance)).toBeCloseTo(before + 100, 2);
  });

  it('وطلبٌ ثانٍ لا يُفتح ما دام الأوّل معلّقًا', async () => {
    await ask('CREDIT', 100);
    const second = await requestProviderAdjustment({
      providerId: provider.id,
      direction: 'CREDIT',
      amount: 50,
      reason: 'سببٌ آخر مكتوبٌ بطوله',
      adminId: requester.id,
      ip: null,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('ALREADY_PENDING');
  });

  it('والسببُ إلزاميّ — سطرٌ يُقرأ بعد سنة', async () => {
    const result = await requestProviderAdjustment({
      providerId: provider.id,
      direction: 'CREDIT',
      amount: 50,
      reason: 'قصير',
      adminId: requester.id,
      ip: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('REASON_TOO_SHORT');
  });
});

describe('الدفترُ يبقى متوازنًا والاسمُ على طرفه', () => {
  it('القيدُ مزدوجٌ متوازن، والمزوّد على طرفه وحده', async () => {
    const id = await ask('CREDIT', 100);
    expect((await approveProviderAdjustment({ requestId: id, adminId: approver.id, ip: null })).ok).toBe(true);

    const rows = await db.ledgerEntry.findMany({
      where: { event: 'provider.admin_credit' },
      select: { account: true, direction: true, amount: true, providerId: true, txnId: true },
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.txnId)).size).toBe(1);

    const net = rows.reduce(
      (sum, row) => sum + (row.direction === 'DEBIT' ? Number(row.amount) : -Number(row.amount)),
      0,
    );
    expect(net).toBeCloseTo(0, 2);

    /** **والاسمُ على طرفه وحده** — ووسمُ المصروف به يُضاعف «ما له علينا». */
    const payable = rows.find((row) => row.account === 'PROVIDER_PAYABLE');
    const expense = rows.find((row) => row.account === 'GOODWILL_EXPENSE');
    expect(payable?.providerId).toBe(provider.id);
    expect(expense?.providerId).toBeNull();
  });

  /**
   * **والكشفُ يتراكم من الأقدم.** حسابُه من الأحدث يُنتج رصيدًا
   * معكوسًا يبدأ من الصفر عند آخر قيد.
   */
  it('وآخرُ سطرٍ في الكشف رصيدُه هو الرصيد', async () => {
    const id = await ask('CREDIT', 100);
    await approveProviderAdjustment({ requestId: id, adminId: approver.id, ip: null });

    const view = await providerLedger(provider.id);
    expect(view.lines.length).toBeGreaterThan(0);
    /** القائمةُ معروضةٌ بالأحدث أوّلًا — فأوّلُها يحمل الرصيد الحاليّ. */
    expect(view.lines[0]?.runningBalance).toBe(view.balance);
    expect(Number(view.credited) - Number(view.debited)).toBeCloseTo(Number(view.balance), 2);
  });
});

describe('الخصمُ لا يُنزل الحساب تحت الصفر', () => {
  it('خصمٌ يتجاوز الرصيد يُرفض', async () => {
    const balance = Number(await providerBalance(provider.id));
    const result = await requestProviderAdjustment({
      providerId: provider.id,
      direction: 'DEBIT',
      amount: balance + 1000,
      reason: 'خصمٌ أكبر من الرصيد بسببٍ مكتوب',
      adminId: requester.id,
      ip: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('INSUFFICIENT_BALANCE');
  });
});
