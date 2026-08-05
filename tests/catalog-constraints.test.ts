import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { ALL_SPECS, specOptionsForModel, trimsWithSpecs } from '@/lib/domain/catalog-options';

/**
 * ═══ الكتالوج يحكم حقول الإدخال ═══
 *
 * كان معالج البيع يعرض التعداد كاملًا لكل مركبة: أربعة نواقل وأربعة
 * أنواع وقود. فيُعرض «كهربائي» على لاندكروزر، ويختاره بائعٌ فيُنشر
 * إعلانٌ بمواصفةٍ لا وجود لها.
 */

describe('خيارات الطراز من فئاته', () => {
  it('تُحصر باتّحاد ما تعرفه فئاته لا بالتعداد', async () => {
    const model = await db.model.findFirstOrThrow({
      where: { trims: { some: { visible: true } } },
      select: { id: true },
    });

    const [options, trims] = await Promise.all([
      specOptionsForModel(model.id),
      trimsWithSpecs(model.id),
    ]);

    expect(options.fromTrims).toBe(trims.length);
    expect(trims.length).toBeGreaterThan(0);

    // كل خيارٍ معروض موجودٌ في فئةٍ فعلًا — ولا خيار من عدم
    for (const value of options.transmissions) {
      expect(trims.some((trim) => trim.transmission === value)).toBe(true);
    }
    for (const value of options.fuels) {
      expect(trims.some((trim) => trim.fuel === value)).toBe(true);
    }
    for (const value of options.bodyTypes) {
      expect(trims.some((trim) => trim.bodyType === value)).toBe(true);
    }

    // **والاتّحاد لا أوّل فئة** — وقصرُه عليها يمنع بائعًا صادقًا
    expect(options.transmissions).toContain(trims[0]?.transmission);
    expect(new Set(options.fuels).size).toBe(new Set(trims.map((t) => t.fuel)).size);
  });

  /**
   * **وما لا يعرفه الكتالوج لا يُحصر.** والحصرُ إلى لا شيء يقفل
   * الاستمارة: بائعٌ لا يجد خيارًا واحدًا لا ينشر أبدًا.
   */
  it('وطرازٌ بلا فئات يعود بالتعداد كاملًا', async () => {
    const options = await specOptionsForModel('no-such-model-id');

    expect(options.fromTrims).toBe(0);
    expect(options.transmissions).toEqual(ALL_SPECS.transmissions);
    expect(options.fuels).toEqual(ALL_SPECS.fuels);
    expect(options.bodyTypes.length).toBeGreaterThan(0);
  });

  /**
   * **والقيَم من المخطّط حرفًا بحرف.** كتبتُ `FOURWD` من الذاكرة
   * والتعداد `FOUR_WD` — تُعرض وتعمل، لكنّها تسقط إلى آخر القائمة.
   */
  it('وثوابت التعداد تطابق المخطّط', async () => {
    const trims = await db.trim.findMany({ select: { drivetrain: true, bodyType: true } });
    for (const trim of trims) {
      expect(ALL_SPECS.drivetrains).toContain(String(trim.drivetrain));
      expect(ALL_SPECS.bodyTypes).toContain(String(trim.bodyType));
    }
  });

  /** والفئة تُعاد بمواصفاتها كاملةً — وإلّا لم تملك الشاشة ما تملأ به. */
  it('والفئة تحمل ناقلها ووقودها لا هيكلها وحده', async () => {
    const model = await db.model.findFirstOrThrow({
      where: { trims: { some: { visible: true } } },
      select: { id: true },
    });
    const trims = await trimsWithSpecs(model.id);
    const first = trims[0];

    expect(first?.transmission).toBeTruthy();
    expect(first?.fuel).toBeTruthy();
    expect(first?.drivetrain).toBeTruthy();
    expect(first?.seats).toBeGreaterThan(0);
    expect(first?.doors).toBeGreaterThan(0);
  });
});
