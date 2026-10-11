import { ArabicNumber } from './ArabicNumber';

/**
 * ═══ سنةُ الصنع — رقمٌ بلا فاصلة ═══
 *
 * `<ArabicNumber value={year} />` تُخرج **«2,026»**: الفاصلة تجعل
 * السنة مبلغًا، فيقرأ المشغّل «ألفين وستة وعشرين ريالًا» في موضع
 * الموديل. ووقع في أربعة مواضع — بطاقة الإعلان وطابور المراجعة
 * وصفحة التفاصيل وجدول المزادات.
 *
 * **والمكوّن يمنع تكرارها**: لا خيار يُنسى، والبوابة ٣٥ تمنع تمرير
 * سنةٍ إلى `ArabicNumber` مباشرةً.
 */
export function Year({ value, className }: { value: number; className?: string }) {
  return <ArabicNumber value={value} grouped={false} className={className} />;
}
