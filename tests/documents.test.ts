import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  issueSaleAgreement,
  issueSettlementDocuments,
  orderDocuments,
  settlementFigures,
} from '@/lib/domain/documents';
import { applyState } from '@/lib/domain/payments';
import { getOrder } from '@/lib/domain/orders';
import { withOrder } from './helpers/order-fixture';

afterAll(async () => {
  await db.$disconnect();
});

describe('كشف التسوية يُرى قبل التسوية', () => {
  it('قبل الإصدار: أرقامٌ محسوبة معلَّمة تقديرًا', async () => {
    await withOrder(async (order) => {
      const figures = await settlementFigures(order.id);
      expect(figures).not.toBeNull();
      expect(figures?.preview).toBe(true);
      /**
       * الصافي **متطابقٌ حسابيًّا** لا «أقلّ من القيمة»: العمولة ٠٪ الآن
       * («عمولة المنصة (٠٪ حاليًا)» في التصميم)، فتأكيدُ النقصان كان
       * يثبّت رقمًا لا قاعدة، ويسقط يوم تُفعَّل العمولة أو تُعطَّل.
       */
      expect(Number(figures?.netToSeller)).toBe(
        Number(figures?.vehicleValue) - Number(figures?.commission) - Number(figures?.gatewayFee),
      );
      expect(Number(figures?.netToSeller)).toBeGreaterThan(0);
    });
  });

  it('بعد الإصدار: يُقرأ من الصفّ لا يُحسب ثانية', async () => {
    await withOrder(async (order) => {
      await issueSettlementDocuments(order.id);
      const figures = await settlementFigures(order.id);
      expect(figures?.preview).toBe(false);

      // القاعدة تغيّرت بعد الإصدار — والكشف الصادر لا يتحرّك
      await db.order.update({
        where: { id: order.id },
        data: { settlementAmount: 1 },
      });
      const after = await settlementFigures(order.id);
      expect(after?.vehicleValue).toBe(figures?.vehicleValue);
    });
  });

  it('السعر المُسوَّى يتقدّم على المتّفق', async () => {
    await withOrder(async (order) => {
      await db.order.update({ where: { id: order.id }, data: { settlementAmount: 50_000 } });
      const figures = await settlementFigures(order.id);
      expect(figures?.vehicleValue).toBe('50000');
      expect(figures?.vehicleValue).not.toBe(String(order.agreedPrice));
    });
  });

  it('صافي البائع لا يصل المشتري', async () => {
    await withOrder(async (order) => {
      const asSeller = await getOrder(order.ref, order.sellerId, 'ar');
      const asBuyer = await getOrder(order.ref, order.buyerId, 'ar');
      expect(asSeller?.settlement).not.toBeNull();
      expect(asBuyer?.settlement).toBeNull();
    });
  });
});

