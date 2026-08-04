import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { MonitorCards } from '@/components/admin/MonitorShell';
import { Badge } from '@/components/ui/Badge';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { adCampaigns, adSlots, adStats } from '@/lib/domain/admin-plans';
import {
  AD_CACHE_MINUTES,
  IMPRESSION_FLUSH_SECONDS,
  MAX_BANNERS_PER_SCREEN,
} from '@/lib/domain/ad-rules';
import { toArabicDigits } from '@/lib/arabic';
import { AdSlotTable } from './AdSlotTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مساحات الإعلانات والحملات' };

const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
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
 * ═══ ولا يُعرض إعلانٌ في المنتج بعد ═══
 *
 * لا مسار يقرأ `AdSlot` ولا `AdCampaign` خارج هذه الشاشة. والشاشة تقول
 * ذلك صراحةً: أرقامُها **إعدادٌ لا أداء**، وقولُها «يُفرَض في الخادم»
 * قبل أن يوجد خادمٌ يفرضه وعدٌ مُخلَف.
 */
export default async function AdminAdsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const [slots, stats, campaigns] = await Promise.all([adSlots(), adStats(), adCampaigns()]);

  const writable = canWrite(admin.role, 'finance.view');

  return (
    <AdminShell title="مساحات الإعلانات والحملات" activeHref="/admin/ads" admin={admin}>
      <p className="mb-5 max-w-xl text-sm leading-loose opacity-60">
        المساحات وتسعيرها، والحملات عليها. <b>والتعطيل يُخفي المساحة ولا يُلغي حملاتها</b>
        — فمعلنٌ دفع لأسبوع لا يفقد مالَه بتعطيلٍ إداريّ.
      </p>

      {/*
        **لا يُعرض إعلانٌ في المنتج بعد.** لا مسار يقرأ هذه المساحات
        خارج هذه الشاشة: مضبوطةٌ ومسعَّرة ولا تصل مستخدمًا. وعرضُ
        «إشغال» و«إيراد» فوق ذلك يجعل الشاشة تصف سوقًا لم يُفتح.
      */}
      {stats.served ? null : (
        <p className="mb-7 max-w-2xl rounded-lg border border-line border-dashed p-4 text-2xs leading-loose opacity-70">
          <b>لا يُعرض إعلانٌ في المنتج بعد.</b> المساحات مضبوطةٌ ومسعَّرة هنا، ولا شاشة
          في التطبيق تطلبها — فالأرقام أدناه إعدادٌ لا أداء. والحملات تُسجَّل ولا تظهر
          لأحد حتى يُبنى مسار العرض.
        </p>
      )}

      <MonitorCards
        cards={[
          {
            // العدد قيمةً والنسبة ملاحظةً — كالتصميم، والجملة لا يحكمها المعدود
            title: 'مساحات مفعّلة',
            value: stats.activeSlots,
            note: `من ${toArabicDigits(String(stats.slots))} — والمعطّلة لا تُعرض للزائر`,
          },
          { title: 'حملات جارية', value: stats.liveCampaigns, note: 'بين تاريخَي البدء والانتهاء' },
          {
            title: 'السقف في جلسة الرئيسية',
            value: stats.sessionCap,
            // **ولا يُقال «يُفرَض في الخادم» قبل أن يوجد خادمٌ يفرضه.**
            note: stats.served ? 'يُفرَض في الخادم' : 'قاعدة — ولا مسار عرضٍ بعد',
          },
          {
            title: 'إجمالي الحملات',
            value: campaigns.length,
            note: 'آخر مئة',
          },
        ]}
      />

      <h2 className="mb-3.5 text-sm font-bold">المساحات</h2>
      {writable ? (
        <AdSlotTable rows={slots} />
      ) : (
        <p className="rounded-lg border border-line border-dashed p-6 text-2xs opacity-55">
          صلاحيتك قراءةٌ فقط — التفعيل والتعطيل لمن يملك الكتابة في المالية.
        </p>
      )}

      <h2 className="mt-10 mb-3.5 text-sm font-bold">الحملات المموّلة</h2>
      {campaigns.length === 0 ? (
        <p className="rounded-lg border border-line border-dashed p-6 text-2xs opacity-55">
          لا حملات. والحملة تُنشأ بعقدٍ مع المعلن، وتظهر هنا بمدّتها وأدائها.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-3xl border-collapse text-2xs">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="p-3 text-start font-bold">المعلن</th>
                <th className="p-3 text-start font-bold">المساحة</th>
                <th className="p-3 text-start font-bold">المدّة</th>
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
                  <td className="font-num p-3">{toArabicDigits(String(row.impressions))}</td>
                  <td className="font-num p-3">{toArabicDigits(String(row.clicks))}</td>
                  <td className="font-num p-3 opacity-70">
                    {toArabicDigits(row.ctrPct.toFixed(1))}٪
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* قواعد التصميم — مكتوبةً حيث يقرؤها من يبيع مساحة، لا في وثيقة. */}
      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-70">
          <p className="mb-2 font-bold">قواعد تحمي التطبيق من الإعلانات</p>
          <p>
            بنر ({toArabicDigits(String(MAX_BANNERS_PER_SCREEN))}) لكل شاشة كحدّ أقصى ·
            وسم «إعلان» أو «مموّل» إلزاميّ ·{' '}
            <b>لا إعلان داخل مسار الدفع والمزايدة والنزاع</b> · وإعلانات
            ({toArabicDigits(String(stats.sessionCap))}) كحدّ أقصى في جلسة الرئيسية،
            والسقف يُفرَض في الخادم لا في التطبيق.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-70">
          <p className="mb-2 font-bold">الأداء والبطارية</p>
          <p>
            طلب واحد يجلب كل مساحات الشاشة · تخزين دقائق
            ({toArabicDigits(String(AD_CACHE_MINUTES))}) · تحميل كسول · صور WebP بمقاس
            الجهاز · <b>لا فيديو تلقائيّ</b> · أحداث الظهور تُجمَّع وتُرسل كل ثانية
            ({toArabicDigits(String(IMPRESSION_FLUSH_SECONDS))}).
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
