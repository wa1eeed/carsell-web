import { getTranslations, setRequestLocale } from 'next-intl/server';
import { vehicleTitle } from '@/lib/domain/vehicle-title';
import { notFound, permanentRedirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import { canonicalPath, faqForListing, servicesForListing, findListingForMetadata, findViewableListing, fromSlug, hasLiveOrder, similarListings, toPublicDetail, type PublicListingDetail } from '@/lib/domain/listing-detail';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/Button';
import {
  REPORT_VALIDITY_DAYS,
  findReportByListingRef,
  inspectionRefForListing,
  toPublicReport,
} from '@/lib/domain/inspection';
import { loadBodyDiagram } from '@/lib/domain/body-diagram';
import { currentUserFromCookies } from '@/lib/domain/account';
import { recordListingView } from '@/lib/domain/listing-views';
import { closingSoon, getAuction, sellerDecisionView, viewerStanding } from '@/lib/domain/auctions';
import { favoritedRefs } from '@/lib/domain/favorites';
import { taxProfileOf } from '@/lib/domain/tax-profile';
import { CarPage } from './CarPage';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { InspectionScreen } from './InspectionScreen';
import { ReportSheet } from './ReportSheet';
import './report-sheet.css';
import { SITE_URL } from '@/lib/env';
import { qrSvg } from '@/lib/qr';
import { landingDepth } from '@/lib/domain/landing';
import { JsonLd } from './JsonLd';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { adsFor } from '@/lib/domain/ads';

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
  /**
   * **وورقةُ الطباعة فرعٌ من التقرير** — `…/inspection/pdf`. فعنوانُها
   * يقول ما هي، ويُنسخ ويُفتح وحده، ولا تُبنى بمعاملٍ (`?print=1`)
   * يضيع عند أوّل مشاركةٍ للرابط.
   */
  const wantsSheet = raw[raw.length - 1] === 'pdf' && raw[raw.length - 2] === 'inspection';
  const trimmed = wantsSheet ? raw.slice(0, -1) : raw;
  const wantsReport = trimmed[trimmed.length - 1] === 'inspection';
  const parts = wantsReport ? trimmed.slice(0, -1) : trimmed;

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
  const target = wantsSheet
    ? `${canonical.path}/inspection/pdf`
    : wantsReport
      ? `${canonical.path}/inspection`
      : canonical.path;
  const here = `/${locale}/cars/${raw.map((part) => encodeURIComponent(part)).join('/')}`;
  if (!matches && target !== here) permanentRedirect(target);

  return { row, canonical, locale, wantsReport, wantsSheet };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};

  /**
   * ═══ والذيلُ يُقشَّر كما يقشّره `resolve` ═══
   *
   * كان يُسقط `inspection` وحدها، و`…/inspection/pdf` ذيلُها `pdf` —
   * فتبقى خمسةُ أجزاء، ويردّ الفحصُ `{}`، **فالورقةُ بلا عنوانٍ
   * البتّة**. ولا يظهر ذلك خطأً في شاشة: يظهر حين يحفظ القارئ الـPDF
   * فيقترح المتصفّحُ اسمَ النافذة اسمًا للملفّ — «Claude» عند من
   * فتحها من التطبيق. **وعنوانُ الصفحة هو اسمُ الملفّ المحفوظ.**
   */
  const sheet = slug[slug.length - 1] === 'pdf' && slug[slug.length - 2] === 'inspection';
  const trimmed = sheet ? slug.slice(0, -1) : slug;
  const report = trimmed[trimmed.length - 1] === 'inspection';
  const parts = report ? trimmed.slice(0, -1) : trimmed;
  if (parts.length !== 4) return {};

  const row = await findListingForMetadata(fromSlug(parts[3] ?? ''));
  if (row === null) return {};

  const canonical = canonicalPath(locale, row);
  /** **وعنوان التبويب بلغة الصفحة** — كان اللقطة العربية على `/en` أيضًا. */
  const title = vehicleTitle(row.vehicle, locale);

  /**
   * ═══ وعنوانُ الورقة اسمُ ملفّها ═══
   *
   * المتصفّحُ يسمّي ملفَّ الـPDF بعنوان الصفحة. فيبدأ بمرجع التقرير —
   * يفرز ويتميّز ولا يلتبس تقريران لسيارتين من طرازٍ واحد — ثمّ ما
   * هو ولأيّ مركبة.
   */
  if (sheet) {
    const reportRef = await inspectionRefForListing(row.ref);
    return {
      title:
        reportRef === null
          ? `تقرير فحص — ${title} — ${row.ref}`
          : `${reportRef} — تقرير فحص — ${title}`,
      robots: { index: false, follow: false },
    };
  }

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
    findReportByListingRef(resolved.row.ref, (await currentUserFromCookies())?.id ?? null),
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
            <LinkButton href={resolved.canonical.path} variant="outline">
              {t('backToListing')}
            </LinkButton>
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
    resolved.locale === 'ar' ? AR_DATE_LOCALE : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric' },
  );

  /**
   * ═══ وورقةُ الطباعة تُقدَّم عاريةً ═══
   *
   * بلا `shell`: لا ترويسةَ موقع ولا تذييل ولا فتات خبز — ورقةُ تقريرٍ
   * مقاسُها A4، وكلُّ ما حولها حبرٌ يُهدر. والرمزُ يُرسم هنا على
   * الخادم فتصل الصفحة مرسومة.
   */
  if (resolved.wantsSheet) {
    const path = resolved.canonical.path;
    /**
     * **والنطاقُ الرسميّ لا مضيفُ التصيير.** ورقةٌ تُطبع من التطوير
     * كانت تحمل رمزًا يقود إلى `localhost:3000` وعنوانًا تحته لا وجود
     * له — ورقٌ لا يصل أحدًا. والمسارُ كما هو، ولا يتبدّل إلّا المضيف.
     */
    const listingUrl = report.listing === null ? null : `${SITE_URL}${path}`;
    const qr = listingUrl === null ? null : await qrSvg(listingUrl, 220);

    return (
      <ReportSheet
        report={report}
        expired={expired}
        qr={qr}
        listingUrl={listingUrl}
        formatted={{
          inspectedAt: dateFormat.format(inspected),
          validUntil: dateFormat.format(new Date(report.validUntil)),
        }}
      />
    );
  }

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

  const [detail, faq, similar, t, landing, ownReport] = await Promise.all([
    toPublicDetail(resolved.row, resolved.locale),
    faqForListing(resolved.row.type),
    similarListings(resolved.row, 4, resolved.locale),
    getTranslations('ui'),
    /**
     * **وصفحةُ الهبوط هي عقدةُ «الماركة في المدينة»** — لا
     * `/cars/{مدينة}/{ماركة}` التي كانت تُعلَن في البيانات المنظَّمة
     * وتردّ ٤٠٤. وتُسأل قبل أن تُعلَن: دونها نُعلن ما لا نملك.
     */
    landingDepth(resolved.row.city, resolved.row.vehicle.brandId, resolved.row.vehicle.modelId),
    /**
     * **وتقريرُ هذا الزائر الخاصّ** — إن كان قد دفع ثمنه. والكائن
     * العام يحمل المنشور وحده، فبلا هذا السطر يقرأ من اشترى تقريرًا
     * «هذه المركبة غير مفحوصة» على الصفحة نفسها.
     */
    findReportByListingRef(resolved.row.ref, (await currentUserFromCookies())?.id ?? null),
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
   * ═══ وتُعَدّ المشاهدة ═══
   *
   * `viewCount` مقروءٌ في أربعة مواضع — صفحةُ «إعلاناتي» تعرضه للبائع
   * وشاشتا الأدمن تعرضانه — **ولا شيء كان يزيده**. فالرقم تحت مركبة
   * البائع هو ما زرعتْه البذرة، يبقى على حاله شهورًا.
   *
   * وعدّادٌ يراه صاحبُ الشأن ولا يتحرّك أسوأ من عدّادٍ غائب: الغائبُ
   * يُسأل عنه، والجامدُ يُصدَّق.
   *
   * ولا يُنتظَر: الزيادةُ لا تؤخّر تصيير الصفحة ولا تُسقطها.
   */
  void recordListingView(resolved.row.id, viewer?.id ?? null, resolved.row.sellerId);

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

  /**
   * ═══ ومزاداتٌ تُغلق قريبًا — قارئُها وشاشتُها مبنيّان ولا ينادِيهما أحد ═══
   *
   * `closingSoon` في النطاق و`ClosingSoonRail` في المكوّنات، كلتاهما
   * مكتوبةٌ موثَّقة — **ولا سطر يصل بينهما**. كشفه فهرسُ المكوّنات
   * المولَّد في عموده «لا يستورده أحد»، لا التصفّح.
   *
   * **ومن يفوّت مزادًا يحتاج التالي**: صفحةٌ تنتهي عند «انتهى» تُخرج
   * الزائر من المنصّة في اللحظة التي هو فيها أكثر استعدادًا للشراء.
   */
  const closing =
    auction === null ? [] : await closingSoon(resolved.row.ref, resolved.locale);

  /**
   * خدماتٌ تُطلب على هذه المركبة — `placements: ['listing_banner']`
   * معلنةٌ في بيانات الخدمات منذ بُنيت **ولا قارئ لها**.
   */
  const services = await servicesForListing(resolved.locale);

  /**
   * ═══ `vehicle_inline` — والاستهداف بالمدينة والماركة ═══
   *
   * المساحة مسعَّرةٌ بالظهور وموضعُها المكتوب «أسفل السعر»، ولم يكن في
   * المنتج ما ينادي مفتاحها. و`adsFor` تقرأ الاستهداف — فمعلنٌ اشترى
   * الرياض لا تُحسب عليه ظهورٌ في جدة.
   */
  const sponsored = await adsFor('vehicle_inline', {
    city: detail.city,
    brandId: resolved.row.vehicle.brandId,
  });
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
            sponsored={sponsored}
            auction={auction}
            standing={standing}
            closing={closing}
            services={services}
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
            /**
             * **والفُتات المرئيّ يقول ما يقوله المعلَن.** كان يقف عند
             * المدينة بينما تُعلن البيانات المنظَّمة ماركةً وطرازًا —
             * فالزائر لا يجد الطريق الذي نَعِد به محرّك البحث.
             */
            /**
             * **ولا يُعرض إلّا الخاصّ**: المنشور يظهر في الكائن العام
             * نفسه، فسطرٌ ثانٍ له تكرار.
             */
            privateReportPath={
              ownReport !== null && ownReport.publishedAt === null
                ? `${resolved.canonical.path}/inspection`
                : null
            }
            landingHref={
              landing.brand
                ? `/${resolved.locale}/browse/${resolved.canonical.city}/${resolved.canonical.brand}`
                : null
            }
            viewer={{
              signedIn: viewer !== null,
              isOwn: viewer !== null && viewer.id === resolved.row.sellerId,
              taxProfile: viewer === null ? null : taxProfileOf(viewer),
              reserved: await hasLiveOrder(resolved.row.id),
              // الإبلاغ يحتاج المعرّف لا المرجع — والمسار يقبل `targetId`
              listingId: resolved.row.id,
              /**
               * **ومعرّف المركبة لمالكها وحده.** بنر الخدمات يحمله
               * فتُختار مركبتُه سلفًا — ومن لا يملكها لا يطلب لها خدمة
               * أصلًا (`VEHICLE_NOT_YOURS`)، فحملُه إليه يَعِد بما يُردّ.
               */
              ownVehicleId:
                viewer !== null && viewer.id === resolved.row.sellerId
                  ? resolved.row.vehicleId
                  : null,
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
        landing={landing}
      />
    </>
  );
}