describe('الفاتورة تشهد بواقعة', () => {
  it('PENDING لا تُصدر شيئًا — و SETTLED تُصدر', async () => {
    await withOrder(async (order) => {
      const payment = await db.payment.create({
        data: {
          orderId: order.id, purpose: 'VEHICLE_ESCROW', gatewayKey: 'moyasar',
          amount: 100, method: 'mada', status: 'CREATED',
        },
      });
      try {
        await applyState(payment.id, 'PENDING', 'test');
        expect(await db.taxInvoice.count({ where: { orderId: order.id } })).toBe(0);
        expect(await db.settlementStatement.count({ where: { orderId: order.id } })).toBe(0);

        await applyState(payment.id, 'SETTLED', 'test');
        expect(await db.settlementStatement.count({ where: { orderId: order.id } })).toBe(1);

        /**
         * **العمولة ٠٪ ⇒ لا فاتورة عمولة.** ووثيقةٌ بمبلغ صفر ليست
         * وثيقةً مخفَّفة بل وثيقةٌ كاذبة: تشهد بتوريدٍ لم يقع.
         */
        const invoices = await db.taxInvoice.findMany({ where: { orderId: order.id } });
        expect(invoices.map((i) => i.ruleSupplyType)).not.toContain('COMMISSION');
      } finally {
        await db.paymentEvent.deleteMany({ where: { paymentId: payment.id } });
        await db.payment.delete({ where: { id: payment.id } });
        await db.escrow.updateMany({
          where: { orderId: order.id },
          data: { status: 'HELD', releasedAt: null },
        });
      }
    });
  });

  it('العمولة حين تُفعَّل تُفوتَر', async () => {
    await withOrder(async (order) => {
      await db.order.update({
        where: { id: order.id },
        data: { commissionPct: 1, commissionAmount: 892.4 },
      });
      try {
        const result = await issueSettlementDocuments(order.id);
        expect(result.invoices.map((i) => i.supplyType)).toContain('COMMISSION');
      } finally {
        await db.order.update({
          where: { id: order.id },
          data: { commissionPct: 0, commissionAmount: 0 },
        });
      }
    });
  });

  /**
   * حارس الازدواج: الخدمة دُفعت بمعاملتها وفُوتِرت معها، فتسوية المركبة
   * لا تعيد فوترتها. وسقوطُ هذا الاختبار يعني فاتورةً خرجت مرّتين.
   */
  it('الخدمات لا تُفوتَر ثانية عند التسوية — وتُعلَن مؤجَّلة', async () => {
    await withOrder(async (order) => {
      const result = await issueSettlementDocuments(order.id);
      expect(result.invoices.map((i) => i.supplyType)).not.toContain('SERVICE');

      const figures = await settlementFigures(order.id);
      if (Number(figures?.servicesTotal) > 0) {
        expect(result.blocked.map((b) => b.supplyType)).toContain('SERVICE');
      }
      /**
       * ورسم النقل الحكوميّ **صرفٌ**: يمرّ من المُصدِر فيردّه صفُّه
       * `OUT_OF_SCOPE` بلا فاتورة. والامتناع أثرُ قاعدةٍ يقرؤها المشغّل
       * في A21، لا سطرُ استثناءٍ في الكود.
       */
      const disbursement = result.blocked.find((b) => b.supplyType === 'DISBURSEMENT');
      expect(disbursement?.reason).toBe('OUT_OF_SCOPE_NO_INVOICE');
      expect(result.invoices.map((i) => i.supplyType)).not.toContain('DISBURSEMENT');
    });
  });

  /**
   * الرسم الإداريّ توريدُ خدمةٍ منّا — يُفوتَر، ولا يُدمج بالصرف الذي
   * يرافقه. ودمجُهما يُسقط وصف الصرف عن المبلغ كلّه فتُستحقّ الضريبة
   * على الأربعمئة بدل الخمسين.
   */
  it('الرسم الإداريّ يُفوتَر، والحكوميّ لا — في الطلب نفسه', async () => {
    await withOrder(async (order) => {
      await db.order.update({
        where: { id: order.id },
        data: { transferFee: 350, transferAdminFee: 50 },
      });

      const result = await issueSettlementDocuments(order.id);
      expect(result.invoices.map((i) => i.supplyType)).toContain('ADMIN_FEE');
      expect(result.invoices.map((i) => i.supplyType)).not.toContain('DISBURSEMENT');

      const invoice = await db.taxInvoice.findFirstOrThrow({
        where: { orderId: order.id, ruleSupplyType: 'ADMIN_FEE' },
      });
      // الخمسون شاملةٌ للضريبة: ١٥/١١٥ منها ≈ ٦٫٥٢ — لا ٧٫٥٠ مضافة
      expect(invoice.total.toString()).toBe('50');
      expect(invoice.taxTotal.toString()).toBe('6.52');
      // ولا فاتورة على الـ٣٥٠ بحال
      expect(Number(invoice.subtotal)).toBeLessThan(350);
    });
  });

  it('الرسم الإداريّ المعطَّل صفرٌ مهما كانت قيمته', async () => {
    const { effectiveAdminFee } = await import('@/lib/domain/fees');
    expect(effectiveAdminFee({ adminFeeEnabled: false, adminFee: 50 }).toString()).toBe('0');
    expect(effectiveAdminFee({ adminFeeEnabled: true, adminFee: 50 }).toString()).toBe('50');
  });

  it('الصرف لا يُزاد عليه — والزيادة ترمي ولا تُصحَّح صمتًا', async () => {
    const { assertNoMarkup } = await import('@/lib/domain/fees');
    const { Prisma } = await import('@/generated/prisma/client');
    expect(() =>
      assertNoMarkup(new Prisma.Decimal(350), new Prisma.Decimal(350)),
    ).not.toThrow();
    expect(() => assertNoMarkup(new Prisma.Decimal(400), new Prisma.Decimal(350))).toThrow();
  });

  it('وعاء ضريبتنا: العمولة والرسم الإداريّ — لا المركبة ولا الصرف', async () => {
    const { ourTaxableBase } = await import('@/lib/domain/fees');
    const base = ourTaxableBase({ commissionAmount: 892.4, transferAdminFee: 50 });
    expect(base.toString()).toBe('942.4');
  });

  it('التوريد المحجوب يُعلَن سببه ولا يُبتلع', async () => {
    await withOrder(async (order) => {
      const result = await issueSettlementDocuments(order.id);
      const vehicle =
        result.invoices.find((i) => i.supplyType === 'VEHICLE') ??
        result.blocked.find((b) => b.supplyType === 'VEHICLE');
      // إمّا فاتورة وإمّا سببٌ مكتوب — ولا صمت
      expect(vehicle).toBeDefined();
    });
  });

  it('نداءان لا يُصدران مستندين', async () => {
    await withOrder(async (order) => {
      await issueSettlementDocuments(order.id);
      const first = await db.settlementStatement.count({ where: { orderId: order.id } });
      await issueSettlementDocuments(order.id);
      expect(await db.settlementStatement.count({ where: { orderId: order.id } })).toBe(first);
    });
  });
});

