import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { postEntries } from '@/lib/domain/ledger';
import { DETAIL_LINES, providerPayoutDetail } from '@/lib/domain/provider-payouts';
import { providerBalance } from '@/lib/domain/provider-ledger';
import { LEDGER_EVENT_LABEL } from '@/lib/labels/admin';
import { PROVIDER_TYPE_LABEL } from '@/lib/labels/providers';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();

/** ما زرعه هذا الملفّ — يُحذف بمعاملته لا بصاحبه. */
const plantedTxns: string[] = [];

afterAll(async () => {
  if (plantedTxns.length === 0) return;
  /**
   * **والقيدُ يُحذف بمعاملته.** حذفُ طرفٍ واحد بـ`providerId` يُبقي
   * الطرف المقابل يتيمًا، فتصير في الدفتر معاملةٌ غير متوازنة تُسقط
   * كلَّ اختبارٍ جارٍ يفحص التوازن.
   */
  await db.ledgerEntry.deleteMany({ where: { txnId: { in: plantedTxns } } });
});

describe('صفحة تفاصيل تحويل المزود', () => {
  it('للصفحة ملف، والقائمة تربط إليها من الطابور والسجل', () => {
    expect(() =>
      readFileSync(join(ROOT, 'src/app/admin/provider-payouts/[id]/page.tsx')),
    ).not.toThrow();
    const table = stripComments(
      readFileSync(join(ROOT, 'src/app/admin/provider-payouts/ProviderPayoutsTable.tsx'), 'utf8'),
    );
    /**
     * **ومرّتان لا مرّة**: الطابورُ والسجلّ كلاهما يُفتح.
     *
     * والنمطُ على `href` لا على المسار وحده — فمسارا الاعتماد والرفض
     * (`/api/v1/admin/provider-payouts/…`) يحويان نصَّه، فعدٌّ به
     * يُخرج أربعًا ويمرّ لو لم يكن في الشاشة رابطٌ واحد.
     */
    const needle = 'href={`/admin/provider-payouts/${encodeURIComponent(row.id)}`}';
    expect(table.split(needle).length - 1).toBe(2);
  });

  it('ولكل نوع مزود تسمية، ولكل حدث في دفتره تسمية', async () => {
    const types = await db.serviceProvider.findMany({ distinct: ['type'], select: { type: true } });
    expect(types.length).toBeGreaterThan(0);
    expect(types.filter((row) => PROVIDER_TYPE_LABEL[row.type] === undefined)).toEqual([]);

    const events = await db.ledgerEntry.findMany({
      where: { account: 'PROVIDER_PAYABLE' },
      distinct: ['event'],
      select: { event: true },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((row) => row.event).filter((e) => LEDGER_EVENT_LABEL[e] === undefined)).toEqual(
      [],
    );
  });

  /**
   * ═══ الرصيدُ يساوي تجميعةَ الحساب لا مجموعَ المعروض ═══
   *
   * **والحدُّ يُختبَر بتجاوزه**: المزروعُ أقلُّ من ستّين قيدًا، فاختبارٌ
   * يقارن المجموعَين عليه أخضرُ مهما كان الحدّ — يصف البيانات لا
   * الشيفرة. فتُزرع قيودٌ تتجاوزه، ثمّ تُستعاد.
   */
  it('والرصيد من تجميعة الحساب الكاملة لا من القيود المعروضة', async () => {
    const payout = await db.providerPayout.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(payout, 'لا تحويل مزوّد مزروع — فالقياس لا يقع').not.toBeNull();
    if (payout === null) return;

    const before = await providerPayoutDetail(payout.id);
    expect(before).not.toBeNull();
    if (before === null) return;
    expect(before.amount).toBe(payout.amount.toFixed(2));
    expect(before.provider.id).toBe(payout.providerId);

    /** معاملةٌ واحدة بـ(الحدّ + ٢) قيدًا دائنًا ومقابلٍ واحد يوازنها. */
    const extra = DETAIL_LINES + 2;
    const posted = await postEntries(db, {
      event: 'service.provider_due',
      postings: [
        ...Array.from({ length: extra }, () => ({
          account: 'PROVIDER_PAYABLE' as const,
          direction: 'CREDIT' as const,
          amount: '1.00',
          providerId: payout.providerId,
          note: 'TEST_DETAIL_LINES',
        })),
        { account: 'PROVIDER_COST' as const, direction: 'DEBIT' as const, amount: `${extra}.00` },
      ],
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    plantedTxns.push(posted.txnId);

    const after = await providerPayoutDetail(payout.id);
    expect(after).not.toBeNull();
    if (after === null) return;

    /** ١· المعروضُ مقتطعٌ عند الحدّ، والعدّادُ يقول العددَ كلَّه. */
    expect(after.lines.length).toBe(DETAIL_LINES);
    expect(after.lineCount).toBeGreaterThan(DETAIL_LINES);

    /** ٢· والرصيدُ يطابق تجميعةَ الحساب — وهي ما يفحصه حارسُ الصرف. */
    expect(after.payableNow).toBe(await providerBalance(payout.providerId));

    /** ٣· ولا يساوي مجموعَ المعروض — وهو الخطأ الذي كان. */
    const shown = after.lines.reduce(
      (sum, line) => (line.direction === 'CREDIT' ? sum + Number(line.amount) : sum - Number(line.amount)),
      0,
    );
    expect(Number(after.payableNow)).not.toBeCloseTo(shown, 2);
  });

  /**
   * **والمرجعُ يُبنى من المُطابِق لا من المُدخَل**: الدفتر يكتب مرجع
   * الطلب في `note`، و`provider_payout.sent` تكتب فيه نصًّا آخر — فلا
   * يُفتح إلّا ما طابق صفًّا قائمًا.
   */
  it('ولا يفتح رابط إلا لمرجع طلب قائم', async () => {
    const payout = await db.providerPayout.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    const detail = await providerPayoutDetail(payout.id);
    expect(detail).not.toBeNull();
    if (detail === null) return;

    for (const line of detail.lines) {
      if (line.requestRef === null) continue;
      const found = await db.serviceRequest.count({ where: { ref: line.requestRef } });
      expect(found, `مرجعٌ لا يقابله طلب: ${line.requestRef}`).toBe(1);
    }
    /** وقيدُ التحويل نفسُه نصُّه ليس مرجعًا — فلا رابط له. */
    const sent = detail.lines.find((line) => line.event === 'provider_payout.sent');
    if (sent !== undefined) expect(sent.requestRef).toBeNull();
  });

  /** **ولا يخرج الآيبان** — وجودُه حالٌ تُعرض، ورقمُه لا. */
  it('ولا يخرج الآيبان من القراءة', async () => {
    const payout = await db.providerPayout.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    const detail = await providerPayoutDetail(payout.id);
    const provider = await db.serviceProvider.findUniqueOrThrow({
      where: { id: payout.providerId },
      select: { iban: true },
    });

    expect(Object.keys(detail?.provider ?? {})).not.toContain('iban');
    if (provider.iban !== null) expect(JSON.stringify(detail)).not.toContain(provider.iban);
  });

  it('ومعرف لا وجود له يعيد null', async () => {
    expect(await providerPayoutDetail('no-such-provider-payout')).toBeNull();
  });
});
