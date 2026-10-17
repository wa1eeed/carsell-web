import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';

import { netToSeller } from '@/lib/domain/money';

/**
 * ═══ حسابُ الطلب يُفحص على كل طلبٍ في القاعدة ═══
 *
 * الطلب يُنشأ من ثلاثة مسارات — بيعٌ مباشر، وقبولُ عرض، ورسوّ مزاد —
 * ويزرعه الزرع من مسارٍ رابع. و`computeOrderAmounts` هي القاعدة
 * الوحيدة، **لكن لا شيء يفحص أن ما في القاعدة يتبعها**.
 *
 * واختبارُ الوحدة يفحص الدالّة على مدخلٍ يصنعه هو. وهذا يفحص **الصفوف
 * القائمة**: طلبٌ كُتب بحسابٍ يدويّ في مسارٍ ما، أو بذرةٌ ركّبت أرقامًا
 * لا تتّسق، يظهر هنا بمرجعه.
 *
 * ═══ ولماذا على كل الصفوف ═══
 *
 * لأن الخطأ الماليّ لا يُرى: الشاشة تعرض ما في العمود، والعمود يبدو
 * معقولًا. وفرقُ ريالٍ في فاتورةٍ واحدة لا يلاحظه أحد حتى تُراجَع
 * الحسابات — وعندها يكون في مئة فاتورة.
 */

afterAll(async () => {
  await db.$disconnect();
});

const D = (value: Prisma.Decimal | number | string): Prisma.Decimal => new Prisma.Decimal(value);

/** فرقٌ دون هللةٍ واحدة تقريبُ تخزين، وما فوقه خطأُ حساب. */
const same = (a: Prisma.Decimal, b: Prisma.Decimal): boolean => a.minus(b).abs().lessThan('0.01');

async function allOrders() {
  return db.order.findMany({
    select: {
      ref: true,
      agreedPrice: true,
      settlementAmount: true,
      commissionPct: true,
      commissionAmount: true,
      buyerCommission: true,
      sellerCommission: true,
      /** لقطةُ ضريبة كلّ طرف — قرار «فوقها» (٢٠٢٦-١٠-١٧) */
      buyerVat: true,
      sellerVat: true,
      transferFee: true,
      transferAdminFee: true,
      processingFee: true,
      processingFeeBearer: true,
      vatAmount: true,
      totalAmount: true,
      depositApplied: true,
    },
  });
}

