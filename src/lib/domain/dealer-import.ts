import { db } from '@/lib/db';
import { parseCsv } from './catalog-import';
import { decodeYear, isValidVinFormat } from './vin';
import { COLOUR_UNSPECIFIED, importColumnOf } from '@/lib/labels/dealer';

/**
 * ═══ `D3` — الإضافة الجماعية ═══
 *
 * **والقارئُ واحدٌ للمعاينة وللكتابة** (قاعدةٌ مسجَّلة في استيراد
 * الكتالوج): طوران في مسارٍ واحد يقرآن الملفّ بالقاعدة عينها، فما
 * عُرض هو ما يقع ولا تفترق قراءتان.
 *
 * **والاستيرادُ ذرّيٌّ على مستوى الصفّ**: الصفوفُ السليمة تدخل
 * والمعطوبةُ تُترك بتقرير — ولا يُلغى ملفٌّ كلُّه بسبب صفّ، فمن رفع
 * أربعين صفًّا لا يُعاقَب بخطأٍ في واحد.
 *
 * **والمستورَدُ مسودّة** كما يكتب الترميز: «لا تُنشر قبل إضافة الصور».
 */

/** مفاتيحُ الأعمدة — **وأسماؤها العربية في `labels/dealer.ts`** (البوابة ١٧). */
export const IMPORT_COLUMN_KEYS = [
  'vin', 'brand', 'model', 'trim', 'year', 'mileage', 'price', 'colour', 'branch',
] as const;

export type ImportColumn = (typeof IMPORT_COLUMN_KEYS)[number];

/**
 * **والرقمُ التسلسليُّ وحدَه لا يكفي** — خلافًا لما يكتبه الترميز.
 * `lookupVin` تُخرج الماركةَ والسنة و**تقول صراحةً `needsModel: true`**:
 * الطرازُ ليس في الرقم. وترميزُ `D3` نفسُه يرسم عمودَي `Make` و
 * `Model` في مطابقة الأعمدة، فالملفُّ يحملهما. والسنةُ تُستخرج من
 * الرقم حين يخلو عمودُها.
 */

export type ImportSeverity = 'ERROR' | 'WARNING' | 'INFO';

export type ImportNoteCode =
  | 'VIN_INVALID'
  | 'BRANCH_UNKNOWN'
  | 'YEAR_OUT_OF_RANGE'
  | 'ALREADY_EXISTS'
  | 'PRICE_ZERO'
  | 'BRAND_REQUIRED'
  | 'BRAND_UNKNOWN'
  | 'MODEL_REQUIRED'
  | 'MODEL_UNKNOWN'
  | 'TRIM_REQUIRED'
  | 'TRIM_UNKNOWN'
  | 'YEAR_UNRESOLVED'
  | 'CATALOGUE_MISMATCH';

export type ImportNote = { code: ImportNoteCode; column?: ImportColumn; value?: string };

export type ImportRow = {
  line: number;
  vin: string;
  severity: ImportSeverity | null;
  /**
   * سببُ الملاحظة — **بعموده وقيمته** لا «صفّ مرفوض».
   *
   * **ورمزٌ لا جملة** (البوابة ١٧): النطاقُ لا يعرف اللغة، والصياغةُ
   * في `labels/dealer.ts` تقرؤها الشاشةُ والتقريرُ معًا.
   */
  note: ImportNote | null;
  /** أموجودةٌ أصلًا؟ — فتُحدَّث لا تُضاف. */
  existing: boolean;
};

export type ImportPreview = {
  rows: ImportRow[];
  totals: { lines: number; ready: number; needsReview: number; duplicates: number };
  /** أعمدةٌ في الملفّ لا نقرؤها — **تُقال ولا تُبتلع**. */
  ignoredColumns: string[];
  /** عمودٌ مطلوبٌ غائب — فالملفّ كلُّه لا يُقرأ. */
  missingColumn: ImportColumn | null;
};


const MIN_YEAR = 1980;

