import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { landingContent } from '@/lib/domain/landing';

/**
 * ═══ فئاتُ الطراز في صفحة الهبوط (Wz) ═══
 *
 * ترميز `Wz` يضع «كل الفئات» ثمّ فئاتِ الطراز — وهي ما يكتبه الباحث
 * حرفيًّا: «كامري LE في الرياض» أخصُّ من «كامري في الرياض».
 *
 * **والمعروضُ ما له إعلانٌ في هذه الصفحة** لا طولُ الكتالوج: شريحةٌ
 * تَعِد بفئةٍ تفتح على صفر هي الدرسُ المسجَّل في مرشّح الماركات.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('شرائحُ الفئات في صفحة الطراز', () => {
  it('تُشتقّ من إعلانات الصفحة لا من كتالوج الطراز', async () => {
    const content = await landingContent('riyadh', 'toyota', 'camry');
    expect(content, 'صفحةُ كامري في الرياض يجب أن تُولَّد').not.toBeNull();
    if (content === null || content.modelId === null) return;

    /** فئاتُ الطراز في الكتالوج — والمعروضُ لا يتجاوزها ولا يساويها بالضرورة. */
    const inCatalog = await db.trim.count({ where: { modelId: content.modelId } });
    expect(content.trims.length).toBeLessThanOrEqual(inCatalog);

    /** وكلُّ شريحةٍ لها إعلانٌ واحد على الأقلّ — ولا تفتح على صفر. */
    for (const trim of content.trims) {
      expect(trim.count).toBeGreaterThan(0);
      const real = await db.listing.count({
        where: { status: 'PUBLISHED', city: content.city, vehicle: { trimId: trim.id } },
      });
      expect(real, `الفئة ${trim.name} تَعِد بـ${String(trim.count)}`).toBe(trim.count);
    }
  });

  /**
   * **ومجموعُ الشرائح لا يتجاوز عدّ الصفحة.** شريحةٌ تَعِد بأكثر ممّا
   * في الصفحة تُرسل الزائر إلى نتيجةٍ أوسع ممّا رأى.
   */
  it('ومجموعُها لا يتجاوز عدّ الصفحة', async () => {
    const content = await landingContent('riyadh', 'toyota', 'camry');
    if (content === null) return;
    const sum = content.trims.reduce((total, trim) => total + trim.count, 0);
    expect(sum).toBeLessThanOrEqual(content.count);
  });

  /** وصفحةُ الماركة بلا طرازٍ لا فئاتِ لها — فالفئةُ تحت الطراز. */
  it('وصفحةُ الماركة بلا فئات', async () => {
    const brandLevel = await landingContent('riyadh', 'toyota', null);
    if (brandLevel === null) return;
    expect(brandLevel.trims).toEqual([]);
  });
});
