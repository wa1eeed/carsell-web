import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { profileCompletion } from '@/lib/domain/profile';
import { setEmail, setIban, verifyIdentity } from '@/lib/domain/profile-edit';

export const runtime = 'nodejs';

/**
 * `PATCH /api/v1/me/profile` — إكمال الملف: بريدٌ أو هويةٌ أو آيبان.
 *
 * **ولم يكن له وجود.** الشاشة تشترط الثلاثة والحارس يمنع دونها، ولا
 * مسار يكتب أيًّا منها — فكل حسابٍ ممنوع من كل معاملة إلى الأبد.
 */
const Body = z.discriminatedUnion('field', [
  z.object({ field: z.literal('email'), email: z.string().min(3).max(254) }),
  z.object({ field: z.literal('iban'), iban: z.string().min(10).max(40) }),
  z.object({
    field: z.literal('identity'),
    nationalId: z.string().min(5).max(20),
    fullName: z.string().min(1).max(120),
  }),
]);

const MESSAGES: Record<string, { ar: string; en: string }> = {
  INVALID: { ar: 'البريد غير صحيح.', en: 'That email is not valid.' },
  TAKEN: { ar: 'هذا البريد مستعمل في حساب آخر.', en: 'That email is already in use.' },
  INVALID_FORMAT: { ar: 'الآيبان ٢٤ خانة تبدأ بـSA.', en: 'A Saudi IBAN is 24 characters starting with SA.' },
  NOT_SAUDI: { ar: 'الآيبان يجب أن يكون سعوديًّا (SA).', en: 'The IBAN must be Saudi (SA).' },
  CHECKSUM: { ar: 'الآيبان غير صحيح — راجع الخانات.', en: 'The IBAN checksum does not match.' },
  INVALID_ID: { ar: 'رقم الهوية ١٠ خانات تبدأ بـ١ أو ٢.', en: 'A national ID is 10 digits starting with 1 or 2.' },
  NAME_REQUIRED: { ar: 'اكتب الاسم كما في الهوية.', en: 'Enter your name as printed on the ID.' },
  ALREADY_VERIFIED: { ar: 'هويتك موثّقة بالفعل.', en: 'Your identity is already verified.' },
};

export async function PATCH(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ field: 'INVALID' }), 422);

  const input = parsed.data;
  const result =
    input.field === 'email'
      ? await setEmail(user.id, input.email)
      : input.field === 'iban'
        ? await setIban(user.id, input.iban)
        : await verifyIdentity(user.id, {
            nationalId: input.nationalId,
            fullName: input.fullName,
          });

  if (!result.ok) {
    const text = MESSAGES[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: text?.ar ?? 'تعذّر الحفظ.',
        messageEn: text?.en ?? 'Could not save.',
      },
      422,
    );
  }

  /**
   * تُعاد حال الاكتمال بعد الحفظ — فتعرف الشاشة أن الحظر رُفع بلا
   * تحميلٍ ثانٍ، وتقول للمستخدم ما صار يستطيعه الآن.
   */
  const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  return ok(profileCompletion(fresh));
}
