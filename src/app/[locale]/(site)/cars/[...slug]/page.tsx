import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import { canonicalPath, faqForListing, findListingForMetadata, findViewableListing, fromSlug, hasLiveOrder, similarListings, toPublicDetail, type PublicListingDetail } from '@/lib/domain/listing-detail';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import {
  REPORT_VALIDITY_DAYS,
  findReportByListingRef,
  toPublicReport,
} from '@/lib/domain/inspection';
import { loadBodyDiagram } from '@/lib/domain/body-diagram';
import { currentUserFromCookies } from '@/lib/domain/account';
import { getAuction, sellerDecisionView, viewerStanding } from '@/lib/domain/auctions';
import { favoritedRefs } from '@/lib/domain/favorites';
import { taxProfileOf } from '@/lib/domain/tax-profile';
import { CarPage } from './CarPage';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { InspectionScreen } from './InspectionScreen';
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
async function resolve(params: Params) {
  const { locale, slug } = params;
  if (!hasLocale(routing.locales, locale)) notFound();

  /**
   * التقرير **جزء أخير على المسار نفسه** لا مسار مستقلّ: Next لا يسمح
   * بجزء ثابت بعد catch-all. والنتيجة أصحّ بنيويًا — التقرير صفة
   * مركبةٍ معروضة، فرابطه فرع من رابطها لا جار له.
   */
  const raw = slug.map(fromSlug);
  const wantsReport = raw[raw.length - 1] === 'inspection';
  const parts = wantsReport ? raw.slice(0, -1) : raw;

  const ref = parts.length === 1 ? parts[0] : parts.length === 4 ? parts[3] : null;
  if (ref === undefined || ref === null) notFound();

  /**
   * **والمحجوز والمباع يُعرضان**: صفحتُهما كانت ٤٠٤، فمن دفع للتوّ
   * لا يستطيع فتح صفحة ما اشترى، وكل رابطٍ مفهرس يموت عند أوّل بيع.
   */
  const row = await findViewableListing(ref);
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
  const target = wantsReport ? `${canonical.path}/inspection` : canonical.path;
  const here = `/${locale}/cars/${raw.map((part) => encodeURIComponent(part)).join('/')}`;
  if (!matches && target !== here) permanentRedirect(target);

  return { row, canonical, locale, wantsReport };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};

  const report = slug[slug.length - 1] === 'inspection';
  const parts = report ? slug.slice(0, -1) : slug;
  if (parts.length !== 4) return {};

  const row = await findListingForMetadata(fromSlug(parts[3] ?? ''));
  if (row === null) return {};

  const canonical = canonicalPath(locale, row);
  const title = [row.vehicle.brandName, row.vehicle.modelName, row.vehicle.trimName]
    .filter((part) => part !== null && part !== '')
    .join(' ');

  // التقرير محتوى فرعي — الإعلان هو ما يُفهرَس
  if (report) {
    return {
      title: `${title} — ${row.ref}`,
      robots: { index: false, follow: true },
    };
  }

  return {
    title: `${title} — ${row.ref}`,
    alternates: { canonical: canonical.path },
    // الصفحة الأساسية وحدها تُفهرَس؛ الوصول بأجزاء أخرى يُحوَّل إليها
    robots: { index: true, follow: true },
  };
}

function shell(children: React.ReactNode) {
  return (
    <>
      <SiteHeader active="cars" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">{children}</div>
      </main>
    </>
  );
}

