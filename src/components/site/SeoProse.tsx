/**
 * ═══ فقرةُ النصّ التحريريّ — القرار ٢٦ ═══
 *
 * **ومكوّنٌ واحد لأنّ الصفحتين توأم**: مدينة × ماركة، ومدينة × ماركة ×
 * طراز. ونسخةٌ في كلٍّ منهما تتباعد في المسافة أو العرض أو الحبر، فلا
 * يُلاحظ أحدٌ حتى تُقارَن الصفحتان جنبًا إلى جنب.
 *
 * **والفصلُ بالخطوط لا بالظلال**: فقرةُ الخاتمة تحت الشبكة تحتاج حدًّا
 * يفصلها عمّا فوقها، والمقدّمةُ تحت العنوان لا تحتاجه.
 *
 * **والأرقامُ داخل الجملة نصٌّ لا عناصر**، فلا يبلغها `ArabicNumber`
 * ولا `font-num`: تُصاغ بـ`formatNumber` في `landingSeoValues` قبل
 * أن تُدخَل القالب — وهو مسلك رسائل الـToast نفسه.
 *
 * **وما لا نصَّ له لا يُصيَّر**: فقرةٌ فارغة تحت العنوان تفتح فجوةً
 * بلا سبب، و`renderSeo` تعيد فراغًا متى نقصت قيمةُ متغيّر.
 */
export function SeoProse({
  text,
  variant = 'intro',
}: {
  text: string | null;
  variant?: 'intro' | 'outro';
}) {
  if (text === null || text === '') return null;

  return (
    <p
      className={
        variant === 'intro'
          ? 'mb-7 max-w-3xl text-sm leading-loose opacity-75'
          : 'mt-9 max-w-3xl border-t border-line pt-6 text-sm leading-loose opacity-70'
      }
    >
      {text}
    </p>
  );
}
