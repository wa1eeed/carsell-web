import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { ALL_SPECS } from '@/lib/catalog/specs';
import { listBrandOptions, listSellableBrandOptions } from '@/lib/domain/catalog-options';
import { BodyType, Drivetrain, FuelType, Transmission } from '@/generated/prisma/enums';

type SeedTrim = {
  nameAr: string;
  nameEn: string;
  bodyType: string;
  transmission: string;
  fuel: string;
  drivetrain: string;
  seats: number;
  doors: number;
  engineL: number | null;
  cylinders: number | null;
};
type SeedModel = { nameAr: string; nameEn: string; trims: SeedTrim[] };
type SeedBrand = { slug: string; nameAr: string; nameEn: string; models: SeedModel[] };

const BRANDS = JSON.parse(
  readFileSync(join(process.cwd(), 'prisma/seed-data/brands.json'), 'utf8'),
) as SeedBrand[];

/**
 * ═══ الكتالوج عريضٌ بما يكفي للبيع ═══
 *
 * **اثنتان وثلاثون ماركةً من اثنتين وأربعين كانت بلا طرازٍ واحد** —
 * ثلاثةُ أرباع القائمة. ومعالجُ البيع يُخفي الماركة التي لا فئةَ
 * ظاهرةً تحتها لأن النشر لا يتمّ بلا فئة، فلم يكن أحدٌ يعرض مرسيدس
 * ولا بي إم دبليو ولا تسلا ولا جيتور. (طلب المالك ٢٠٢٦-١٠-١٨.)
 *
 * وهذا يسأل عن الشرط لا عن الرقم: **كلُّ ماركةٍ ظاهرةٍ تُباع**.
 * فمحرّرُ الكتالوج يضيف ويحذف، ورقمٌ مكتوبٌ هنا يتقادم في أوّل تعديل.
 */
