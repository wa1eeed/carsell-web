import type { LegalVersionStatus } from '@/generated/prisma/client';
import type { LegalSurface } from '@/lib/domain/legal';

/**
 * تسمياتُ النسخ والأسطح — **بتعهّدٍ يفحصه المُصرِّف** (البوابة ٥٩).
 *
 * فقيمةُ تعدادٍ تُضاف ولا تُسمّى تُعرض خامّةً أو لا تُعرض: الفهرسةُ
 * بنصٍّ تُعيد `undefined` بلا شكوى، ويخرج صفٌّ بلا صنف.
 */
export const LEGAL_VERSION_STATUS = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشور',
  SUPERSEDED: 'نسخة سابقة',
} as const satisfies Record<LegalVersionStatus, string>;

/**
 * ═══ «يظهر في» — وسطحان مشتقّان لا قائمةٌ تُكتب ═══
 *
 * الترميز يكتب في العمود «التسجيل · الإعدادات» و«قبل أوّل مزايدة»
 * و«صفحة الطلب». **وحقلٌ يكتبه المشغّل بيده يكذب أوّلَ تغييرٍ في
 * الشيفرة** — يقول «قبل أوّل مزايدة» ولا شيء يعرضه هناك.
 *
 * فالمعروضُ هنا ما يمكن إثباتُه: `SIGNUP` من `requiredAtSignup` وهو
 * الحقلُ الذي يقرؤه التسجيل نفسُه، و`LEGAL` من `active` إذ كلُّ مستندٍ
 * سارٍ يبلغه الزائر من التذييل ومن شريط الصفحات القانونية.
 */
export const LEGAL_SURFACE = {
  SIGNUP: 'التسجيل',
  LEGAL: 'الصفحات القانونية',
} as const satisfies Record<LegalSurface, string>;
