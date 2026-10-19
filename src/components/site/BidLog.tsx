'use client';

import { useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Quantity } from '@/components/ui/Quantity';
import { AR_DATE_LOCALE, displayDigits } from '@/lib/arabic';
import { cn } from '@/lib/cn';
import { BidStep } from '@/components/site/AuctionSections';
import type { PublicAuction } from '@/lib/domain/auctions';

/**
 * ═══ سجلّ المزايدات — جدولًا كما في التصميم ═══
 *
 * كان قائمةً من أربعة حقول: المستعار وحالتُه والفرق والمبلغ. والتصميم
 * يرسم جدولًا بسبعة أعمدة، **وأهمُّ ما كان ناقصًا الوقت**: النصّ فوق
 * السجلّ يَعِد بأن «كل مزايدة موثّقة برقم المزايد وتوقيتٍ دقيق» —
 * **ولا وقتَ معروضًا فيه إطلاقًا**. والحقل `at` محمولٌ في البيانات منذ
 * بُنيت.
 *
 * ووعدٌ مكتوبٌ فوق سجلٍّ لا يفي به أسوأ من سجلٍّ صامت: من يُطلب منه
 * حجزُ عربونٍ يقرأ السطر ثم لا يجد ما يقيس عليه.
 *
 * **والجدول يُمرَّر أفقيًّا على الهاتف** ولا يُطوى: سبعةُ أعمدةٍ في
 * ٣٧٥px لا تُقرأ، وطيُّها يُخفي العمود الذي جاء القارئ لأجله.
 */
/**
 * ═══ ويُطوى الأقدم ═══
 *
 * التصميم يفتح السجلَّ على الأحدث ويطوي ما قبلها خلف «اعرض الـ١٣
 * مزايدة الأقدم». **والسجلُّ كان يطبع الستّين كلَّها**، فتُدفن
 * المزايداتُ التي تحسم المزاد تحت تاريخٍ لا يقرؤه أحد.
 */
const VISIBLE_BIDS = 8;

