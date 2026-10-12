import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies } from '@/lib/domain/account';
import { saleAgreementFor, settlementStatementFor } from '@/lib/domain/documents';
import { AgreementSheet } from './AgreementSheet';
import { SettlementSheet } from './SettlementSheet';

export const dynamic = 'force-dynamic';

const KINDS = ['agreement', 'settlement'] as const;
type Kind = (typeof KINDS)[number];

export const metadata: Metadata = { title: 'مستند الطلب' };

/**
 * ═══ المستند يُفتح ═══
 *
 * صفحة الطلب كانت تسرد المستندات الصادرة **ولا تفتح واحدًا**: «عقد
 * البيع ✓» وبلا رابط. ومن اشترى بسبعين ألفًا يحتاج عقده في المرور،
 * وكشفَ تسويته ليعرف لماذا وصله هذا المبلغ بالذات.
 *
 * ═══ والتنزيل بالطباعة لا بمولّد ═══
 *
 * مولّد PDF عربيّ يحتاج تضمين خطوطٍ وتشكيلًا، وحوارُ الطباعة يفعلهما
 * صحيحًا — وهو القرار نفسه المتّخذ في تقرير الفحص، فلا قاعدتان.
 *
 * **والحارس في الخادم**: المستند خاصٌّ بطرفَي الطلب، و`saleAgreementFor`
 * تفحص ذلك بنفسها — فلا يكفي أن تُخفي الشاشة الرابط.
 */
export default async function OrderDocumentPage({
  params,
}: {
  params: Promise<{ locale: string; ref: string; kind: string }>;
}) {
  const { locale, ref, kind } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  if (!KINDS.includes(kind as Kind)) notFound();

  const viewer = await currentUserFromCookies();
  if (viewer === null) redirect(`/${locale}/auth?next=/${locale}/account/orders/${ref}`);

  const decoded = decodeURIComponent(ref);

  if (kind === 'agreement') {
    const agreement = await saleAgreementFor(decoded, viewer.id);
    if (agreement === null) notFound();
    return (
      <>
        <SiteHeader />
        <main className="min-h-screen bg-bg text-ink">
          <div className="mx-auto w-full max-w-3xl px-10 py-10 print:px-0 print:py-0">
            <AgreementSheet agreement={agreement} backHref={`/${locale}/account/orders/${ref}`} />
          </div>
        </main>
      </>
    );
  }

  const statement = await settlementStatementFor(decoded, viewer.id);
  if (statement === null) notFound();

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-3xl px-10 py-10 print:px-0 print:py-0">
          <SettlementSheet statement={statement} backHref={`/${locale}/account/orders/${ref}`} />
        </div>
      </main>
    </>
  );
}
