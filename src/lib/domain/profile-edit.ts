import { db } from '@/lib/db';
import { APP_ENV } from '@/lib/env';
import { recordTrialVerification, submitIdentity } from './identity-state';
import { toLatinDigits } from '@/lib/arabic';
import { encryptSecret } from '@/lib/crypto/secrets';
/**
 * **والفحصُ من وحدة الآيبان** — ويُعاد تصديرُه هنا لأن نداءاتِه
 * التاريخية تقرؤه من هذا المسار، ونقلُه بلا تصديرٍ يكسرها بلا داعٍ.
 */
import { checkIban, type IbanFailure } from './iban';

export { checkIban, normalizeIban } from './iban';
export type { IbanFailure } from './iban';

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

const SAUDI_ID_LENGTH = 10;

export type EmailFailure = 'INVALID' | 'TAKEN';
export type IdFailure = 'INVALID_ID' | 'NAME_REQUIRED' | 'ALREADY_VERIFIED';

export type SaveResult<F> = { ok: true } | { ok: false; reason: F };

/**
 * الأرقام العربية-الهندية تُلصق كما هي — والتخزين لاتينيّ.
 * والتحويل بـ`toLatinDigits` القائمة لا بنسخةٍ ثانية منها: نسختان
 * تتباعدان أوّل تغيير، وهذه تعرف الفارسية وفواصل الآلاف أيضًا.
 */
export function normalizeDigits(raw: string): string {
  return toLatinDigits(raw).replace(/\D/g, '');
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

  /**
   * ═══ والتوثيق الذاتيّ لا يصل الإنتاج ═══
   *
   * **كان بلا حدّ بيئة**: من يكتب رقمًا سليم البنية يُوثَّق حسابه
   * فورًا — ويمرّ حارسَ الشراء، **ويُنقل باسمه ملكيةُ مركبة**. فهو
   * بابُ احتيالٍ ومخالفةُ «اعرف عميلك» معًا، ولا يصلح إلّا ريثما
   * يُربط نفاذ.
   *
   * فالتطوير وstaging يُوثِّقان ذاتيًّا (وإلّا فحسابٌ لا يشتري ولا
   * يبيع أبدًا، ولا تُجرَّب رحلة)، و**الإنتاج يُقدِّم إلى المراجعة**:
   * `PENDING` يصل طابور A18، ويمرّ عليه إنسان.
   *
   * وهو **فتحٌ للباب لا إغلاقه**: المستخدم يقدّم كما كان، والفرق أن
   * جوابه ينتظر بدل أن يُمنح. ويوم يُربط نفاذ تصير
   * `submitIdentity('nafath')` في البيئات كلّها.
   *
   * **والحدّ `APP_ENV` لا `NODE_ENV`**: الثاني `production` في
   * staging أيضًا، فالحراسة به تُغلق بابَ التجريب على بيئة التجريب.
   */
  const encrypted = encryptSecret(digits);

  if (APP_ENV === 'production') {
    await submitIdentity(db, userId, 'manual', { name, nationalIdEncrypted: encrypted }, now);
  } else {
    await recordTrialVerification(
      db,
      userId,
      // الرقم نفسه مشفَّر — يُقارن ولا يُعرض
      { name, nationalIdEncrypted: encrypted },
      now,
    );
  }

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
