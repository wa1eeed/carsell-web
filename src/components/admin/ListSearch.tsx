
/**
 * ═══ بحث القوائم — ولم يكن في المنتج مربّعٌ واحد ═══
 *
 * قِيس: **صفر حقل بحث في تسعٍ وأربعين شاشة**، و«كل الإعلانات» تعرض
 * مئة وسبعة روابط بلا مربّع. فمن يبحث عن مرجعٍ بعينه يقرأ الصفحة
 * بعينه، أو يفتح القاعدة.
 *
 * ═══ ونموذجٌ لا حالةُ عميل ═══
 *
 * `method="get"` يكتب `?q=` في الرابط: فيُشارَك ويُحفظ ويعود بزرّ
 * الرجوع — وحالةٌ في الذاكرة تضيع بأوّل تحديث. ولا JS: يعمل قبل أن
 * تصل الحزمة، وهو ما يحتاجه مشغّلٌ يفتح عشرين تبويبًا.
 *
 * **والمعاملات الأخرى تُحمل معه**: بحثٌ يمسح الشريحة المختارة يُرجع
 * المشغّل إلى «الكل» في كل مرّة.
 */
export function ListSearch({
  action,
  value,
  placeholder,
  keep = {},
}: {
  action: string;
  value: string | null;
  placeholder: string;
  /** ما يبقى من معاملات الرابط — الشريحة وما شابهها. */
  keep?: Record<string, string | null>;
}) {
  return (
    <form method="get" action={action} className="mb-4 flex flex-wrap items-center gap-2.5">
      {Object.entries(keep).map(([name, keptValue]) =>
        keptValue === null || keptValue === '' ? null : (
          <input key={name} type="hidden" name={name} value={keptValue} />
        ),
      )}

      <label className="relative flex min-w-56 flex-1 items-center">
        <span className="pointer-events-none absolute start-3 opacity-40">
          {/* الأيقونة مضمَّنة — ولا وحدة أيقونات في المستودع */}
          <svg
            viewBox="0 0 24 24"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="search"
          name="q"
          defaultValue={value ?? ''}
          placeholder={placeholder}
          className="w-full rounded-md border border-line bg-surface py-2.25 pe-3.5 ps-9 text-2xs"
        />
      </label>

      <button
        type="submit"
        className="rounded-btn border border-line px-4 py-2.25 text-3xs font-bold hover:border-ink"
      >
        ابحث
      </button>

      {/*
        **والمسح زرٌّ لا تفريغُ حقل.** من يفرّغ الحقل ولا يضغط يبقى
        على نتيجةٍ مرشَّحة ويظنّها الكل.
      */}
      {value === null || value === '' ? null : (
        <a
          href={
            Object.entries(keep).filter(([, v]) => v !== null && v !== '').length === 0
              ? action
              : `${action}?${new URLSearchParams(
                  Object.entries(keep).filter((entry): entry is [string, string] =>
                    entry[1] !== null && entry[1] !== '',
                  ),
                ).toString()}`
          }
          className="text-3xs font-bold underline underline-offset-2 opacity-60 hover:opacity-100"
        >
          امسح البحث
        </a>
      )}
    </form>
  );
}
