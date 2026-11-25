#!/usr/bin/env node
/**
 * ═══ يولّد ترحيلَ الكتالوج من `brands.json` ═══
 *
 * **والبياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل لا ببذرة** — قاعدةٌ
 * مكتوبة في هذا المستودع: البذرةُ تُطبَّق على قاعدةٍ فارغة مرّةً
 * واحدة، فصفٌّ يُضاف إلى الملفّ يصل بيئةً جديدة **ولا يصل بيئةً
 * تعمل**.
 *
 * **ويُولَّد ولا يُكتب بيد**: ألفُ فئةٍ مكتوبةٌ يدويًّا في SQL تتباعد
 * عن الملفّ أوّلَ تعديل، ولا شيء يشكو.
 *
 * و`ON CONFLICT DO NOTHING` يجعله يمرّ بلا أثرٍ على ما زُرع ويصلَ ما
 * لم يُزرع — ويحتاج قيودَ التفرّد التي أُضيفت معه.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const brands = JSON.parse(readFileSync(join(ROOT, 'prisma/seed-data/brands.json'), 'utf8'));

/** نصٌّ مهرَّب لـSQL — والفاصلة العليا تُضاعَف. */
const q = (value) =>
  value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const n = (value) => (value === null || value === undefined ? 'NULL' : String(value));
const b = (value) => (value ? 'true' : 'false');

/**
 * معرّفٌ مستقرّ من المسار.
 *
 * **ولا `gen_random_uuid()`**: ترحيلٌ يُعاد تشغيله على قاعدةٍ أخرى
 * يجب أن يُنتج المعرّفات نفسَها، وإلّا صار للطراز الواحد معرّفان في
 * بيئتين — ومرجعٌ يُنقل بينهما يكسر.
 */
const id = (path) => `cat_${path.replaceAll(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 60)}`;

const lines = [
  '-- مولَّد: npm run catalog:migration — لا يُحرَّر بيد.',
  '-- المصدر: prisma/seed-data/brands.json',
  '',
];

for (const brand of brands) {
  /**
   * **والشعارُ مسارٌ مشتقٌّ من المقطع** — `public/brand-logos/<slug>.svg`.
   * وبدونه تفتح بيئةٌ جديدة على أربعٍ وسبعين ماركةً بلا شارة، والملفّات
   * في المستودع تنتظر من يشير إليها.
   */
  lines.push(
    `INSERT INTO "Brand" ("id","slug","nameAr","nameEn","sort","visible","logoUrl") VALUES ` +
      `(${q(id(brand.slug))},${q(brand.slug)},${q(brand.nameAr)},${q(brand.nameEn)},${n(brand.sort)},${b(brand.visible)},${q(`/brand-logos/${brand.slug}.svg`)}) ` +
      `ON CONFLICT ("slug") DO NOTHING;`,
  );

  for (const model of brand.models) {
    const modelId = id(`${brand.slug}_${model.nameEn}`);
    lines.push(
      `INSERT INTO "Model" ("id","brandId","nameAr","nameEn","yearFrom","yearTo","bodyType","visible") ` +
        `SELECT ${q(modelId)},b."id",${q(model.nameAr)},${q(model.nameEn)},${n(model.yearFrom)},${n(model.yearTo)},` +
        `${model.bodyType === null ? 'NULL' : `'${model.bodyType}'::"BodyType"`},${b(model.visible)} ` +
        `FROM "Brand" b WHERE b."slug"=${q(brand.slug)} ` +
        `ON CONFLICT ("brandId","nameEn") DO NOTHING;`,
    );

    for (const trim of model.trims) {
      lines.push(
        `INSERT INTO "Trim" ("id","modelId","nameAr","nameEn","yearFrom","yearTo","bodyType","transmission","fuel","drivetrain","seats","doors","engineL","cylinders","horsepower","visible") ` +
          `SELECT ${q(id(`${brand.slug}_${model.nameEn}_${trim.nameEn}`))},m."id",${q(trim.nameAr)},${q(trim.nameEn)},` +
          `${n(trim.yearFrom)},${n(trim.yearTo)},'${trim.bodyType}'::"BodyType",'${trim.transmission}'::"Transmission",` +
          `'${trim.fuel}'::"FuelType",'${trim.drivetrain}'::"Drivetrain",${n(trim.seats)},${n(trim.doors)},` +
          `${n(trim.engineL)},${n(trim.cylinders)},${n(trim.horsepower)},true ` +
          `FROM "Model" m JOIN "Brand" br ON br."id"=m."brandId" ` +
          `WHERE br."slug"=${q(brand.slug)} AND m."nameEn"=${q(model.nameEn)} ` +
          `ON CONFLICT ("modelId","nameEn") DO NOTHING;`,
      );
    }
  }
}

const out = process.argv[2];
if (out === undefined) {
  console.error('الاستعمال: node scripts/generate-catalog-migration.mjs <مسار الترحيل>');
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${lines.join('\n')}\n`);

const models = brands.reduce((sum, brand) => sum + brand.models.length, 0);
const trims = brands.reduce(
  (sum, brand) => sum + brand.models.reduce((inner, model) => inner + model.trims.length, 0),
  0,
);
console.log(`✓ ${brands.length} ماركة · ${models} طرازًا · ${trims} فئة → ${out}`);
