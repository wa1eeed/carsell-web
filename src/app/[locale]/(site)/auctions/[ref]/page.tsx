import { permanentRedirect, notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';

import { routing } from '@/i18n/routing';
import { canonicalPath, findPublishedListing } from '@/lib/domain/listing-detail';

export const dynamic = 'force-dynamic';

/**
 * ═══ صفحةُ المزاد صارت صفحةَ المركبة ═══
 *
 * **للمركبة صفحةٌ واحدة.** كان للمزاد صفحةٌ ثانية بسجلّه وشروطه
 * وعدّاده — فصار للشيء الواحد رابطان: يتنافسان في محرّك البحث،
 * ويتنقّل بينهما المزايد بين وجهين للعرض نفسه، ويُقسَّم بينهما ما
 * يصله من زيارات. (قرار المالك.)
 *
 * والمسار يبقى محوِّلًا **لا يُحذف**: روابطُ مشتركةٌ ومفهرسةٌ تشير
 * إليه، وحذفُه يحوّلها إلى ٤٠٤ — والتحويل الدائم ينقل ما بُني من
 * فهرسةٍ إلى الوجهة الجديدة بدل أن يُهدره.
 */
export default async function AuctionRedirect({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}) {
  const { locale, ref } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const listing = await findPublishedListing(ref);
  if (listing === null) notFound();

  permanentRedirect(canonicalPath(locale, listing).path);
}
