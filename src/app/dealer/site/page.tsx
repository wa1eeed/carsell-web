import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { DealerShell } from '@/components/dealer/DealerShell';
import { LinkButton } from '@/components/ui/Button';
import { DEALER_MODULE, dealerHasModule } from '@/lib/domain/dealer-modules';
import { dealerSite } from '@/lib/domain/dealer-site';
import { SITE_URL } from '@/lib/env';
import { db } from '@/lib/db';
import { SiteForm } from './SiteForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'موقع المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D16` — موقعُ المعرض الرسميّ ═══
 *
 * طلبُ المالك ٢٠٢٦-١١-٢٦: «لاندنق بيج كموقع رسمي له يعرض سياراته فقط …
 * بهويته و يمكن تركيب شعاره و دومينه».
 */
export default async function DealerSitePage() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (!(await dealerHasModule(actor, DEALER_MODULE.landing))) redirect('/dealer');
  /** **ولمالكه وحده** — هويّةُ المنشأة ودومينُها قرارُ صاحب السجلّ. */
  if (actor.role !== 'OWNER') redirect('/dealer');

  const [site, dealer] = await Promise.all([
    dealerSite(actor.dealerId),
    db.dealer.findUniqueOrThrow({
      where: { id: actor.dealerId },
      select: { nameAr: true, city: true, logoUrl: true },
    }),
  ]);

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/site"
      title="موقع المعرض"
      subtitle="موقعك الرسمي — سياراتك وحدها، بهويتك"
      actions={
        site === null || !site.visible ? undefined : (
          <LinkButton href={`/showroom/${site.slug}`} variant="outline" size="sm">
            افتح موقعك
          </LinkButton>
        )
      }
    >
      {dealer.logoUrl === null ? (
        /*
          **والتذكيرُ يسبق لحظةَ الحاجة**: موقعٌ بهويّةٍ بلا شعارٍ يُفتح
          باسمٍ مجرّد — ومن اكتشف ذلك بعد النشر نشر ما لا يريد.
        */
        <p className="mb-5 rounded-lg border border-line bg-surface px-4 py-3 text-2xs leading-loose">
          <b>ولا شعار مرفوع بعد.</b> موقعك يعرض اسمك مجردا حتى ترفعه من الملف العام.
        </p>
      ) : null}

      <SiteForm
        site={site}
        origin={SITE_URL}
        dealerName={dealer.nameAr}
        city={dealer.city}
      />
    </DealerShell>
  );
}