export async function previewImport(
  dealerId: string,
  text: string,
  now: Date = new Date(),
): Promise<ImportPreview> {
  const table = parseCsv(text);
  const header = table[0] ?? [];

  const index = new Map<ImportColumn, number>();
  const ignored: string[] = [];
  header.forEach((cell, position) => {
    const key = importColumnOf(cell);
    if (key === null) {
      if (cell.trim() !== '') ignored.push(cell.trim());
      return;
    }
    if (!index.has(key)) index.set(key, position);
  });

  if (!index.has('vin')) {
    return {
      rows: [],
      totals: { lines: 0, ready: 0, needsReview: 0, duplicates: 0 },
      ignoredColumns: ignored,
      missingColumn: 'vin',
    };
  }

  const body = table.slice(1).filter((row) => row.some((cell) => cell.trim() !== ''));
  const at = (row: string[], key: ImportColumn): string => {
    const position = index.get(key);
    return position === undefined ? '' : (row[position] ?? '').trim();
  };

  const vins = body.map((row) => at(row, 'vin').toUpperCase().replace(/\s/g, ''));
  const [existing, branches, brands] = await Promise.all([
    db.vehicle.findMany({
      where: { dealerId, vin: { in: vins.filter((vin) => vin !== '') } },
      select: { vin: true },
    }),
    db.branch.findMany({ where: { dealerId, active: true }, select: { name: true } }),
    /** **والماركةُ تُطابَق بالكتالوج لا تُكتب حرّةً** — وإلّا دخل «تويتا». */
    db.brand.findMany({
      where: { visible: true },
      select: {
        nameAr: true,
        nameEn: true,
        models: {
          select: {
            nameAr: true,
            nameEn: true,
            /** **والفئةُ تُفحص في المعاينة أيضًا** — انظر التعليق أدناه. */
            trims: { where: { visible: true }, select: { nameAr: true, nameEn: true } },
          },
        },
      },
    }),
  ]);

  const known = new Set(existing.map((vehicle) => vehicle.vin));
  const branchNames = new Set(branches.map((branch) => branch.name));
  /**
   * ═══ والمعاينةُ تفحص ما يفحصه الكاتب — الفئةَ معهما ═══
   *
   * **وُجد بالمشي**: صفٌّ بفئةٍ ليست من الطراز كان يُعرض «سليمًا» ثمّ
   * يُترَك عند الاستيراد. فالمعاينةُ تَعِد بما لا يقع، وهو عينُ ما
   * وُضعت المعاينةُ لتمنعه.
   */
  const catalogue = new Map<string, Map<string, Set<string>>>();
  for (const brand of brands) {
    const models = new Map<string, Set<string>>();
    for (const model of brand.models) {
      const trims = new Set<string>();
      for (const trim of model.trims) {
        trims.add(trim.nameAr.trim().toLowerCase());
        trims.add(trim.nameEn.trim().toLowerCase());
      }
      models.set(model.nameAr.trim().toLowerCase(), trims);
      models.set(model.nameEn.trim().toLowerCase(), trims);
    }
    catalogue.set(brand.nameAr.trim().toLowerCase(), models);
    catalogue.set(brand.nameEn.trim().toLowerCase(), models);
  }

  const rows: ImportRow[] = body.map((row, position) => {
    const vin = vins[position] ?? '';
    /** **ورقمُ السطر رقمُه في الملفّ** — فمن يفتحه يجده حيث قلنا. */
    const line = position + 2;
    const branch = at(row, 'branch');
    const price = Number(at(row, 'price').replace(/[^\d.]/g, ''));
    const year = Number(at(row, 'year').replace(/[^\d]/g, ''));

    if (vin === '' || !isValidVinFormat(vin)) {
      return {
        line,
        vin,
        severity: 'ERROR' as const,
        note: { code: 'VIN_INVALID' as const, column: 'vin' as const },
        existing: false,
      };
    }
    if (branch !== '' && !branchNames.has(branch)) {
      return {
        line,
        vin,
        severity: 'ERROR' as const,
        note: { code: 'BRANCH_UNKNOWN' as const, column: 'branch' as const, value: branch },
        existing: known.has(vin),
      };
    }
    if (at(row, 'year') !== '' && (year < MIN_YEAR || year > now.getUTCFullYear() + 1)) {
      return {
        line,
        vin,
        severity: 'ERROR' as const,
        note: { code: 'YEAR_OUT_OF_RANGE' as const, column: 'year' as const, value: at(row, 'year') },
        existing: known.has(vin),
      };
    }
    const brandCell = at(row, 'brand');
    const modelCell = at(row, 'model');
    if (!known.has(vin)) {
      /**
       * **والماركةُ والطرازُ مطلوبان للجديد لا للمحدَّث**: الموجودةُ
       * لها ماركتُها، والجديدةُ بلا طرازٍ لا يمكن إنشاؤها أصلًا
       * (`Vehicle.modelId` مطلوب) — فيُقال ذلك بسطره وعموده.
       */
      const models = catalogue.get(brandCell.trim().toLowerCase());
      if (brandCell === '' || models === undefined) {
        return {
          line,
          vin,
          severity: 'ERROR' as const,
          note:
            brandCell === ''
              ? ({ code: 'BRAND_REQUIRED' as const, column: 'brand' as const })
              : ({ code: 'BRAND_UNKNOWN' as const, column: 'brand' as const, value: brandCell }),
          existing: false,
        };
      }
      const trims = models.get(modelCell.trim().toLowerCase());
      if (modelCell === '' || trims === undefined) {
        return {
          line,
          vin,
          severity: 'ERROR' as const,
          note:
            modelCell === ''
              ? ({ code: 'MODEL_REQUIRED' as const, column: 'model' as const })
              : ({ code: 'MODEL_UNKNOWN' as const, column: 'model' as const, value: modelCell }),
          existing: false,
        };
      }

      const trimCell = at(row, 'trim');
      if (trimCell === '' || !trims.has(trimCell.trim().toLowerCase())) {
        return {
          line,
          vin,
          severity: 'ERROR' as const,
          note:
            trimCell === ''
              ? ({ code: 'TRIM_REQUIRED' as const, column: 'trim' as const })
              : ({ code: 'TRIM_UNKNOWN' as const, column: 'trim' as const, value: trimCell }),
          existing: false,
        };
      }
    }

    if (known.has(vin)) {
      return {
        line,
        vin,
        severity: 'INFO' as const,
        note: { code: 'ALREADY_EXISTS' as const },
        existing: true,
      };
    }
    if (at(row, 'price') !== '' && (!Number.isFinite(price) || price <= 0)) {
      return {
        line,
        vin,
        severity: 'WARNING' as const,
        note: { code: 'PRICE_ZERO' as const, column: 'price' as const },
        existing: false,
      };
    }
    return { line, vin, severity: null, note: null, existing: false };
  });

  return {
    rows,
    totals: {
      lines: rows.length,
      ready: rows.filter((row) => row.severity !== 'ERROR').length,
      needsReview: rows.filter((row) => row.severity === 'ERROR' || row.severity === 'WARNING').length,
      duplicates: rows.filter((row) => row.existing).length,
    },
    ignoredColumns: ignored,
    missingColumn: null,
  };
}

