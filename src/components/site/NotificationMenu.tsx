'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { TimeAgo } from '@/components/ui/TimeAgo';
import { Link } from '@/i18n/navigation';
import { NOTIFICATIONS_CHANGED } from '@/lib/notifications-signal';
import { subscribeToOwnChannel } from '@/lib/realtime/subscribe';
import { cn } from '@/lib/cn';

type Item = {
  id: string;
  key: string;
  priority: 'critical' | 'high' | 'normal';
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  href: string | null;
};

/**
 * ═══ قائمة الإشعارات ═══
 *
 * **والقراءة تقع بالفتح لا بالنقر على كلٍّ.** من فتح القائمة ورأى
 * الثمانية رآها، وإلزامُه بنقر كلٍّ ليُطفئ النقطة يجعل العدّاد يكذب
 * عليه أسبوعًا.
 *
 * ═══ و«لحظيًّا» هنا استطلاع، ويُقال كما هو ═══
 *
 * القناة `user:{id}` تنشر `notification.created` منذ هذه المهمة،
 * **وخدمة البثّ ترفض القنوات الخاصّة** حتى يوجد مُصدِر التذاكر. فلا
 * مشترك بعد — والاستطلاع كلّ نصف دقيقة **وعند عودة التركيز** هو ما
 * يقع فعلًا. وحين تصل التذكرة يحلّ الاشتراك محلّ المؤقّت ولا يتغيّر
 * شيءٌ آخر.
 *
 * **ولا استطلاع لتبويبةٍ مخفيّة**: `visibilitychange` يوقفه، فلا
 * يُنادى الخادم لمن ترك الصفحة مفتوحةً وذهب.
 */
