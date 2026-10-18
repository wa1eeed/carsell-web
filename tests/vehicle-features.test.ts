import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { addVehicle, saleCandidate } from '@/lib/domain/garage';
import { createListing } from '@/lib/domain/publish';
import { listSellFormFeatures, trimsWithSpecs } from '@/lib/domain/catalog-options';

const ROOT = process.cwd();
const WIZARD = join(ROOT, 'src/app/[locale]/(site)/sell/SellWizard.tsx');
const FIELDS = join(ROOT, 'src/components/site/VehicleFields.tsx');
const TRIM_EDITOR = join(ROOT, 'src/app/admin/catalog/trims/[id]/TrimEditor.tsx');

async function anyTrim() {
  return db.trim.findFirstOrThrow({
    select: { id: true, modelId: true, model: { select: { brandId: true } } },
  });
}

function baseVehicle(
  trim: { id: string; modelId: string; model: { brandId: string } },
  features: string[],
) {
  return {
    brandId: trim.model.brandId,
    modelId: trim.modelId,
    trimId: trim.id,
    year: 2024,
    mileageKm: 40_000,
    transmission: 'AUTOMATIC' as const,
    fuel: 'PETROL' as const,
    spec: 'SAUDI' as const,
    condition: 'USED' as const,
    city: 'جدة',
    colorExterior: 'ابيض',
    vin: null,
    features,
  };
}

/**
 * ═══ المميّزات يقرّها البائع — وكان لا يُسأل ═══
 *
 * `ListingFeature` كان **بلا كاتبٍ في المنتج كلِّه**: تزرعه البذرة
 * ولا شاشةَ ولا مسارَ ولا دالّةَ نطاقٍ تكتبه. قِيس ٢٠٢٦-١٠-١٨ فكان
 * ستّون إعلانًا من اثنين وستّين يحمل مميّزات — **والستّون كلُّها
 * مزروعة** — والاثنان المنشوران من الشاشة بلا واحدة. فمن صفّى على
 * «فتحة سقف» لم يجد إعلانًا حقيقيًّا واحدًا، ولا كان سيجد أبدًا.
 * (طلب المالك ٢٠٢٦-١٠-١٨.)
 */
describe('استمارة البائع تسأل عن المميزات', () => {
  it('القسم في الاستمارة، ويصل النداءَين', () => {
    const fields = readFileSync(FIELDS, 'utf8');
    expect(fields).toContain('export function VehicleFeatureFields');
    /** وفي الحمولة — **وحقلٌ يُملأ ولا يُرسَل** هو البوابة ٦٠. */
    expect(fields).toContain('features: vehicle.features');

    const wizard = readFileSync(WIZARD, 'utf8');
    expect(wizard).toContain('<VehicleFeatureFields');
    expect(wizard).toContain('sellFeatures');
  });

  it('والكتالوج يقرر ما يظهر — موضع sell_form', async () => {
    const shown = await listSellFormFeatures();
    expect(shown.length).toBeGreaterThan(0);

    const all = await db.feature.findMany({
      where: { active: true, placements: { has: 'sell_form' } },
      select: { key: true },
    });
    expect(shown.length).toBe(all.length);
    /** ولكلٍّ مجموعةٌ — القسمُ يعرضها مجموعاتٍ لا قائمةً واحدة. */
    expect(shown.every((row) => row.group !== '')).toBe(true);
  });

  /** **والفئةُ تُرجّح**: ما تأتي به يصل البائعَ معلَّمًا، ولا يحصر ما يراه. */
  it('وفئةُ الطراز تعيد مفاتيحها لترجّح بها', async () => {
    const trim = await db.trim.findFirstOrThrow({
      where: { features: { some: {} } },
      select: { modelId: true, id: true },
    });
    const rows = await trimsWithSpecs(trim.modelId);
    const found = rows.find((row) => row.id === trim.id);
    expect(found).toBeDefined();
    expect(found?.featureKeys.length).toBeGreaterThan(0);
  });
});

