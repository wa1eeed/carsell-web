import { hash, verify } from '@node-rs/argon2';

/**
 * تجزئة كلمة مرور الأدمن — **Argon2id**.
 *
 * لماذا Argon2id لا bcrypt ولا `crypto.scrypt` من المكتبة القياسية:
 *   · توصية OWASP الأولى، ويقاوم GPU/ASIC أفضل من scrypt بكلفة مكافئة.
 *   · نموذج التهديد هنا حساب يفرج عن ضمان ويطّلع على هويات — يستحق
 *     أقوى اشتقاق متاح.
 *   · `@node-rs/argon2` يشحن ثنائيات جاهزة لـ`linux-x64-musl` و
 *     `linux-arm64-musl`، فصورة `node:22-alpine` لا تحتاج node-gyp —
 *     وهذه كانت الحجّة العملية الوحيدة ضد Argon2 في Node.
 *
 * المعاملات من توصية OWASP لـArgon2id: 19 MiB ذاكرة، تكرارتان،
 * تفرّع واحد.
 */

const OPTIONS = {
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/**
 * يعيد `false` على أي بصمة فاسدة أو فارغة بدل أن يرمي.
 *
 * البصمة الفارغة حالة مقصودة: الترحيل يمنحها للحسابات القائمة
 * قبل إضافة كلمات المرور، فتصير غير قابلة للدخول حتى يعيد
 * `SUPER_ADMIN` تعيينها.
 */
export async function verifyPassword(
  plain: string,
  hashed: string,
): Promise<boolean> {
  if (hashed === '') return false;
  try {
    return await verify(hashed, plain, OPTIONS);
  } catch {
    return false;
  }
}