export type ImportResult = {
  created: number;
  updated: number;
  skipped: { line: number; vin: string; note: ImportNote }[];
};

/**
 * **والكتابةُ تمرّ بالمعاينة نفسِها** — فما عُرض هو ما يقع.
 *
 * **وكلُّ صفّ يُكتب على حدة**: `createMany` واحدة تكتب أربعين بخطأ
 * سطر وتتخطّى التحقّق، و`AuditLog` لا يُكتب لأحد — فيبقى أربعون صفًّا
 * بلا من أدخلها.
 */
export async function runImport(input: {
  dealerId: string;
  actorId: string;
  text: string;
  branchId: string | null;
  /** مدينةُ المعرض — `Vehicle.city` مطلوب، ولا عمودَ له في الترميز. */
  city: string;
}): Promise<ImportResult> {
  const preview = await previewImport(input.dealerId, input.text);
  const result: ImportResult = { created: 0, updated: 0, skipped: [] };

  const table = parseCsv(input.text);
  const header = table[0] ?? [];
  const position = (key: ImportColumn): number =>
    header.findIndex((cell) => importColumnOf(cell) === key);

  const columns = {
    brand: position('brand'),
    model: position('model'),
    trim: position('trim'),
    year: position('year'),
    mileage: position('mileage'),
    price: position('price'),
    colour: position('colour'),
    branch: position('branch'),
  };

  const branches = await db.branch.findMany({
    where: { dealerId: input.dealerId, active: true },
    select: { id: true, name: true },
  });

  for (const row of preview.rows) {
    if (row.severity === 'ERROR') {
      result.skipped.push({ line: row.line, vin: row.vin, note: row.note ?? { code: 'CATALOGUE_MISMATCH' } });
      continue;
    }

    const cells = table[row.line - 1] ?? [];
    const read = (at: number): string => (at < 0 ? '' : (cells[at] ?? '').trim());
    const branchName = read(columns.branch);
    const branchId =
      branchName === ''
        ? input.branchId
        : (branches.find((branch) => branch.name === branchName)?.id ?? input.branchId);

    const price = Number(read(columns.price).replace(/[^\d.]/g, ''));
    const mileage = Number(read(columns.mileage).replace(/[^\d]/g, ''));
    const year = Number(read(columns.year).replace(/[^\d]/g, ''));

    const data = {
      ...(Number.isFinite(mileage) && mileage > 0 ? { mileageKm: mileage } : {}),
      ...(read(columns.colour) === '' ? {} : { colorExterior: read(columns.colour) }),
      ...(branchId === null ? {} : { branchId }),
    };

    if (row.existing) {
      await db.vehicle.updateMany({
        where: { dealerId: input.dealerId, vin: row.vin },
        data,
      });
      result.updated += 1;
    } else {
      const brandCell = read(columns.brand);
      const modelCell = read(columns.model);
      const brand = await db.brand.findFirst({
        where: {
          visible: true,
          OR: [{ nameAr: brandCell }, { nameEn: { equals: brandCell, mode: 'insensitive' } }],
        },
        select: { id: true, nameAr: true },
      });
      const model =
        brand === null
          ? null
          : await db.model.findFirst({
              where: {
                brandId: brand.id,
                OR: [{ nameAr: modelCell }, { nameEn: { equals: modelCell, mode: 'insensitive' } }],
              },
              select: { id: true, nameAr: true },
            });

      if (brand === null || model === null) {
        result.skipped.push({
          line: row.line,
          vin: row.vin,
          note: { code: 'CATALOGUE_MISMATCH' as const },
        });
        continue;
      }

      /**
       * **والسنةُ من العمود، وإلّا من الرقم التسلسليّ.** `decodeYear`
       * تقرؤها من الخانة العاشرة — فصفٌّ بلا عمود سنةٍ يُستورَد.
       * و`null` من كليهما تُترك بسببها لا تُخمَّن: سنةٌ مخمَّنة في
       * مركبةٍ تُعرض للبيع تُقرأ حقيقةً.
       */
      const resolvedYear = Number.isFinite(year) && year > 0 ? year : decodeYear(row.vin);
      if (resolvedYear === null) {
        result.skipped.push({
          line: row.line,
          vin: row.vin,
          note: { code: 'YEAR_UNRESOLVED' as const, column: 'year' as const },
        });
        continue;
      }

      /**
       * ═══ والمواصفةُ من الفئة — وهذا معنى «تُجلب من الكتالوج» ═══
       *
       * `Vehicle` يفرض نوعَ الهيكل وناقلَ الحركة والوقودَ والدفعَ
       * والمقاعد، **ولا يحمل الرقمُ التسلسليُّ شيئًا منها**. والفئةُ
       * في الكتالوج تحملها كلَّها — وترميزُ `D3` يرسم عمود `Trim`.
       *
       * **وبلا فئةٍ لا يُخترع شيء**: مركبةٌ تدخل بناقلٍ أوتوماتيكيّ
       * «افتراضًا» تُعرض للبيع بمواصفةٍ لم يقلها أحد.
       */
      const trimCell = read(columns.trim);
      const trim = await db.trim.findFirst({
        where: {
          modelId: model.id,
          visible: true,
          ...(trimCell === ''
            ? {}
            : { OR: [{ nameAr: trimCell }, { nameEn: { equals: trimCell, mode: 'insensitive' } }] }),
        },
        orderBy: { nameAr: 'asc' },
        select: {
          id: true, nameAr: true, bodyType: true, transmission: true,
          fuel: true, drivetrain: true, seats: true,
        },
      });

      if (trim === null) {
        result.skipped.push({
          line: row.line,
          vin: row.vin,
          note:
            trimCell === ''
              ? ({ code: 'TRIM_REQUIRED' as const, column: 'trim' as const })
              : ({ code: 'TRIM_UNKNOWN' as const, column: 'trim' as const, value: trimCell }),
        });
        continue;
      }

      await db.vehicle.create({
        data: {
          ownerId: input.actorId,
          dealerId: input.dealerId,
          ...(branchId === null ? {} : { branchId }),
          vin: row.vin,
          brandId: brand.id,
          modelId: model.id,
          trimId: trim.id,
          brandName: brand.nameAr,
          modelName: model.nameAr,
          trimName: trim.nameAr,
          year: resolvedYear,
          bodyType: trim.bodyType,
          transmission: trim.transmission,
          fuel: trim.fuel,
          drivetrain: trim.drivetrain,
          seats: trim.seats,
          /** **والمستورَدُ مستعمَل** — ومعرضٌ يبيع جديدًا يصحّحه من المخزون. */
          condition: 'USED',
          /**
           * **والمواصفةُ الإقليمية `SAUDI` افتراضًا** — وهي الأغلب في
           * مخزون معارض المملكة، ولا عمودَ لها في ترميز `D3`. ومعرضٌ
           * يستورد خليجيًّا يصحّحها من المخزون.
           */
          spec: 'SAUDI',
          /** **ومدخلُها الاستيراد لا الفكّ**: الرقمُ لم يُفكّ، والصفّ قاله. */
          entryMode: 'MANUAL',
          mileageKm: Number.isFinite(mileage) && mileage > 0 ? mileage : 0,
          colorExterior: read(columns.colour) === '' ? COLOUR_UNSPECIFIED : read(columns.colour),
          city: input.city,
        },
      });
      result.created += 1;
    }

    await db.auditLog.create({
      data: {
        actorId: input.actorId,
        actorType: 'user',
        action: 'dealer.vehicle.import',
        entity: 'vehicle',
        entityId: row.vin,
        after: { price: Number.isFinite(price) ? price : null, year: Number.isFinite(year) ? year : null },
      },
    });
  }

  return result;
}

