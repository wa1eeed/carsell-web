import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { setTaxStatus } from '@/lib/domain/tax-profile';

export const runtime = 'nodejs';

const Body = z.object({
  status: z.enum(['INDIVIDUAL', 'VAT_REGISTERED']),
  /**
   * نصٌّ لا رقم — **والتطبيع في النطاق**.
   *
   * الرقم يُلصق بمسافات وشرطات وأرقام عربية-هندية، و`z.number()` كانت
   * ترفض كل ذلك قبل أن يصل إلى من يعرف كيف يطبّعه. والسقف ٤٠ يتّسع
   * للصيغ المزخرفة ولا يفتح البابَ لنصٍّ طويل.
   */
  vatNumber: z.string().max(40).optional(),
});

/**
 * `PUT /api/v1/account/tax-status` — الوضع الضريبيّ للمستخدم.
 *
 * **يُسأل مرّة عند أوّل إجراء**، ويُعدَّل من الإعدادات بعدها. والمسار
 * واحد للحالتين: لا فرق بين أوّل حفظٍ وتعديلٍ لاحق إلا في من يفتح
 * النافذة.
 *
 * وسبب الرفض يعود مفصَّلًا: من أدخل أربعة عشر رقمًا لا تنفعه رسالةٌ عن
 * النمط، ورسالةٌ واحدة لكل الأخطاء تجعله يعيد المحاولة عشوائيًّا.
 */
export async function PUT(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ status: 'INVALID' }), 422);

  const result = await setTaxStatus(user.id, parsed.data);
  if (!result.ok) return fail(ERRORS.VALIDATION({ vatNumber: result.reason }), 422);

  return ok(result.profile);
}
