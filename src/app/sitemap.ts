import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { canonicalPath } from '@/lib/domain/listing-detail';
import { landingCombinations } from '@/lib/domain/landing';
import { listPublicDealers } from '@/lib/domain/dealer-page';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

const BASE = 'https://carsell.one';

/**
 * خريطة الموقع — **من الصفوف لا من قائمة مكتوبة**.
 *
 * وقائمةٌ تُحدَّث بيد تُبقي روابط إعلاناتٍ بيعت وتُغفل ما نُشر اليوم.
 * والرابط الميّت في الخريطة أسوأ من غيابه: يُعلّم المحرّك أن ما نقوله
 * عن أنفسنا لا يُطابق ما نملك.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, landings, dealers] = await Promise.all([
    db.listing.findMany({
      where: { status: 'PUBLISHED' },
      include: { vehicle: { include: { brand: { select: { slug: true } } } } },
      orderBy: { publishedAt: 'desc' },
      take: 5000,
    }),
    landingCombinations(),
    listPublicDealers('ar'),
  ]);

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of routing.locales) {
    // الثابتة
    for (const path of ['', '/cars', '/auctions', '/services', '/dealers', '/help']) {
      entries.push({
        url: `${BASE}/${locale}${path}`,
        changeFrequency: path === '' ? 'daily' : 'daily',
        priority: path === '' ? 1 : 0.8,
      });
    }

    for (const entry of landings) {
      const path =
        entry.modelSlug === null
          ? `/browse/${entry.citySlug}/${entry.brandSlug}`
          : `/browse/${entry.citySlug}/${entry.brandSlug}/${entry.modelSlug}`;
      entries.push({
        url: `${BASE}/${locale}${encodeURI(path)}`,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }

    for (const dealer of dealers) {
      entries.push({
        url: `${BASE}/${locale}/dealers/${dealer.slug}`,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }

    for (const listing of listings) {
      entries.push({
        url: `${BASE}${canonicalPath(locale, listing).path}`,
        lastModified: listing.publishedAt ?? undefined,
        changeFrequency: 'weekly',
        priority: 0.9,
      });
    }
  }

  return entries;
}
