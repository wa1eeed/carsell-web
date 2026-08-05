import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { extendTransferDeadline } from '@/lib/domain/transfer-windows';

export const runtime = 'nodejs';

const Body = z.object({ reason: z.string().min(10).max(400) });

/**
 * `POST /api/v1/admin/orders/{ref}/extend-transfer` — تمديد سقف النقل
 * مرّة واحدة.
 *
 * **ولم يكن له باب.** `extendTransferDeadline` مبنيّة ومختبَرة بحدّها
 * (مرّة واحدة) وبسببها الإلزاميّ — ولا ينادِيها شيء. فطلبٌ عالق في
 * المرور لسببٍ خارج يدَي الطرفين يمضي إلى الإلغاء التلقائيّ، ولا يملك
 * التشغيلُ ما يوقفه به.
 *
 * ═══ ولا يُفتح للمرّة الثانية ═══
 *
 * تمديدٌ بلا سقفٍ لعدده يجعل القاعدة زينة: كل طلبٍ عالق يُمدَّد حتى
 * يُنسى، ومالُ المشتري محجوزٌ طول ذلك. والنطاق يردّ `ALREADY_EXTENDED`
 * — والشاشة تُخفي الزرّ أصلًا، فلا يُضغط ما يُرفض.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  /**
   * **`orders.changeStage` لا `orders.view`.** التمديد يؤخّر مال
   * المشتري، فهو تصرّفٌ في مسار الطلب لا قراءةٌ له.
   */
  const guard = await requireAdmin(request, 'orders.changeStage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(
      {
        code: 'REASON_REQUIRED',
        messageAr: 'اكتب سببًا للتمديد — يُقرأ بعد سنة.',
        messageEn: 'A reason is required — it will be read a year from now.',
      },
      422,
    );
  }

  const { ref } = await params;
  const result = await extendTransferDeadline(guard.admin, ref, parsed.data.reason, guard.ip);

  if (!result.ok) {
    if (result.reason === 'ORDER_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    if (result.reason === 'REASON_REQUIRED') {
      return fail(
        {
          code: 'REASON_REQUIRED',
          messageAr: 'اكتب سببًا للتمديد — يُقرأ بعد سنة.',
          messageEn: 'A reason is required — it will be read a year from now.',
        },
        422,
      );
    }
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'ALREADY_EXTENDED'
            ? 'مُدّد هذا الطلب مرّة — ولا يُمدَّد ثانية.'
            : 'لا سقف نقلٍ على هذا الطلب.',
        messageEn:
          result.reason === 'ALREADY_EXTENDED'
            ? 'This order was already extended once.'
            : 'This order has no transfer deadline.',
      },
      409,
    );
  }

  return ok(result);
}
