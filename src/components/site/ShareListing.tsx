'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * ═══ مشاركة الإعلان ═══
 *
 * التصميم `Wc` يضع «حفظ · مشاركة» معًا، **والمشاركة لم تُبنَ**. وهي
 * في هذا السوق ليست زينة: السيارة تُرسَل إلى الأخ والصديق في واتساب
 * قبل أن تُشترى، ومن لا يجد زرًّا ينسخ العنوان من شريط المتصفّح —
 * فيُرسل رابطًا بمعاملات بحثٍ وأثرٍ لا تخصّه، أو لا يرسل شيئًا.
 *
 * ═══ وثلاثة مسارات، أوّلُها المتاح ═══
 *
 *   ١· `navigator.share` — صحيفة النظام على الهاتف. وهي الأصحّ: فيها
 *      واتساب والرسائل والنسخ بما اعتاده صاحب الجهاز.
 *   ٢· واتساب مباشرةً — على سطح المكتب حيث لا صحيفة نظام، وهو
 *      المقصد الأوّل عمليًّا.
 *   ٣· نسخ الرابط — وما يُنسخ **عنوانٌ أساسيّ** لا ما في شريط
 *      المتصفّح: بلا `?utm` ولا `?from` ولا شريحةٍ مفتوحة.
 *
 * **ولا يرمي شيءٌ منها**: رفضُ المستخدم للصحيفة ليس خطأً، ومنعُ
 * الحافظة في سياقٍ غير آمن حالٌ متوقّعة — والفشل يسقط إلى التالي
 * بصمتٍ لا برسالةٍ تُشعر المستخدم أنه أخطأ.
 */

export function ShareListing({
  title,
  year,
  url,
  className,
}: {
  /** عنوانُ المركبة — يُرسَل مع الرابط فيُقرأ قبل أن يُفتح. */
  title: string;
  /**
   * السنة **رقمًا لا نصًّا**: لصقُها في قالبٍ يتخطّى تحويل الأرقام
   * (البوابة ٦)، والصياغة هنا بأرقامٍ لاتينية — فنصُّ واتساب يُقرأ
   * على كل جهازٍ ولو لم يحمل خطًّا عربيًّا كاملًا.
   */
  year: number;
  /**
   * العنوان **المطلق والأساسيّ** — يُبنى في الخادم من `APP_URL`.
   *
   * وبناؤه من `window.location` يختلف بين الخادم والعميل فيكسر
   * الترطيب، **ويُرسل عنوان بيئةٍ لا عنوان المنصّة** حين يُفتح من
   * نسخةٍ تجريبية — فيصل الرابط إلى من لا يملك الدخول إليها.
   */
  url: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  /** «تويوتا راف٤ XLE 2025» — لاتينيّةٌ في نصٍّ يُرسَل، لا في شاشة. */
  const headline = `${title} ${year.toLocaleString('en-US', { useGrouping: false })}`;

  const share = (): void => {
    const link = url;

    /** صحيفة النظام أوّلًا — وفيها ما اعتاده صاحب الجهاز. */
    const sheet = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share;
    if (typeof sheet === 'function') {
      void sheet
        .call(navigator, { title: headline, url: link })
        .catch(() => undefined);
      return;
    }

    /** وبلا صحيفة: نسخٌ، وإعلانُه في الزرّ نفسه لا في رسالةٍ عابرة. */
    void navigator.clipboard
      ?.writeText(link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  return (
    <span className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={share}
        aria-label="شارك الإعلان"
        className="flex h-11 items-center gap-2 rounded-btn border border-line px-3.5 text-3xs font-bold transition-colors hover:border-ink"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" />
        </svg>
        {copied ? 'نسخ الرابط' : 'مشاركة'}
      </button>

      {/*
        **وواتساب صريحٌ على سطح المكتب.** صحيفة النظام غائبةٌ هناك،
        وهو المقصد الأوّل — فزرٌّ واحد بدل نسخٍ ولصقٍ وبحثٍ عن محادثة.
        ويُخفى على الهاتف: الصحيفة تحويه وتزيد.
      */}
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${headline}\n${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="شارك عبر واتساب"
        className="hidden h-11 items-center rounded-btn border border-line px-3.5 text-3xs font-bold transition-colors hover:border-ink sm:flex"
      >
        واتساب
      </a>
    </span>
  );
}
