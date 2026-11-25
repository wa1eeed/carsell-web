import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '@/lib/db';
import { BodyType, Drivetrain, FuelType, Transmission } from '@/generated/prisma/enums';

const ROOT = join(import.meta.dirname, '..');
const brands = JSON.parse(
  readFileSync(join(ROOT, 'prisma/seed-data/brands.json'), 'utf8'),
) as {
  slug: string;
  nameAr: string;
  nameEn: string;
  models: {
    nameEn: string;
    trims: { nameEn: string; bodyType: string; transmission: string; fuel: string; drivetrain: string }[];
  }[];
}[];

/**
 * ═══ الكتالوج — ملفُّه وقاعدتُه والترحيلُ بينهما ═══
 *
 * **والبياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل لا ببذرة**: ملفٌّ
 * يُعدَّل بلا ترحيلٍ يصل بيئةً جديدة ولا يصل بيئةً تعمل.
 */
describe('كتالوج المركبات', () => {
  it('ولا ماركتان بمقطعٍ واحد، ولا طرازان باسمٍ واحد تحتها', () => {
    const slugs = brands.map((brand) => brand.slug);
    expect(new Set(slugs).size, 'مقاطع مكرّرة').toBe(slugs.length);

    for (const brand of brands) {
      const models = brand.models.map((model) => model.nameEn);
      expect(new Set(models).size, `طرازات مكرّرة في ${brand.slug}`).toBe(models.length);
      for (const model of brand.models) {
        const trims = model.trims.map((trim) => trim.nameEn);
        expect(new Set(trims).size, `فئات مكرّرة في ${brand.slug}/${model.nameEn}`).toBe(trims.length);
      }
    }
  });

  it('وكل قيمة مواصفة في الملف من تعداد المخطط', () => {
    /**
     * **والقائمةُ تُشتقّ من التعداد لا تُكتب بجواره** — وهي قاعدةٌ
     * مسجَّلة: `ALL_SPECS` كُتبت بيد فحملت `WAGON` ولا وجود له.
     */
    const valid = {
      bodyType: new Set<string>(Object.values(BodyType)),
      transmission: new Set<string>(Object.values(Transmission)),
      fuel: new Set<string>(Object.values(FuelType)),
      drivetrain: new Set<string>(Object.values(Drivetrain)),
    };

    for (const brand of brands) {
      for (const model of brand.models) {
        for (const trim of model.trims) {
          const where = `${brand.slug}/${model.nameEn}/${trim.nameEn}`;
          expect(valid.bodyType.has(trim.bodyType), `${where} bodyType`).toBe(true);
          expect(valid.transmission.has(trim.transmission), `${where} transmission`).toBe(true);
          expect(valid.fuel.has(trim.fuel), `${where} fuel`).toBe(true);
          expect(valid.drivetrain.has(trim.drivetrain), `${where} drivetrain`).toBe(true);
        }
      }
    }
  });

  it('وكل ماركة في الملف لها شعار على القرص', () => {
    /**
     * **والشعارُ مسارٌ مشتقٌّ من المقطع** — فماركةٌ تُضاف بلا ملفّ
     * تُعرض بصورةٍ مكسورة في المرشّح ولوحة الأدمن معًا، وهو ما وقع
     * في مساحةٍ إعلانية من قبل.
     */
    const broken = brands
      .map((brand) => brand.slug)
      .filter((slug) => !existsSync(join(ROOT, 'public/brand-logos', `${slug}.svg`)));
    expect(broken).toEqual([]);
  });

  it('وما في الملف يصل القاعدة', async () => {
    /**
     * **والملفُّ والقاعدةُ يتباعدان بلا فحص**: يُضاف صفٌّ إلى الملفّ
     * ويُنسى ترحيلُه، فيعمل التطويرُ ولا يصل نشرًا.
     */
    const [inDb, modelsInDb, trimsInDb] = await Promise.all([
      db.brand.count(),
      db.model.count(),
      db.trim.count(),
    ]);

    const models = brands.reduce((sum, brand) => sum + brand.models.length, 0);
    const trims = brands.reduce(
      (sum, brand) => sum + brand.models.reduce((inner, model) => inner + model.trims.length, 0),
      0,
    );

    expect(inDb, 'ماركاتٌ في الملفّ لا في القاعدة').toBeGreaterThanOrEqual(brands.length);
    expect(modelsInDb).toBeGreaterThanOrEqual(models);
    expect(trimsInDb).toBeGreaterThanOrEqual(trims);
  });

  it('ولا طراز بلا فئة — فمنها تجلب المواصفة', () => {
    /**
     * **والفئةُ ليست زينة**: `Vehicle` يفرض الهيكلَ والناقلَ والوقودَ
     * والدفعَ والمقاعد، وكلُّها على `Trim`. فطرازٌ بلا فئةٍ لا تُنشأ
     * منه مركبةٌ أصلًا — لا من الاستمارة ولا من الاستيراد.
     */
    const empty = brands.flatMap((brand) =>
      brand.models.filter((model) => model.trims.length === 0).map((model) => `${brand.slug}/${model.nameEn}`),
    );
    expect(empty).toEqual([]);
  });
});

describe('المدن', () => {
  it('ولكل مدينة مقطع فريد ومنطقة', async () => {
    const cities = await db.city.findMany({ select: { nameAr: true, slug: true, region: true } });
    expect(cities.length, 'لا مدنَ في القاعدة').toBeGreaterThan(20);

    const slugs = cities.map((city) => city.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(cities.filter((city) => city.region.trim() === '')).toEqual([]);
  });

  it('وكل مدينة في إعلان قائم موجودة في الجدول', async () => {
    /**
     * **ومدينةٌ في إعلانٍ ولا صفَّ لها** تعني إعلانًا معروضًا لا
     * يصله مرشّح: `Listing.city` نصٌّ لا مفتاحٌ أجنبيّ، فلا ترمي
     * القاعدة — والعطلُ صامتٌ تمامًا.
     */
    const [used, known] = await Promise.all([
      db.listing.groupBy({ by: ['city'] }),
      db.city.findMany({ select: { nameAr: true } }),
    ]);
    const names = new Set(known.map((city) => city.nameAr));
    expect(used.map((row) => row.city).filter((city) => !names.has(city))).toEqual([]);
  });
});
