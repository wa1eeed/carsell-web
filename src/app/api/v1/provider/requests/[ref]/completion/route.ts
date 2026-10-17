import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { saveCompletion, type SaveCompletionFailure } from '@/lib/domain/service-completion';
import type { CompletionIssueCode } from '@/lib/domain/completion-validate';

export const runtime = 'nodejs';

/**
 * **القيَم نصوصٌ كما كُتبت**، والتطبيع والتحقّق في النطاق: حقلٌ يقبل كل
 * صيغة لصق ويطبّعها، ومن يمنع اللصق يظنّ أنه يمنع الخطأ وهو يصنعه.
 */
const Body = z.object({
  values: z.record(z.string().max(64), z.string().max(2000)),
});

const MESSAGES: Record<SaveCompletionFailure, { ar: string; en: string; status: number }> = {
  REQUEST_NOT_FOUND: { ar: 'لم نجد هذا الطلب.', en: 'Request not found.', status: 404 },
  NO_FORM: {
    ar: 'لا نموذج إنجازٍ لهذا الطلب.',
    en: 'This request has no completion form.',
    status: 404,
  },
  LOCKED: {
    ar: 'أُنهي هذا الطلب، فلا يُعدَّل إثباتُه.',
    en: 'This request is closed; its record cannot be changed.',
    status: 409,
  },
  INVALID: { ar: 'راجِع الحقول المعلَّمة.', en: 'Check the marked fields.', status: 422 },
};

/**
 * `POST /api/v1/provider/requests/{ref}/completion` — حفظُ إثبات الإنجاز.
 *
 * **ولا يُقدّم الحال**: الخطوة تُنادى بعده، و`applyStep` ترفض الإنهاء ما
 * لم يكتمل الإثبات — فالحالة تمرّ بمدخلها الوحيد دائمًا.
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
  const result = await saveCompletion({
    ref: decodeURIComponent(ref),
    providerId: user.providerId,
    values: parsed.data.values,
  });

  if (!result.ok) {
    const message = MESSAGES[result.reason];
    /**
     * **ويُقال أيُّ حقلٍ** لا «راجِع الحقول»: نموذجٌ بسبعة حقول ورسالةٌ
     * عامّة يجعل المزوّد يفحصها واحدًا واحدًا.
     */
    const fields: Record<string, CompletionIssueCode> = {};
    for (const issue of result.issues ?? []) fields[issue.key] = issue.code;

    return fail(
      {
        code: result.reason,
        messageAr: message.ar,
        messageEn: message.en,
        ...(Object.keys(fields).length > 0 ? { fields } : {}),
      },
      message.status,
    );
  }

  return ok({ saved: true });
}
