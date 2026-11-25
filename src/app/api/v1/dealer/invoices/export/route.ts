import { fail, ERRORS } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerInvoices } from '@/lib/domain/dealer-money';
import { toCsv } from '@/lib/csv';

export const runtime = 'nodejs';

/**
 * ═══ التصدير المحاسبيّ — `D7` ═══
 *
 * **وأعمدتُه ما يحتاجه محاسب**: الرقم والتاريخ والطرف والقيم الثلاث
 * وحالُ الإبلاغ. ومن يستوردها إلى دفتره يطابقها بالإقرار، فتُكتب
 * **بالهللات** كما تُطابَق.
 *
 * **والمحاسبُ يصدِّر**: مصفوفةُ `D9` تعطيه المالَ كلَّه.
 */
export async function GET() {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (actor.role === 'SALES') return fail(ERRORS.FORBIDDEN, 403);

  const rows = await dealerInvoices(actor.dealerId, actor.branchId);

  const csv = toCsv(
    ['رقم الفاتورة', 'التاريخ', 'نوع التوريد', 'المركبة', 'الطلب', 'العميل', 'قبل الضريبة', 'الضريبة', 'الإجمالي', 'حال الإبلاغ'],
    rows.map((row) => [
      row.number,
      row.issuedAt,
      row.supply,
      row.vehicle ?? '',
      row.orderRef ?? '',
      row.customerName,
      row.subtotal,
      row.tax,
      row.total,
      row.status,
    ]),
  );

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="dealer-invoices.csv"',
      /** وثيقةٌ ضريبية فيها أسماءُ عملاء — لا تُخزَّن في وسيط. */
      'cache-control': 'no-store',
    },
  });
}