/** Wd — تقرير الفحص، تحت رابط الإعلان. */
async function inspectionView(resolved: Awaited<ReturnType<typeof resolve>>) {
  const [row, t, nav, diagram] = await Promise.all([
    findReportByListingRef(resolved.row.ref),
    getTranslations('ui'),
    getTranslations('site.nav'),
    loadBodyDiagram(),
  ]);

  const carTitle = [
    resolved.row.vehicle.brandName,
    resolved.row.vehicle.modelName,
    resolved.row.vehicle.trimName,
  ]
    .filter((part) => part !== null && part !== '')
    .join(' ');

  /**
   * **والتقرير فرعٌ من الإعلان لا جارٌ له** — والمسار يقول ذلك: عنوان
   * المركبة عقدةٌ تعود إلى صفحتها. ومن فتح التقرير برابطٍ مباشر كان
   * يصل صفحةً لا تقول عن أيّ مركبةٍ هي ولا كيف يرى إعلانها.
   *
   * **ويُحسب قبل الفرع**: أكثر الإعلانات بلا فحص، فالحالة الفارغة هي
   * الأكثر وصولًا — ومسارٌ يظهر في الحالة الممتلئة وحدها يغيب عن
   * أكثر من يحتاجه.
   */
  const crumbs = (
    <Breadcrumb
      label={t('breadcrumb')}
      className="mb-5"
      items={[
        { label: nav('home'), href: `/${resolved.locale}` },
        { label: nav('cars'), href: `/${resolved.locale}/cars` },
        { label: carTitle, href: resolved.canonical.path },
        { label: t('inspectionReport') },
      ]}
    />
  );

  /**
   * مركبة بلا فحص **حالة قائمة لا خطأ**: أغلب الإعلانات كذلك. حالةٌ
   * صريحة تدلّ على دليل الخدمات، لا ٤٠٤ توحي بأن الرابط مكسور.
   */
  if (row === null) {
    return shell(
      <>
        {crumbs}
        <EmptyState
          title={t('noReport')}
          description={t('noReportBody')}
          action={
            <Link href={resolved.canonical.path}>
              <Button variant="outline">{t('backToListing')}</Button>
            </Link>
          }
        />
      </>,
    );
  }

  const report = toPublicReport(row, resolved.locale);
  const inspected = new Date(report.inspectedAt);
  const expired =
    Date.now() - inspected.getTime() > REPORT_VALIDITY_DAYS * 24 * 3600 * 1000;

  // التاريخ يُصاغ على الخادم — لا اختلاف بين ما يُقدَّم وما يُروى
  const dateFormat = new Intl.DateTimeFormat(
    resolved.locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric' },
  );

  return shell(
    <>
      {crumbs}
      <InspectionScreen
        report={report}
        expired={expired}
        diagram={diagram}
        formatted={{
          inspectedAt: dateFormat.format(inspected),
          validUntil: dateFormat.format(new Date(report.validUntil)),
        }}
      />
    </>,
  );
}

export default async function CarDetailPage({ params }: { params: Promise<Params> }) {
  const resolved = await resolve(await params);
  setRequestLocale(resolved.locale);

  if (resolved.wantsReport) return inspectionView(resolved);

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

  /**
   * الجلسة تُقرأ هنا لا في المكوّن: زرّ الشراء يحتاج أن يعرف **قبل**
   * الضغط أهو صاحب الإعلان، وأمسجَّلٌ دخوله — فيوجّه إلى الدخول بدل
   * أن يُظهر خطأً بعد نداءٍ فاشل.
   */
  const viewer = await currentUserFromCookies();

  /**
   * ═══ المزاد بتفصيله — ولا يُجلب إلّا لمزاد ═══
   *
   * **وصفحةُ المركبة هي الصفحة**: كان للمزاد صفحةٌ ثانية بسجلّه
   * وشروطه، فصار للمركبة الواحدة رابطان — يتنافسان في البحث،
   * ويتنقّل بينهما المزايد بلا سبب. (قرار المالك.)
   *
   * و`standing` لمن دخل وزايد وحده: جواب «أما زلتُ الأعلى؟» دون أن
   * تخرج هويةُ أحد.
   */
  const auction = resolved.row.type === 'AUCTION' ? await getAuction(resolved.row.ref) : null;
  const standing =
    auction === null || viewer === null
      ? null
      : await viewerStanding(resolved.row.ref, viewer.id);

  return (
    <>
      <SiteHeader active="cars" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <CarPage
            auction={auction}
            standing={standing}
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
            viewer={{
              signedIn: viewer !== null,
              isOwn: viewer !== null && viewer.id === resolved.row.sellerId,
              taxProfile: viewer === null ? null : taxProfileOf(viewer),
              reserved: await hasLiveOrder(resolved.row.id),
              // الإبلاغ يحتاج المعرّف لا المرجع — والمسار يقبل `targetId`
              listingId: resolved.row.id,
              /** والقلب يُرسَم ممتلئًا من أوّل تصيير — لا يومض بعده. */
              favorited: (await favoritedRefs(viewer?.id ?? null, [resolved.row.ref])).has(
                resolved.row.ref,
              ),
              /**
               * ═══ قرارُ البائع — وقارئُه لم يكن يناديه أحد ═══
               *
               * `sellerDecisionView` و`SellerDecisionPanel` والمسار
               * و`resolveSellerDecision(id, true)` كلُّها مبنيّة —
               * **والوحيد الذي ينادي الأخيرة وظيفةٌ دورية تمرّر
               * `false`**. فكل مزادٍ لم يبلغ احتياطيَه ينتهي بالردّ
               * حتمًا مهما أراد البائع، والمهلة تُعدّ له في لوحة
               * الأدمن وحدها.
               */
              sellerDecision:
                viewer === null || viewer.id !== resolved.row.sellerId
                  ? null
                  : await sellerDecisionView(resolved.row.ref, viewer.id),
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
