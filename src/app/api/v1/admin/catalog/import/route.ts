import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import {
  IMPORT_COLUMNS,
  type ImportColumn,
  commitCatalogImport,
  previewCatalogImport,
} from '@/lib/domain/catalog-import';

export const runtime = 'nodejs';

/**
 * ═══ استيراد الكتالوج (A13) ═══
 *
 * `GET` يُنزّل القالب، و`POST` طوران في مسارٍ واحد: `preview` يقول ما
 * سيقع، و`commit` يُوقعه. **وطورٌ واحد يقرأ الملفّ مرّتين بالقاعدة
 * نفسها** — فما عُرض في المعاينة هو ما يُكتب، ولا تفترق قراءتان.
 *
 * ═══ والحدُّ على الحجم ═══
 *
 * الملفُّ يصل نصًّا في الجسد، والكتالوجُ كلُّه ٣٦٠ فئة — فمِلّيونُ حرفٍ
 * سقفٌ واسع. وبلا سقفٍ يصير المسار بابًا لإغراق الذاكرة.
 */
const MAX_CSV_CHARS = 1_000_000;

/**
 * القالبُ المنزَّل — ترويسةٌ وصفٌّ مثال.
 *
 * **وأعمدتُه من `IMPORT_COLUMNS`** لا مكتوبةً هنا: قالبٌ ينقصه عمودٌ
 * يقرؤه المستورِد يجعل المشغّل يملأ ملفًّا يُرفض نصفُه.
 *
 * وموضعُه المسار لا النطاق: صفُّه المثال عربيٌّ بطبعه («كامري»)،
 * والنطاق لا يكتب عربيًّا.
 */
const EXAMPLE: Record<ImportColumn, string> = {
  brand: 'toyota',
  model_ar: 'كامري',
  model_en: 'Camry',
  trim_ar: 'LE',
  trim_en: 'LE',
  body_type: 'SEDAN',
  transmission: 'AUTOMATIC',
  fuel: 'PETROL',
  drivetrain: 'FWD',
  seats: '5',
  doors: '4',
  year_from: '2018',
  year_to: '2026',
};

function importTemplate(): string {
  const cell = (value: string): string =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = [
    IMPORT_COLUMNS.join(','),
    IMPORT_COLUMNS.map((column) => cell(EXAMPLE[column])).join(','),
  ];
  // BOM — وإلّا قرأ Excel على ويندوز العربيةَ حروفًا مشوّشة
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

const Body = z.object({
  csv: z.string().min(1).max(MAX_CSV_CHARS),
  mode: z.enum(['preview', 'commit']),
});

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  return new Response(importTemplate(), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="carsell-catalog-template.csv"',
      'cache-control': 'no-store',
    },
  });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ csv: 'INVALID' }), 422);

  if (parsed.data.mode === 'preview') {
    return ok(await previewCatalogImport(parsed.data.csv));
  }

  /**
   * **والكتابةُ تحتاج صلاحيةَ كتابة لا قراءةً**. `requireAdmin` تفحص
   * الصلاحية، و`canWrite` تفرّق القارئ من الكاتب — وقارئٌ يستورد ثلاثَ
   * مئة فئة ليس قارئًا.
   */
  const { canWrite } = await import('@/lib/domain/permissions');
  if (!canWrite(guard.admin.role, 'catalog.manage')) return fail(ERRORS.FORBIDDEN, 403);

  return ok(await commitCatalogImport(guard.admin, parsed.data.csv, guard.ip));
}
