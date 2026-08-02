import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import {
  canonicalPath,
  faqForListing,
  findListingForMetadata,
  findPublishedListing,
  similarListings,
  toPublicDetail,
  type PublicListingDetail,
} from '@/lib/domain/listing-detail';
import { CarPage } from './CarPage';
import { JsonLd } from './JsonLd';

export const dynamic = 'force-dynamic';

type Params = { locale: string; slug: string[] };

/**
 * الرابط الأساسي `/{locale}/cars/{city}/{brand}/{model}/{ref}` (قرار ٢٥).
 *
 * مسار واحد يلتقط كل الأطوال:
 *   · جزء واحد  ⇒ `ref` قديم، يُحوَّل ٣٠١ إلى الأساسي.
 *   · أربعة     ⇒ الصفحة، وإن خالف جزءٌ الحقيقةَ حُوِّل ٣٠١ إلى الصحيح.
 *   · ما عداهما ⇒ ٤٠٤ (صفحات الهبوط في المهمة ١٠-ب).
 *
 * التحويل ٣٠١ لا ٣٠٢: نسختان من الصفحة نفسها تقسمان وزنها في الفهرسة،
 * والدائم وحده ينقل الوزن إلى الأساسي.
 */
/**
 * أجزاء المسار تصل **مُرمَّزة** من Next، والمدينة عربية. مقارنتها
 * بالنصّ المفكوك تفشل دائمًا فيتحوّل الرابط إلى نفسه بلا نهاية —
 * وهذا ما وقع فعلًا قبل هذا الفكّ.
 */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

async function resolve(params: Params) {
  const { locale, slug } = params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const parts = slug.map(decodeSegment);
  const ref = parts.length === 1 ? parts[0] : parts.length === 4 ? parts[3] : null;
  if (ref === undefined || ref === null) notFound();

  const row = await findPublishedListing(ref);
  if (row === null) notFound();

  const canonical = canonicalPath(locale, row);
  const matches =
    parts.length === 4 &&
    parts[0] === canonical.city &&
    parts[1] === canonical.brand &&
    parts[2] === canonical.model;

  /**
   * **حارس الحلقة**: لا يُحوَّل مسار إلى نفسه مهما اختلّ الحساب
   * أعلاه. حلقة تحويل لا نهائية تُسقط الصفحة عن الفهرسة كلّها
   * وتظهر للزائر صفحة خطأ — وثمن الحارس مقارنة نصّين.
   */
  const here = `/${locale}/cars/${parts.map(encodeURIComponent).join('/')}`;
  if (!matches && canonical.path !== here) permanentRedirect(canonical.path);

  return { row, canonical, locale };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale) || slug.length !== 4) return {};

  const row = await findListingForMetadata(decodeSegment(slug[3] ?? ''));
  if (row === null) return {};

  const canonical = canonicalPath(locale, row);
  const title = [row.vehicle.brandName, row.vehicle.modelName, row.vehicle.trimName]
    .filter((part) => part !== null && part !== '')
    .join(' ');

  return {
    title: `${title} — ${row.ref}`,
    alternates: { canonical: canonical.path },
    // الصفحة الأساسية وحدها تُفهرَس؛ الوصول بأجزاء أخرى يُحوَّل إليها
    robots: { index: true, follow: true },
  };
}

export default async function CarDetailPage({ params }: { params: Promise<Params> }) {
  const resolved = await resolve(await params);
  setRequestLocale(resolved.locale);

  const [detail, faq, similar, t] = await Promise.all([
    toPublicDetail(resolved.row),
    faqForListing(resolved.row.type),
    similarListings(resolved.row),
    getTranslations('ui'),
  ]);

  const isArabic = resolved.locale === 'ar';
  const faqRows = faq.map((entry) => ({
    id: entry.id,
    question: isArabic ? entry.questionAr : entry.questionEn,
    answer: isArabic ? entry.answerAr : entry.answerEn,
  }));

  return (
    <>
      <SiteHeader active="cars" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-page px-10 py-8">
          <CarPage
            detail={detail satisfies PublicListingDetail}
            faq={faqRows}
            similar={similar.map((item) => ({
              ref: item.ref,
              title: item.title,
              year: item.year,
              mileageKm: item.mileageKm,
              price: Number(item.price),
              inspected: item.inspected,
              href: item.path(resolved.locale),
            }))}
            canonical={resolved.canonical}
            locale={resolved.locale}
            heading={{
              home: t('home'),
              cars: t('cars'),
            }}
          />
        </div>
      </main>

      {/**
       * البيانات المنظَّمة **من نفس الكائن العام** الذي تعرضه الصفحة —
       * لا استعلام ثانٍ. الاحتياطي غير موجود في `detail` أصلًا، فلا
       * يمكن أن يتسرّب إلى JSON-LD ولو سهوًا (قرار ٢٩).
       */}
      <JsonLd
        detail={detail}
        faq={faqRows}
        canonical={resolved.canonical}
        locale={resolved.locale}
      />
    </>
  );
}
