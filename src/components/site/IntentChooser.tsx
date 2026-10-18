import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * ═══ قبل الاستمارة: ماذا تريد بهذه السيارة؟ ═══
 *
 * **وكانت الاستمارتان اثنتين لسؤالٍ واحد.** `/sell` تسأل بيانات
 * المركبة ثمّ تنشر، و`/account/vehicles/new` تسأل البيانات نفسَها ثمّ
 * تحفظ — **نفس الحقول في شاشتين**، ومن فتح إحداهما لا يعرف أنّ
 * الأخرى موجودة. ومن أراد تسجيل سيارته ليطلب عليها فحصًا كان يُساق
 * إلى صفحةٍ ترويستُها «بِع سيارتك».
 *
 * فالسؤالُ يُطرح مرّةً في أوّله، والحقولُ بعده واحدة. (طلب المالك
 * ٢٠٢٦-١٠-١٨.)
 *
 * ═══ والخيارُ يقول أثرَه لا اسمَه ═══
 *
 * «أضفها إلى سياراتي» وحدها لا تقول لماذا يفعلها أحد — فتحتها سطرٌ
 * يقول ما تفتحه: العرضُ لاحقًا، وطلبُ فحصٍ أو خدمة. وبلا ذلك يختار
 * الناسُ «اعرضها للبيع» دائمًا لأنها الوحيدة التي يفهمون غرضها.
 */
export type SaleIntent = 'sell' | 'garage';

export function IntentChooser({ locale }: { locale: string }) {
  return (
    <div className="cascade grid gap-4 sm:grid-cols-2">
      <IntentCard
        index={0}
        tone="accent"
        title="اعرضها للبيع"
        lead="أنشئ إعلانا يراه المشترون."
        points={['صور وسعر وطريقة بيع', 'بيع مباشر أو تفاوض أو مزاد', 'المبلغ عبر حساب ضمان']}
        action="ابدأ الإعلان"
        icon={<TagMark />}
        href={`/${locale}/sell?intent=sell`}
      />

      <IntentCard
        index={1}
        tone="plain"
        title="أضفها إلى سياراتي"
        lead="سجلها في حسابك بدون ما تعرضها."
        /*
          **والملاحظةُ من كلام المالك**: «يمكنه بعد الاضافة عرضها للبيع
          او طلب خدمات على السياره» — وهي التي تجعل الخيار مفهومًا.
        */
        points={['تعرضها للبيع وقت ما تحب', 'تطلب عليها فحصا أو خدمة', 'ما يشوفها أحد غيرك']}
        action="أضف السيارة"
        icon={<GarageMark />}
        href={`/${locale}/sell?intent=garage`}
      />
    </div>
  );
}

function IntentCard({
  index,
  tone,
  title,
  lead,
  points,
  action,
  icon,
  href,
}: {
  index: number;
  tone: 'accent' | 'plain';
  title: string;
  lead: string;
  points: readonly string[];
  action: string;
  icon: ReactNode;
  href: string;
}) {
  /**
   * **بطاقةٌ كاملةٌ هي الرابط** — لا رابطٌ داخل بطاقةٍ قابلةٍ للنقر:
   * تفاعليٌّ داخل تفاعليّ لا يجوز (البوابة ٤٨)، ولوحةُ المفاتيح تقف
   * موقفين لفعلٍ واحد.
   */
  return (
    <Link
      href={href}
      style={{ '--i': index } as CSSProperties}
      className={cn(
        'group flex flex-col items-start rounded-2xl border p-6 text-start transition-all',
        'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-16px_var(--color-ink)]',
        tone === 'accent'
          ? 'border-accent bg-accent-100/40 hover:border-accent-900'
          : 'border-line bg-surface hover:border-ink',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mb-4 flex size-11 items-center justify-center rounded-xl transition-colors',
          tone === 'accent' ? 'bg-accent text-bg' : 'bg-line/70 text-ink',
        )}
      >
        {icon}
      </span>

      <span className="text-lg font-bold">{title}</span>
      <span className="mt-1.5 text-2xs leading-loose opacity-75">{lead}</span>

      <span className="mt-4 flex flex-col gap-2 text-3xs leading-loose">
        {points.map((point) => (
          <span key={point} className="flex items-start gap-2">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="mt-1 size-3 shrink-0 opacity-60"
              fill="none"
              stroke="currentColor"
              strokeWidth={3.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
            <span>{point}</span>
          </span>
        ))}
      </span>

      {/* السهمُ يتقدّم عند التحويم — إشارةُ اتّجاهٍ لا زينة */}
      <span className="mt-5 flex items-center gap-2 text-2xs font-bold">
        {action}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4 transition-transform group-hover:-translate-x-1 rtl:rotate-180 rtl:group-hover:translate-x-1"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </Link>
  );
}

function TagMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 11.5V5a1.5 1.5 0 0 1 1.5-1.5h6.5a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8l-6.1 6.1a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1-.5-1.5Z" />
      <circle cx="7.75" cy="7.75" r="1.25" />
    </svg>
  );
}

function GarageMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 4l9 6.5V20H3z" />
      <path d="M7 20v-4.5h10V20M7 15.5h10" />
    </svg>
  );
}
