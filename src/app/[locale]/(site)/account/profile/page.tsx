import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies } from '@/lib/domain/account';
import { profileCompletion } from '@/lib/domain/profile';
import { ProfileForm } from './ProfileForm';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  // صفحة خاصّة تحمل بيانًا شخصيًّا — لا تُفهرَس
  return { title: 'إكمال الملف', robots: { index: false, follow: false } };
}

/**
 * ═══ Wf-ب — إكمال الملف ═══
 *
 * **الوجهة التي كانت ٤٠٤.** الحساب يعرض الناقص ويربط إلى `#email`
 * و`#idVerification` و`#iban` هنا، والحارس يمنع الشراء والبيع دونها —
 * ولم تكن الصفحة موجودة أصلًا. فالشرط مفروضٌ والباب مغلق.
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const completion = profileCompletion(user);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-2xl px-10 py-10">
          <Link
            href={`/${locale}/account`}
            className="mb-6 inline-block text-2xs opacity-55 hover:opacity-100"
          >
            ← حسابي
          </Link>

          <h1 className="mb-1.5 text-3xl font-bold tracking-tight">إكمال الملف</h1>
          <p className="mb-8 text-sm leading-loose opacity-60">
            {completion.missing.length === 0
              ? 'ملفك مكتمل — تستطيع الشراء والبيع.'
              : /*
                 * ما يفتحه كل حقل يُقال قبل ملئه: «أكمل ملفك» وحدها لا
                 * تقول لماذا، ومن لا يعرف الأثر لا يكمل.
                 */
                completion.canBuy
                ? 'تستطيع الشراء الآن. ويبقى الآيبان قبل أن تبيع — إليه يصل مبلغ البيع.'
                : 'البريد وتوثيق الهوية قبل أول شراء، والآيبان قبل أول بيع.'}
          </p>

          <ProfileForm
            initial={{
              email: user.email,
              name: user.name,
              idVerified: user.idVerified,
              hasIban: user.iban !== null && user.iban !== '',
            }}
            missing={completion.missing}
          />
        </div>
      </main>
    </>
  );
}
