import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { applyStep, type StepFailure } from '@/lib/domain/provider-queue';

export const runtime = 'nodejs';

const Body = z.object({
  step: z.string().min(1).max(40),
  reason: z.string().max(500).nullable(),
});

const MESSAGES: Record<StepFailure, { ar: string; en: string; status: number }> = {
  REQUEST_NOT_FOUND: { ar: 'لم نجد هذا الطلب.', en: 'Request not found.', status: 404 },
  NOT_YOURS: { ar: 'هذا الطلب ليس لك.', en: 'This request is not yours.', status: 403 },
  /** **وسبقَك غيرُك** حالٌ قائمة لا عطل — فالرسالة تقولها */
  STEP_NOT_ALLOWED: {
    ar: 'تعذّر تنفيذ هذه الخطوة — ربّما تغيّرت حال الطلب أو سبقك مزوّد آخر.',
    en: 'That step is no longer available — the request changed, or another provider took it.',
    status: 409,
  },
  REASON_REQUIRED: {
    ar: 'اكتب سبب التعذّر بجملةٍ يفهمها من يراجعه.',
    en: 'Write why it could not be done, in a sentence a reviewer can act on.',
    status: 422,
  },
  /**
   * **ويُقال ما ينقص لا «تعذّرت».** الخطوةُ مرفوضةٌ لأنّ الإثبات لم
   * يكتمل — والمزوّد لا يعرف ذلك من رسالةٍ عامّة، فيُعيد الضغط.
   */
  FORM_INCOMPLETE: {
    ar: 'أكمل نموذج الإنجاز أوّلًا — لا يُقبل إنهاء الطلب بلا إثبات.',
    en: 'Fill in the completion form first — a request cannot be closed without it.',
    status: 422,
  },
};

/**
 * `POST /api/v1/provider/requests/{ref}/step` — تقديمُ الطلب خطوة.
 *
 * **والحارس هنا لا في الشاشة**: الشاشة تعرض ما تقبله الحال، ونداءٌ
 * مباشر يُنهي طلبًا لم يبدأ أو يقبل طلبَ مزوّدٍ آخر.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await currentProviderUser();
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const { ref } = await params;
  const result = await applyStep({
    ref: decodeURIComponent(ref),
    providerId: user.providerId,
    step: parsed.data.step,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    const message = MESSAGES[result.reason];
    return fail({ code: result.reason, messageAr: message.ar, messageEn: message.en }, message.status);
  }

  return ok({ status: result.status });
}
