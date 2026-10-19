import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { ADMIN_NAV } from '@/components/admin/nav';
import { monthlyPayment } from '@/lib/domain/money';
import { financingSettings, updateFinancingSettings } from '@/lib/domain/financing';
import { FINANCING_LIMITS, monthlyInstalment, validateFinancing } from '@/lib/finance/terms';

const ROOT = process.cwd();
const admin = { id: 'test-admin-financing' };

/** **والاختبار يعيد ما غيّره** — والصفّ مزروع لا مصنوع هنا. */
let original: Awaited<ReturnType<typeof financingSettings>> | null = null;
afterAll(async () => {
  if (original !== null) await updateFinancingSettings(admin, original, null);
  await db.auditLog.deleteMany({ where: { actorId: admin.id } });
});

/**
 * ═══ إعدادُ التمويل كان لا يتغيّر إلّا بنشر ═══
 *
 * أربعةُ أرقام خلف كلّ «أو شهريا» على بطاقة سيارة، وخلف أيِّ إعلانٍ
 * يُعدّ قابلًا للتمويل — تزرعها البذرة ولا شيء يعدّلها (البوابة ٦٣).
 */
describe('إعداد التمويل يُحرَّر من اللوحة', () => {
  it('الوجهة في الملاحة ولها شاشة ومسار', () => {
    const entry = ADMIN_NAV.flatMap((group) => group.items).find(
      (item) => item.href === '/admin/financing',
    );
    expect(entry).toBeDefined();
    expect(() => readFileSync(join(ROOT, 'src/app/admin/financing/page.tsx'))).not.toThrow();
    expect(() =>
      readFileSync(join(ROOT, 'src/app/api/v1/admin/financing/route.ts')),
    ).not.toThrow();
  });

  it('ويُكتب ويُقرأ، ومعه سجل تدقيق', async () => {
    original = await financingSettings();
    const next = { downPaymentPct: 25, months: 48, profitRatePct: 7.5, minPrice: 30_000 };

    const before = await db.auditLog.count({ where: { entity: 'FinanceSetting' } });
    const result = await updateFinancingSettings(admin, next, '10.0.0.9');
    expect(result.ok).toBe(true);

    expect(await financingSettings()).toEqual(next);
    expect(await db.auditLog.count({ where: { entity: 'FinanceSetting' } })).toBe(before + 1);
  });

  /**
   * **والحدودُ تُفرض في الخادم لا في الحقل.** الشاشة تقترح، والنداءُ
   * المباشر يصل بلا شاشة — وقيمةٌ شاذّة تطبع قسطًا سخيفًا تحت كلّ
   * سيارة في المنصّة.
   */
  it('والقيمة الشاذة تُردّ ولا تُكتب', async () => {
    const saved = await financingSettings();
    for (const bad of [
      { ...saved, downPaymentPct: 100 },
      { ...saved, months: 2 },
      { ...saved, months: 12.5 },
      { ...saved, profitRatePct: 80 },
      { ...saved, minPrice: -1 },
    ]) {
      const result = await updateFinancingSettings(admin, bad, null);
      expect(result.ok).toBe(false);
    }
    /** ولم يتغيّر شيء بعد خمس محاولات. */
    expect(await financingSettings()).toEqual(saved);
  });

  it('والحدود مصدر واحد يقرؤه التحقق', () => {
    expect(validateFinancing({ downPaymentPct: 0, months: 6, profitRatePct: 0, minPrice: 0 }))
      .toEqual([]);
    expect(
      validateFinancing({
        downPaymentPct: FINANCING_LIMITS.downPaymentPct.max + 1,
        months: 60,
        profitRatePct: 0,
        minPrice: 0,
      }),
    ).toContain('DOWN_PAYMENT_RANGE');
  });
});

/**
 * ═══ وقاعدةُ المال تُكتب مرّة ═══
 *
 * كانت `monthlyPayment` مكتوبةً مرّتين حرفًا بحرف — في `listings.ts`
 * و`listing-detail.ts` — فنسختان تتباعدان أوّلَ تغيير وتقول بطاقةُ
 * البحث رقمًا وصفحةُ السيارة آخر. وصارت في `money.ts` وحدها.
 *
 * **ونسخةُ المتصفّح لا تُحسب استثناءً**: الشاشةُ تحسب لحظيًّا ولا
 * تستطيع استيراد `money.ts` (تجرّ `db` عبر `tax.ts`)، فتطابُقُهما
 * يُحرس هنا لا بالنيّة.
 */
describe('قاعدة القسط واحدة', () => {
  it('لا نسخة ثانية في النطاق', () => {
    for (const file of ['src/lib/domain/listings.ts', 'src/lib/domain/listing-detail.ts']) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      expect(source).not.toContain('function monthlyPayment(');
    }
    expect(readFileSync(join(ROOT, 'src/lib/domain/money.ts'), 'utf8'))
      .toContain('export function monthlyPayment(');
  });

  it('ونسخة الشاشة تطابقها رقما برقم', () => {
    const cases = [
      { price: 45_000, s: { downPaymentPct: 20, months: 60, profitRatePct: 5, minPrice: 0 } },
      { price: 120_000, s: { downPaymentPct: 25, months: 48, profitRatePct: 7.5, minPrice: 0 } },
      { price: 250_000, s: { downPaymentPct: 0, months: 96, profitRatePct: 0, minPrice: 0 } },
      { price: 99_999, s: { downPaymentPct: 90, months: 6, profitRatePct: 30, minPrice: 0 } },
    ];
    for (const { price, s } of cases) {
      expect(monthlyInstalment(price, s)).toBe(
        monthlyPayment(price, s.downPaymentPct, s.months, s.profitRatePct),
      );
    }
  });
});
