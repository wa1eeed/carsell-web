import { afterAll, describe, expect, it } from 'vitest';
import { BodyType, Drivetrain, FuelType, Transmission } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import {
  ENUM_VALUES,
  IMPORT_COLUMNS,
  commitCatalogImport,
  parseCsv,
  previewCatalogImport,
} from '@/lib/domain/catalog-import';

/**
 * ═══ استيراد الكتالوج من CSV (A13) ═══
 *
 * الكتالوج ٣٠٣ طرازًا و٣٦٠ فئة تُضاف صفًّا صفًّا. والمستورِد يكتب
 * **ما ينقص وحده**: الفئةُ تُملأ منها مواصفاتُ كلّ إعلانٍ يُنشر،
 * فاستيرادٌ يُحدّث يُبدّل مواصفاتِ ما نُشر بملفٍّ واحد بلا أن يقول.
 */

const TAG = `IMP${String(Date.now()).slice(-9)}`;
let adminId: string | null = null;
const madeModels: string[] = [];

afterAll(async () => {
  if (madeModels.length > 0) {
    await db.trim.deleteMany({ where: { modelId: { in: madeModels } } });
    await db.auditLog.deleteMany({ where: { entity: 'Trim' } });
    await db.model.deleteMany({ where: { id: { in: madeModels } } });
  }
  if (adminId !== null) {
    await db.auditLog.deleteMany({ where: { actorId: adminId } });
    await db.adminUser.deleteMany({ where: { id: adminId } });
  }
  await db.$disconnect();
});

async function admin() {
  const row = await db.adminUser.create({
    data: { email: `${TAG.toLowerCase()}@carsell.one`, name: 'مستورد', role: 'SUPER_ADMIN', passwordHash: 'x' },
  });
  adminId = row.id;
  return row;
}

async function brandSlug() {
  const row = await db.brand.findFirstOrThrow({ select: { slug: true } });
  return row.slug;
}

function sheet(rows: readonly string[]): string {
  return [IMPORT_COLUMNS.join(','), ...rows].join('\n');
}

describe('قارئُ CSV', () => {
  /**
   * **والاقتباسُ لا الفاصلة.** `split(',')` يكسر أوّلَ اسمٍ فيه فاصلة
   * — «مرسيدس-بنز، الفئة S» واردٌ في أسماء الفئات.
   */
  it('يحترم الاقتباس والفاصلةَ داخله', () => {
    const rows = parseCsv('a,b\n"فيه، فاصلة",ثان\n');
    expect(rows[1]).toEqual(['فيه، فاصلة', 'ثان']);
  });

  it('ويفكّ الاقتباسَ المكرّر', () => {
    const rows = parseCsv('a\n"قال ""نعم"""\n');
    expect(rows[1]?.[0]).toBe('قال "نعم"');
  });

  /**
   * **والـBOM يُنزع.** ملفٌّ خرج من Excel يبدأ به فيصير أوّلُ عمودٍ
   * `﻿brand` — والرسالة تقول «عمود مجهول» عن عمودٍ مكتوبٍ صحيحًا.
   */
  it('وينزع BOM ويقبل CRLF', () => {
    const rows = parseCsv('﻿brand,model_en\r\ntoyota,Camry\r\n');
    expect(rows[0]).toEqual(['brand', 'model_en']);
    expect(rows[1]).toEqual(['toyota', 'Camry']);
  });

  it('ولا يَعُدّ السطورَ الفارغة صفوفًا', () => {
    expect(parseCsv('a\nb\n\n\n').length).toBe(2);
  });
});

/**
 * **وقيَمُ التعداد مشتقّةٌ لا منسوخة.** نسخةٌ بيدٍ تحمل قيمةً لا وجود
 * لها وتنقص أخرى أضافها المخطّط — وقد وقع في `ALL_SPECS` قبلها.
 */
describe('قيَمُ التعداد المقبولة', () => {
  it('تطابق المخطّطَ قيمةً بقيمة', () => {
    expect([...(ENUM_VALUES.body_type ?? [])].sort()).toEqual(Object.values(BodyType).sort());
    expect([...(ENUM_VALUES.transmission ?? [])].sort()).toEqual(Object.values(Transmission).sort());
    expect([...(ENUM_VALUES.fuel ?? [])].sort()).toEqual(Object.values(FuelType).sort());
    expect([...(ENUM_VALUES.drivetrain ?? [])].sort()).toEqual(Object.values(Drivetrain).sort());
  });
});

