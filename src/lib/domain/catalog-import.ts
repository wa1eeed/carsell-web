import type { AdminUser } from '@/generated/prisma/client';
import { BodyType, Drivetrain, FuelType, Transmission } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { createModel, createTrim } from './catalog';

/**
 * ═══ استيراد الكتالوج من CSV (A13) ═══
 *
 * الترميز يضع «استيراد CSV» في ترويسة «الطرازات والفئات». والكتالوج
 * اليوم ٤٢ ماركة و٣٠٣ طرازًا و٣٦٠ فئة، **وكلُّها تُضاف صفًّا صفًّا من
 * الشاشة** — فطرحُ ماركةٍ بثلاثين طرازًا عملُ يومٍ بالفأرة.
 *
 * ═══ ولا يكتب إلّا ما ينقص ═══
 *
 * **لا تحديث ولا حذف.** الفئةُ تُملأ منها مواصفاتُ كلّ إعلانٍ يُنشر،
 * فاستيرادٌ يُحدّث يُبدّل مواصفاتِ ثلاثِ مئة طراز بملفٍّ واحد بلا أن
 * يقول. والموجودُ يُعَدّ ويُعرض، ولا يُمَسّ.
 *
 * ═══ والمعاينةُ تسبق الكتابة ═══
 *
 * ترميز `D3` يكتب مفرداتِ الاستيراد بنصّها: «صفوف الملف · مكرّرة
 * (موجودة) · مطابقة الأعمدة · تُتجاهل». فالمشغّل يرى **ما سيقع** قبل
 * أن يقع: كم صفًّا قُرئ، وكم جديدٌ، وكم موجود، وأيّ صفٍّ رُفض ولماذا.
 *
 * ═══ والقيَم مفاتيحُ تعدادٍ لا تسمياتٍ عربية ═══
 *
 * النطاق لا يعرف اللغة (البوابة ١٧)، والتسمياتُ العربية في `messages`.
 * **والقائمةُ تُشتقّ من التعداد لا تُكتب**: نسخةٌ بيدٍ تحمل قيمةً لا
 * وجود لها وتنقص أخرى أضافها المخطّط — وقد وقع في `ALL_SPECS` قبلها.
 * والقالبُ المنزَّل يحمل القيَم المقبولة، فتُعرَف بلا تخمين.
 */

/** الأعمدة التي يقرؤها الاستيراد — وما عداها يُتجاهَل ويُقال. */
export const IMPORT_COLUMNS = [
  'brand',
  'model_ar',
  'model_en',
  'trim_ar',
  'trim_en',
  'body_type',
  'transmission',
  'fuel',
  'drivetrain',
  'seats',
  'doors',
  'year_from',
  'year_to',
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** ما لا يُقبل فارغًا — وفئةٌ ناقصةٌ تُملأ فراغًا في نموذج البيع. */
const REQUIRED: readonly ImportColumn[] = [
  'brand',
  'model_ar',
  'model_en',
  'trim_ar',
  'trim_en',
  'body_type',
  'transmission',
  'fuel',
  'drivetrain',
  'seats',
  'doors',
];

export type RowProblem =
  | 'BRAND_NOT_FOUND'
  | 'MISSING_FIELD'
  | 'BAD_ENUM'
  | 'BAD_NUMBER'
  | 'DUPLICATE_IN_FILE';

export type RejectedRow = {
  /** رقمُ السطر في الملفّ كما يراه المشغّل — الترويسة ١. */
  line: number;
  problem: RowProblem;
  /** العمودُ المعنيّ — و`null` حين يخصّ الصفَّ كلَّه. */
  column: string | null;
  value: string;
};

export type ImportPreview = {
  /** أعمدةُ الملفّ التي عرفناها، بترتيب ظهورها. */
  matched: string[];
  /** أعمدةٌ في الملفّ لا نقرؤها — تُقال ولا تُبتلع. */
  ignored: string[];
  /** صفوفُ الملفّ بلا الترويسة. */
  rows: number;
  /** طرازاتٌ ستُنشأ. */
  newModels: number;
  /** فئاتٌ ستُنشأ. */
  newTrims: number;
  /** صفوفٌ موجودةٌ أصلًا — «مكرّرة (موجودة)». */
  existing: number;
  rejected: RejectedRow[];
};

/**
 * ═══ قارئُ CSV — بالاقتباس لا بالفاصلة ═══
 *
 * `split(',')` يكسر أوّلَ اسمٍ فيه فاصلة («مرسيدس-بنز، الفئة S»)، وهو
 * واردٌ في أسماء الفئات. والاقتباسُ المزدوج يُهرَّب بتكراره كما في
 * المعيار، والسطرُ ينتهي بـ`\n` أو `\r\n`.
 *
 * **والـBOM يُنزع**: ملفٌّ خرج من Excel يبدأ به، فيصير أوّلُ عمودٍ
 * `﻿brand` ولا يُطابق شيئًا — والرسالة تقول «عمود مجهول» عن عمودٍ
 * مكتوبٍ صحيحًا.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  /** سطورٌ فارغة في ذيل الملفّ لا تُعَدّ صفوفًا. */
  return rows.filter((entry) => entry.some((value) => value.trim() !== ''));
}