export function BidLogTable({
  bids,
  events,
  locale,
  listingRef,
}: {
  bids: PublicAuction['bids'];
  /** ما وقع بين المزايدات — تمديدُ الإغلاق بوقته. */
  events?: PublicAuction['events'];
  locale: string;
  /** مرجعُ الإعلان — ومنه رابطُ تنزيل السجلّ. */
  listingRef?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const hidden = Math.max(0, bids.length - VISIBLE_BIDS);
  const shown = showAll ? bids : bids.slice(0, VISIBLE_BIDS);

  /**
   * ═══ والحدثُ يقع في موضعه من الزمن ═══
   *
   * سطرُ «مُدّد وقت الإغلاق» بين المزايدتين اللتين وقع بينهما، لا في
   * ذيل السجلّ: من يقرأ مزايدةً عند ٢١:٥٩ وإغلاقًا عند ٢٢:٠٥ يحتاج
   * السببَ **حيث انقطع الزمن** لا في مكانٍ آخر.
   */
  const eventsBefore = (at: string, index: number): PublicAuction['events'] => {
    if (events === undefined || events.length === 0) return [];
    const next = shown[index - 1];
    const upper = next === undefined ? Infinity : new Date(next.at).getTime();
    const lower = new Date(at).getTime();
    return events.filter((event) => {
      const t = new Date(event.at).getTime();
      return t >= lower && t < upper;
    });
  };
  const time = new Intl.DateTimeFormat(locale === 'ar' ? AR_DATE_LOCALE : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Riyadh',
  });

  return (
    <>
      {/*
        ═══ وعلى الهاتف صفوفٌ لا جدول ═══

        ستّةُ أعمدةٍ تطلب ٥٧٦px، والحاوية على الهاتف ٣٦١ — فيُخفى
        **عمود المبلغ** خلف تمريرٍ أفقيّ لا يدلّ عليه شيء، وهو سبب
        قراءة السجلّ أصلًا. والتصميم مكتبيٌّ ولا يقول شيئًا عن الهاتف.
        فالمعلومات نفسها في صفَّين، ولا تمرير.
      */}
      <ul className="flex flex-col gap-px overflow-hidden rounded-xl border border-line bg-line sm:hidden">
        {shown.flatMap((bid, index) => [
          /**
           * **والحدثُ على الهاتف كما هو على المكتب.** أوّلُ بناءٍ وضع
           * سطرَ التمديد في الجدول وحده، فقِيس على عرضِ هاتفٍ فلم يظهر
           * — والجدولُ مخفيٌّ دون `sm`، **وأكثرُ من يقرأ السجلّ على
           * هاتفه**. فما يُضاف إلى أحد العرضين يُضاف إلى الآخر.
           */
          ...eventsBefore(bid.at, index).map((event) => (
            <li key={`me-${event.at}`} className="flex flex-wrap items-center gap-2 bg-bg p-3 text-3xs opacity-70">
              <span>مدد وقت الإغلاق</span>
              <Quantity unit="minutes" count={Math.round((event.seconds ?? 0) / 60)} />
              <span aria-hidden className="opacity-40">·</span>
              <span className="bidi-isolate">{time.format(new Date(event.at))}</span>
            </li>
          )),
          <li
            key={`m-${bid.alias}-${bid.at}`}
            className={cn('flex flex-col gap-1.5 p-3.5', bid.top ? 'bg-accent-100' : 'bg-surface')}
          >
            <span className="flex items-baseline justify-between gap-3">
              <span dir="ltr" className="font-num text-2xs font-bold">
                #U-{displayDigits(bid.alias)}
              </span>
              <span className="font-num text-sm font-bold">
                <ArabicNumber value={Number(bid.amount)} />
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2 text-3xs">
              <span className="bidi-isolate opacity-70">{time.format(new Date(bid.at))}</span>
              <BidStep step={bid.step} />
              {bid.isAuto ? <Badge tone="neutral" size="sm">تلقائية</Badge> : null}
              {bid.top ? (
                <Badge tone="accent" size="sm">الأعلى</Badge>
              ) : (
                <Badge tone="neutral" size="sm">تم تجاوزها</Badge>
              )}
            </span>
          </li>,
        ])}
      </ul>

      <div className="no-scrollbar hidden overflow-x-auto rounded-xl border border-line sm:block">
      <table className="w-full min-w-xl border-collapse text-2xs">
        <thead>
          <tr className="border-b border-line bg-surface text-3xs opacity-70">
            <th className="p-3 text-start font-bold">المزايد</th>
            <th className="p-3 text-start font-bold">التاريخ والوقت</th>
            <th className="p-3 text-start font-bold">الفرق</th>
            <th className="p-3 text-start font-bold">النوع</th>
            <th className="p-3 text-start font-bold">الحالة</th>
            <th className="p-3 text-end font-bold">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {shown.flatMap((bid, index) => [
            ...eventsBefore(bid.at, index).map((event) => (
              <tr key={`e-${event.at}`} className="border-b border-line bg-bg">
                <td colSpan={6} className="p-3">
                  <span className="flex flex-wrap items-center gap-2 text-3xs opacity-70">
                    <span>مدد وقت الإغلاق</span>
                    {/*
                      **والمدّة بوحدةٍ تُقرأ بلا قسمة**: التمديدُ ثوانٍ
                      في القاعدة ودقائقُ في القراءة — «٣٠٠ ثانية» يحتاج
                      قسمةً في الرأس. والجمعُ من `Quantity` لا من يد.
                    */}
                    <Quantity unit="minutes" count={Math.round((event.seconds ?? 0) / 60)} />
                    <span aria-hidden className="opacity-40">·</span>
                    <span className="bidi-isolate">{time.format(new Date(event.at))}</span>
                  </span>
                </td>
              </tr>
            )),
            <tr
              key={`${bid.alias}-${bid.at}`}
              /** **والأعلى يُميَّز بخلفيّته** — هو ما تبحث عنه العين أوّلًا. */
              className={cn('border-b border-line last:border-b-0', bid.top && 'bg-accent-100')}
            >
              <td className="p-3">
                {/* الرقم لاتينيٌّ يُقارَن خانةً بخانة — ومعزول */}
                <span dir="ltr" className="font-num font-bold">#U-{displayDigits(bid.alias)}</span>
              </td>
              <td className="p-3">
                <span className="bidi-isolate opacity-70">{time.format(new Date(bid.at))}</span>
              </td>
              <td className="p-3"><BidStep step={bid.step} /></td>
              <td className="p-3">
                {bid.isAuto ? (
                  <Badge tone="neutral" size="sm">تلقائية</Badge>
                ) : (
                  <span className="opacity-65">—</span>
                )}
              </td>
              <td className="p-3">
                {bid.top ? (
                  <Badge tone="accent" size="sm">الأعلى</Badge>
                ) : (
                  <Badge tone="neutral" size="sm">تم تجاوزها</Badge>
                )}
              </td>
              <td className="p-3 text-end">
                <span className="font-num font-bold">
                  <ArabicNumber value={Number(bid.amount)} />
                </span>
              </td>
            </tr>,
          ])}
        </tbody>
      </table>
      </div>

      {/*
        **والمطويُّ يُقال عددُه** — «اعرض الأقدم» بلا رقمٍ لا يقول
        للقارئ أيفتح ثلاثةً أم ستّين.
      */}
      {/*
        **وزرُّ التنزيل فوق السجلّ** كما في التصميم — ومن يتابع إغلاقًا
        يحتاج الصفوف ليحسبها لا لقطةَ شاشة. والملفُّ يحمل ما تحمله
        الشاشة بالضبط: أسماءٌ مستعارة بلا هويّة.
      */}
      {listingRef === undefined ? null : (
        <a
          href={`/api/v1/auctions/${encodeURIComponent(listingRef)}/bids/export`}
          download
          className="mt-3 inline-flex items-center gap-1.5 text-2xs underline underline-offset-4 opacity-75 hover:opacity-100"
        >
          نزل السجل ملفا
        </a>
      )}

      {hidden === 0 || showAll ? null : (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 w-full rounded-xl border border-line py-2.5 text-2xs font-bold hover:border-ink"
        >
          <span className="flex items-center justify-center gap-1.5">
            <span>اعرض</span>
            <Quantity unit="bids" count={hidden} />
            <span>الأقدم</span>
          </span>
        </button>
      )}
    </>
  );
}
