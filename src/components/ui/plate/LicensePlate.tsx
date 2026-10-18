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
 */
export function LicensePlate({
  letters,
  numbers,
  size = 'card',
  className,
}: {
  letters: string | null;
  numbers: string | null;
  size?: PlateSize;
  className?: string;
}) {
  const arabic = normalizeArabicLetters(letters ?? '');
  const western = normalizePlateNumbers(numbers ?? '');
  if (arabic === '' || western === '') return null;

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
