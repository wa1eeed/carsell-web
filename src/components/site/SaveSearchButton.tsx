'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Toast } from '@/components/ui/Toast';

/**
 * «احفظ البحث» — في شريط النتائج كما في التصميم (Wb).
 *
 * **والجرس ليس زينة**: الحفظ يعني أن يصل صاحبه خبرُ ما يُنشر مطابقًا،
 * فالأيقونة تقول ذلك قبل الضغط.
 *
 * ═══ ومن لم يسجّل دخوله يُوجَّه لا يُمنع ═══
 *
 * الزرّ يظهر للجميع، والضغطة تأخذ الزائر إلى الدخول **وتعيده إلى
 * بحثه**. وإخفاؤه عمّن لم يدخل يمنع الوحيد الذي قد تُقنعه الميزة
 * بالتسجيل.
 */

const REASON: Record<string, string> = {
  EMPTY_FILTERS: 'حدد شيئا أولا — بحث بلا فلتر يعني كل السيارات.',
  LIMIT_REACHED: 'بلغت حد المحفوظات. احذف واحدا قبل أن تحفظ غيره.',
  DUPLICATE: 'هذا البحث محفوظ عندك.',
};

export function SaveSearchButton({
  query,
  signedIn,
  saved,
  locale,
}: {
  query: string;
  signedIn: boolean;
  saved: boolean;
  locale: string;
}) {
  const t = useTranslations('search.saved');
  const router = useRouter();
  const [pending, start] = useTransition();
  /**
   * ═══ الحالة تُشتقّ من البحث لا تُنسخ مرّة ═══
   *
   * `useState(saved)` يُقرأ **عند التركيب وحده**. والتنقّل داخل
   * الصفحة لا يُعيد تركيب الزرّ، فيبقى «محفوظ» بعد أن يحذف الزائر
   * شارةً — وهو بحثٌ آخر لم يُحفظ. فالزرّ يَعِد بما لم يقع.
   *
   * والعلاج اشتقاقٌ لا مزامنة: نحفظ **أيّ بحثٍ** حُفظ للتوّ، فيَصدُق
   * على بحثه ويكذب على غيره بلا `useEffect`.
   */
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const done = saved || justSaved === query;
  const [toast, setToast] = useState<string | null>(null);

  const save = (): void => {
    if (!signedIn) {
      const back = `/${locale}/cars${query === '' ? '' : `?${query}`}`;
      router.push(`/${locale}/auth?next=${encodeURIComponent(back)}`);
      return;
    }

    start(async () => {
      const response = await fetch('/api/v1/me/searches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { fields?: Record<string, string>; messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        const key = payload?.error?.fields?.search;
        setToast((key === undefined ? undefined : REASON[key]) ?? payload?.error?.messageAr ?? 'تعذر الحفظ.');
        return;
      }

      setJustSaved(query);
      setToast('حفظ البحث. سنخبرك بما ينشر مطابقا له.');
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={save}
        disabled={pending || done}
        aria-pressed={done}
        className="flex shrink-0 items-center gap-2 rounded-lg border border-line px-3.5 py-2.5 text-3xs font-semibold transition-colors hover:bg-surface disabled:opacity-75"
      >
        <BellIcon filled={done} />
        {done ? t('saved') : t('save')}
      </button>
      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function BellIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-3 opacity-55"
    >
      <path d="M18 15V10a6 6 0 0 0-12 0v5l-2 3h16z" />
    </svg>
  );
}
