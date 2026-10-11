import Link from 'next/link';
import { toArabicDigits } from '@/lib/arabic';

/**
 * ═══ أقسام الحساب — والأبواب التي لم تكن ═══
 *
 * تسعُ صفحاتٍ تحت `/account`، **وكانت الشاشة تربط إلى خمسٍ منها**.
 * فالمفضّلة والعروض والتقارير والبحوث المحفوظة مبنيّةٌ تعمل ولا يصلها
 * أحد إلّا برابطٍ يكتبه بيده — وهو ما لا يفعله مستخدم.
 *
 * وثلاثٌ منها كانت تُذكر في «عندك: …» **حين يكون فيها عملٌ عاجل
 * فقط**، فتظهر وتختفي: من لا عرض عنده اليوم لا يعرف أن للعروض صفحة.
 * والقائمةُ تُعرض كاملةً دائمًا، والعدّادُ زيادةٌ عليها لا شرطٌ لها.
 *
 * ═══ والعدد لا يُعرض صفرًا ═══
 *
 * «المفضّلة ٠» تقول شيئًا لا يحتاج أن يُقال، وتزاحم العدد الذي يحتاج.
 * فالصفر غيابُ شارةٍ لا شارةُ صفر.
 */

type Section = {
  key: string;
  label: string;
  hint: string;
  count?: number;
  /** عددٌ يستدعي فعلًا — يُرسم بلون التأكيد لا بالرمادي */
  urgent?: boolean;
};

export function AccountSections({
  locale,
  sections,
}: {
  locale: string;
  sections: readonly Section[];
}) {
  return (
    <section className="mt-9">
      <h2 className="mb-3.5 text-sm font-bold">أقسام حسابي</h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.key}
            href={`/${locale}/account/${section.key}`}
            className="group flex items-center gap-3.5 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-ink"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{section.label}</span>
                {section.count === undefined || section.count === 0 ? null : (
                  <span
                    className={
                      section.urgent === true
                        ? 'rounded-md bg-accent px-1.5 py-0.5 font-num text-3xs font-bold text-bg'
                        : 'rounded-md bg-bg px-1.5 py-0.5 font-num text-3xs font-bold opacity-60'
                    }
                  >
                    {toArabicDigits(String(section.count))}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-3xs opacity-50">{section.hint}</p>
            </div>
            <ArrowIcon />
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * السهم يشير إلى **بداية السطر** — ففي العربية يسارًا وفي الإنجليزية
 * يمينًا. و`rtl:` تقلبه، ولا يُكتب اتجاهٌ ثابت.
 */
function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-3.5 shrink-0 opacity-30 transition-opacity group-hover:opacity-70 rtl:rotate-180"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