describe('المعاينةُ تقول ما سيقع', () => {
  it('تفرز الجديدَ والموجودَ والمرفوضَ وتسمّي المتجاهَل', async () => {
    const slug = await brandSlug();
    const csv =
      sheet([
        `${slug},طراز قياس,${TAG}Model,أساسي,${TAG}Base,SUV,CVT,HYBRID,AWD,7,5,2020,2026`,
        `لا ماركة,س,X,ص,Y,SEDAN,AUTOMATIC,PETROL,FWD,5,4,,`,
        `${slug},س,X2,,,SEDAN,AUTOMATIC,PETROL,FWD,5,4,,`,
        `${slug},س,X3,ز,Z,SPACESHIP,AUTOMATIC,PETROL,FWD,5,4,,`,
        `${slug},س,X4,ح,W,SEDAN,AUTOMATIC,PETROL,FWD,none,4,,`,
        `${slug},طراز قياس,${TAG}Model,أساسي,${TAG}Base,SUV,CVT,HYBRID,AWD,7,5,2020,2026`,
      ]).replace(IMPORT_COLUMNS.join(','), `${IMPORT_COLUMNS.join(',')},notes`);

    const preview = await previewCatalogImport(csv);
    expect(preview.rows).toBe(6);
    expect(preview.newModels).toBe(1);
    expect(preview.newTrims).toBe(1);
    expect(preview.ignored).toEqual(['notes']);

    const problems = preview.rejected.map((row) => row.problem);
    expect(problems).toContain('BRAND_NOT_FOUND');
    expect(problems).toContain('MISSING_FIELD');
    expect(problems).toContain('BAD_ENUM');
    expect(problems).toContain('BAD_NUMBER');
    expect(problems).toContain('DUPLICATE_IN_FILE');
  });

  /** **ولا تكتب شيئًا** — معاينةٌ تكتب ليست معاينة. */
  it('ولا تمسّ القاعدة', async () => {
    const slug = await brandSlug();
    const before = await db.model.count();
    await previewCatalogImport(
      sheet([`${slug},لا تُكتب,${TAG}NoWrite,أساسي,${TAG}NoWrite,SUV,CVT,HYBRID,AWD,7,5,,`]),
    );
    expect(await db.model.count()).toBe(before);
  });
});

describe('الكتابةُ تُنشئ الناقصَ وحده', () => {
  it('تكتب مرّةً، وإعادةُ الملفّ لا تكتب شيئًا', async () => {
    const operator = await admin();
    const slug = await brandSlug();
    const csv = sheet([
      `${slug},طراز قياس,${TAG}M1,أساسي,${TAG}T1,SUV,CVT,HYBRID,AWD,7,5,2020,2026`,
      `${slug},طراز قياس,${TAG}M1,فاخر,${TAG}T2,SUV,CVT,HYBRID,AWD,7,5,2020,2026`,
    ]);

    const first = await commitCatalogImport(operator, csv, null);
    const made = await db.model.findMany({ where: { nameEn: `${TAG}M1` }, select: { id: true } });
    madeModels.push(...made.map((row) => row.id));

    expect(first.createdModels).toBe(1);
    expect(first.createdTrims).toBe(2);
    expect(first.skipped).toBe(0);

    /** **والحدُّ يُعبَر**: الملفّ نفسُه ثانيةً. */
    const again = await commitCatalogImport(operator, csv, null);
    expect(again.createdModels).toBe(0);
    expect(again.createdTrims).toBe(0);
    expect(again.skipped).toBe(2);
  });

  /**
   * **ولا يُحدّث الموجود.** فئةٌ قائمة بمواصفاتٍ أخرى تبقى كما هي —
   * وإلّا بدّل ملفٌّ واحد مواصفاتِ ما نُشر عليه إعلان.
   */
  it('ولا يبدّل مواصفات فئةٍ قائمة', async () => {
    const operator = adminId === null ? await admin() : await db.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    const slug = await brandSlug();
    const trim = await db.trim.findFirstOrThrow({
      where: { nameEn: `${TAG}T1` },
      select: { id: true, seats: true, fuel: true },
    });

    await commitCatalogImport(
      operator,
      sheet([`${slug},طراز قياس,${TAG}M1,أساسي,${TAG}T1,SEDAN,MANUAL,DIESEL,RWD,2,2,1990,1995`]),
      null,
    );

    const after = await db.trim.findUniqueOrThrow({
      where: { id: trim.id },
      select: { seats: true, fuel: true },
    });
    expect(after.seats).toBe(trim.seats);
    expect(after.fuel).toBe(trim.fuel);
  });

  /** **وكلُّ صفٍّ يُكتب يترك أثرًا** — المرورُ بـ`createModel` يضمنه. */
  it('ويكتب التدقيقَ لكل ما أنشأه', async () => {
    const logs = await db.auditLog.count({
      where: { actorId: adminId ?? '', action: { in: ['model.create', 'trim.create'] } },
    });
    expect(logs).toBeGreaterThanOrEqual(3);
  });
});
