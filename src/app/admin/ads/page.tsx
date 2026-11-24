import { redirect } from 'next/navigation';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Money } from '@/components/ui/Money';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { MonitorCards } from '@/components/admin/MonitorShell';
import { Badge } from '@/components/ui/Badge';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { adCampaigns, adSlots, adStats } from '@/lib/domain/admin-plans';
import {
  AD_CACHE_MINUTES,
  IMPRESSION_FLUSH_SECONDS,
  MAX_BANNERS_PER_SCREEN,
} from '@/lib/domain/ad-rules';
import { displayDigits, AR_DATE_LOCALE } from '@/lib/arabic';
import { AdSlotTable } from './AdSlotTable';
import { SlotPreview } from './SlotPreview';
import { NewCampaign } from './NewCampaign';
import { NewSlot } from './NewSlot';
import { CampaignActions } from './CampaignActions';
import { Quantity } from '@/components/ui/Quantity';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مساحات الإعلانات والحملات' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Riyadh',
});

/**
 * A30 + A31 — مساحات الإعلانات وتسعيرها · والإعلانات المموّلة.
 *
 * شاشتان في التصميم ومصدرهما واحد: المساحة وحملاتها. وفصلُهما يجعل من
 * يعطّل مساحةً لا يرى ما سيوقفه — فالحملات تحت المساحات في صفحةٍ واحدة.
 *
 * ═══ وصار يُعرض — المهمّة ١٢٢ ═══
 *
 * كان لا مسار يقرأ `AdSlot` ولا `AdCampaign` خارج هذه الشاشة، والشاشة
 * تقول ذلك صراحةً. وصارت `search_inline` تُقرأ في نتائج البحث،
 * و`ADS_SERVED` قُلبت في الالتزام نفسه — فسطرُ «لا يُعرض إعلان» يختفي
 * من تلقائه، ولا يبقى نصٌّ يصف حالًا مضت.
 */
/** شرائح A31 — والمرحلة من التاريخين والحالة، لا من راية وحدها. */
const PHASES = [
  { key: 'live', label: 'نشطة' },
  { key: 'scheduled', label: 'مجدولة' },
  { key: 'ended', label: 'منتهية' },
  { key: 'paused', label: 'متوقفة' },
] as const;

