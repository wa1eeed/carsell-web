import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { payoutDetail } from '@/lib/domain/payouts';
import { LEDGER_EVENT_LABEL } from '@/lib/labels/admin';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();

/**
 * ═══ تحويلُ مستحقٍّ كان صفًّا في قائمة ═══
 *
 * مبلغٌ وحالٌ وأربعُ خانات، ولا موضعَ يُسأل فيه «لماذا لهذا البائع هذا
 * المبلغ؟» ولا «من طلب ومن أرسل؟».
 */
describe('صفحة تفاصيل التحويل', () => {
  it('للصفحة ملف، والقائمة تربط إليها', () => {
    expect(() => readFileSync(join(ROOT, 'src/app/admin/payouts/[id]/page.tsx'))).not.toThrow();
    const table = stripComments(
      readFileSync(join(ROOT, 'src/app/admin/payouts/PayoutsTable.tsx'), 'utf8'),
    );
    expect(table).toContain('/admin/payouts/${encodeURIComponent(row.id)}');
  });

  /**
   * **وكلُّ حدثٍ في الدفتر له تسمية** — ومفتاحٌ خامّ مثل `order.earned`
   * لا يقول للمشغّل شيئًا، وقيمةٌ بلا تسمية تُعرض خامًّا أو لا تُعرض.
   */
  it('ولكل حدث في الدفتر تسمية', async () => {
    const events = await db.ledgerEntry.findMany({ distinct: ['event'], select: { event: true } });
    expect(events.length).toBeGreaterThan(0);
    const missing = events
      .map((row) => row.event)
      .filter((event) => LEDGER_EVENT_LABEL[event] === undefined);
    expect(missing).toEqual([]);
  });

  /**
   * ═══ والرصيدُ يُفسَّر بقيوده ═══
   *
   * **ويُقاس على صفٍّ مزروع لا على نصّ**: الرصيدُ المحسوب هنا يساوي
   * `CREDIT − DEBIT` على حساب البائع — والطرحُ بالعكس يُظهر دَينًا
   * علينا حيث لا دَين.
   */
  it('والرصيد يساوي دائن القيود ناقص مدينها', async () => {
    const payout = await db.payout.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(payout, 'لا تحويل مزروع — فالقياس لا يقع').not.toBeNull();
    if (payout === null) return;

    const detail = await payoutDetail(payout.id);
    expect(detail).not.toBeNull();
    if (detail === null) return;

    expect(detail.amount).toBe(payout.amount.toFixed(2));
    expect(detail.seller.id).toBe(payout.sellerId);

    const entries = await db.ledgerEntry.findMany({
      where: { account: 'SELLER_PAYABLE', userId: payout.sellerId },
      select: { direction: true, amount: true },
    });
    const balance = entries.reduce(
      (sum, row) => (row.direction === 'CREDIT' ? sum + Number(row.amount) : sum - Number(row.amount)),
      0,
    );
    expect(Number(detail.payableNow)).toBeCloseTo(balance, 2);
    expect(detail.lines.length).toBeGreaterThan(0);
  });

  /** **ولا يخرج الآيبان** — وجودُه حالٌ تُعرض، ورقمُه لا. */
  it('ولا يخرج الآيبان كاملًا من القراءة', async () => {
    const payout = await db.payout.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    const detail = await payoutDetail(payout.id);
    const seller = await db.user.findUniqueOrThrow({
      where: { id: payout.sellerId },
      select: { iban: true },
    });

    const serialised = JSON.stringify(detail);
    expect(Object.keys(detail?.seller ?? {})).not.toContain('iban');
    if (seller.iban !== null) expect(serialised).not.toContain(seller.iban);
  });

  it('ومعرف لا وجود له يعيد null', async () => {
    expect(await payoutDetail('no-such-payout')).toBeNull();
  });
});