describe('الكتالوج يفتح كل ماركة للبيع', () => {
  it('كل ماركة في القائمة العامة هي في قائمة البيع', async () => {
    const [all, sellable] = await Promise.all([listBrandOptions(), listSellableBrandOptions()]);
    const missing = all
      .filter((brand) => !sellable.some((row) => row.id === brand.id))
      .map((brand) => brand.nameEn);

    expect(all.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
    expect(sellable.length).toBe(all.length);
  });

  it('كل ماركة ظاهرة تحتها طراز ظاهر وفئة ظاهرة', async () => {
    const orphans = await db.brand.findMany({
      where: {
        visible: true,
        models: { none: { visible: true, trims: { some: { visible: true } } } },
      },
      select: { slug: true },
    });
    expect(orphans.map((row) => row.slug)).toEqual([]);
  });

  /**
   * **والبذرة هي الحقيقة للقاعدة الفارغة، والترحيل للقائمة** — فما
   * يصل إحداهما يصل الأخرى. والفحص على الملفّ لأن قاعدةَ التطوير قد
   * تحمل ما أضافه محرّرٌ بيد.
   */
  it('بذرة الماركات لا تترك ماركةً بلا فئة', () => {
    const empty = BRANDS.filter(
      (brand) => !brand.models.some((model) => model.trims.length > 0),
    ).map((brand) => brand.slug);
    expect(empty).toEqual([]);
  });
});

/**
 * ═══ ولا رقمَ في المنصّة إلّا وهو صحيح ═══
 *
 * قرارُ ١٦ ينسخ مواصفةَ الفئة **لقطةً** إلى المركبة وقت النشر، فسعةُ
 * محرّكٍ مخترعة هنا تسافر إلى الإعلان وتقرير الفحص وإحصاء السوق بلا
 * أن يراها أحدٌ تدخل. فالفئةُ القياسية تحمل ما يُعرف يقينًا — الهيكل
 * والدفع والوقود والناقل والمقاعد والأبواب — **وتترك الأرقام فارغة**.
 * (قرار المالك: «اتساع بلا أرقام مخترعة».)
 */
describe('بيانات الكتالوج صحيحةٌ أو فارغة', () => {
  const trims = BRANDS.flatMap((brand) =>
    brand.models.flatMap((model) =>
      model.trims.map((trim) => ({ brand: brand.slug, model: model.nameEn, trim })),
    ),
  );

  it('كل قيمة موروثة عضوٌ في تعدادها', () => {
    const bad = trims.filter(
      ({ trim }) =>
        !(trim.bodyType in BodyType) ||
        !(trim.transmission in Transmission) ||
        !(trim.fuel in FuelType) ||
        !(trim.drivetrain in Drivetrain),
    );
    expect(bad.map((row) => `${row.brand}/${row.model}/${row.trim.nameEn}`)).toEqual([]);
  });

  it('المقاعد والأبواب داخل ما يقبله النطاق', () => {
    const bad = trims.filter(
      ({ trim }) =>
        !Number.isInteger(trim.seats) ||
        trim.seats < 1 ||
        trim.seats > 20 ||
        !Number.isInteger(trim.doors) ||
        trim.doors < 2 ||
        trim.doors > 6,
    );
    expect(bad.map((row) => `${row.brand}/${row.model}/${row.trim.nameEn}`)).toEqual([]);
  });

  /**
   * **والرقمُ لا يصل وحده.** سعةُ محرّكٍ بلا سلندرات، أو سلنداتٌ بلا
   * سعة، شكلُ رقمٍ كُتب من الذاكرة في حقلٍ واحد — ومن يملك المصدر
   * يملك الحقلين. فالفئةُ تصفُ محرّكَها كاملًا أو تصمت.
   */
  it('سعة المحرك وسلنداته تردان معا أو لا تردان', () => {
    const half = trims.filter(
      ({ trim }) => (trim.engineL === null) !== ((trim as { cylinders: number | null }).cylinders === null),
    );
    expect(half.map((row) => `${row.brand}/${row.model}/${row.trim.nameEn}`)).toEqual([]);
  });

  /** والكهربائيُّ بلا محرّكِ احتراق — فسعةٌ له خطأٌ لا نقص. */
  it('الكهربائي لا يحمل سعة محرك ولا سلندرات', () => {
    const wrong = trims.filter(
      ({ trim }) =>
        trim.fuel === 'ELECTRIC' &&
        (trim.engineL !== null || (trim as { cylinders: number | null }).cylinders !== null),
    );
    expect(wrong.map((row) => `${row.brand}/${row.model}/${row.trim.nameEn}`)).toEqual([]);
  });

  it('لا طراز مكرر داخل الماركة', () => {
    const dupes: string[] = [];
    for (const brand of BRANDS) {
      const seen = new Set<string>();
      for (const model of brand.models) {
        if (seen.has(model.nameEn)) dupes.push(`${brand.slug}/${model.nameEn}`);
        seen.add(model.nameEn);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('لا فئة مكررة داخل الطراز', () => {
    const dupes: string[] = [];
    for (const brand of BRANDS) {
      for (const model of brand.models) {
        const seen = new Set<string>();
        for (const trim of model.trims) {
          if (seen.has(trim.nameEn)) dupes.push(`${brand.slug}/${model.nameEn}/${trim.nameEn}`);
          seen.add(trim.nameEn);
        }
      }
    }
    expect(dupes).toEqual([]);
  });
});

/**
 * ═══ والقائمةُ الاحتياطية تساوي تعدادها ═══
 *
 * كانت تُكتب بيد فحملت `WAGON` و`FOURWD` **ولا وجود لهما في المخطّط**
 * — ومن اختار أحدهما أرسل قيمةً يردّها الخادم — ونقص منها `CROSSOVER`
 * و`PLUGIN_HYBRID` بعد أن أضافهما المخطّط. وأثرُ النقص لم يكن
 * تجميليًّا: شجرةُ الوقود في الاستمارة تفتح للهجين القابل للشحن
 * بطاريةً ومدًى ومنفذَ شحن، **ولا سبيل إلى اختياره** — طرازٌ بلا
 * فئاتٍ منشورة يعود بقائمةٍ ليس فيها.
 *
 * وصارت تُشتقّ من التعداد المولَّد، وهذا يسأل أن تبقى كذلك.
 */
describe('قائمة المواصفات الاحتياطية من التعداد', () => {
  it('تساوي أعضاء تعدادها حرفا بحرف', () => {
    expect([...ALL_SPECS.bodyTypes].sort()).toEqual(Object.values(BodyType).sort());
    expect([...ALL_SPECS.transmissions].sort()).toEqual(Object.values(Transmission).sort());
    expect([...ALL_SPECS.fuels].sort()).toEqual(Object.values(FuelType).sort());
    expect([...ALL_SPECS.drivetrains].sort()).toEqual(Object.values(Drivetrain).sort());
  });

  it('تحمل الهجين القابل للشحن الذي تعرفه شجرة الوقود', () => {
    expect(ALL_SPECS.fuels).toContain('PLUGIN_HYBRID');
    expect(ALL_SPECS.bodyTypes).toContain('CROSSOVER');
  });
});
