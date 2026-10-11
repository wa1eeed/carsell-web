import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { Button } from '@/components/ui/Button';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies } from '@/lib/domain/account';
import { savedSearches } from '@/lib/domain/saved-search';
import { describeFilters } from '@/lib/labels/filters';
import { AccountList } from '../AccountList';
import { SavedSearchRow } from './SavedSearchRow';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: 'بحوثي المحفوظة', robots: { index: false, follow: false } };
}

/**
 * ═══ البحوث المحفوظة ═══
 *
 * `SavedSearch` كان نموذجًا في المخطّط بلا كاتبٍ ولا قارئ، وقرار
 * المصمّم ١٨ يضعه في **المرحلة الأولى** مع المفضّلة. وبُنيت المفضّلة
 * وبقي هذا.
 *
 * **والعدد «الجديد» هو الميزة.** بحثٌ محفوظ بلا «كم جدّ منذ زيارتك»
 * تذكرةٌ يعيد صاحبها فتحها ليقارن بذاكرته.
 */
export default async function SearchesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const rows = await savedSearches(user.id);
  const described = await Promise.all(
    rows.map(async (row) => ({ ...row, summary: await describeFilters(row.query, locale) })),
  );

  return (
    <AccountList
      locale={locale}
      title="بحوثي المحفوظة"
      subtitle="نخبرك بما يُنشر مطابقًا لها."
      empty={{
        title: 'لا بحوث محفوظة',
        description:
          'حدّد ما تبحث عنه ثم اضغط «احفظ البحث» في صفحة النتائج — ونخبرك بكل سيارة جديدة تطابقه.',
      }}
      action={
        <Link href={`/${locale}/cars`}>
          <Button size="sm">ابدأ بحثًا</Button>
        </Link>
      }
    >
      {described.map((row) => (
        <SavedSearchRow key={row.id} row={row} locale={locale} />
      ))}
    </AccountList>
  );
}
