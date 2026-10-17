import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminLink } from '@/components/admin/AdminLink';
import {
  DetailCard,
  DetailColumns,
  DetailHeader,
  DetailStats,
  Field,
} from '@/components/admin/DetailShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { AR_DATE_LOCALE, displayDigits } from '@/lib/arabic';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { providerDetail } from '@/lib/domain/admin-provider-detail';
import { providerPlatformReady } from '@/lib/domain/provider-account';
import { getProviderFeePlan } from '@/lib/domain/provider-fees';
import { AccountActions } from './AccountActions';
import { LedgerPanel } from './LedgerPanel';
import { pendingProviderAdjustment, providerLedger } from '@/lib/domain/provider-ledger';

import { PROVIDER_TYPE_LABEL } from '@/lib/labels/providers';
import {
  PROVIDER_ACCOUNT_NOTE,
  PROVIDER_ACCOUNT_STATUS,
  PROVIDER_REQUEST_STATUS,
} from '@/lib/labels/provider';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تفاصيل المزوّد' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * ═══ صفحةُ المزوّد — طلباتُه وحسابُه ومستحقّاته ═══
 *
 * طلب المالك (٢٠٢٦-١٠-١٤): «نحتاج نطوّر صفحة تفاصيل المزوّد: إضافة
 * رصيد، والطلبات التي استلمها، ومستحقّاته، وكل شيء يخصّه».
 *
 * **ولم تكن له صفحة**: جدولٌ يعرض «ثلاثة متأخّرة» ولا يفتح واحدًا
 * منها، فمن يقرأ العدد يبحث يدويًّا عن ثلاثة صفوفٍ في مئة.
 */
