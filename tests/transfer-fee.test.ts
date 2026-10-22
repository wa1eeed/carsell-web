import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { getTransferFee, setTransferFee } from '@/lib/domain/payment-routing';
import { computeOrderAmounts } from '@/lib/domain/order-amounts';
import { financeSummary } from '@/lib/domain/admin-finance';
import { supplyVatPct } from '@/lib/domain/tax';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();

/**
 * ═══ ثلاثةُ حقولٍ تقرؤها كلُّ صفقة ولا يكتبها شيء ═══
 *
 * `transferFee` رسمٌ حكوميٌّ يُمرَّر، و`transferAdminFeeEnabled`
 * و`transferAdminFee` رسمُنا فوقه — **ولا شاشةَ ولا مسارَ يكتب واحدًا
 * منها**: الرسمُ مجمَّدٌ على ما زرعته البذرة، ورسمُنا مُطفأٌ إلى الأبد.
 */
describe('رسم نقل الملكية يضبط من اللوحة', () => {
  it('وللبطاقة ملف، والمسار يقبل الحقول الثلاثة', () => {
    expect(() =>
      readFileSync(join(ROOT, 'src/app/admin/payments/TransferFeeCard.tsx')),
    ).not.toThrow();
    const route = stripComments(
      readFileSync(join(ROOT, 'src/app/api/v1/admin/payments/transfer-fee/route.ts'), 'utf8'),
    );
    for (const field of ['fee', 'adminFeeEnabled', 'adminFee']) {
      expect(route, field).toContain(`${field}:`);
    }
    const page = stripComments(
      readFileSync(join(ROOT, 'src/app/admin/payments/page.tsx'), 'utf8'),
    );
    expect(page).toContain('<TransferFeeCard');
  });

  /**
   * ═══ والقياسُ على المال لا على الحفظ ═══
   *
   * **وما يُحفظ يُقرأ في حساب الطلب**: حقلٌ يُكتب ولا يبلغ الحساب هو
   * زرٌّ بلا أثر — وهو ما كان عليه الحال قبل هذا.
   */
  it('وما يحفظ يغير ما يدفعه المشتري', async () => {
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
    const before = await getTransferFee();
    const listing = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED' },
      select: { askPrice: true },
    });

    try {
      const saved = await setTransferFee(
        admin,
        { fee: 410, adminFeeEnabled: true, adminFee: 60 },
        null,
      );
      expect(saved.ok).toBe(true);

      const row = await getTransferFee();
      expect(Number(row.fee)).toBe(410);
      expect(row.adminFeeEnabled).toBe(true);
      expect(Number(row.adminFee)).toBe(60);

      /** والحسابُ يقرؤهما — السطران منفصلان كما بُنيا. */
      const amounts = await computeOrderAmounts(db, Number(listing.askPrice));
      expect(Number(amounts.transferFee)).toBe(410);
      expect(Number(amounts.transferAdminFee)).toBe(60);
    } finally {
      /**
       * ═══ والاستعادةُ لا تمرّ بالدالّة المقيسة ═══
       *
       * استعادةٌ تنادي `setTransferFee` تُهزَم حين تُكسَر الدالّة
       * لقياس البوابة: المسبارُ حذف سطرَ كتابة `transferAdminFee`،
       * فكتب الاختبارُ ٦٠ ولم يستطع محوَه — **وبقيت رسومٌ إداريةٌ
       * مفعَّلةٌ في قاعدة التطوير أسقطت سبعةَ اختباراتٍ جارة**.
       * فالاستعادة كتابةٌ مباشرة لا تعتمد على ما تقيسه.
       */
      await db.platformSetting.update({
        where: { id: 'default' },
        data: {
          transferFee: before.fee,
          transferAdminFeeEnabled: before.adminFeeEnabled,
          transferAdminFee: before.adminFee,
        },
      });
      await db.auditLog.deleteMany({ where: { action: 'payments.transfer_fee_changed' } });
    }
  }, 60_000);

  /**
   * **ورسمٌ مفعَّلٌ بصفرٍ ليس تفعيلًا** — رايةٌ تقول «نأخذ» ورقمٌ يقول
   * «لا شيء»، فيقرأ المشغّل أنه فعّله وهو لم يأخذ ريالًا.
   */
  it('ويرفض المفعل بصفر', async () => {
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
    const before = await getTransferFee();
    const result = await setTransferFee(
      admin,
      { fee: 350, adminFeeEnabled: true, adminFee: 0 },
      null,
    );
    expect(result.ok).toBe(false);
    /** ولم يُكتب شيء — الرفضُ قبل الكتابة لا بعدها. */
    expect(await getTransferFee()).toEqual(before);
  });

  /**
   * ═══ ونسبةُ الضريبة من قاعدتها لا من رقمٍ ثانٍ ═══
   *
   * كلُّ طلبٍ يحسب ضريبتَه من `TaxRule('COMMISSION')`، وكانت شاشةُ
   * المالية تقرأ `PlatformSetting.vatPct` — **فيُعطَّل الحكمُ من
   * `/admin/tax` وتبقى اللوحة تقول «١٥٪»**.
   */
  it('وملخص المالية يقرأ نسبة القاعدة لا رقما ثانيا', async () => {
    const rule = await db.taxRule.findFirst({
      where: { supplyType: 'COMMISSION', sellerType: null, buyerType: null, active: true },
    });
    expect(rule, 'لا قاعدةَ عمولةٍ مزروعة — فالقياس لا يقع').not.toBeNull();
    if (rule === null) return;

    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);

    /** ① وهما متّفقان الآن. */
    const summary = await financeSummary(from, to);
    expect(summary.vatPct).toBe(await supplyVatPct('COMMISSION', to));

    /**
     * ② **والشرطُ يُصنَع لا يُنتظَر**: ما دامت القاعدة ١٥ و
     * `PlatformSetting.vatPct` ١٥ فالمساواة تصحّ بأيّ مصدر. فتُغيَّر
     * القاعدة وحدها، ثمّ تُستعاد.
     */
    const platform = await db.platformSetting.findUniqueOrThrow({ where: { id: 'default' } });
    expect(Number(platform.vatPct)).toBe(15);
    try {
      await db.taxRule.update({ where: { id: rule.id }, data: { ratePct: 5 } });
      const moved = await financeSummary(from, to);
      expect(moved.vatPct).toBe(5);
      expect(moved.vatPct).not.toBe(Number(platform.vatPct));
    } finally {
      await db.taxRule.update({ where: { id: rule.id }, data: { ratePct: rule.ratePct } });
    }
  }, 60_000);
});
