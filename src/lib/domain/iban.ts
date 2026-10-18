import { decryptSecret } from '@/lib/crypto/secrets';

/**
 * ═══ الآيبان يُقرأ من مدخلٍ واحد ═══
 *
 * **وقد كان ثلاثةً تقرأ ما لا تفهمه.** العمود يُكتب مشفَّرًا
 * (`profile-edit`)، وثلاثة مواضع كانت تقصّه كنصٍّ صريح:
 *
 *   · شاشة الحساب تعرض للمستخدم آيبانه **`v1._••••w4Ij`**.
 *   · شاشة الطلب تعرض للأدمن **`w4Ij`** على أنها آخر أربع من آيبانه —
 *     وبها يطابق حوالةً بنكية.
 *   · والبذرة تكتبه **صريحًا**، فصار في عمودٍ واحد صيغتان.
 *
 * ولا شيء يشتكي: `slice` على نصٍّ مشفَّر تعيد نصًّا، فالعطل يُعرض
 * رقمًا خاطئًا لا خطأً. والبوابة ٢٩ تمنع عودة الصنف.
 *
 * ═══ والفشل غياب لا خطأ ═══
 *
 * صفٌّ لا يُفكّ (مفتاحٌ دُوِّر، أو قيمةٌ قديمة صريحة) يُقرأ **«لا
 * آيبان»**: والتحويل يتوقّف بأمان ويُطلب من البائع إدخاله، بدل أن
 * يخرج مالٌ إلى أربع خاناتٍ لا يعرفها أحد.
 */

function plain(encrypted: string | null): string | null {
  if (encrypted === null || encrypted === '') return null;
  try {
    const value = decryptSecret(encrypted).replace(/\s/g, '');
    return value.length < 8 ? null : value;
  } catch {
    return null;
  }
}

/**
 * ═══ والفحصُ هنا لا في `profile-edit` ═══
 *
 * كان `checkIban` في `profile-edit.ts`، وهي تستورد `db` — فاستيرادُها
 * **ساكنًا** من البذرة يبني عميل Prisma قبل أن تُحمّل البذرةُ بيئتَها،
 * فيسقط الزرع بـ«DATABASE_URL غير مضبوط» وهو مضبوط. وهذا موضعُه:
 * وحدةُ الآيبان، بلا قاعدةٍ ولا شاشة — تقرؤها البذرةُ والنطاقُ معًا.
 */
export type IbanFailure = 'INVALID_FORMAT' | 'NOT_SAUDI' | 'CHECKSUM';

const IBAN_LENGTH = 24;

/**
 * **يقبل كل صيغة لصق ويطبّعها.** الآيبان يُنسخ من تطبيق المصرف بمسافات
 * كل أربع خانات، ومن يمنع ذلك يظنّ أنه يمنع الخطأ وهو يصنعه.
 */
export function normalizeIban(raw: string): string {
  // علامات الاتّجاه تُلصق مع النصّ من تطبيقات المصارف — تُحذف بهروبها
  return raw.replace(/[\s\u200e\u200f-]/g, '').toUpperCase();
}

/**
 * فحص الآيبان السعودي — الطول والبادئة و**خانتا التحقّق (mod-97)**.
 *
 * والأخيرة هي التي تُمسك الخانة المقلوبة: طولٌ صحيح وبادئةٌ صحيحة لا
 * يمنعان رقمًا خاطئًا، والمال يذهب إلى حسابٍ آخر أو يُردّ بعد أسبوع.
 */
export function checkIban(
  raw: string,
): { ok: true; value: string } | { ok: false; reason: IbanFailure } {
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

/** آخر أربع خانات — وبها تُطابَق الحوالة بكشف البنك. */
export function ibanLast4(encrypted: string | null): string | null {
  const value = plain(encrypted);
  return value === null ? null : value.slice(-4);
}

/**
 * `SA03••••7519` — للعرض على صاحبه.
 *
 * **والأوّل أربعةٌ والأخير أربعة**: الأوّل يقول البلد والبنك فيطمئنّ
 * صاحبه أنه آيبانه هو، والأخير يميّزه عن آيبانٍ ثانٍ في البنك نفسه.
 */
export function ibanMasked(encrypted: string | null): string | null {
  const value = plain(encrypted);
  return value === null ? null : `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
