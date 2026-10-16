import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { displayDigits } from '@/lib/arabic';
import type { Chip } from '@/lib/domain/query-parse';

/**
 * ═══ «فُهم كالتالي» ═══
 *
 * شريط البحث في صدر الرئيسية كان يرسل الجملة ولا أحد يقرؤها، فمن
 * كتب «كامري ٢٠٢٠ مستعملة» وصل إلى كل السيارات. ثمّ صار يُقرأ —
 * **والقراءة وحدها لا تكفي**.
 *
 * محرّكٌ يُخمّن بلا أن يقول ما خمّنه يترك الزائر أمام نتائج لا يعرف
 * لِمَ هي هذه؛ فإن أخطأ التخمين لم يعرف أين يصحّح، وإن أصاب لم
 * يثق. فالشريط يقول ما فُهم شاراتٍ **تُحذف واحدةً واحدة**، وما لم
 * يُفهم يُقال كما كُتب.
 *
 * ═══ وبلا جافاسكربت ═══
 *
 * كل شارةٍ رابطٌ إلى الصفحة نفسها بلا ذلك الفلتر — فالحذف تنقّلٌ لا
 * حالةُ عميل. ويعمل قبل أن تصل الحزمة، ويُفهرَس، ويُشارَك رابطُه.
 */

type Props = {
  text: string;
  chips: readonly Chip[];
  rest: string;
  locale: string;
  /** اسمٌ معروضٌ لكل معرّف — فالشارة تقول «تويوتا» لا `cmx…` */
  names: Readonly<Record<string, string>>;
  /** الرابط بعد حذف هذه الشارة */
  hrefWithout: (chip: Chip) => string;
  /**
   * حقولٌ حذفها الزائر — **فلا تبقى شارتُها معروضة**.
   *
   * وكانت تبقى: يضغط «×» فيُحذف الفلتر فعلًا (تسعُ نتائج بدل ستّ)
   * **والشارة في مكانها** تقول إنه مطبَّق. فالشاشة تَعِد بما لا يقع،
   * وهو الصنف المسجَّل في قواعد هذا المستودع.
   */
  dropped: readonly string[];
};

export async function QueryUnderstanding({
  text,
  chips,
  rest,
  locale,
  names,
  hrefWithout,
  dropped,
}: Props) {
  const t = await getTranslations('search');
  const te = await getTranslations('enums');
  const digits = locale === 'ar' ? displayDigits : (value: string): string => value;

  /** الشارة المشتقّة (`text: ''`) لا تُعرض — الموديل يقول ماركته. */
  const removed = new Set(dropped);
  const shown = chips.filter((chip) => chip.text !== '' && !removed.has(chip.field));
  if (text.trim() === '') return null;

  const label = (chip: Chip): string => {
    switch (chip.field) {
      case 'brandId':
      case 'modelId':
        return names[String(chip.value)] ?? chip.text;
      case 'city':
        return String(chip.value);
      case 'condition':
        return te(`condition.${String(chip.value)}`);
      case 'transmission':
        return te(`transmission.${String(chip.value)}`);
      case 'fuel':
        return te(`fuel.${String(chip.value)}`);
      case 'bodyType':
        return te(`bodyType.${String(chip.value)}`);
      case 'drivetrain':
        return te(`drivetrain.${String(chip.value)}`);
      case 'spec':
        return te(`spec.${String(chip.value)}`);
      case 'type':
        return te(`listingType.${String(chip.value)}`);
      case 'inspected':
        return t('chip.inspected');
      /**
       * **والحدّ يُقال بحدّه لا برقمه وحده.** «٢٠٢٠» لا تقول أمِن
       * هذه السنة أم إليها، و«١٠٠٬٠٠٠» لا تقول أسقفٌ هي أم أرضية —
       * فشارةٌ بالرقم وحده تُقرأ على وجهين.
       */
      case 'yearFrom':
        return t('chip.yearFrom', { year: digits(String(chip.value)) });
      case 'yearTo':
        return t('chip.yearTo', { year: digits(String(chip.value)) });
      case 'priceMin':
        return t('chip.priceMin', { price: digits(chip.value.toLocaleString('en-US')) });
      case 'priceMax':
        return t('chip.priceMax', { price: digits(chip.value.toLocaleString('en-US')) });
    }
  };

  return (
    <section className="mb-5 rounded-xl border border-accent bg-accent-100 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <SearchIcon />
        <p className="min-w-0 flex-1 text-2xs font-semibold text-accent-900">
          <span className="bidi-isolate">«{text}»</span>
        </p>
      </div>

      {shown.length === 0 && chips.length > 0 ? null : shown.length === 0 ? (
        /**
         * **ولا شيء فُهم حالةٌ تُقال صراحةً.** شريطٌ فارغ فوق كل
         * النتائج يُقرأ عطلًا — والزائر يحسب بحثه طُبّق وقد أُهمل.
         */
        <p className="text-2xs leading-loose text-accent-800">{t('understood.none')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="me-1 text-3xs font-medium text-accent-800">{t('understood.as')}</span>
          {shown.map((chip) => (
            <Link
              key={`${chip.field}-${String(chip.value)}`}
              href={hrefWithout(chip)}
              aria-label={t('chip.remove', { what: label(chip) })}
              className="flex items-center gap-1.5 rounded-md bg-bg px-2.5 py-1.5 text-3xs font-semibold transition-opacity hover:opacity-75"
            >
              <span className="bidi-isolate">{label(chip)}</span>
              <CloseIcon />
            </Link>
          ))}
        </div>
      )}

      {rest === '' ? null : (
        <p className="mt-3 border-t border-accent/25 pt-2.5 text-3xs leading-loose text-accent-800">
          {t('understood.rest')} <span className="bidi-isolate font-semibold">{rest}</span>
        </p>
      )}
    </section>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-4 shrink-0 text-accent-800"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden
      className="size-2.5 opacity-50"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
