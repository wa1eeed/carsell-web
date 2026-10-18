import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { completionFormView } from '@/lib/domain/service-completion';
import { completionFormFor } from '@/lib/domain/completion-schema';
import { providerRequestView } from '@/lib/domain/provider-queue';
import { COMPLETION_FORM_TITLE } from '@/lib/labels/completion';
import { ProviderBar } from '../../ProviderBar';
import { CompletionForm } from './CompletionForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'إثبات الإنجاز — كارز',
  robots: { index: false, follow: false },
};

/**
 * ═══ نموذجُ الإنجاز — لكل صنفٍ حقولُه، وشاشةٌ واحدة ═══
 *
 * طلبُ المالك (٢٠٢٦-١٠-١٧): «وإذا كان المزوّد نقل ملكيّة هناك حقول
 * تناسبه لتنفيذ الطلب **وهكذا لباقي المزوّدين**».
 *
 * **وستّةُ أصناف كانت تُنهي بلا حقلٍ واحد**: ناقلٌ يضغط «أنهِ» فلا نعلم
 * رقم البوليصة، ومؤمِّنٌ ينتهي ولا رقمَ وثيقة، وممولٌ لا نعرف قراره.
 * فيدفع العميل ويقرأ «اكتمل» ولا شيء يقول له ما وقع.
 *
 * والفحصُ له شاشتُه (بنودٌ وصورٌ ومخطّطُ هيكل)، وهذه لما عداه.
 */
/**
 * أللطلب نموذجُ صنفٍ آخر؟ — فيُدلّ عليه بدل الباب المسدود.
 * و`null` حين لا يراه هذا المزوّد أصلًا.
 */
async function otherFormPath(ref: string, providerId: string): Promise<string | null> {
  const view = await providerRequestView(ref, providerId);
  if (view === null || !view.mine || view.type === null) return null;
  return completionFormFor(view.type) === 'INSPECTION'
    ? `/provider/${encodeURIComponent(ref)}/inspection`
    : null;
}

export default async function CompletionPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const user = await currentProviderUser();
  if (user === null) redirect('/provider/login');

  const { ref } = await params;
  /** **والمرجع يصل مُرمَّزًا من Next** — فيُفكّ حيث يُقارَن */
  const decoded = decodeURIComponent(ref);
  const view = await completionFormView(decoded, user.providerId);

  /**
   * ═══ ونموذجُ الصنف الآخر تحويلٌ لا بابٌ مسدود ═══
   *
   * طلبُ فحصٍ نموذجُه `/inspection`، فهذا المسار ليس له — **والمنعُ
   * بـ٤٠٤ يترك من وصله بمرجعٍ قديمٍ أو إشارةٍ محفوظة أمام صفحةٍ
   * ميّتة**، والصواب أن يُدلّ على بابه. والعكسُ مثلُه.
   */
  if (view === null) {
    const other = await otherFormPath(decoded, user.providerId);
    if (other !== null) redirect(other);
    /** وطلبٌ ليس له — ٤٠٤: وجودُ الطلب نفسه معلومة */
    notFound();
  }

  const initial: Record<string, string> = {};
  for (const value of view.saved) {
    initial[value.key] =
      value.text ??
      value.number ??
      /** والتاريخ إلى `yyyy-mm-dd` — وهو ما يقبله `input[type=date]` */
      (value.date === null ? '' : value.date.slice(0, 10));
  }

  const title = COMPLETION_FORM_TITLE[view.type] ?? 'إثبات الإنجاز';

  return (
    <>
      <ProviderBar name={user.name} />
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <Breadcrumb
          label="مسار التنقل"
          separator="›"
          className="mb-5"
          items={[
            { label: 'طابوري', href: '/provider' },
            { label: view.ref, href: `/provider/${encodeURIComponent(view.ref)}` },
            { label: title },
          ]}
        />

        <h1 className="mb-1.5 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mb-7 text-2xs leading-loose opacity-70">
          ما تكتبه هنا يراه صاحب الطلب، ويحفظ إثباتا لما أنجز. ولا ينهى الطلب قبل أن
          تكتمل الحقول المطلوبة.
        </p>

        <CompletionForm
          ref_={view.ref}
          type={view.type}
          fields={view.fields}
          initial={initial}
          locked={view.locked}
        />
      </main>
    </>
  );
}
