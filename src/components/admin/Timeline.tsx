import Link from 'next/link';
import { Money } from '@/components/ui/Money';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import type { TimelineEvent } from '@/lib/domain/admin-listing-timeline';
import { AUDIT_ACTION_LABEL } from '@/lib/labels/audit';
import { TIMELINE_DETAIL, TIMELINE_LABEL } from '@/lib/labels/timeline';

/**
 * ═══ خطُّ الزمن — ومن يحقّق يحتاج التسلسل لا اللقطة ═══
 *
 * «لماذا بِيعت بأقلّ من سعرها؟» سؤالٌ تسلسليّ: متى أُحيلت، وبأيّ
 * سبب، وأيُّ عرضٍ وصل ومتى سقط. وكان يُركَّب من خمس شاشاتٍ في رأس
 * المشغّل.
 *
 * **والأقدم أوّلًا**: القصّة تُقرأ من بدايتها، وعرضُ الأحدث أوّلًا
 * يجعل القارئ يبنيها معكوسة.
 */

const dt = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/** فاعلٌ بمفتاحه — وما عداه اسمُ شخصٍ يُعرض حرفيًّا. */
const ACTOR_LABEL: Record<string, string> = {
  admin: 'الإدارة',
  user: 'المستخدم',
  system: 'النظام',
  gateway: 'بوابة الدفع',
  buyer: 'المشتري',
  seller: 'البائع',
};

const DOT: Record<TimelineEvent['tone'], string> = {
  accent: 'bg-accent',
  warn: 'bg-warn',
  danger: 'bg-danger',
  neutral: 'bg-ink/25',
};

/** مبلغٌ أم نصّ؟ — التفصيل يأتي رقمًا في العروض والمزايدات. */
function Detail({ value }: { value: string }) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim() !== '') return <Money amount={numeric} />;
  /**
   * **والمفتاح يُصاغ قبل أن يُعرض.** «ENDED_MET» و«TRANSFER» في سطرٍ
   * عربيّ تُقرأ شيفرةً لا خبرًا — ويبقى الخام لما لا تسمية له: السجلّ
   * يُقرأ في تحقيق، فغموضُه أسوأ من قبحه.
   */
  return <span>{TIMELINE_DETAIL[value] ?? AUDIT_ACTION_LABEL[value] ?? value}</span>;
}

export function Timeline({ events }: { events: readonly TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line p-6 text-2xs opacity-70">
        لا أحداث مسجلة على هذا الإعلان بعد.
      </p>
    );
  }

  return (
    <ol className="relative flex flex-col gap-0">
      {/*
        الخيط الرأسيّ — **بالحدود لا بالظلال** كبقيّة الفصل في المنصّة.
      */}
      <span aria-hidden className="absolute bottom-2 top-2 start-[5px] w-px bg-line" />

      {events.map((event, index) => (
        <li
          key={`${event.at}-${event.kind}-${String(index)}`}
          className="relative flex gap-4 py-2.5 ps-6"
        >
          <span
            aria-hidden
            className={`absolute start-0 top-4 size-2.5 rounded-full ring-2 ring-bg ${DOT[event.tone]}`}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2 text-2xs font-bold">
              {/*
                **والمفتاح الخام يبقى لما لا تسمية له**: سطرٌ يقول
                `order.transfer_confirmed` أوضح من سطرٍ يقول «حدث» —
                والتاريخ يُقرأ في تحقيق، فغموضُه أسوأ من قبحه.
              */}
              {TIMELINE_LABEL[event.kind] ?? AUDIT_ACTION_LABEL[event.kind] ?? event.kind}
              {event.detail === null ? null : (
                <span className="font-normal opacity-65">
                  <Detail value={event.detail} />
                </span>
              )}
            </span>

            <span className="flex flex-wrap items-center gap-2 text-3xs opacity-65">
              <span>{dt.format(new Date(event.at))}</span>
              {event.actor === null ? null : (
                <>
                  <span aria-hidden>·</span>
                  {/*
                    **ومفاتيحُ النوع تُصاغ كلُّها لا `admin` وحدها.**
                    كان السطر يقول «سُوّيت الدفعة · gateway» و«تقدّم
                    الطلب · user» — شيفرةٌ في جملةٍ عربية. وما ليس
                    مفتاحًا فهو اسمُ شخصٍ يُعرض كما هو.
                  */}
                  <span className="bidi-isolate">
                    {ACTOR_LABEL[event.actor] ?? event.actor}
                  </span>
                </>
              )}
              {event.href === null ? null : (
                <>
                  <span aria-hidden>·</span>
                  <Link href={event.href} className="underline underline-offset-4 hover:opacity-80">
                    افتح
                  </Link>
                </>
              )}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
