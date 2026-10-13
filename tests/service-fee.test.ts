import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { serviceTotal } from '@/lib/domain/money';

/**
 * ═══ رسمٌ يُضبط ولا يُحصَّل ═══
 *
 * `Service.adminFeeEnabled` و`adminFee` لهما محرّرٌ كامل في لوحة
 * الأدمن — مفتاحُ تشغيل وحقلُ مبلغ ونصٌّ يشرح تصنيفه الضريبيّ —
 * **وصفرُ قرّاءٍ في مسار الشراء**. فيُفعّله المشغّل ويُسعّره، ويدفع
 * العميل السعر وحده، ولا يدخل ريالٌ منه.
 *
 * وقِيس: سبعةٌ وثلاثون موضعًا تقرؤه في `src/lib/domain`، **كلُّها في
 * `admin-services.ts`** — أي في تحريره لا في تحصيله.
 *
 * ═══ ونسبةً أو مبلغًا — قرار المالك ٢٠٢٦-١٠-١٤ ═══
 *
 * «رسوم المنصّة … تفرضه المنصّة على خدمة المزوّد **وتُضاف عليه**».
 * فالمزوّد يقبض سعرَه كاملًا، والعميل يدفع السعر والرسم.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('رسم المنصّة على الخدمة', () => {
  it('المطفأ لا يُضاف — والإجمالي سعرٌ وضريبته', () => {
    const money = serviceTotal(500, 15, { mode: 'FIXED', amount: 50, enabled: false });
    expect(money.providerNet.toFixed(2)).toBe('500.00');
    expect(money.platformFee.toFixed(2)).toBe('0.00');
    expect(money.total.toFixed(2)).toBe('575.00');
  });

  it('والثابت يُضاف فوق سعر المزوّد لا يُقتطع منه', () => {
    const money = serviceTotal(500, 15, { mode: 'FIXED', amount: 50, enabled: true });
    /** **حصّة المزوّد لا تنقص**: رفعُ رسمنا ليس خفضًا لدخله. */
    expect(money.providerNet.toFixed(2)).toBe('500.00');
    expect(money.platformFee.toFixed(2)).toBe('50.00');
    expect(money.net.toFixed(2)).toBe('550.00');
    expect(money.total.toFixed(2)).toBe('632.50');
  });

  it('والنسبة تُقرأ من سعر المزوّد', () => {
    const money = serviceTotal(500, 15, { mode: 'PERCENT', amount: 10, enabled: true });
    expect(money.platformFee.toFixed(2)).toBe('50.00');
    expect(money.total.toFixed(2)).toBe('632.50');
  });

  /**
   * **والوضعان يلتقيان على الرقم نفسه** حين يتساويان — فالفرق في
   * التعبير لا في الحساب، ولا يُنتج أحدُهما ريالًا لا يُنتجه الآخر.
   */
  it('ويتساوى الوضعان متى تساوت قيمتاهما', () => {
    const fixed = serviceTotal(800, 15, { mode: 'FIXED', amount: 40, enabled: true });
    const pct = serviceTotal(800, 15, { mode: 'PERCENT', amount: 5, enabled: true });
    expect(pct.total.toFixed(2)).toBe(fixed.total.toFixed(2));
  });
});

/**
 * ═══ وما تعرضه الشاشة هو ما يُحجز ═══
 *
 * الشاشة تنادي `serviceTotal` والشراء ينادي `serviceTotal` — قاعدةٌ
 * واحدة. وحسابان لرقمٍ واحد يجعلان المشتري يدفع غير ما رأى، وهو العطل
 * الذي بُنيت `money.ts` لمنعه.
 */
describe('الخدمة المزروعة تُحسب بالقاعدة نفسها', () => {
  it('ورسمُها يُحسب من إعدادها لا من ثابتٍ في الشيفرة', async () => {
    const service = await db.service.findFirst({
      where: { active: true },
      select: { price: true, adminFee: true, adminFeeEnabled: true, adminFeeMode: true },
    });
    if (service === null) return;

    const money = serviceTotal(service.price, 15, {
      mode: service.adminFeeMode,
      amount: service.adminFee,
      enabled: service.adminFeeEnabled,
    });

    const expected = service.adminFeeEnabled
      ? service.adminFeeMode === 'PERCENT'
        ? Number(service.price) * (Number(service.adminFee) / 100)
        : Number(service.adminFee)
      : 0;

    expect(Number(money.platformFee)).toBeCloseTo(expected, 2);
    expect(Number(money.net)).toBeCloseTo(Number(service.price) + expected, 2);
  });
});
