import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { accountBalance, postEntries } from '@/lib/domain/ledger';
import { DETAIL_LINES, payoutDetail } from '@/lib/domain/payouts';
import { LEDGER_EVENT_LABEL } from '@/lib/labels/admin';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();

/** ما زرعه هذا الملفّ — **والقيدُ يُحذف بمعاملته لا بصاحبه**. */
const plantedTxns: string[] = [];

afterAll(async () => {
  if (plantedTxns.length === 0) return;
  await db.ledgerEntry.deleteMany({ where: { txnId: { in: plantedTxns } } });
});

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

  /**
   * ═══ والحدُّ يُختبَر بتجاوزه ═══
   *
   * الفحصُ فوقه يقارن الرصيدَ بتجميعةِ كلِّ القيود، **والمزروعُ أقلُّ من
   * الحدّ** — فيمرّ وإن كان الرصيد مجموعَ المعروض وحده. والبائع النشط
   * يتجاوزه، فتقول الشاشة حقًّا ويردّ حارسُ الصرف «يتجاوز حقّه»:
   * رقمان لمالٍ واحد. فتُزرع قيودٌ تتجاوز الحدّ، ثمّ تُستعاد.
   */
  it('والرصيد من تجميعة الحساب لا من القيود المعروضة', async () => {
    const payout = await db.payout.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });

    const extra = DETAIL_LINES + 2;
    const posted = await postEntries(db, {
      event: 'order.earned',
      postings: [
        ...Array.from({ length: extra }, () => ({
          account: 'SELLER_PAYABLE' as const,
          direction: 'CREDIT' as const,
          amount: '1.00',
          userId: payout.sellerId,
        })),
        { account: 'BUYER_ADVANCE' as const, direction: 'DEBIT' as const, amount: `${extra}.00` },
      ],
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    plantedTxns.push(posted.txnId);

    const detail = await payoutDetail(payout.id);
    expect(detail).not.toBeNull();
    if (detail === null) return;

    expect(detail.lines.length).toBe(DETAIL_LINES);
    expect(detail.lineCount).toBeGreaterThan(DETAIL_LINES);

    const guard = await accountBalance('SELLER_PAYABLE', { userId: payout.sellerId });
    expect(detail.payableNow).toBe(guard.toFixed(2));

    const shown = detail.lines.reduce(
      (sum, line) => (line.direction === 'CREDIT' ? sum + Number(line.amount) : sum - Number(line.amount)),
      0,
    );
    expect(Number(detail.payableNow)).not.toBeCloseTo(shown, 2);
 
    /**
     * **ويُستعاد في موضعه لا في `afterAll` وحده**: جارُه في الملفّ
     * نفسِه يقرأ آخر ستّين قيدًا، فستُّون قيدًا مزروعة تطرد منها قيدَ
     * التحويل الذي يقيسه — فيسقط على ما لا يقيسه. و`afterAll` يبقى
     * شبكةَ أمانٍ لو سقط الاختبار قبل هذا السطر.
     */
    await db.ledgerEntry.deleteMany({ where: { txnId: posted.txnId } });
  });

  /**
   * ═══ ومعرّفٌ خامّ ليس مرجعًا ═══
   *
   * `payout.sent` تكتب في `note` نصًّا فيه معرّفُ التحويل، فكان سطرُ
   * الخصم يقول معرّفًا خامًّا — أو «—» حين لا يُقرأ — في شاشةٍ يطابقها
   * مشغّلٌ بكشف بنك. والمرجعُ يُطابَق بصفّ التحويل لا بشكل النصّ.
   */
  it('وقيد التحويل يحمل مرجعه البنكي', async () => {
    const sent = await db.payout.findFirst({
      where: { status: 'SENT', bankRef: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    expect(sent, 'لا تحويل مُرسَل مزروع — فالقياس لا يقع').not.toBeNull();
    if (sent === null) return;

    const detail = await payoutDetail(sent.id);
    expect(detail).not.toBeNull();
    if (detail === null) return;

    const own = detail.lines.find((line) => line.payoutId === sent.id);
    expect(own, 'لا قيدَ خصمٍ لهذا التحويل في حساب البائع').toBeDefined();
    if (own === undefined) return;
    expect(own.direction).toBe('DEBIT');
    expect(own.payoutRef).toBe(sent.bankRef);
  });

  it('ومعرف لا وجود له يعيد null', async () => {
    expect(await payoutDetail('no-such-payout')).toBeNull();
  });
});
