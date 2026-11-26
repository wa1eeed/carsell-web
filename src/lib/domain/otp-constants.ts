/**
 * ═══ ثوابتُ رمز الدخول — بلا `db` ═══
 *
 * **والحدُّ بين الخادم والعميل يمرّ عبر الاستيرادات لا التوجيهات**:
 * `auth.ts` تستورد `db`، فمكوّنُ `'use client'` يستورد منها ثابتًا
 * **يجرّ Prisma إلى حزمة المتصفّح ويُسقط البناء**. وقع مرّتين في هذا
 * المستودع (`CategoryFilter` ومحرّر القوالب)، والبوابةُ تحرسه.
 *
 * فالثوابتُ المشتركة في ملفّها، وتُعاد من `auth.ts` لمن اعتاد موضعَها.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

/**
 * رمزٌ ثابت لأرقام التجربة ولـstaging كلِّها — **معروفٌ عمدًا**.
 *
 * ولا يُرسَل عبر مزوّد، ولا يُستعمل في الإنتاج إلّا لرقمٍ مُدرَجٍ
 * صراحةً في `OTP_TEST_NUMBERS`.
 */
export const OTP_TEST_CODE = '000000';
