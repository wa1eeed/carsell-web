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
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { campaignDetail } from '@/lib/domain/admin-campaigns';
import { COOLDOWN_HOURS, MARKETING_CAP_PER_MONTH } from '@/lib/campaigns/segments';
import {
  CAMPAIGN_STATUS_LABEL,
  NOTIFICATION_CHANNEL_LABEL,
  SEGMENT_FIELD_LABEL,
} from '@/lib/labels/admin';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { SendCampaignButton } from '../SendButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'حملة تسويقية' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

const TONE: Record<string, 'accent' | 'warn' | 'danger' | 'neutral'> = {
  DRAFT: 'neutral',
  SCHEDULED: 'warn',
  RUNNING: 'warn',
  SENT: 'accent',
  CANCELLED: 'danger',
};

/**
 * ═══ حملةٌ واحدة — وكانت صفًّا بأربعة عدّادات ═══
 *
 * **ولا موضعَ يُقرأ فيه نصُّ الرسالة التي ستخرج.** والإرسال لا رجعة
 * فيه ويستهلك سقفَ الشهر لكلّ من وصلته، ونافذةُ التأكيد تسمّي الحملة
 * ولا تُري ما فيها. فهذه الصفحة تُري **ما سيصل** قبل أن يصل، و**من
 * سيصله** بالقاعدة التي يطبّقها الإرسال نفسُه، و**من حُجب ولماذا**.
 */
