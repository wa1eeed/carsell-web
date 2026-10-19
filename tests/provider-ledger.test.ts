import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  approveProviderAdjustment,
  pendingProviderAdjustment,
  providerBalance,
  providerLedger,
  requestProviderAdjustment,
} from '@/lib/domain/provider-ledger';
import { REQUIRED_APPROVALS, selfApprovalBlocked } from '@/lib/domain/approvals';
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

/**
 * ═══ والنصابُ صار واحدًا — قرار المالك ٢٠٢٦-١٠-١٤ ═══
 *
 * «الأدمن يملك صلاحية مطلقة». فكانت هذه الاختبارات تُثبّت نصابَ
 * العضوين، **واختبارٌ يثبّت قاعدةً أُلغيت يجعل تنفيذَ القرار يبدو
 * كسرًا**. فتُعاد صياغتها على القاعدة النافذة: واحدٌ يُتمّ، والأثرُ
 * يبقى مكتوبًا — وهو ما حلّ محلّ العضو الثاني.
 */
describe('القيدُ يقع بيدٍ واحدة، ويُكتب أثرُه', () => {
  it('الطلبُ وحده ينفّذ، والرصيد يتحرّك بمقداره', async () => {
    const before = Number(await providerBalance(provider.id));
    await ask('CREDIT', 100);

    expect(Number(await providerBalance(provider.id))).toBeCloseTo(before + 100, 2);
    // ولا يبقى معلَّقًا ينتظر أحدًا
    expect(await pendingProviderAdjustment(provider.id)).toBeNull();
  });

  /** **والأثرُ هو الحارس الباقي** — فمن قيّد مكتوبٌ باسمه ومبلغه. */
  it('ويُكتب في سجل التدقيق بمن قيّد وبكم', async () => {
    await ask('DEBIT', 70);
    const log = await db.auditLog.findFirst({
      where: { entity: 'ServiceProvider', entityId: provider.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log?.actorId).toBe(requester.id);
    expect(JSON.stringify(log?.after)).toContain('70.00');
  });

  /** **ورفعُ النصاب إلى اثنين يعيد منعَ الذاتية بلا تعديلٍ آخر.** */
  it('ومنع الموافقة الذاتية يتبع الرقم لا الشيفرة', () => {
    expect(REQUIRED_APPROVALS).toBe(1);
    expect(selfApprovalBlocked({ requestedBy: 'a', requiredApprovals: 1 }, 'a')).toBe(false);
    expect(selfApprovalBlocked({ requestedBy: 'a', requiredApprovals: 2 }, 'a')).toBe(true);
  });

  it('وطلبٌ ثانٍ يُفتح لأنّ الأوّل نُفِّذ ولم يبقَ معلّقًا', async () => {
    await ask('CREDIT', 100);
    const second = await requestProviderAdjustment({
      providerId: provider.id,
      direction: 'CREDIT',
      amount: 50,
      reason: 'سببٌ آخر مكتوبٌ بطوله',
      adminId: requester.id,
      ip: null,
    });
    expect(second.ok).toBe(true);
    if (second.ok) made.push(second.requestId);
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
    // الطلبُ ينفّذ بنفسه الآن — فالقيد يقع بنداءٍ واحد
    await ask('CREDIT', 100);

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