export default async function AdminProviderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'services.manage')) redirect('/admin');

  const { id } = await params;
  const [provider, feePlan, platformReady, ledger, pendingEntry] = await Promise.all([
    providerDetail(id),
    getProviderFeePlan(),
    providerPlatformReady(),
    providerLedger(id),
    pendingProviderAdjustment(id),
  ]);
  if (provider === null) notFound();

  /**
   * ═══ المنفَّذ وغيرُ المنفَّذ قائمتان لا قائمة ═══
   *
   * كانتا مخلوطتين بترتيب التاريخ، فمن يفتح الصفحة ليعرف **ما الذي
   * ينتظر هذا المزوّد** يقرأ خمسين صفًّا ليجد ثلاثة. والسؤالان
   * مختلفان: «ما عليه الآن؟» و«ماذا أنجز؟».
   */
  const open = provider.requests.filter((request) =>
    ['NEW', 'ASSIGNED', 'IN_PROGRESS'].includes(request.status),
  );
  const closed = provider.requests.filter(
    (request) => !['NEW', 'ASSIGNED', 'IN_PROGRESS'].includes(request.status),
  );

  return (
    <AdminShell title="تفاصيل المزوّد" activeHref="/admin/providers" admin={admin}>
      <DetailHeader
        backHref="/admin/providers"
        backLabel="كل المزوّدين"
        reference={provider.nameEn}
        title={provider.nameAr}
        badges={
          <>
            <Badge tone="neutral">{PROVIDER_TYPE_LABEL[provider.type] ?? provider.type}</Badge>
            {provider.active ? null : <Badge tone="danger">موقوف عندنا</Badge>}
            <Badge
              tone={
                provider.account.status === 'ACTIVE'
                  ? 'accent'
                  : provider.account.status === 'REJECTED' || provider.account.status === 'DISABLED'
                    ? 'danger'
                    : 'warn'
              }
            >
              {PROVIDER_ACCOUNT_STATUS[provider.account.status] ?? provider.account.status}
            </Badge>
          </>
        }
      />

      {/*
        ═══ العدّادات — وكلٌّ محسوبٌ من القائمة نفسها ═══

        **لا استعلامٌ ثانٍ بشرطٍ ثانٍ**: عدٌّ يُحسب هنا وقائمةٌ تُرشَّح
        هناك يقولان رقمين مختلفين لسؤالٍ واحد — والبوابة ٤٠ وُلدت منه.
      */}
      <DetailStats
        items={[
          { label: 'معروض عليه', value: <ArabicNumber value={provider.counts.offered} /> },
          { label: 'مقبول', value: <ArabicNumber value={provider.counts.assigned} /> },
          { label: 'قيد التنفيذ', value: <ArabicNumber value={provider.counts.inProgress} /> },
          { label: 'أنجزه', value: <ArabicNumber value={provider.counts.done} /> },
          ...(provider.counts.failed === 0
            ? []
            : [
                {
                  label: 'تعذّر',
                  value: <ArabicNumber value={provider.counts.failed} />,
                  tone: 'warn' as const,
                },
              ]),
          ...(provider.counts.overdue === 0
            ? []
            : [
                {
                  label: 'تجاوز المهلة',
                  value: <ArabicNumber value={provider.counts.overdue} />,
                  tone: 'danger' as const,
                },
              ]),
        ]}
      />

      <DetailColumns
        main={
          <>
            <DetailCard
              title="ما ينتظره الآن"
              note={<Quantity unit="openRequests" count={open.length} />}
            >
              {open.length === 0 ? (
                <EmptyState
                  title={
                    provider.requests.length === 0 ? 'لم يستلم طلبًا بعد' : 'لا شيء ينتظره الآن'
                  }
                  description={
                    provider.requests.length === 0
                      ? 'يصله الطلب حين يُدفع ويكون في تخصّصه ومدنه.'
                      : 'أنجز كلّ ما وصله.'
                  }
                />
              ) : (
                <div className="flex flex-col divide-y divide-line">
                  {open.slice(0, 50).map((request) => (
                    <div key={request.ref} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="min-w-0 flex-1">
                        {/*
                          **والمرجع بابٌ لا نصّ**: من يقرأ «تجاوز
                          المهلة» يريد أن يفتحه ليسأل عنه.
                        */}
                        <AdminLink href={`/admin/service-requests/${encodeURIComponent(request.ref)}`}>
                          {request.ref}
                        </AdminLink>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-3xs opacity-70">
                          <span>{request.serviceName}</span>
                          {request.city === null ? null : (
                            <>
                              <span aria-hidden className="opacity-40">·</span>
                              <span>{request.city}</span>
                            </>
                          )}
                          <span aria-hidden className="opacity-40">·</span>
                          <span className="bidi-isolate">
                            {riyadh.format(new Date(request.createdAt))}
                          </span>
                        </span>
                      </span>
                      {!request.overdue ? null : <Badge tone="danger">تجاوز المهلة</Badge>}
                      <Badge tone="neutral">
                        {PROVIDER_REQUEST_STATUS[request.status] ?? request.status}
                      </Badge>
                      <Money amount={Number(request.amount)} decimals={2} />
                    </div>
                  ))}
                </div>
              )}
            </DetailCard>

            {/*
              ═══ وما أنجزه — القائمةُ الثانية ═══

              **وهي سجلٌّ لا طابور**: تُقرأ حين يُسأل «ماذا عمل لنا؟»،
              ولذلك تأتي بعد ما ينتظره لا قبله.
            */}
            {closed.length === 0 ? null : (
              <DetailCard
                title="ما أنجزه"
                note={<Quantity unit="completedRequests" count={closed.length} />}
                className="mt-5"
              >
                <div className="flex flex-col divide-y divide-line">
                  {closed.slice(0, 50).map((request) => (
                    <div key={request.ref} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="min-w-0 flex-1">
                        <AdminLink
                          href={`/admin/service-requests/${encodeURIComponent(request.ref)}`}
                        >
                          {request.ref}
                        </AdminLink>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-3xs opacity-70">
                          <span>{request.serviceName}</span>
                          {request.city === null ? null : (
                            <>
                              <span aria-hidden className="opacity-40">·</span>
                              <span>{request.city}</span>
                            </>
                          )}
                          <span aria-hidden className="opacity-40">·</span>
                          <span className="bidi-isolate">
                            {riyadh.format(new Date(request.createdAt))}
                          </span>
                        </span>
                      </span>
                      <Badge tone={request.status === 'DONE' ? 'accent' : 'danger'}>
                        {PROVIDER_REQUEST_STATUS[request.status] ?? request.status}
                      </Badge>
                      <Money amount={Number(request.amount)} decimals={2} />
                    </div>
                  ))}
                </div>
              </DetailCard>
            )}

            {/*
              ═══ وحسابُه عندنا ═══

              `PROVIDER_PAYABLE` كان يُقيَّد عند كل خدمةٍ تُنجَز **بلا
              صاحبٍ ولا سداد**: نعرف كم علينا للمزوّدين مجموعين ولا
              نعرف لمن، ولا نعرف ما خرج منه. فصار القيد يحمل اسمه،
              وهذه بطاقتُه: رصيدٌ وكشفٌ وقيدٌ بموافقة ثانية.
            */}
            <DetailCard
              title="حسابه عندنا"
              note="الرصيد وحركته وأدوات القيد"
              className="mt-5"
            >
              <LedgerPanel
                providerId={provider.id}
                balance={ledger.balance}
                credited={ledger.credited}
                debited={ledger.debited}
                lines={ledger.lines}
                pending={pendingEntry}
                canAdjust={canWrite(admin.role, 'providers.adjust')}
                meId={admin.id}
              />
            </DetailCard>

            {/*
              ═══ ومن يدخل اللوحة باسمه ═══

              حسابُ المزوّد منشأة، ومن يعمل عليها أشخاص. **وبلا هذه
              القائمة لا يُعرف من يرى طلباتِ عملائنا** ولا من بقي له
              دخولٌ بعد أن ترك العمل.
            */}
            <DetailCard title="من يدخل لوحته" className="mt-5">
              {provider.staff.length === 0 ? (
                <EmptyState
                  title="لا حساب دخول"
                  description="بلا حساب لا يرى المزوّد طلباته ولا يؤكّد إنجازها."
                />
              ) : (
                <div className="flex flex-col divide-y divide-line">
                  {provider.staff.map((person) => (
                    <div key={person.id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-2xs font-bold">{person.name}</span>
                        <span dir="ltr" className="bidi-ltr mt-0.5 block text-3xs opacity-70">
                          {person.email}
                        </span>
                      </span>
                      {person.mustChangePassword ? (
                        <Badge tone="warn">لم يغيّر كلمته بعد</Badge>
                      ) : null}
                      {person.active ? null : <Badge tone="danger">موقوف</Badge>}
                      <span className="text-3xs opacity-65">
                        {person.lastSeenAt === null
                          ? 'لم يدخل بعد'
                          : riyadh.format(new Date(person.lastSeenAt))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </DetailCard>
          </>
        }
        side={
          <>
            {/*
              ═══ حساب الدفع — ونقرؤه من المزوّد لا نحسبه ═══

              **رصيدُه ليس عندنا**: المال يذهب إليه من البوّابة مباشرةً،
              فرقمٌ نحسبه نحن رقمٌ نظنّه. وما نملك إثباته هو ما أنجزه
              عندنا — ويُسمّى باسمه.
            */}
            <DetailCard
              title="حساب الدفع"
              note={
                provider.account.syncedAt === null
                  ? 'لم يُزامَن بعد'
                  : riyadh.format(new Date(provider.account.syncedAt))
              }
            >
              <p className="mb-3.5 text-3xs leading-loose opacity-75">
                {PROVIDER_ACCOUNT_NOTE[provider.account.status] ?? ''}
              </p>
              {provider.account.note === null ? null : (
                <p className="mb-3.5 rounded-md bg-warn-100 p-3 text-3xs leading-loose text-warn-900">
                  {provider.account.note}
                </p>
              )}
              <Field
                label="معرّف الحساب"
                ltr
                value={provider.account.accountRef ?? '—'}
              />
              <Field
                label="معرّف التحويل"
                ltr
                value={provider.account.payoutRef ?? '—'}
              />
              {/*
                **ولقطةُ الشروط لا مصفوفةُ اليوم**: المصفوفة تتغيّر،
                وشريكٌ فُتح حسابه بشروطٍ سابقة يبقى عليها عند البوّابة.
              */}
              {provider.account.fees === null ? null : (
                <Field
                  label="الرسوم المُرسَلة"
                  ltr
                  value={`mada ${String(provider.account.fees.madaRate ?? '—')} · card ${String(
                    provider.account.fees.cardRate ?? '—',
                  )}`}
                />
              )}
              <AccountActions
                providerId={provider.id}
                open={provider.account.accountRef !== null}
                file={provider.account.file}
                docsComplete={provider.account.docsComplete}
                feesConfigured={feePlan.configured}
                platformConfigured={platformReady}
                canManage={can(admin.role, 'services.manage') === true}
              />
            </DetailCard>

            <DetailCard title="قيمة ما أنجزه" className="mt-5">
              {/*
                **ومن المُنجَز وحده.** طلبٌ لم يُنجَز لا يستحقّ عليه
                شيئًا، وعدُّه يُظهر دَينًا لا نملكه — وهو الخطأ نفسه
                الذي أُصلح في دفتر البائع.

                **وهي قيمةُ الطلب لا حصّتُه منه**: الاقتطاع يقع توزيعًا
                لدى البوّابة، وحسابُه هنا بقاعدةٍ ثانية يُنتج رقمين.
              */}
              <Money amount={Number(provider.earned)} size="lg" decimals={2} />
              {/*
                **والوحدةُ وحدةُ المعدود.** استعملتُ «القائم» للمُنجَز
                فقرأها القياس «مجموع قيمة ٤ قائمة أنجزها» — جملةٌ لا
                معنى لها. والعربية ستّ صيغ، فلكل معدودٍ وحدتُه.
              */}
              <p className="mt-2 text-3xs leading-loose opacity-70">
                مجموع قيمة <Quantity unit="completedRequests" count={provider.earnedFrom} /> أنجزها.
                وحصّتنا تُقتطع في التوزيع لدى البوّابة، فلا تُحسب هنا مرّتين.
              </p>
            </DetailCard>

            <DetailCard title="التغطية والالتزام" className="mt-5">
              <Field
                label="المدن"
                value={
                  provider.cities.length === 0 ? 'كل المدن' : provider.cities.join(' · ')
                }
              />
              <Field
                label="الالتزام"
                value={
                  provider.slaHours === null ? (
                    '—'
                  ) : (
                    <Quantity unit="hours" count={provider.slaHours} />
                  )
                }
              />
              <Field
                label="عمولتنا المسجَّلة"
                ltr
                value={
                  provider.commissionPct === null
                    ? '—'
                    : `${displayDigits(provider.commissionPct)}٪`
                }
              />
              <Field label="الجوّال" ltr value={provider.contactPhone ?? '—'} />
              <Field label="البريد" ltr value={provider.contactEmail ?? '—'} />
            </DetailCard>

            <p className="mt-5 text-3xs leading-loose opacity-70">
              التحرير والإيقاف من{' '}
              <Link href="/admin/providers" className="font-bold underline underline-offset-2">
                قائمة المزوّدين
              </Link>
              .
            </p>
          </>
        }
      />
    </AdminShell>
  );
}
