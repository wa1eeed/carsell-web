import Link from 'next/link';

/**
 * ٤٠٤ على جذر التطبيق.
 *
 * وهو بلا لغة: قد يصل إليه من لا مسار له أصلًا، فالعربية هي الافتراض.
 *
 * ⚠️ ولا يكفي وحده لإصلاح بناء الإنتاج — انظر `docs/NOTES.md`.
 */
export default function NotFound() {
  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-bg p-10 text-ink"
    >
      <div className="max-w-md text-center">
        <p className="font-num mb-2 text-5xl font-bold opacity-20">٤٠٤</p>
        <h1 className="mb-2.5 text-2xl font-bold">لا توجد هذه الصفحة</h1>
        <p className="mb-6 text-sm leading-loose opacity-65">
          قد يكون الرابط قديمًا، أو الإعلان بيع وسُحب من العرض.
        </p>
        <Link
          href="/ar"
          className="inline-block rounded-full border border-ink px-7 py-3 text-sm font-bold"
        >
          إلى الرئيسية
        </Link>
      </div>
    </main>
  );
}
