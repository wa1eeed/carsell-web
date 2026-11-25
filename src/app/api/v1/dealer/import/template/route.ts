import { fail, ERRORS } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { IMPORT_COLUMN_KEYS } from '@/lib/domain/dealer-import';
import { IMPORT_COLUMN_AR } from '@/lib/labels/dealer';
import { toCsv } from '@/lib/csv';

export const runtime = 'nodejs';

/**
 * ═══ قالبُ الاستيراد ═══
 *
 * **والقالبُ يُولَّد من الأعمدة التي يقرؤها المستورِد** لا يُكتب بيد:
 * عمودٌ يُضاف إلى القارئ ولا يُضاف إلى القالب يجعل من نزّله يرفع
 * ملفًّا ناقصًا — ونسختان تتباعدان كأيّ نسختين.
 */
export async function GET() {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const headers = IMPORT_COLUMN_KEYS.map((key) => IMPORT_COLUMN_AR[key]);
  /** **وصفٌّ واحدٌ مثالًا** — قالبٌ بترويسةٍ وحدها لا يقول أيّ صيغةٍ تُقبل. */
  const example = ['1HGCM82633A004352', 'تويوتا', 'كامري', 'LE', '2022', '48000', '92000', 'أبيض', ''];

  return new Response(toCsv(headers, [example]), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="dealer-import-template.csv"',
    },
  });
}
