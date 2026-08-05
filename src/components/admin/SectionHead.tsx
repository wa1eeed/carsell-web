/**
 * ترويسة قسم — **عنوانٌ وملاحظةٌ وخطٌّ يمتدّ**.
 *
 * مقيسةٌ من الترميز: فجوة ١٢px · هامشٌ علويّ ٢٦px وسفليّ ١٤px. وكان
 * العلويّ ٣٦px — أوسعَ ممّا يفصل، فتبدو الأقسام مبعثرةً لا متتابعة.
 *
 * وكانت مكتوبةً في ملفّين (التشغيلية والمالية) — والنسخة الثانية لا
 * تُنتج فرقًا يوم كُتبت.
 */
export function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="mt-6.5 mb-3.5 flex items-baseline gap-3">
      <h2 className="text-md font-bold">{title}</h2>
      <span className="text-2xs opacity-45">{note}</span>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}
