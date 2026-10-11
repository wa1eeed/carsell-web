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
