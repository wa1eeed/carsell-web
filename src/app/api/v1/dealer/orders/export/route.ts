import { fail, ERRORS } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { deskOrdersForExport } from '@/lib/domain/dealer-desk';
import { toCsv } from '@/lib/csv';

export const runtime = 'nodejs';

/**
 * ═══ تصديرُ طابور الطلبات — `D6` ═══
 *
 * **وزرُّ «تصدير» في الترميز يبلغ هذا المسار**: زرٌّ لا يناديه أحد
 * هو الصنفُ الذي أُصلح في هذا المستودع مرّاتٍ، فالوجهةُ تُفتح
 * وتُقاس قبل أن يُشحن الزرّ.
 *
 * **والجدولُ مقتطعٌ والتصديرُ لا** — وهو البابُ الذي تَعِد به الجملةُ
 * تحت الجدول: «والتصدير يحمل القائمة كلها». فسقفُه أعلى، وسببُه أنّ
 * ملفًّا يُفتح في Excel لا يُقرأ صفًّا صفًّا.
 *
 * **والمحاسبُ يصدِّر**: مصفوفةُ `D9` تعطيه المالَ كلَّه، والطابورُ
 * مصدرُ أرقامه.
 */
export async function GET() {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const rows = await deskOrdersForExport(actor.dealerId, actor.branchId);

  /**
   * **ولا `reservePrice` ولا `minAcceptPrice` في ملفٍّ يُرسَل** — وهما
   * ليسا في المُجلَب أصلًا: ما لا يدخل الكائن لا يتسرّب منه.
   */
  const csv = toCsv(
    ['المرجع', 'المركبة', 'المشتري', 'المرحلة', 'الحال', 'المبلغ', 'الضمان', 'أنشئ', 'موعد النقل'],
    rows.map((row) => [
      row.ref,
      row.vehicle,
      row.buyerName ?? '',
      row.stage,
      row.status,
      row.amount,
      row.escrow ?? '',
      row.createdAt,
      row.transferAt ?? '',
    ]),
  );

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="dealer-orders.csv"`,
      /** ملفٌّ فيه أسماءُ مشترين — لا يُخزَّن في وسيطٍ ولا في المتصفّح. */
      'cache-control': 'no-store',
    },
  });
}
