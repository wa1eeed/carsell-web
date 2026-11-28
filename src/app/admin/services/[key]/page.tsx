import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  DetailCard,
  DetailColumns,
  DetailHeader,
  DetailStats,
  Field,
} from '@/components/admin/DetailShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { Sla } from '@/components/admin/Sla';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { serviceDetail } from '@/lib/domain/admin-services';
import { PROVIDER_TYPE_LABEL } from '@/lib/labels/providers';
import { SERVICE_CATEGORY, SERVICE_REQUEST_STATUS } from '@/lib/labels/services';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { ServiceSettings } from './ServiceSettings';
import { TemplateEditor } from './TemplateEditor';
import { serviceTemplate } from '@/lib/domain/service-template';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'خدمة' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

const PLACEMENT_LABEL: Record<string, string> = {
  home_services: 'دليل الخدمات',
  listing_banner: 'بنر في صفحة المركبة',
  guide: 'الدليل',
  checkout: 'عند الدفع',
};

/**
 * ═══ خدمةٌ واحدة — وثلاثةُ حقولٍ لا يبلغها أحد ═══
 *
 * الجدولُ يعرض السعرَ والرسمَ والظهور، **ولا موضعَ فيه لِما تشمله
 * الخدمة**: بنودٌ يقرؤها المشتري قبل زرّ الدفع — لأن الثمن يُقارَن بما
 * يقابله لا بوصفٍ عامّ — تزرعها البذرة ولا تعدّلها شاشة. ومثلُها
 * `providerType` الذي يُبنى عليه طابورُ المدينة، و`adminFeeMode`
 * و`category` اللذان كانا يُختاران عند الإنشاء وحده.
 */
