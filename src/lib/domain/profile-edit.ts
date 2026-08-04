import { db } from '@/lib/db';
import { toLatinDigits } from '@/lib/arabic';
import { encryptSecret } from '@/lib/crypto/secrets';

/**
 * ═══ إكمال الملف — الشرط الذي كان يُفرَض بلا وسيلة لاستيفائه ═══
 *
 * `profileCompletion` تحسب الناقص، والشاشة تعرضه، والحارس يمنع الشراء
 * والبيع حتى يكتمل — **ولم يكن في المنتج كلّه مسارٌ يكتب أيًّا من
 * الثلاثة**. فكل مستخدمٍ مسجَّل ممنوعٌ من كل معاملة إلى الأبد، والشاشة
 * تحيله إلى صفحةٍ ترد ٤٠٤.
 *
 * وشرطٌ يُفرَض بلا بابٍ يُستوفى منه ليس تشديدًا: هو **قفلٌ بلا مفتاح**.
 */

const IBAN_LENGTH = 24;
const SAUDI_ID_LENGTH = 10;

export type EmailFailure = 'INVALID' | 'TAKEN';
export type IbanFailure = 'INVALID_FORMAT' | 'NOT_SAUDI' | 'CHECKSUM';
export type IdFailure = 'INVALID_ID' | 'NAME_REQUIRED' | 'ALREADY_VERIFIED';

export type SaveResult<F> = { ok: true } | { ok: false; reason: F };

/**
 * **يقبل كل صيغة لصق ويطبّعها.** الآيبان يُنسخ من تطبيق المصرف بمسافات
 * كل أربع خانات، ومن يمنع ذلك يظنّ أنه يمنع الخطأ وهو يصنعه.
 */
export function normalizeIban(raw: string): string {
  // علامات الاتّجاه تُلصق مع النصّ من تطبيقات المصارف — تُحذف بهروبها
  return raw.replace(/[\s\u200e\u200f-]/g, '').toUpperCase();
}

/**
 * الأرقام العربية-الهندية تُلصق كما هي — والتخزين لاتينيّ.
 * والتحويل بـ`toLatinDigits` القائمة لا بنسخةٍ ثانية منها: نسختان
 * تتباعدان أوّل تغيير، وهذه تعرف الفارسية وفواصل الآلاف أيضًا.
 */
export function normalizeDigits(raw: string): string {
  return toLatinDigits(raw).replace(/\D/g, '');
}

/**
 * فحص الآيبان السعودي — الطول والبادئة و**خانتا التحقّق (mod-97)**.
 *
 * والأخيرة هي التي تُمسك الخانة المقلوبة: طولٌ صحيح وبادئةٌ صحيحة لا
 * يمنعان رقمًا خاطئًا، والمال يذهب إلى حسابٍ آخر أو يُردّ بعد أسبوع.
 */
export function checkIban(raw: string): { ok: true; value: string } | { ok: false; reason: IbanFailure } {
  const value = normalizeIban(raw);
  if (!/^[A-Z]{2}[0-9A-Z]+$/.test(value)) return { ok: false, reason: 'INVALID_FORMAT' };
  if (!value.startsWith('SA')) return { ok: false, reason: 'NOT_SAUDI' };
  if (value.length !== IBAN_LENGTH) return { ok: false, reason: 'INVALID_FORMAT' };

  // القياسي: أوّل أربعة إلى الآخر، ثم كل حرف رقمان، ثم mod 97 = 1
  const rearranged = value.slice(4) + value.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  if (remainder !== 1) return { ok: false, reason: 'CHECKSUM' };

  return { ok: true, value };
}

export async function setEmail(userId: string, raw: string): Promise<SaveResult<EmailFailure>> {
  const email = raw.trim().toLowerCase();
  // فحصٌ متحفّظ: الغرض إمساك الخطأ المطبعيّ لا استيفاء RFC
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || email.length > 254) {
    return { ok: false, reason: 'INVALID' };
  }

  const taken = await db.user.findFirst({
    where: { email, id: { not: userId } },
    select: { id: true },
  });
  if (taken !== null) return { ok: false, reason: 'TAKEN' };

  await db.user.update({ where: { id: userId }, data: { email } });
  return { ok: true };
}

/**
 * الآيبان **يُخزَّن مشفّرًا** — كما تقول الوثيقة في المخطّط نفسه.
 * وحفظُه خامًا يجعل نسخةً واحدة من القاعدة كشفَ حساباتٍ مصرفية.
 */
export async function setIban(userId: string, raw: string): Promise<SaveResult<IbanFailure>> {
  const checked = checkIban(raw);
  if (!checked.ok) return checked;

  await db.user.update({
    where: { id: userId },
    data: { iban: encryptSecret(checked.value) },
  });
  return { ok: true };
}

export type IdentityInput = { nationalId: string; fullName: string };

/**
 * ═══ توثيق الهوية ═══
 *
 * // DESIGN-Q: التوثيق الحقيقي عبر أبشر/نفاذ غير مربوط بعد. هنا يُقبل
 * الرقم بفحص بنيته (١٠ خانات تبدأ بـ١ للمواطن أو ٢ للمقيم) ويُوثَّق
 * الحساب مباشرةً — **وهذا وضعٌ تجريبيّ صريح**، لا بديلٌ دائم. وحين
 * يُربط نفاذ يصير هذا المسار طلبَ توثيقٍ ينتظر ردّ الجهة.
 *
 * ولم أتركه معطّلًا لأن البديل أسوأ: حسابٌ لا يشتري ولا يبيع أبدًا.
 */
export async function verifyIdentity(
  userId: string,
  input: IdentityInput,
  now: Date = new Date(),
): Promise<SaveResult<IdFailure>> {
  const digits = normalizeDigits(input.nationalId);
  if (digits.length !== SAUDI_ID_LENGTH || !/^[12]/.test(digits)) {
    return { ok: false, reason: 'INVALID_ID' };
  }

  const name = input.fullName.trim();
  // الاسم يُقارن باسم المالك في نقل الملكية — فلا يُقبل حرفًا واحدًا
  if (name.length < 4) return { ok: false, reason: 'NAME_REQUIRED' };

  const user = await db.user.findUnique({ where: { id: userId } });
  if (user === null) return { ok: false, reason: 'INVALID_ID' };
  if (user.idVerified) return { ok: false, reason: 'ALREADY_VERIFIED' };

  await db.user.update({
    where: { id: userId },
    data: {
      name,
      idVerified: true,
      idVerifiedAt: now,
      // الرقم نفسه مشفَّر — يُقارن ولا يُعرض
      nationalIdEncrypted: encryptSecret(digits),
    },
  });

  await db.auditLog.create({
    data: {
      actorId: userId,
      actorType: 'user',
      entity: 'User',
      entityId: userId,
      action: 'identity.verified',
      before: { idVerified: false },
      after: { idVerified: true, method: 'SELF_DECLARED' },
      ip: null,
      createdAt: now,
    },
  });

  return { ok: true };
}
