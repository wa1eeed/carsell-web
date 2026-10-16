import { getTranslations, setRequestLocale } from 'next-intl/server';
import { FilterChip } from '@/components/ui/FilterChip';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { MarkAllRead } from '@/components/site/MarkAllRead';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { EmptyState } from '@/components/ui/EmptyState';
import { TimeAgo } from '@/components/ui/TimeAgo';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies } from '@/lib/domain/account';
import { listNotifications, unreadCount } from '@/lib/domain/notifications';
import { userChannels } from '@/lib/domain/push-channels';
import { ChannelPreferences } from './ChannelPreferences';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'notificationCenter' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * ═══ كل الإشعارات ═══
 *
 * القائمة في الجرس ثمانية — تكفي «ماذا جدّ» ولا تكفي «ماذا فاتني
 * الأسبوع الماضي». وهذه الشاشة هي الوجهة التي يربط إليها الجرس،
 * **فوجودُها شرطُ صدقِ الرابط**: عدّادٌ يربط إلى ٤٠٤ أسوأ من عدّادٍ
 * لا يربط.
 *
 * والتبويب على `readAt` لا على النوع: ما ينتظر قراءةً هو السؤال،
 * وتصنيفُها إلى «عروض» و«طلبات» يُعيد بناء الشاشات التي تربط إليها
 * أصلًا.
 */
export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const search = await searchParams;
  const unreadOnly = search.tab === 'unread';

  const [items, unread, t, channels] = await Promise.all([
    listNotifications(user.id, { locale, limit: 100, unreadOnly }),
    unreadCount(user.id),
    getTranslations('notificationCenter'),
    /**
     * ═══ ومفاتيحُه معها — لا في شاشةٍ ثالثة ═══
     *
     * من فتح مركز الإشعارات جاء يقرأ ما وصله أو يوقف ما لا يعنيه،
     * وهما سؤالٌ واحد. وشاشةُ «إعدادات» منفصلة تجعل المفتاح يُبحث
     * عنه، وأكثرُ الناس لا يبحثون — فيُطفئون الجرس كلَّه.
     */
    userChannels(user.id),
  ]);

  const now = new Date().toISOString();

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <Breadcrumb
            label="مسار التنقّل"
            separator="›"
            className="mb-6"
            items={[{ label: 'حسابي', href: `/${locale}/account` }, { label: t('title') }]}
          />

          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="mb-1.5 text-4xl font-bold tracking-tight">{t('title')}</h1>
              <p className="text-sm opacity-70">{t('emptyBody')}</p>
            </div>
            {unread === 0 ? null : <MarkAllRead label={t('markAll')} />}
          </div>

          {/*
            **والشريحة من `FilterChip`** — كانت نسخةً ثالثة بأصنافها
            (مع «إعلاناتي» و«العروض»)، وثلاثُ نسخٍ لشيءٍ واحد تتباعد
            أوّلَ تغييرٍ في الشكل فتبدو صفحاتٌ من منصّاتٍ شتّى.
          */}
          <nav className="mb-6 flex flex-wrap items-center gap-2.5">
            {([
              { key: 'all', href: `/${locale}/account/notifications`, on: !unreadOnly },
              { key: 'unread', href: `/${locale}/account/notifications?tab=unread`, on: unreadOnly },
            ] as const).map((tab) => (
              <FilterChip
                key={tab.key}
                href={tab.href}
                active={tab.on}
                {...(tab.key === 'unread' && unread > 0 ? { count: unread } : {})}
              >
                {t(tab.key === 'all' ? 'tabAll' : 'tabUnread')}
              </FilterChip>
            ))}
          </nav>

          <ChannelPreferences channels={channels} />

          {items.length === 0 ? (
            <EmptyState
              title={unreadOnly ? t('emptyUnread') : t('empty')}
              description={unreadOnly ? t('emptyUnreadBody') : t('emptyBody')}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {items.map((item) => {
                const inner = (
                  <>
                    <span
                      aria-hidden
                      className={cn(
                        'mt-2 size-2 shrink-0 rounded-full',
                        item.readAt === null
                          ? item.priority === 'critical'
                            ? 'bg-danger'
                            : 'bg-accent'
                          : 'bg-transparent',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'text-sm',
                            item.readAt === null ? 'font-bold' : 'font-semibold opacity-70',
                          )}
                        >
                          {item.title}
                        </span>
                        {item.priority === 'critical' && item.readAt === null ? (
                          <span className="rounded-sm bg-danger/12 px-1.5 py-px text-3xs font-bold text-danger">
                            {t('critical')}
                          </span>
                        ) : null}
                      </span>
                      {item.body === '' ? null : (
                        <span className="mt-1 block text-2xs leading-relaxed opacity-70">
                          {item.body}
                        </span>
                      )}
                    </span>
                    <TimeAgo
                      at={item.createdAt}
                      now={now}
                      className="shrink-0 text-3xs opacity-65"
                    />
                  </>
                );

                return (
                  <li key={item.id}>
                    {item.href === null ? (
                      <span className="flex gap-3 py-4">{inner}</span>
                    ) : (
                      <a href={item.href} className="-mx-3 flex gap-3 rounded-lg px-3 py-4 transition-colors hover:bg-surface">
                        {inner}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