export default async function AdminCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const { id } = await params;
  const campaign = await campaignDetail(decodeURIComponent(id));
  if (campaign === null) notFound();

  const sent = campaign.status === 'SENT';
  const pct = (part: number): number | null =>
    campaign.results.sent === 0 ? null : Math.round((part / campaign.results.sent) * 100);

  return (
    <AdminShell title="حملة تسويقية" activeHref="/admin/campaigns" admin={admin}>
      <DetailHeader
        backHref="/admin/campaigns"
        backLabel="الحملات التسويقية"
        reference={campaign.id.slice(-10).toUpperCase()}
        title={campaign.nameAr}
        badges={
          <>
            <Badge tone={TONE[campaign.status] ?? 'neutral'}>
              {CAMPAIGN_STATUS_LABEL[campaign.status as keyof typeof CAMPAIGN_STATUS_LABEL] ??
                campaign.status}
            </Badge>
            {campaign.channels.map((channel) => (
              <Badge key={channel} tone="neutral" size="sm">
                {NOTIFICATION_CHANNEL_LABEL[channel] ?? channel}
              </Badge>
            ))}
          </>
        }
        actions={
          canWrite(admin.role, 'notifications.manage') ? (
            <SendCampaignButton
              campaignId={campaign.id}
              nameAr={campaign.nameAr}
              status={campaign.status}
            />
          ) : undefined
        }
      />

      {/*
        **والإحصاءُ يتبدّل بتبدّل الحال**: قبل الإرسال السؤالُ «كم
        سيصلهم؟»، وبعده «كم وصلوا وكم فتحوا؟». وعرضُ أصفارِ الفتح على
        مسودّةٍ يُقرأ فشلًا وهي لم تُرسَل بعد.
      */}
      <DetailStats
        items={
          sent
            ? [
                { label: 'وصلتهم', value: <ArabicNumber value={campaign.results.sent} /> },
                {
                  label: 'فتحوا',
                  value: (
                    <>
                      <ArabicNumber value={campaign.results.opened} />
                      {pct(campaign.results.opened) === null ? null : (
                        <span className="text-2xs opacity-65">
                          {' · '}
                          <ArabicNumber value={pct(campaign.results.opened) ?? 0} percent />
                        </span>
                      )}
                    </>
                  ),
                },
                {
                  label: 'نقروا',
                  value: (
                    <>
                      <ArabicNumber value={campaign.results.clicked} />
                      {pct(campaign.results.clicked) === null ? null : (
                        <span className="text-2xs opacity-65">
                          {' · '}
                          <ArabicNumber value={pct(campaign.results.clicked) ?? 0} percent />
                        </span>
                      )}
                    </>
                  ),
                },
                { label: 'حولوا', value: <ArabicNumber value={campaign.results.converted} /> },
              ]
            : [
                { label: 'يطابقون الشريحة', value: <ArabicNumber value={campaign.audience.matched} /> },
                {
                  label: 'وافقوا على التسويق',
                  value: <ArabicNumber value={campaign.audience.consented} />,
                },
                {
                  label: 'سيصلهم فعلا',
                  value: <ArabicNumber value={campaign.audience.reachable} />,
                  ...(campaign.audience.reachable === 0 ? { tone: 'danger' as const } : {}),
                },
              ]
        }
      />

      <DetailColumns
        main={
          <>
            {/*
              ═══ ما سيصل المستخدم ═══

              **وهو ما لم يكن يُعرض في شاشةٍ قطّ.** `subjectAr` و`bodyAr`
              عمودان في المخطّط لا يقرؤهما أحد، فالمشغّل يُمضي رسالةً
              إلى آلافٍ وهو لا يعرف ماذا تقول.
            */}
            <DetailCard
              title="نص الرسالة"
              note={campaign.channels.map((c) => NOTIFICATION_CHANNEL_LABEL[c] ?? c).join(' · ')}
            >
              {campaign.subjectAr === null && campaign.bodyAr === null ? (
                <p className="text-2xs leading-loose opacity-75">
                  لا نص لهذه الحملة بعد — وإرسالها الآن يخرج بلا محتوى. اكتب عنوانها
                  ونصها قبل الإرسال.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="bidi-isolate text-sm font-bold">{campaign.subjectAr ?? '—'}</p>
                  <p className="bidi-isolate text-2xs leading-loose whitespace-pre-wrap opacity-80">
                    {campaign.bodyAr ?? '—'}
                  </p>
                </div>
              )}
            </DetailCard>

            {/*
              ═══ من سيصله ولماذا حُجب الباقي ═══

              «حُجب ثمانية» لا يقول للمشغّل شيئًا، و«ستّةٌ في تهدئتهم
              واثنان بلغا سقف الشهر» يقول له أيؤجّل أم يُلغي.
            */}
            <DetailCard title="الجمهور الآن" note="يحوسب لحظة الإرسال لا لحظة الحفظ">
              <Field
                label="يطابقون قواعد الشريحة"
                value={<ArabicNumber value={campaign.audience.matched} />}
              />
              <Field
                label="ومنهم من وافق على التسويق"
                value={<ArabicNumber value={campaign.audience.consented} />}
              />
              <Field
                label="في تهدئتهم"
                value={<ArabicNumber value={campaign.audience.blockedByCooldown} />}
              />
              <Field
                label="بلغوا سقف الشهر"
                value={<ArabicNumber value={campaign.audience.blockedByCap} />}
              />
              <Field
                label="سيصلهم فعلا"
                value={<ArabicNumber value={campaign.audience.reachable} />}
                strong
              />
              <p className="mt-3 text-3xs leading-loose opacity-65">
                التهدئة <Quantity unit="hours" count={COOLDOWN_HOURS} /> بين حملتين، والسقف{' '}
                <Quantity unit="messages" count={MARKETING_CAP_PER_MONTH} /> تسويقية شهريا لكل
                مستخدم.
              </p>
            </DetailCard>

            {!sent ? null : (
              <DetailCard
                title="من وصلتهم"
                note={
                  campaign.results.sent > campaign.results.rows.length ? (
                    <>
                      آخر <Quantity unit="messages" count={campaign.results.rows.length} /> من
                      أصل <ArabicNumber value={campaign.results.sent} />
                    </>
                  ) : (
                    'الأحدث أولا'
                  )
                }
              >
                {campaign.results.rows.length === 0 ? (
                  <p className="text-2xs opacity-70">لم تسجل رسالة واحدة.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line">
                    {campaign.results.rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                      >
                        <Link
                          href={`/admin/users/${encodeURIComponent(row.userId)}`}
                          className="bidi-isolate -my-1 min-w-0 flex-1 truncate py-1 text-2xs underline underline-offset-4"
                        >
                          {row.name ?? row.ref ?? '—'}
                        </Link>
                        <span className="bidi-isolate text-3xs opacity-65">
                          {riyadh.format(new Date(row.sentAt))}
                        </span>
                        {/* **والأثرُ يُقال بوقوعه لا بصمته**: «لم يفتح» حالٌ تُقرأ */}
                        <span className="flex items-center gap-1.5">
                          {row.openedAt === null ? null : (
                            <Badge tone="neutral" size="sm">
                              فتح
                            </Badge>
                          )}
                          {row.clickedAt === null ? null : (
                            <Badge tone="ink" size="sm">
                              نقر
                            </Badge>
                          )}
                          {row.convertedAt === null ? null : (
                            <Badge tone="accent" size="sm">
                              حول
                            </Badge>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailCard>
            )}
          </>
        }
        side={
          <>
            <DetailCard title="الشريحة">
              <Field label="الاسم" value={campaign.segment.nameAr} />
              <Field label="المفتاح" value={campaign.segment.key} ltr />
              <div className="mt-3 flex flex-col gap-2">
                <span className="text-3xs opacity-65">شروطها</span>
                {campaign.segment.rules.length === 0 ? (
                  <span className="text-2xs opacity-75">بلا شروط — تطابق كل حساب نشط.</span>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {campaign.segment.rules.map((rule) => (
                      <li key={`${rule.field}-${String(rule.negate)}`} className="text-2xs">
                        <span className={rule.negate === true ? 'opacity-70 line-through' : ''}>
                          {SEGMENT_FIELD_LABEL[
                            rule.field as keyof typeof SEGMENT_FIELD_LABEL
                          ] ?? rule.field}
                        </span>
                        {rule.value === undefined ? null : (
                          <span className="opacity-70">
                            {' · '}
                            <ArabicNumber value={rule.value} />
                          </span>
                        )}
                        {rule.negate !== true ? null : (
                          <span className="text-3xs opacity-65"> (يشترط نفيه)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </DetailCard>

            <DetailCard title="من ومتى">
              <Field label="أنشأها" value={campaign.createdByName ?? campaign.createdBy} />
              <Field label="وقت الإنشاء" value={riyadh.format(new Date(campaign.createdAt))} />
              <Field
                label="مجدولة"
                value={
                  campaign.scheduledAt === null
                    ? 'بلا جدولة'
                    : riyadh.format(new Date(campaign.scheduledAt))
                }
              />
              <Field
                label="وقت الإرسال"
                value={
                  campaign.sentAt === null ? 'لم ترسل' : riyadh.format(new Date(campaign.sentAt))
                }
              />
            </DetailCard>

            {sent ? null : (
              <DetailCard title="ما بقي عليه">
                <p className="text-2xs leading-loose opacity-75">
                  الرسالة الخارجة لا تسترد، ويستهلك بها سقف الشهر لكل من وصلته. راجع
                  نصها وجمهورها، ثم أرسلها من الزر أعلى الصفحة.
                </p>
              </DetailCard>
            )}
          </>
        }
      />
    </AdminShell>
  );
}
