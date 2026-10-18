import { SaudiLicensePlate } from './SaudiLicensePlate';
import { lettersToLatin, normalizeArabicLetters, normalizePlateNumbers } from '@/lib/plate';
import type { PlateSize } from './types';

/**
 * ═══ لوحةُ مركبةٍ في كارز ═══
 *
 * غلافٌ على مكوّن المواصفة: كارز تخزّن `plateLetters` و`plateNumbers`
 * وحدهما — لا نوعًا ولا إصدارًا — فتُرسم **الخصوصيّة الطويلة** دائمًا،
 * وهي لوحةُ أكثر ما يُباع هنا.
 *
 * **والحروفُ اللاتينية تُشتقّ ولا تُخزَّن**: خريطةُ اللوحة ليست نقحرةً
 * لغوية (ص→X، م→Z، ع→E)، فحقلٌ ثانٍ يُكتب بيدٍ يختلف عن أخيه أوّل
 * خطأٍ مطبعيّ. والمصدرُ واحد.
 *
 * **ويُطبَّع ما يُعرض**: البياناتُ القديمة فيها «أ» و«ي» وأرقامٌ عربية،
 * والخريطةُ تردّها إلى الشكل المعتمد — فلا تُرسم لوحةٌ بحرفٍ ليس على
 * لوحات المرور.
 *
 * و`null` حين لا لوحة: مركبةٌ بلا لوحةٍ مسجّلة حالٌ قائمة (مركبةٌ في
 * المعرض لم تُسجَّل بعد)، ورسمُ لوحةٍ فارغة يقول ما ليس بصحيح.
 *
 * ═══ إلّا في الإدخال — و`blank` هي الفرق ═══
 *
 * **والفرقُ بين عرضٍ وإدخال**: لوحةٌ فارغةٌ في إعلانٍ **دعوى** («هذه
 * سيارةٌ بلوحةٍ بيضاء»)، ولوحةٌ فارغةٌ في استمارة **لوحُ رسم** — يُكتب
 * عليها حرفًا حرفًا ورقمًا رقمًا وصاحبُها يختار. فمن طلبها صريحًا
 * يطلبها، ولا تُرسم بالصدفة في موضع عرض. (طلب المالك ٢٠٢٦-١٠-١٨.)
 */
export function LicensePlate({
  letters,
  numbers,
  size = 'card',
  className,
  blank = false,
}: {
  letters: string | null;
  numbers: string | null;
  size?: PlateSize;
  className?: string;
  /** استمارةُ إدخال: تُرسم الصفيحةُ ولو خلت، ويُكتب عليها ما يُختار. */
  blank?: boolean;
}) {
  const arabic = normalizeArabicLetters(letters ?? '');
  const western = normalizePlateNumbers(numbers ?? '');
  if (!blank && (arabic === '' || western === '')) return null;

  return (
    <SaudiLicensePlate
      plateType="private"
      plateFormat="long"
      arabicLetters={arabic}
      latinLetters={lettersToLatin(arabic)}
      plateNumbers={western}
      emblem="palm-swords-black"
      size={size}
      {...(className === undefined ? {} : { className })}
    />
  );
}
