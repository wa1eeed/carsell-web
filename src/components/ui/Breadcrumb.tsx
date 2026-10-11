import Link from 'next/link';

/**
 * ═══ مسار التنقّل — ولم يكن في أي شاشة ═══
 *
 * التصميم يضعه في أربع شاشات (القانوني، المزاد، المعرض، تقرير الفحص)
 * ولا واحدة منها تعرضه. وصفحةٌ عميقة بلا مسار تجعل الزائر يخرج
 * بالرجوع لا بالصعود — فمن وصل من بحثٍ خارجيّ إلى مستندٍ قانونيّ لا
 * يعرف أن فوقه قسمًا ولا أن فوقه موقعًا.
 *
 * ═══ والصفحة الأخيرة ليست رابطًا ═══
 *
 * رابطٌ إلى الصفحة التي أنت فيها يُقرأ على أنه وجهة، وقارئ الشاشة
 * يعلنه رابطًا فيُضيع ترتيب القراءة. فالأخير نصٌّ بـ`aria-current`،
 * **ولو مرّر المنادي له `href`**.
 *
 * ═══ والعقدة الوسطى قد تكون بلا صفحة ═══
 *
 * «القانوني» في التصميم ليس له فهرس في المنتج. و`href` اختياريّ
 * لهذا بالضبط: عقدةٌ تُعرض ولا تُنقر أصدق من رابطٍ يردّ ٤٠٤ — وهو
 * الصنف الذي أُصلح في عدّادات الحساب وفي ستّ شاشاتٍ قبله.
 */

export type Crumb = {
  label: string;
  /** غيابه يعني «عقدةٌ بلا صفحة» — تُعرض ولا تُنقر. */
  href?: string;
};

export function Breadcrumb({
  items,
  label,
  className = '',
}: {
  items: readonly Crumb[];
  /**
   * تسمية المِلاحة لقارئ الشاشة — **من المنادي لا مكتوبةً هنا**.
   * المكوّن يُستعمل في اللغتين، ونصٌّ عربيّ ثابت يجعل النسخة
   * الإنجليزية تُعلن بالعربية.
   */
  label: string;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className={className}>
      {/*
        **يلتفّ ولا ينكمش.** عنوانٌ طويل («نيسان باترول بلاتينيوم ٢٠٢٢
        · تقرير الفحص») على شاشة ٣٧٥ يفيض بالعرض — والانكماش يحذف
        المحتوى، فالصفّ الثاني يُبقيه مقروءًا. و`min-w-0` تسمح
        للكلمة الطويلة أن تُكسر بدل أن تدفع الصفّ.
      */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-3xs opacity-50">
        {items.map((item, index) => {
          const last = index === items.length - 1;

          return (
            <li key={`${String(index)}-${item.label}`} className="flex min-w-0 items-center gap-x-2">
              {index === 0 ? null : (
                <span aria-hidden className="opacity-60">
                  ·
                </span>
              )}

              {/*
                **والنصّ معزول اتجاهيًّا.** «تويوتا كامري GLE ٢٠٢٤»
                فيه لاتينيّ وأرقام داخل سياق RTL، وبلا عزلٍ تهاجر
                الـGLE إلى طرف السطر.
              */}
              {last || item.href === undefined ? (
                <span
                  {...(last ? { 'aria-current': 'page' as const } : {})}
                  className="bidi-isolate min-w-0 break-words"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="bidi-isolate min-w-0 break-words hover:underline hover:opacity-100"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
