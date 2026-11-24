/**
 * ═══ ما يفتح الشراء وما يفتح البيع — **في وحدةٍ بلا Prisma** ═══
 *
 * كانا شرطين مكتوبين داخل `canBuy`/`canSell`، فلا يقرؤهما أحدٌ من
 * خارج. وترميز `Wm` يضع في شاشة الدخول لوحةَ «يُكمل قبل أول شراء أو
 * بيع» تسرد الحقولَ نفسَها — **والسردُ بيدٍ نسخةٌ ثانية** تتباعد أوّلَ
 * تغييرٍ في الحارس، فتَعِد الشاشةُ بغير ما يُفرض.
 *
 * ═══ ولماذا ملفٌّ مستقلّ ═══
 *
 * `AuthForm` مكوّنُ عميل، و`profile.ts` يستورد نوعَ `User` من عميل
 * Prisma المولَّد — **فاستيرادُه منها يجرّ الحزمةَ إلى المتصفّح**،
 * وبوابةُ `checkClientDbImports` أمسكتها فورًا. والقاعدةُ مكتوبةٌ في
 * المستودع: الثوابتُ المشتركة في ملفّها.
 *
 * **والتذكيرُ يسبق لحظة الحاجة**: اكتشافُ «عليك عمل» عند الضغط على
 * «اشترِ» أسوأ توقيتٍ ممكن — المشتري اختار سيارةً وفتح محفظته.
 */
export type MissingField =
  | 'email'
  | 'idVerification'
  | 'iban'
  | 'city'
  | 'bankName'
  | 'taxStatus'
  /** للمنشأة وحدها — السجلّ التجاريّ وعنوانها. */
  | 'crNumber'
  | 'address';

/** ما يمنع الشراء حين ينقص. */
export const BUY_REQUIRES = ['email', 'idVerification'] as const satisfies readonly MissingField[];

/** وما يمنع البيع — الشراءُ وزيادة. */
export const SELL_REQUIRES = [
  ...BUY_REQUIRES,
  'iban',
] as const satisfies readonly MissingField[];
