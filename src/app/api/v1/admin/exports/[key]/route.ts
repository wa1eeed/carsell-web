import type { NextRequest } from 'next/server';
import { ERRORS, fail } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { runReport } from '@/lib/domain/admin-reports-export';
import { REPORTS } from '@/lib/domain/report-catalog';

export const runtime = 'nodejs';
// التقرير يُقرأ لحظة طلبه — ولا يُخزَّن ردٌّ يحمل بيانات
export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/admin/exports/{key}` — تنزيل تقرير بصيغة CSV (A36).
 *
 * **وليس تحت `reports/`**: هناك `reports/[ref]` لطابور البلاغات، وNext
 * يرفض اسمَي مقطعٍ مختلفين في المستوى نفسه — فيسقط تحميل كل المسارات
 * برسالةٍ لا تذكر أيّ ملفٍّ سبّبها.
 *
 * ═══ والصلاحية صلاحية التقرير نفسه ═══
 *
 * لكل تقرير صلاحيتُه في الكتالوج: المالية للمبيعات، و`users.viewIdentity`
 * لتقرير العملاء. **وحارسٌ واحد لكل التقارير** يفتح تقرير العملاء لمن
 * يملك المالية — وهو الملف الذي يخرج من المنصّة ولا يعود.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const definition = REPORTS.find((report) => report.key === key);
  if (definition === undefined) return fail(ERRORS.NOT_FOUND, 404);

  const guard = await requireAdmin(request, definition.permission);
  if (!guard.ok) return guard.response;

  const result = await runReport({ key, adminId: guard.admin.id, ip: guard.ip });
  if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);

  return new Response(result.csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${result.filename}"`,
      // **ولا يُخزَّن**: ملفٌّ يحمل بيانات لا يبقى في ذاكرة وسيط
      'cache-control': 'no-store, private',
      'x-report-rows': String(result.rows),
    },
  });
}