export default async function AdminServicePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'services.manage')) redirect('/admin');

  const { key } = await params;
  const service = await serviceDetail(decodeURIComponent(key));
  if (service === null) notFound();

  const editable = canWrite(admin.role, 'services.manage');
  const template = await serviceTemplate(service.key);

  return (
    <AdminShell title="خدمة" activeHref="/admin/services" admin={admin}>
      <DetailHeader
        backHref="/admin/services"
        backLabel="الخدمات"
        reference={service.key}
        title={service.nameAr}
        badges={
          <>
            <Badge tone={service.active ? 'accent' : 'neutral'}>
              {service.active ? 'منشورة' : 'مخفية'}
            </Badge>
            <Badge tone="neutral" size="sm">
              {SERVICE_CATEGORY[service.category] ?? service.category}
            </Badge>
            {!service.isAutomated ? null : (
              <Badge tone="ink" size="sm">
                تكامل آلي
              </Badge>
            )}
          </>
        }
      />

      <DetailStats
        items={[
          { label: 'السعر', value: <Money amount={Number(service.price)} /> },
          { label: 'طلبات', value: <ArabicNumber value={service.totalRequests} /> },
          {
            label: 'قائمة الآن',
            value: <ArabicNumber value={service.openRequests} />,
            ...(service.openRequests > 0 ? { tone: 'warn' as const } : {}),
          },
          { label: 'إيراد منجز', value: <Money amount={Number(service.revenue)} /> },
        ]}
      />

      <DetailColumns
        main={
          <>
            {/*
              ═══ ما تشمله الخدمة — وكان بلا كاتب ═══

              مصفوفةٌ يقرؤها المشتري قبل الدفع، تزرعها البذرة ويعرضها
              الموقع، **ولا شاشةَ تكتبها**: بندٌ واحد يحتاج نشرًا.
            */}
            <ServiceSettings
              serviceKey={service.key}
              includesAr={service.includesAr}
              includesEn={service.includesEn}
              providerType={service.providerType}
              adminFeeMode={service.adminFeeMode}
              category={service.category}
              price={service.price}
              adminFee={service.adminFee}
              adminFeeEnabled={service.adminFeeEnabled}
              canEdit={editable}
            />

            {/*
              ═══ قالبُ الخدمة — طلبُ المالك ٢٠٢٦-١١-٢٨ ═══

              «قالب لكل خدمة … حقول لاتخاذ إجراء وحقول للسعر». وكان
              **الفحصُ وحده** قابلًا للتحرير، وباقي الخدمات حقولُها في
              الشيفرة: إضافةُ حقلٍ تحتاج نشرًا.
            */}
            {template === null ? null : (
              <DetailCard
                title="قالب الخدمة"
                note={
                  template.version === 0 ? (
                    'لم يحرر بعد'
                  ) : (
                    <>
                      الإصدار <ArabicNumber value={template.version} />
                    </>
                  )
                }
              >
                <p className="mb-3.5 text-3xs leading-loose opacity-70">
                  حقول <b>يملؤها العميل</b> وهو يطلب — وما يحمل زيادة منها يرفع السعر قبل
                  الدفع. وحقول <b>يملؤها المزود</b> عند الإنهاء، تسجل في الطلب ولا تغير
                  مبلغا دفع. وكل تغيير يرفع الإصدار، والطلبات القائمة تحتفظ بما قرأته.
                </p>
                {editable ? (
                  <TemplateEditor template={template} />
                ) : (
                  <p className="text-2xs opacity-70">العرض فقط — لا تملك تحرير الخدمات.</p>
                )}
              </DetailCard>
            )}

            <DetailCard
              title="آخر الطلبات"
              note={
                service.totalRequests > service.recent.length ? (
                  <>
                    آخر <Quantity unit="serviceRequests" count={service.recent.length} /> من
                    أصل <ArabicNumber value={service.totalRequests} />
                  </>
                ) : (
                  'الأحدث أولا'
                )
              }
            >
              {service.recent.length === 0 ? (
                <p className="text-2xs opacity-70">لم يطلب أحد هذه الخدمة بعد.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {service.recent.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                      <Link
                        href={`/admin/service-requests/${encodeURIComponent(row.ref)}`}
                        className="bidi-ltr font-num -my-1 py-1 text-2xs "
                      >
                        {row.ref}
                      </Link>
                      <span className="bidi-isolate min-w-0 flex-1 truncate text-3xs opacity-65">
                        {row.providerName ?? 'بلا مزود'}
                      </span>
                      <span className="bidi-isolate text-3xs opacity-65">
                        {riyadh.format(new Date(row.createdAt))}
                      </span>
                      <Money amount={Number(row.amount)} size="sm" />
                      <Badge tone="neutral" size="sm">
                        {SERVICE_REQUEST_STATUS[row.status] ?? row.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </DetailCard>
          </>
        }
        side={
          <>
            <DetailCard title="الوصف">
              <p className="bidi-isolate text-2xs leading-loose opacity-80">{service.descAr}</p>
              <p dir="ltr" className="bidi-ltr mt-3 text-3xs leading-loose opacity-65">
                {service.descEn}
              </p>
            </DetailCard>

            <DetailCard title="من يؤديها">
              <Field
                label="المزود المفضل"
                value={service.provider?.nameAr ?? 'بلا مزود مفضل'}
              />
              {/*
                **وصنفُ المؤدّي هو قاعدةُ الطابور**: قرار المالك أن طلب
                الفحص يذهب لفاحصي مدينة المركبة — والمزوّد المفضَّل واحدٌ
                لا طابور، فغيابُ الصنف يترك الإسناد بلا قاعدة.
              */}
              <Field
                label="صنف من يؤديها"
                value={
                  service.providerType === null
                    ? 'لم يحدد — ولا طابور مدينة بدونه'
                    : (PROVIDER_TYPE_LABEL[
                        service.providerType as keyof typeof PROVIDER_TYPE_LABEL
                      ] ?? service.providerType)
                }
              />
              <Field label="الالتزام" value={<Sla hours={service.slaHours} />} />
              {service.provider === null ? null : (
                <Link
                  href={`/admin/providers/${encodeURIComponent(service.provider.id)}`}
                  className="mt-3 inline-block py-1 text-2xs opacity-75 hover:opacity-100"
                >
                  صفحة المزود
                </Link>
              )}
            </DetailCard>

            <DetailCard title="أين تظهر">
              {service.placements.length === 0 ? (
                <p className="text-2xs opacity-70">لا تظهر في أي موضع — تصل بالرابط وحده.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {service.placements.map((placement) => (
                    <li key={placement} className="text-2xs">
                      {PLACEMENT_LABEL[placement] ?? placement}
                    </li>
                  ))}
                </ul>
              )}
              <Field label="ترتيب العرض" value={<ArabicNumber value={service.sort} />} />
            </DetailCard>
          </>
        }
      />
    </AdminShell>
  );
}