describe('═══ حساب الطلب ═══', () => {
  it('العمولة مجموعُ طرفيها — ولا حقلَ واحد يقول أيّهما قُصد', async () => {
    const wrong = (await allOrders())
      .filter((o) => !same(o.commissionAmount, o.buyerCommission.plus(o.sellerCommission)))
      .map((o) => `${o.ref}: ${o.commissionAmount.toFixed(2)} ≠ ${o.buyerCommission.toFixed(2)} + ${o.sellerCommission.toFixed(2)}`);

    expect(wrong).toEqual([]);
  });

  it('الإجمالي = السعر + عمولة المشتري + ضريبتُه + رسم النقل + الرسم الإداري + حصّته من المعالجة', async () => {
    /**
     * **وعمولة البائع ليست في إجمالي المشتري.** كان الحقل الواحد
     * يُضاف هنا ويُخصم هناك، فتُؤخذ العمولة مرّتين ولا يظهر.
     *
     * **والعربون يُخصم من المطلوب**: `auction-order` تكتب
     * `totalAmount = الإجمالي − المحجوز`، فالمقارنة تردّه.
     */
    const wrong = (await allOrders())
      .filter((o) => {
        const buyerShare = o.processingFeeBearer === 'BUYER' ? o.processingFee : D(0);
        const expected = o.agreedPrice
          .plus(o.buyerCommission)
          /** **وضريبتُه فوق رسمه** — قرار «فوقها» (٢٠٢٦-١٠-١٧) */
          .plus(o.buyerVat)
          .plus(o.transferFee)
          .plus(o.transferAdminFee)
          .plus(buyerShare)
          .minus(o.depositApplied);
        return !same(o.totalAmount, expected);
      })
      .map((o) => `${o.ref}: الإجمالي ${o.totalAmount.toFixed(2)}`);

    expect(wrong).toEqual([]);
  });

  /**
   * **والمجموعُ حصّتا الطرفين** — ومنه يُفحص أنّ الوعاء توريداتُنا
   * وحدها: لا قيمةُ المركبة (مورّدها البائع) ولا الرسمُ الحكوميّ
   * (لسنا مورّده).
   */
  it('الضريبة على توريداتنا وحدها — لا على المركبة ولا على الرسم الحكوميّ', async () => {
    const wrong = (await allOrders())
      .filter((o) => !same(o.vatAmount, o.buyerVat.plus(o.sellerVat)))
      .map((o) => `${o.ref}: ${o.vatAmount.toFixed(2)} ≠ ${o.buyerVat.plus(o.sellerVat).toFixed(2)}`);

    expect(wrong).toEqual([]);

    /** **ولا تُحتسب على ما ليس توريدًا منّا** — فالوعاء العمولة ورسومُنا */
    const overreach = (await allOrders())
      .filter((o) => o.vatAmount.greaterThan(o.commissionAmount.plus(o.transferAdminFee).plus(o.processingFee)))
      .map((o) => o.ref);
    expect(overreach).toEqual([]);
  });

  it('صافي البائع لا يتجاوز ما اتُّفق عليه ولا ينزل تحت الصفر', async () => {
    /**
     * حدٌّ لا صيغة: `netToSeller` تُفحص وحدةً. وهذا يمنع الحالة التي
     * لا تُرى — عمولةٌ تتجاوز السعر فيصير الصافي سالبًا، أو خصمٌ
     * نُسي فيتجاوز الصافي المتّفق.
     */
    const bad = (await allOrders())
      .map((o) => ({ ref: o.ref, net: netToSeller(o), value: o.settlementAmount ?? o.agreedPrice }))
      .filter((row) => row.net.lessThan(0) || row.net.greaterThan(row.value))
      .map((row) => `${row.ref}: الصافي ${row.net.toFixed(2)} من ${row.value.toFixed(2)}`);

    expect(bad).toEqual([]);
  });

  it('نسبة العمولة المخزَّنة تطابق عمولة البائع المحسوبة', async () => {
    /**
     * `commissionPct` لقطةٌ تُعرض للبائع، و`sellerCommission` ما
     * يُخصم فعلًا. **ورقمان معروضان لا يتّفقان أسوأ من رقمٍ واحد**
     * — ولا يُكشف إلا بمقارنتهما.
     *
     * والمقارنة تحتمل الثابت والحدّين: قاعدةٌ بمبلغٍ ثابت أو حدٍّ
     * أدنى تجعل الخصم فوق النسبة، فلا يُطالَب بالتساوي إلّا حين لا
     * ثابتَ ولا حدّ — وذلك حالُ القواعد كلّها اليوم.
     */
    const rules = await db.commissionRule.findMany({
      where: { scope: 'global', side: 'SELLER' },
      select: { fixedFee: true, minFee: true, maxFee: true },
    });
    const plain = rules.every(
      (r) => r.fixedFee.isZero() && (r.minFee === null || r.minFee.isZero()) && r.maxFee === null,
    );
    if (!plain) return;

    const wrong = (await allOrders())
      .filter((o) => {
        const expected = o.agreedPrice.times(o.commissionPct).dividedBy(100);
        return !same(o.sellerCommission, expected);
      })
      .map((o) => `${o.ref}: ${o.sellerCommission.toFixed(2)} ≠ ${o.commissionPct.toFixed(2)}٪`);

    expect(wrong).toEqual([]);
  });
});
