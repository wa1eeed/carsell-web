import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { profileCompletion } from '@/lib/domain/profile';
import { setEmail, setIban, verifyIdentity } from '@/lib/domain/profile-edit';
import { submitBusinessIdentity } from '@/lib/domain/business-identity';

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
  /**
   * ═══ وفرعُ المنشأة — KYB ═══
   *
   * `commercial_register` قيمةٌ في المخطّط بلا كاتب: كان توثيقُ وكالةٍ
   * يمرّ بمسار الفرد، فلا يُعرَف من الحساب أنه معرضٌ ولا باسم مَن
   * تُصدَر فاتورته. والشخصُ والمنشأة في طلبٍ واحد: قرارٌ واحد على صورةٍ
   * كاملة لا قراران على نصفين.
   *
   * **وzod تحرس الشكل والحجم، والمعنى في النطاق** — فتعود الأخطاء دفعةً.
   */
  /**
   * ═══ وحقولُ الملف البسيطة ═══
   *
   * المدينة والعنوان واسم المصرف — تُكتب كما تُكتب، ولا منطقَ لها غير
   * ألّا تكون فارغة. وفصلُها عن التوثيق مقصود: هذه تُصحَّح متى شاء
   * صاحبُها، وذاك يمرّ بمراجعة.
   */
  z.object({ field: z.literal('city'), city: z.string().max(60) }),
  z.object({ field: z.literal('address'), address: z.string().max(200) }),
  z.object({ field: z.literal('bankName'), bankName: z.string().max(80) }),
  z.object({
    field: z.literal('business'),
    signatoryName: z.string().max(120),
    signatoryNationalId: z.string().max(20),
    businessName: z.string().max(160),
    crNumber: z.string().max(20),
    crExpiresAt: z.string().max(10),
    vatNumber: z.string().max(20).nullable().optional(),
  }),
]);

const MESSAGES: Record<string, { ar: string; en: string }> = {
  INVALID: { ar: 'البريد غير صحيح.', en: 'That email is not valid.' },
  TAKEN: { ar: 'هذا البريد مستعمل في حساب آخر.', en: 'That email is already in use.' },
  INVALID_FORMAT: { ar: 'الآيبان 24 خانة تبدأ بـSA.', en: 'A Saudi IBAN is 24 characters starting with SA.' },
  NOT_SAUDI: { ar: 'الآيبان يجب أن يكون سعوديًّا (SA).', en: 'The IBAN must be Saudi (SA).' },
  CHECKSUM: { ar: 'الآيبان غير صحيح — راجع الخانات.', en: 'The IBAN checksum does not match.' },
  INVALID_ID: { ar: 'رقم الهوية 10 خانات تبدأ بـ1 أو 2.', en: 'A national ID is 10 digits starting with 1 or 2.' },
  USER_NOT_FOUND: { ar: 'الحساب غير موجود.', en: 'Account not found.' },
  NAME_REQUIRED: { ar: 'اكتب الاسم كما في الهوية.', en: 'Enter your name as printed on the ID.' },
  ALREADY_VERIFIED: { ar: 'هويتك موثّقة بالفعل.', en: 'Your identity is already verified.' },
};

export async function PATCH(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ field: 'INVALID' }), 422);

  const input = parsed.data;

  if (input.field === 'city' || input.field === 'address' || input.field === 'bankName') {
    const value = (input.field === 'city'
      ? input.city
      : input.field === 'address'
        ? input.address
        : input.bankName
    ).trim();
    if (value === '') return fail(ERRORS.VALIDATION({ [input.field]: 'REQUIRED' }), 422);

    await db.user.update({ where: { id: user.id }, data: { [input.field]: value } });
    const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    return ok(profileCompletion(saved));
  }

  if (input.field === 'business') {
    const saved = await submitBusinessIdentity(user.id, input);
    if (!saved.ok) {
      if (saved.reason === 'VALIDATION') return fail(ERRORS.VALIDATION(saved.fields), 422);
      const text = MESSAGES[saved.reason];
      return fail(
        {
          code: saved.reason,
          messageAr: text?.ar ?? 'تعذّر الحفظ.',
          messageEn: text?.en ?? 'Could not save.',
        },
        422,
      );
    }
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    return ok(profileCompletion(after));
  }

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
