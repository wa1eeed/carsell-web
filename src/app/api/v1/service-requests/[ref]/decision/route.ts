import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { decideServiceRequest, type DecisionFailure } from '@/lib/domain/service-lifecycle';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/service-requests/{ref}/decision` — إذنُ البائع أو رفضُه.
 *
 * قرار المالك (٢٠٢٦-١٠-١٤): «عند طلبه للفحص **يجب أن يقبل البائع**».
 * فمركبةٌ تُفحص بلا إذن صاحبها تُرسل فاحصًا إلى بابه وتكشف بياناته لمن
 * لم يأذن له.
 *
 * **والحارس هنا لا في الشاشة**: شرطٌ تفرضه الشاشة وحدها اقتراحٌ لا
 * حارس — ونداءٌ مباشر يتجاوزه.
 */
const Body = z.object({
  accept: z.boolean(),
  reason: z.string().max(500).nullable(),
});

const MESSAGES: Record<DecisionFailure, { ar: string; en: string; status: number }> = {
  REQUEST_NOT_FOUND: { ar: 'لم نجد هذا الطلب.', en: 'Request not found.', status: 404 },
  NOT_SELLER: {
    ar: 'صاحب المركبة وحده يقرر.',
    en: 'Only the vehicle owner decides.',
    status: 403,
  },
  NOT_AWAITING: {
    ar: 'هذا الطلب لم يعد ينتظر إذنك.',
    en: 'This request is no longer awaiting your decision.',
    status: 409,
  },
  WINDOW_LAPSED: {
    ar: 'انقضت مهلة الإذن، وسقط الطلب بلا رسوم.',
    en: 'The consent window lapsed and the request was dropped at no charge.',
    status: 409,
  },
  /**
   * **ولا يُكتب العدد في الجملة.** «١٠ أحرف» جمعٌ بيدٍ يُصيب حالةً من
   * ستّ، والعربية تُغيّر الصيغة بالعدد — فتُصاغ الجملة فلا يحكمها
   * عددٌ معدود (البوابة ١٨). والحدّ نفسه تفرضه الشاشة والخادم معًا.
   */
  REASON_REQUIRED: {
    ar: 'اكتب سبب الرفض بجملة يفهمها طالب الفحص.',
    en: 'Write why you declined, in a sentence the requester can act on.',
    status: 422,
  },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const { ref } = await params;
  const result = await decideServiceRequest({
    ref,
    sellerId: user.id,
    accept: parsed.data.accept,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    const message = MESSAGES[result.reason];
    return fail({ code: result.reason, messageAr: message.ar, messageEn: message.en }, message.status);
  }

  return ok({ status: result.status });
}