describe('عقد البيع', () => {
  it('يُصدر مرّة، ويحمل الهيكل والطرفين', async () => {
    await withOrder(async (order) => {
      expect((await issueSaleAgreement(order.id)).ok).toBe(true);
      expect((await issueSaleAgreement(order.id)).ok).toBe(true);

      const agreements = await db.vehicleSaleAgreement.findMany({ where: { orderId: order.id } });
      expect(agreements).toHaveLength(1);
      expect(agreements[0]?.sellerName).not.toBe('');
      expect(agreements[0]?.buyerName).not.toBe('');
    });
  });
});

describe('القادم يُعرض بموعده', () => {
  it('قبل أي إصدار: ثلاثة مواضع، كلّها بموعدها لا بغيابها', async () => {
    await withOrder(async (order) => {
      const docs = await orderDocuments(order.ref, order.buyerId);
      expect(docs).not.toBeNull();
      expect(docs?.every((d) => d.state === 'PENDING')).toBe(true);
      expect(docs?.map((d) => d.kind)).toEqual(['AGREEMENT', 'SETTLEMENT', 'INVOICE']);
      // موعدٌ مذكور لكل قادم — والغياب بلا موعد هو ما يُقلق صاحب الطلب
      expect(docs?.every((d) => d.availableAt !== null)).toBe(true);
    });
  });

  it('بعد الإصدار: جاهزٌ برقمه', async () => {
    await withOrder(async (order) => {
      await issueSaleAgreement(order.id);
      await issueSettlementDocuments(order.id);

      const docs = await orderDocuments(order.ref, order.sellerId);
      const ready = docs?.filter((d) => d.state === 'READY') ?? [];
      expect(ready.length).toBeGreaterThanOrEqual(2);
      expect(ready.every((d) => d.reference !== null)).toBe(true);
      // الجاهز لا يحمل موعدًا — الموعد صفة القادم وحده
      expect(ready.every((d) => d.availableAt === null)).toBe(true);
    });
  });

  it('ثالثٌ غير الطرفين لا يرى شيئًا', async () => {
    await withOrder(async (order) => {
      expect(await orderDocuments(order.ref, 'someone-else')).toBeNull();
    });
  });
});