export function NotificationMenu({
  initialItems,
  initialUnread,
  now,
}: {
  initialItems: readonly Item[];
  initialUnread: number;
  now: string;
}) {
  const t = useTranslations('notificationCenter');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<readonly Item[]>(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  /**
   * **والاستطلاع يبقى سقفًا لا يُرفع.** البثّ تحسينٌ لا شرط: لا Redis
   * في التطوير، وقد تسقط الخدمة. فحين يحيا الاشتراك يتباعد الاستطلاع
   * ولا يتوقّف — ونزعُه يجعل عطلًا في ناقلٍ عطلًا في المنتج.
   */
  const [streaming, setStreaming] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/v1/notifications?limit=8', { cache: 'no-store' });
      if (!response.ok) return;
      const body = (await response.json()) as { data?: { items?: Item[]; unread?: number } };
      if (body.data?.items !== undefined) setItems(body.data.items);
      if (typeof body.data?.unread === 'number') setUnread(body.data.unread);
    } catch {
      /* تعذّر الاتّصال — العدّ يبقى على آخر ما عُرف، ولا رسالة خطأ على جرس */
    }
  }, []);

  /**
   * ═══ الاشتراك — والمسار الذي وصفته الوثيقة منذ المهمة ١٠ ═══
   *
   * `notification.created` تُنشر على `user:{id}` منذ بُني المركز،
   * **ولا مشترِك لها**. والتذكرة تُطلب من REST ثم تُقدَّم في أوّل
   * إطار — ولا تدخل العنوان.
   */
  useEffect(() => {
    return subscribeToOwnChannel({
      onLive: setStreaming,
      onMessage: (message) => {
        /* الرسالة إشعارٌ بتغيّر لا مصدرُ بيانات — والتفاصيل من REST */
        if (message.type === 'notification.created') void refresh();
      },
    });
  }, [refresh]);

  useEffect(() => {
    const poll = (): void => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = setInterval(poll, streaming ? 120_000 : 30_000);
    const sync = (): void => {
      void refresh();
    };
    window.addEventListener('focus', poll);
    document.addEventListener('visibilitychange', poll);
    /* شاشةٌ أخرى غيّرت العدّ — تُقرأ الحقيقة من الخادم لا تُخمَّن */
    window.addEventListener(NOTIFICATIONS_CHANGED, sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', poll);
      document.removeEventListener('visibilitychange', poll);
      window.removeEventListener(NOTIFICATIONS_CHANGED, sync);
    };
  }, [refresh, streaming]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onClickOutside = (event: MouseEvent): void => {
      if (panel.current !== null && !panel.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  const markAll = async (): Promise<void> => {
    /* التفاؤل أوّلًا — النقطة تُطفأ فورًا، والخادم يؤكّد */
    setUnread(0);
    setItems((rows) => rows.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
    try {
      await fetch('/api/v1/notifications/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      void refresh();
    }
  };

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next) void refresh();
  };

  return (
    <div className="relative flex" ref={panel}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('title')}
        className="relative flex size-9 items-center justify-center rounded-full border border-line transition-colors hover:border-ink"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="size-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread === 0 ? null : (
          /*
            **والعدّ على الجرس المغلق.** من لا يعرف أنّ شيئًا ينتظره
            لا يفتح القائمة ليكتشفه.
          */
          <span className="absolute -end-0.5 -top-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-danger px-1 py-px text-3xs font-bold text-bg">
            <ArabicNumber value={unread} />
          </span>
        )}
      </button>

      <div
        role="menu"
        aria-label={t('title')}
        className={cn(
          'absolute top-11 end-0 z-50 w-[22rem] max-w-[calc(100vw-2rem)] origin-top',
          /* الطبقة العائمة تُفصل بخطٍّ وسطحٍ مصمت — و`shadow-2xl` هي ما تستعمله `Sheet` */
          'rounded-xl border border-line bg-bg shadow-2xl transition duration-150',
          'motion-reduce:transition-none',
          open ? 'visible scale-100 opacity-100' : 'invisible scale-95 opacity-0',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-sm font-bold">{t('title')}</p>
          {unread === 0 ? null : (
            <button
              type="button"
              onClick={() => void markAll()}
              className="text-3xs font-semibold text-accent-700 underline-offset-2 hover:underline"
            >
              {t('markAll')}
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-2xs font-bold">{t('empty')}</p>
            <p className="mt-1 text-3xs opacity-55">{t('emptyBody')}</p>
          </div>
        ) : (
          <ul className="max-h-96 divide-y divide-line-2 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <Row item={item} now={now} onNavigate={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-line px-4 py-2.5 text-center">
          <Link
            href="/account/notifications"
            onClick={() => setOpen(false)}
            className="text-3xs font-semibold underline-offset-2 hover:underline"
          >
            {t('viewAll')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({
  item,
  now,
  onNavigate,
}: {
  item: Item;
  now: string;
  onNavigate: () => void;
}) {
  const t = useTranslations('notificationCenter');

  const body = (
    <>
      <span className="flex items-start gap-2">
        {/*
          **والنقطة على غير المقروء وحده.** شارةٌ على كل سطر لا تفرّق،
          وتفريقُ ما يحتاج نظرةً هو كلّ غرض المركز.
        */}
        <span
          aria-hidden
          className={cn(
            'mt-1.5 size-1.5 shrink-0 rounded-full',
            item.readAt === null
              ? item.priority === 'critical'
                ? 'bg-danger'
                : 'bg-accent'
              : 'bg-transparent',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={cn('text-2xs', item.readAt === null ? 'font-bold' : 'font-semibold opacity-70')}>
              {item.title}
            </span>
            {item.priority === 'critical' && item.readAt === null ? (
              <span className="rounded-sm bg-danger/12 px-1.5 py-px text-3xs font-bold text-danger">
                {t('critical')}
              </span>
            ) : null}
          </span>
          {item.body === '' ? null : (
            <span className="mt-0.5 block text-3xs leading-relaxed opacity-60">{item.body}</span>
          )}
          <TimeAgo at={item.createdAt} now={now} className="mt-1 block text-3xs opacity-40" />
        </span>
      </span>
    </>
  );

  /**
   * **ولا رابطَ بلا وجهة.** النزاع بلا شاشةِ مستخدم، فسطرُه يُقرأ ولا
   * يُنقر — وسطرٌ ينقر إلى ٤٠٤ أسوأ من سطرٍ لا يُنقر.
   */
  if (item.href === null) {
    return <span className="block px-4 py-3">{body}</span>;
  }

  return (
    <a href={item.href} onClick={onNavigate} className="block px-4 py-3 transition-colors hover:bg-bg">
      {body}
    </a>
  );
}