describe('المميزات تُكتب على المركبة', () => {
  it('addVehicle يكتبها، ويرشّح ما ليس في الكتالوج', async () => {
    const [owner, trim, feature] = await Promise.all([
      db.user.findFirstOrThrow({ select: { id: true } }),
      anyTrim(),
      db.feature.findFirstOrThrow({
        where: { active: true, placements: { has: 'sell_form' } },
        select: { key: true },
      }),
    ]);

    const result = await addVehicle({
      sellerId: owner.id,
      /** **ومفتاحٌ مخترَع لا يُسقط المعاملة** بخطأ مفتاحٍ أجنبيّ. */
      vehicle: baseVehicle(trim, [feature.key, 'ميزة_لا_وجود_لها']),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    try {
      const rows = await db.vehicleFeature.findMany({
        where: { vehicleId: result.vehicleId },
        select: { featureKey: true },
      });
      expect(rows.map((row) => row.featureKey)).toEqual([feature.key]);
    } finally {
      await db.vehicle.delete({ where: { id: result.vehicleId } });
    }
  });

  /** **ولا يُسأل مرّتين**: ما أقرّه في مرآبه يصل استمارةَ العرض معلَّمًا. */
  it('وسيارةُ المرآب تحمل مميزاتها إلى استمارة العرض', async () => {
    const [owner, trim, feature] = await Promise.all([
      db.user.findFirstOrThrow({ select: { id: true } }),
      anyTrim(),
      db.feature.findFirstOrThrow({
        where: { active: true, placements: { has: 'sell_form' } },
        select: { key: true },
      }),
    ]);

    const result = await addVehicle({
      sellerId: owner.id,
      vehicle: baseVehicle(trim, [feature.key]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    try {
      const candidate = await saleCandidate(owner.id, result.vehicleId, 'ar');
      expect(candidate?.features).toEqual([feature.key]);
    } finally {
      await db.vehicle.delete({ where: { id: result.vehicleId } });
    }
  });
});

/**
 * ═══ ولوحةُ الأدمن تضيف وتسمّي ═══
 *
 * **وكان المحرّر يُعلّم من قائمةٍ ثابتة وحدها**: ميزةٌ ليست في
 * الكتالوج لا سبيل إلى إضافتها إلّا بمغادرة الشاشة والعودة.
 */
describe('محرر الفئة يضيف ميزة ويسميها', () => {
  it('زرُّ + ينادي مسارَ الإنشاء ويعلّمها لهذه الفئة', () => {
    const editor = readFileSync(TRIM_EDITOR, 'utf8');
    expect(editor).toContain('+ أضف ميزة');
    expect(editor).toContain("fetch('/api/v1/admin/features'");
    expect(editor).toContain("method: 'POST'");
    /** **والمُنشَأةُ تُعلَّم فورًا** — من أضافها أرادها هنا. */
    expect(/setKeys\(\(was\) => \[\.\.\.new Set\(\[\.\.\.was, key\]\)\]\)/.test(editor)).toBe(true);
    /** وتدخل استمارةَ البائع، وإلّا فميزةٌ لا يُسأل عنها أحد. */
    expect(editor).toContain("'sell_form'");
  });

  /**
   * **والأثرُ يُقال لا يُكتشف.** `Feature.key` مفتاحٌ عامّ، فالمُنشَأة
   * من داخل فئةٍ تظهر لكلّ فئة ولكلّ بائع.
   */
  it('ويقول إنها تدخل الكتالوج كله', () => {
    expect(readFileSync(TRIM_EDITOR, 'utf8')).toContain('تضاف إلى كتالوج المميزات كله');
  });
});

/**
 * ═══ والنشرُ يأخذ لقطةً ═══
 *
 * `ListingFeature` لقطةٌ لا قراءةٌ حيّة (قرار ١٩): تعديلُ البائع
 * لسيارته بعد النشر لا يغيّر إعلانًا يقرؤه الناس، ولا تغيّره مراجعةُ
 * الكتالوج. وهذا يفحص أنّ اللقطة **تُؤخذ أصلًا** — وهو ما لم يكن
 * يقع في المنتج كلِّه.
 */
describe('النشر يكتب اللقطة', () => {
  const madeVehicles: string[] = [];
  const madeListings: string[] = [];
  const touched = new Map<
    string,
    { taxStatus: 'INDIVIDUAL' | 'VAT_REGISTERED' | null; email: string | null; idVerified: boolean; iban: string | null }
  >();

  afterAll(async () => {
    await db.listingImage.deleteMany({ where: { listingId: { in: madeListings } } });
    await db.listingFeature.deleteMany({ where: { listingId: { in: madeListings } } });
    await db.listing.deleteMany({ where: { id: { in: madeListings } } });
    await db.vehicle.deleteMany({ where: { id: { in: madeVehicles } } });
    await db.uploadedAsset.deleteMany({ where: { r2Key: { startsWith: 'feature-probe/' } } });
    /** **والاستعادة إلى ما كان لا إلى فراغ** — الصفّ مزروع لا مصنوع هنا. */
    for (const [id, before] of touched) await db.user.update({ where: { id }, data: before });
  });

  it('المميزات المعلمة تصل المركبةَ والإعلان معا', async () => {
    const seller = await db.user.findFirstOrThrow({
      where: { dealerId: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!touched.has(seller.id)) {
      touched.set(seller.id, {
        taxStatus: seller.taxStatus,
        email: seller.email,
        idVerified: seller.idVerified,
        iban: seller.iban,
      });
    }
    await db.user.update({
      where: { id: seller.id },
      data: {
        taxStatus: 'INDIVIDUAL',
        email: seller.email ?? `feat${seller.id.slice(-6)}@carsell.one`,
        idVerified: true,
        iban: seller.iban ?? 'SA0380000000608010167519',
      },
    });

    const [trim, picks] = await Promise.all([
      db.trim.findFirstOrThrow({
        where: { visible: true },
        select: { id: true, modelId: true, model: { select: { brandId: true } } },
      }),
      db.feature.findMany({
        where: { active: true, placements: { has: 'sell_form' } },
        orderBy: { key: 'asc' },
        take: 3,
        select: { key: true },
      }),
    ]);
    const keys = picks.map((row) => row.key);
    expect(keys.length).toBe(3);

    const key = `feature-probe/${trim.id}.jpg`;
    await db.uploadedAsset.upsert({
      where: { r2Key: key },
      create: { r2Key: key, ownerId: seller.id, phash: '1a2b3c4d5e6f7081', plateBlurred: true, qualityFlags: [] },
      update: { ownerId: seller.id },
    });

    const result = await createListing({
      sellerId: seller.id,
      type: 'DIRECT',
      askPrice: 77_000,
      taxableSupply: null,
      vehicle: baseVehicle(trim, keys),
      images: [key],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const listing = await db.listing.findFirstOrThrow({
      where: { ref: result.ref },
      select: { id: true, vehicleId: true },
    });
    madeListings.push(listing.id);
    madeVehicles.push(listing.vehicleId);

    const [onVehicle, onListing] = await Promise.all([
      db.vehicleFeature.findMany({
        where: { vehicleId: listing.vehicleId },
        orderBy: { featureKey: 'asc' },
        select: { featureKey: true },
      }),
      db.listingFeature.findMany({
        where: { listingId: listing.id },
        orderBy: { featureKey: 'asc' },
        select: { featureKey: true },
      }),
    ]);
    expect(onVehicle.map((row) => row.featureKey)).toEqual(keys);
    expect(onListing.map((row) => row.featureKey)).toEqual(keys);

    /**
     * **واللقطةُ لا تتبع المركبة بعدها** — من شطب ميزةً عن سيارته
     * لم يطلب تعديل إعلانٍ منشور يقرؤه الناس.
     */
    await db.vehicleFeature.deleteMany({ where: { vehicleId: listing.vehicleId } });
    const after = await db.listingFeature.count({ where: { listingId: listing.id } });
    expect(after).toBe(3);
  });
});
