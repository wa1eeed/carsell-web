import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { cancelInvoice } from '@/lib/domain/tax';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const Body = z.object({ reason: z.string().min(5).max(500) });

/**
 * `POST /api/v1/admin/tax/invoices/{id}/cancel` — إشعارٌ دائن يُلغي فاتورة.
 *
 * **ولم يكن لها باب.** `cancelInvoice` مبنيّةٌ مختبَرة منذ المهمّة ٢١:
 * تُنشئ `CreditNote` بتسلسلها وتُوسم الفاتورة — ولا شيء يناديها.
 * ففاتورةٌ صدرت بخطأ تبقى صادرةً إلى الأبد، والتصحيح الوحيد تعديلُ
 * صفٍّ بيد — وهو ما تمنعه قاعدةُ «الفاتورة مستندٌ لا يُنقَّح».
 *
 * ═══ والسبب إلزاميّ ═══
 *
 * الإشعار الدائن يُقرأ في مراجعةٍ ضريبية بعد سنة، و«أُلغيت» بلا سببٍ
 * مكتوب سؤالٌ بلا جواب. والحدّ خمسة أحرف — لا لأنه كافٍ، بل لأن ما
 * دونه ليس سببًا.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ reason: 'REQUIRED' }), 422);

  const { id } = await params;

  /**
   * **والمفتاح رقمُ الفاتورة لا معرّفها الداخليّ.** الرقم
   * (`INV-2026-000042`) هو ما يُقرأ في الجدول وفي سجلّ التدقيق وفي
   * مراجعةٍ ضريبية — والمعرّف الداخليّ لا يُقال في مكالمة ولا يُكتب
   * في مذكّرة.
   */
  const invoice = await db.taxInvoice.findUnique({
    where: { number: decodeURIComponent(id) },
    select: { id: true },
  });
  if (invoice === null) return fail(ERRORS.NOT_FOUND, 404);

  const result = await cancelInvoice(invoice.id, parsed.data.reason, guard.admin.id);

  if (!result.ok) {
    if (result.reason === 'INVOICE_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    /**
     * **والملغاة سلفًا ٤٠٩ لا ٤٢٢**: ليست مُدخلًا خاطئًا يُصحَّح، بل
     * حالةٌ لا يصحّ الفعل فيها مهما أعاد.
     */
    return fail(
      { code: result.reason, messageAr: 'أُلغيت هذه الفاتورة سلفًا.', messageEn: 'Already cancelled.' },
      result.reason === 'ALREADY_CANCELLED' ? 409 : 422,
    );
  }

  return ok({ creditNoteNumber: result.number });
}