/** قيَمُ التعداد المقبولة — **مشتقّةٌ منه**، فلا نسخةَ تتباعد. */
export const ENUM_VALUES: Readonly<Record<string, readonly string[]>> = {
  body_type: Object.values(BodyType),
  transmission: Object.values(Transmission),
  fuel: Object.values(FuelType),
  drivetrain: Object.values(Drivetrain),
};

/**
 * **والقالبُ المنزَّل ليس هنا** — صفُّه المثال يحمل اسمَ طرازٍ عربيًّا
 * («كامري»)، والنطاق لا يكتب عربيًّا (البوابة ١٧). وهو عرضٌ لا منطق:
 * ملفٌّ يُنزّله المشغّل ليعرف الأعمدة. فمكانُه المسار، وأعمدتُه من
 * `IMPORT_COLUMNS` هنا فلا تفترق عمّا يُقرأ.
 */

type Parsed = {
  line: number;
  brandSlug: string;
  modelAr: string;
  modelEn: string;
  trimAr: string;
  trimEn: string;
  bodyType: BodyType;
  transmission: Transmission;
  fuel: FuelType;
  drivetrain: Drivetrain;
  seats: number;
  doors: number;
  yearFrom: number | null;
  yearTo: number | null;
};

type Reading = {
  matched: string[];
  ignored: string[];
  rowCount: number;
  good: Parsed[];
  rejected: RejectedRow[];
};

function readNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * يقرأ الملفّ ويفصل الصالح عن المرفوض — **ولا يلمس القاعدة إلّا
 * ليتحقّق من الماركة**.
 */
async function read(text: string): Promise<Reading> {
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const names = header.map((value) => value.trim().toLowerCase());

  const known = new Set<string>(IMPORT_COLUMNS);
  const matched = names.filter((name) => known.has(name));
  const ignored = names.filter((name) => name !== '' && !known.has(name));
  const at = (column: ImportColumn): number => names.indexOf(column);

  const body = rows.slice(1);
  const good: Parsed[] = [];
  const rejected: RejectedRow[] = [];

  const brands = await db.brand.findMany({ select: { id: true, slug: true, nameAr: true, nameEn: true } });
  const brandBy = new Map<string, string>();
  for (const brand of brands) {
    brandBy.set(brand.slug.toLowerCase(), brand.id);
    brandBy.set(brand.nameAr.trim(), brand.id);
    brandBy.set(brand.nameEn.trim().toLowerCase(), brand.id);
  }

  /** **والتكرارُ داخل الملفّ يُقال** — صفّان متطابقان يُنشئ أحدُهما ويُرفض الآخر. */
  const seen = new Set<string>();

  body.forEach((cells, index) => {
    const line = index + 2;
    const value = (column: ImportColumn): string => {
      const i = at(column);
      return i === -1 ? '' : (cells[i] ?? '').trim();
    };

    for (const column of REQUIRED) {
      if (value(column) === '') {
        rejected.push({ line, problem: 'MISSING_FIELD', column, value: '' });
        return;
      }
    }

    const brandKey = value('brand');
    const brandId = brandBy.get(brandKey.toLowerCase()) ?? brandBy.get(brandKey);
    if (brandId === undefined) {
      rejected.push({ line, problem: 'BRAND_NOT_FOUND', column: 'brand', value: brandKey });
      return;
    }

    for (const column of ['body_type', 'transmission', 'fuel', 'drivetrain'] as const) {
      const raw = value(column).toUpperCase();
      if (!(ENUM_VALUES[column] ?? []).includes(raw)) {
        rejected.push({ line, problem: 'BAD_ENUM', column, value: value(column) });
        return;
      }
    }

    const seats = readNumber(value('seats'));
    const doors = readNumber(value('doors'));
    if (seats === null || doors === null || seats <= 0 || doors <= 0) {
      rejected.push({
        line,
        problem: 'BAD_NUMBER',
        column: seats === null || seats <= 0 ? 'seats' : 'doors',
        value: seats === null || seats <= 0 ? value('seats') : value('doors'),
      });
      return;
    }

    const key = `${brandId}\u0000${value('model_en').toLowerCase()}\u0000${value('trim_en').toLowerCase()}`;
    if (seen.has(key)) {
      rejected.push({ line, problem: 'DUPLICATE_IN_FILE', column: null, value: value('trim_en') });
      return;
    }
    seen.add(key);

    good.push({
      line,
      brandSlug: brandId,
      modelAr: value('model_ar'),
      modelEn: value('model_en'),
      trimAr: value('trim_ar'),
      trimEn: value('trim_en'),
      bodyType: value('body_type').toUpperCase() as BodyType,
      transmission: value('transmission').toUpperCase() as Transmission,
      fuel: value('fuel').toUpperCase() as FuelType,
      drivetrain: value('drivetrain').toUpperCase() as Drivetrain,
      seats,
      doors,
      yearFrom: readNumber(value('year_from')),
      yearTo: readNumber(value('year_to')),
    });
  });

  return { matched, ignored, rowCount: body.length, good, rejected };
}

