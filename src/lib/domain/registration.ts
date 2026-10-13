import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

/**
 * ═══ التسجيل — فردٌ أو حساب معرض ═══
 *
 * **ولم يكن تسجيلًا.** الدخول رقمٌ ورمزٌ لمرّة واحدة، ومن دخل أوّل
 * مرّة صار له حسابٌ بلا اسمٍ ولا مدينةٍ ولا كلمة — فيُفتح له «حسابي»
 * على «بلا اسم»، ولا تُرشَّح له نتيجةٌ قريبة، ولا سبيل له إلى الدخول
 * إلّا رمزٌ جديد في كل مرّة.
 *
 * ═══ والرمز يبقى بابًا ═══
 *
 * كلمةُ المرور تُضاف ولا تحلّ محلّه: تسعةٌ وعشرون حسابًا قائمًا لا
 * كلمة لها، وجعلُها شرطًا يُغلق عليها حساباتها. فالرمز للجميع،
 * والكلمة لمن وضعها.
 *
 * ═══ ونوعُ الحساب يُسأل هنا ═══
 *
 * المعرض يُدخل اسمه وبريده لا مدينته: عنوانُه يُستكمل في التهيئة مع
 * سجلّه وآيبانه، وسؤالُه عن مدينةٍ مفردة الآن ثمّ عن عنوانٍ بعد قليل
 * سؤالان عن شيءٍ واحد.
 */

export type RegistrationInput = {
  accountType: 'INDIVIDUAL' | 'BUSINESS';
  /** اسم الشخص للفرد، واسم المعرض للحساب التجاريّ. */
  name: string;
  /** للفرد وحده — والمعرض عنوانُه في التهيئة. */
  city?: string | null;
  /** للمعرض: إلزاميّ. وللفرد: يُكمَّل في الملف. */
  email?: string | null;
  password: string;
};

export type RegistrationResult =
  | { ok: true }
  | { ok: false; reason: 'VALIDATION'; fields: Record<string, string> }
  | { ok: false; reason: 'EMAIL_TAKEN' };

/** أقصر كلمةٍ تُقبل — وثمانٍ هي الحدّ الذي لا يُجادَل فيه. */
export const MIN_PASSWORD = 8;

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** يعيد مفاتيح لا جُملًا — والصياغة في الشاشة (البوابة ١٧). */
export function validateRegistration(input: RegistrationInput): Record<string, string> {
  const fields: Record<string, string> = {};
  const business = input.accountType === 'BUSINESS';

  if (clean(input.name).length < 2) fields.name = 'REQUIRED';

  if (business) {
    const email = clean(input.email);
    if (email === '') fields.email = 'REQUIRED';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fields.email = 'INVALID';
  } else if (clean(input.city) === '') {
    fields.city = 'REQUIRED';
  }

  /**
   * **والطول يُقاس على ما كُتب لا على ما عُرض.** كلمةٌ من مسافاتٍ
   * طولُها ثمانٍ ليست كلمة — فالقياس بعد التشذيب.
   */
  if (clean(input.password).length < MIN_PASSWORD) fields.password = 'SHORT';

  return fields;
}

/**
 * يُكمل حسابًا أُنشئ للتوّ بالرمز — **ولا يُنشئ حسابًا**.
 *
 * فالهاتف يُوثَّق بالرمز قبل أن يُكتب شيء: تسجيلٌ يكتب حسابًا ثمّ
 * يطلب التحقّق يترك صفوفًا لأرقامٍ لا يملكها أحد.
 */
export async function completeRegistration(
  userId: string,
  input: RegistrationInput,
): Promise<RegistrationResult> {
  const fields = validateRegistration(input);
  if (Object.keys(fields).length > 0) return { ok: false, reason: 'VALIDATION', fields };

  const business = input.accountType === 'BUSINESS';
  const email = clean(input.email);

  if (email !== '') {
    const taken = await db.user.findFirst({
      where: { email, NOT: { id: userId } },
      select: { id: true },
    });
    if (taken !== null) return { ok: false, reason: 'EMAIL_TAKEN' };
  }

  await db.user.update({
    where: { id: userId },
    data: {
      accountType: input.accountType,
      // اسمُ المعرض يُكتب في `businessName` **وفي `name`** — فالشاشات
      // تقرأ `name` وحدها، وحسابٌ باسمٍ فارغ يُعرض «بلا اسم»
      name: clean(input.name),
      ...(business ? { businessName: clean(input.name) } : {}),
      ...(business ? {} : { city: clean(input.city) }),
      ...(email === '' ? {} : { email }),
      passwordHash: await hashPassword(clean(input.password)),
    },
  });

  return { ok: true };
}