describe('السالب يحتفظ بإشارته', () => {
  /**
   * نصف القاعدة هنا ونصفها في `ArabicNumber`: التنسيق يضع الإشارة
   * **قبل** الرقم، والمكوّن يثبّتها يسارًا بـ`dir="ltr"`. وبلا الاثنين
   * يُرسم الخصم «٨٩٢−» فيُقرأ رقمًا وشرطةً غامضة — أو لا تُرى الشرطة
   * فيُقرأ الخصم زيادة.
   */
  it('التنسيق يضع الإشارة قبل الرقم في اللغتين', async () => {
    const { formatNumber } = await import('@/lib/arabic');
    expect(formatNumber(-892, 'ar').startsWith('-')).toBe(true);
    expect(formatNumber(-892, 'en').startsWith('-')).toBe(true);
    expect(formatNumber(-2465, 'ar')).toBe('-٢٬٤٦٥');
  });
});

describe('رسوم المعالجة — على طرفٍ واحد لا طرفين', () => {
  const POLICY = {
    processingFeeEnabled: true,
    processingFeeBearer: 'SELLER' as const,
    processingFeePct: 2.5,
    processingFeeFixed: 10,
  };

  it('النسبة والثابت يجتمعان، والمعطَّلة صفر', async () => {
    const { processingFeeFor } = await import('@/lib/domain/fees');
    // ٢٫٥٪ من ١٠٠٬٠٠٠ = ٢٥٠٠ + ١٠ ثابتًا
    expect(processingFeeFor(POLICY, 100_000).toString()).toBe('2510');
    // وترك أحدهما صفرًا يُنتج الصيغة المفردة بلا راية ثالثة
    expect(processingFeeFor({ ...POLICY, processingFeeFixed: 0 }, 100_000).toString()).toBe('2500');
    expect(processingFeeFor({ ...POLICY, processingFeePct: 0 }, 100_000).toString()).toBe('10');
    expect(processingFeeFor({ ...POLICY, processingFeeEnabled: false }, 100_000).toString()).toBe(
      '0',
    );
  });

  /**
   * **أخطر ما في الحقلين**: كلٌّ منهما صحيحٌ وحده. فلو أضافها المشتري
   * وخُصمت من البائع أخذناها مرّتين، ولا شيء في الشاشة يُظهر ذلك.
   */
  it('ما أضافه المشتري لا يُخصم من البائع — والعكس', async () => {
    const { processingFeeOnBuyer, processingFeeOnSeller } = await import('@/lib/domain/fees');

    const onSeller = { ...POLICY, processingFeeBearer: 'SELLER' as const };
    expect(processingFeeOnBuyer(onSeller, 100_000).toString()).toBe('0');
    expect(
      processingFeeOnSeller({ processingFee: '2510', processingFeeBearer: 'SELLER' }).toString(),
    ).toBe('2510');

    const onBuyer = { ...POLICY, processingFeeBearer: 'BUYER' as const };
    expect(processingFeeOnBuyer(onBuyer, 100_000).toString()).toBe('2510');
    expect(
      processingFeeOnSeller({ processingFee: '2510', processingFeeBearer: 'BUYER' }).toString(),
    ).toBe('0');
  });

  it('وهي توريدٌ منّا فتدخل وعاء الضريبة أيًّا كان من تحمّلها', async () => {
    const { ourTaxableBase } = await import('@/lib/domain/fees');
    expect(
      ourTaxableBase({ commissionAmount: 0, transferAdminFee: 50, processingFee: 2510 }).toString(),
    ).toBe('2560');
  });

  it('الكشف يخصم ما تحمّله البائع وحده', async () => {
    await withOrder(async (order) => {
      await db.order.update({
        where: { id: order.id },
        data: { processingFee: 2510, processingFeeBearer: 'BUYER' },
      });
      const buyerBore = await settlementFigures(order.id);
      expect(buyerBore?.gatewayFee).toBe('0');

      await db.order.update({
        where: { id: order.id },
        data: { processingFeeBearer: 'SELLER' },
      });
      const sellerBore = await settlementFigures(order.id);
      expect(sellerBore?.gatewayFee).toBe('2510');
      // والصافي ينقص بها لا بغيرها
      expect(Number(buyerBore?.netToSeller) - Number(sellerBore?.netToSeller)).toBe(2510);
    });
  });
});