/** ما الذي سيقع — **ولا يقع شيء**. */
export async function previewCatalogImport(text: string): Promise<ImportPreview> {
  const reading = await read(text);

  const models = await db.model.findMany({ select: { id: true, brandId: true, nameEn: true } });
  const trims = await db.trim.findMany({ select: { modelId: true, nameEn: true } });

  const modelKey = (brandId: string, nameEn: string): string =>
    `${brandId}\u0000${nameEn.trim().toLowerCase()}`;
  const modelBy = new Map(models.map((row) => [modelKey(row.brandId, row.nameEn), row.id]));
  const trimKeys = new Set(trims.map((row) => `${row.modelId}\u0000${row.nameEn.trim().toLowerCase()}`));

  /** الطرازاتُ الجديدة تُعَدّ مرّةً ولو تكرّرت في صفوفٍ لفئاتٍ شتّى. */
  const plannedModels = new Set<string>();
  let newTrims = 0;
  let existing = 0;

  for (const row of reading.good) {
    const key = modelKey(row.brandSlug, row.modelEn);
    const modelId = modelBy.get(key);

    if (modelId === undefined) {
      plannedModels.add(key);
      newTrims += 1;
      continue;
    }
    if (trimKeys.has(`${modelId}\u0000${row.trimEn.trim().toLowerCase()}`)) existing += 1;
    else newTrims += 1;
  }

  return {
    matched: reading.matched,
    ignored: reading.ignored,
    rows: reading.rowCount,
    newModels: plannedModels.size,
    newTrims,
    existing,
    rejected: reading.rejected,
  };
}

export type ImportResult = {
  createdModels: number;
  createdTrims: number;
  skipped: number;
  rejected: RejectedRow[];
};

/**
 * يكتب ما ينقص — **ويمرّ بـ`createModel`/`createTrim`**.
 *
 * فالتحقّقُ واحدٌ والتدقيقُ يُكتب لكلّ صفّ: استيرادٌ يكتب مباشرةً
 * يتخطّى القاعدة التي تحرس الشاشة، ويترك ثلاثَ مئة صفٍّ بلا أثرٍ في
 * `AuditLog` يقول من أدخلها.
 */
export async function commitCatalogImport(
  admin: AdminUser,
  text: string,
  ip: string | null,
): Promise<ImportResult> {
  const reading = await read(text);

  let createdModels = 0;
  let createdTrims = 0;
  let skipped = 0;
  const rejected = [...reading.rejected];

  for (const row of reading.good) {
    const found = await db.model.findFirst({
      where: { brandId: row.brandSlug, nameEn: row.modelEn },
      select: { id: true },
    });

    let modelId = found?.id ?? null;
    if (modelId === null) {
      const made = await createModel(
        admin,
        {
          brandId: row.brandSlug,
          nameAr: row.modelAr,
          nameEn: row.modelEn,
          yearFrom: row.yearFrom,
          yearTo: row.yearTo,
        },
        ip,
      );
      if (!made.ok) {
        rejected.push({ line: row.line, problem: 'MISSING_FIELD', column: 'model_en', value: row.modelEn });
        continue;
      }
      modelId = made.model.id;
      createdModels += 1;
    }

    /** **والموجودُ يُتخطّى ولا يُحدَّث** — ملفٌّ واحد لا يبدّل مواصفات ما نُشر عليه. */
    const trim = await db.trim.findFirst({
      where: { modelId, nameEn: row.trimEn },
      select: { id: true },
    });
    if (trim !== null) {
      skipped += 1;
      continue;
    }

    const madeTrim = await createTrim(
      admin,
      {
        modelId,
        nameAr: row.trimAr,
        nameEn: row.trimEn,
        yearFrom: row.yearFrom,
        yearTo: row.yearTo,
        bodyType: row.bodyType,
        transmission: row.transmission,
        fuel: row.fuel,
        drivetrain: row.drivetrain,
        seats: row.seats,
        doors: row.doors,
      },
      ip,
    );
    if (!madeTrim.ok) {
      rejected.push({ line: row.line, problem: 'MISSING_FIELD', column: 'trim_en', value: row.trimEn });
      continue;
    }
    createdTrims += 1;
  }

  return { createdModels, createdTrims, skipped, rejected };
}