export default async function AdminAdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const [slots, stats, allCampaigns] = await Promise.all([adSlots(), adStats(), adCampaigns()]);

  /** النسبةُ من البسط والمقام — ولا قسمةَ على صفر. */
  const occupancyPct = stats.occupancy.measured
    ? Math.round((stats.occupancy.soldSlotDays / stats.occupancy.totalSlotDays) * 100)
    : null;

  const search = await searchParams;
  const raw = typeof search.phase === 'string' ? search.phase : null;
  const active = PHASES.find((row) => row.key === raw)?.key ?? null;
  const campaigns = active === null ? allCampaigns : allCampaigns.filter((row) => row.phase === active);

  const tabs: MonitorTab[] = [
    { key: null, label: 'الكل', count: allCampaigns.length },
    ...PHASES.map((row) => ({
      key: row.key,
      label: row.label,
      count: allCampaigns.filter((item) => item.phase === row.key).length,
    })),
  ];

  const writable = canWrite(admin.role, 'finance.view');

  return (
    <AdminShell
      title="مساحات الإعلانات والحملات"
      subtitle={
        <>
          {/* الترميز يكتبها بعددها: «٧ مساحات · ٤ إعلانات كحدّ أقصى في الجلسة» */}
          <Quantity unit="adSlots" count={stats.slots} /> ·{' '}
          <Quantity unit="sessionAdCap" count={stats.sessionCap} />
        </>
      }
      activeHref="/admin/ads"
      admin={admin}
    >
      <p className="mb-5 max-w-xl text-sm leading-loose opacity-70">
        المساحات وتسعيرها، والحملات عليها. <b>والتعطيل يخفي المساحة ولا يلغي
        حملاتها</b>، فمعلن دفع لأسبوع لا يفقد ماله بتعطيل إداري.
      </p>

      {/*
        **لا يُعرض إعلانٌ في المنتج بعد.** لا مسار يقرأ هذه المساحات
        خارج هذه الشاشة: مضبوطةٌ ومسعَّرة ولا تصل مستخدمًا. وعرضُ
        «إشغال» و«إيراد» فوق ذلك يجعل الشاشة تصف سوقًا لم يُفتح.
      */}
      {stats.served ? null : (
        <p className="mb-7 max-w-2xl rounded-lg border border-line border-dashed p-4 text-2xs leading-loose opacity-75">
          <b>لا يعرض إعلان في المنتج بعد.</b> المساحات مضبوطة ومسعرة هنا، ولا شاشة في التطبيق تعرضها بعد. فالأرقام أدناه
          إعدادات لا نتائج، والحملات تسجل ولا يراها أحد حتى يبنى مسار العرض.
        </p>
      )}

      <MonitorCards
        cards={[
          {
            // العدد قيمةً والنسبة ملاحظةً — كالتصميم، والجملة لا يحكمها المعدود
            title: 'مساحات مفعلة',
            value: stats.activeSlots,
            note: `من ${displayDigits(String(stats.slots))} — والمعطلة لا تعرض للزائر`,
          },
          { title: 'حملات جارية', value: stats.liveCampaigns, note: 'بين تاريخي البدء والانتهاء' },
          {
            title: 'السقف في الجلسة',
            value: stats.sessionCap,
            /**
             * ═══ والآن يُفرَض فعلًا ═══
             *
             * كان الثابت لا يقرؤه أحد، والبطاقة تقول «قاعدة — ولا
             * إعلان في الرئيسية بعد» **والرئيسيةُ تعرض إعلانين**.
             * فصار الوسيط يحسب الباقي من كوكي الجلسة ويمرّره إلى
             * الصفحة، ومسارُ الظهور يكتب العدّاد — وكلاهما خادم.
             *
             * و`homeServed` مقيسٌ لا ثابت: أثمّ حملةٌ حيّةٌ على مساحةٍ
             * مفعَّلة من مساحات الرئيسية؟
             */
            note: stats.homeServed
              ? 'في الرئيسية · يفرض في الخادم'
              : 'في الرئيسية · ولا حملة جارية عليها الآن',
          },
          {
            title: 'إجمالي الحملات',
            value: campaigns.length,
            note: 'آخر مئة',
          },
        ]}
      />

      {/*
        ═══ الإشغال والإيراد — بطاقتان في الترميز بلا مصدر ═══

        «إشغال هذا الشهر ٧٨٪» و«إيراد الإعلانات ٤٨٬٢٠٠ · +١٤٪». وكان
        إيرادُ الإعلانات في لوحة المالية **صفرًا أبدًا**: ترشيحٌ على
        حالٍ (`running`) لا كاتبَ لها في المنتج كلِّه. والقاعدة الآن
        في `ads.ts` يقرؤها الموضعان.
      */}
      <div className="mb-7 grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-3xs font-bold tracking-[0.14em] opacity-65">إشغال هذا الشهر</h2>
          {occupancyPct === null ? (
            <p className="mt-2 text-sm font-bold opacity-65">لا مساحة مفعلة</p>
          ) : (
            <p className="mt-2 text-2xl font-bold">
              <ArabicNumber value={occupancyPct} percent />
            </p>
          )}
          <p className="mt-1 text-3xs opacity-65">
            {occupancyPct === null ? (
              'فعل مساحة ليبدأ القياس'
            ) : (
              <>
                من أيام الشهر كلها على المساحات المفعلة · المتاح{' '}
                <ArabicNumber value={100 - occupancyPct} percent />
              </>
            )}
          </p>
        </section>

        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-3xs font-bold tracking-[0.14em] opacity-65">إيراد الإعلانات</h2>
          <p className="mt-2 text-2xl font-bold">
            <Money amount={stats.revenue} />
          </p>
          <p className="mt-1 text-3xs opacity-65">
            {/*
              **ولا نسبةَ تغيّرٍ من صفر**: من لا شيءٍ إلى ألفٍ بدايةٌ
              لا زيادةٌ مئوية، و«∞٪» ليست رقمًا يُقرأ.
            */}
            {stats.revenueChangePct === null ? (
              'ولا شهر ماضي يقاس عليه'
            ) : (
              <>
                عن الشهر الماضي{' '}
                {stats.revenueChangePct >= 0 ? '+' : ''}
                <ArabicNumber value={stats.revenueChangePct} percent />
              </>
            )}
            {' · '}يعترف به عند بدء الحملة
          </p>
        </section>
      </div>

      <div className="mb-3.5 flex items-center justify-between gap-4">
        <h2 className="text-sm font-bold">المساحات</h2>
        {/*
          **و«أضف مساحة» كانت في الترميز بلا باب.** `AdSlot` تُعدَّل
          رايتُها من الجدول ولا يُنشئها شيء — فمساحةٌ جديدة تحتاج صفًّا
          في القاعدة بيد، والشاشة تعرض سبعًا إلى الأبد.
        */}
        {writable ? <NewSlot /> : null}
      </div>
      {/*
        ═══ والمعاينة للقراءة، فتسبق حارسَ الكتابة ═══

        من يملك القراءة وحدها يبيع هذه المساحات ويُري المعلن ما
        اشتراه — وإخفاؤها عنه يجعل الصلاحية تمنع نظرًا لا كتابة.
      */}
      <SlotPreview slots={slots} />

      {writable ? (
        <AdSlotTable rows={slots} />
      ) : (
        <p className="rounded-lg border border-line border-dashed p-6 text-2xs opacity-70">
          صلاحيتك قراءة فقط. التفعيل والتعطيل لمن يملك الكتابة في المالية.
        </p>
      )}

      <div className="mt-10 mb-3.5 flex items-center justify-between gap-4">
        <h2 className="text-sm font-bold">الحملات الممولة</h2>
        {/*
          **والزرّ هو ما كان ناقصًا.** الجدول يقرأ `AdCampaign` ولا
          شيء يكتبه — فجدولٌ فارغ يُقرأ «لا حملات الآن» وصوابُه «لا
          سبيل إلى حملة».
        */}
        {writable ? <NewCampaign slots={slots} /> : null}
      </div>
      <MonitorTabs tabs={tabs} active={active} basePath="/admin/ads" param="phase" />

      {campaigns.length === 0 ? (
        <p className="rounded-lg border border-line border-dashed p-6 text-2xs opacity-70">
          لا حملات بعد. و«حملة جديدة» أعلاه تنشئ واحدة، تظهر في نتائج البحث بعد
          السادسة متى حل تاريخ بدئها.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-3xl border-collapse text-2xs">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="p-3 text-start font-bold">المعلن</th>
                <th className="p-3 text-start font-bold">المساحة</th>
                <th className="p-3 text-start font-bold">المدة</th>
                <th className="p-3 text-start font-bold">ظهور</th>
                <th className="p-3 text-start font-bold">نقرات</th>
                <th className="p-3 text-start font-bold">النقر إلى الظهور</th>
                <th className="p-3 text-start font-bold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="bidi-isolate p-3 font-bold">{row.advertiserName}</td>
                  <td className="p-3 opacity-70">
                    {slots.find((slot) => slot.key === row.slotKey)?.nameAr ?? row.slotKey}
                  </td>
                  <td className="p-3 opacity-70">
                    {riyadh.format(new Date(row.startsAt))} — {riyadh.format(new Date(row.endsAt))}
                  </td>
                  {/*
                    **وصيغةٌ واحدة للرقم في الشاشة الواحدة**: أسعارُ
                    المساحات فوقها مفصولةُ الآلاف («٦٬٠٠٠»)، وظهورٌ
                    يُكتب «١٨٤٢٠» بجوارها رقمان بصيغتين — و`displayDigits`
                    تبدّل الخانات ولا تفصل، و`ArabicNumber` تفعل الاثنتين.
                  */}
                  <td className="p-3">
                    <ArabicNumber value={row.impressions} />
                  </td>
                  <td className="p-3">
                    <ArabicNumber value={row.clicks} />
                  </td>
                  <td className="p-3 opacity-75">
                    {/* **وعلامةُ النسبة داخل المقطع** لا بجواره (البوابة). */}
                    <ArabicNumber value={row.ctrPct} decimals={1} percent />
                  </td>
                  <td className="p-3">
                    {/*
                      **الحالة من التاريخين لا من راية**: حملةٌ انتهت
                      أمس ورايتُها `active` تُعرض «جارية» وهي لا تُعرض.
                    */}
                    <Badge tone={row.live ? 'accent' : 'neutral'}>
                      {row.live
                        ? 'جارية'
                        : new Date(row.startsAt).getTime() > Date.now()
                          ? 'لم تبدأ'
                          : 'انتهت'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {writable ? <CampaignActions id={row.id} phase={row.phase} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* قواعد التصميم — مكتوبةً حيث يقرؤها من يبيع مساحة، لا في وثيقة. */}
      <div className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-75">
          <p className="mb-2 font-bold">قواعد تحمي التطبيق من الإعلانات</p>
          <p>
            <Quantity unit="banners" count={MAX_BANNERS_PER_SCREEN} /> لكل شاشة كحد أقصى ·
            وسم «إعلان» أو «ممول» إلزامي ·{' '}
            <b>لا إعلان داخل مسار الدفع والمزايدة والنزاع</b> ·{' '}
            <Quantity unit="ads" count={stats.sessionCap} /> كحد أقصى في جلسة الرئيسية
            {stats.homeServed
              ? '، والسقف يفرض في الخادم لا في التطبيق'
              : '. وهي قاعدة لم يبلغها مسار بعد، فلا إعلان في الرئيسية'}
            .
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-75">
          <p className="mb-2 font-bold">الأداء والبطارية</p>
          <p>
            طلب واحد يجلب كل مساحات الشاشة · يخزن{' '}
            <Quantity unit="minutes" count={AD_CACHE_MINUTES} /> · تحميل كسول · صور WebP بمقاس
            الجهاز · <b>لا فيديو تلقائي</b> · أحداث الظهور تجمع وترسل كل{' '}
            <Quantity unit="seconds" count={IMPRESSION_FLUSH_SECONDS} />.
          </p>
        </div>
      </div>
    
      <ListFooter
        shown={allCampaigns.length}
        total={null}
        note="المساحات وحملاتها"
        can="تفعيل مساحة أو إيقافها وتعديل تسعيرها، وقراءة أداء الحملات."
        cannot="تعديل حملة جارية. المعلن اشترى مساحة بشروط معلنة، وتغييرها تحته إخلال."
      />
    </AdminShell>
  );
}
