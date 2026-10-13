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
import { IdentityPanel } from '@/components/admin/IdentityPanel';
import { MonitorTabs } from '@/components/admin/MonitorShell';
import { Timeline } from '@/components/admin/Timeline';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { adminUserDetail } from '@/lib/domain/admin-entity-detail';
import { userTimeline } from '@/lib/domain/admin-entity-timelines';
import { orderStateLabel } from '@/lib/labels/orders';
import { LEDGER_ACCOUNT_LABEL } from '@/lib/labels/admin';
import { MarginPanel } from './MarginPanel';
import { WalletPanel } from './WalletPanel';
import { displayDigits, AR_DATE_LOCALE } from '@/lib/arabic';
import { Quantity } from '@/components/ui/Quantity';

export const dynamic = 'force-dynamic';

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

const IDENTITY_TONE: Record<string, 'accent' | 'warn' | 'danger' | 'neutral'> = {
  VERIFIED: 'accent',
  PENDING: 'warn',
  REJECTED: 'danger',
  NONE: 'neutral',
};

/**
 * **والمفاتيح من التعداد لا من الذاكرة.**
 *
 * كتبتُ `NOT_REGISTERED`/`REGISTERED` أوّلًا ولا وجود لهما — والتعداد
 * `INDIVIDUAL | VAT_REGISTERED`. ومفتاحٌ لا يطابق يسقط إلى `??` فيُعرض
 * خامًا بلا خطأ: عطلٌ صامت لا يراه إلا من قرأ الشاشة بالعربية.
 */
const TAX_LABEL: Record<string, string> = {
  INDIVIDUAL: 'غير مسجَّل في الضريبة',
  VAT_REGISTERED: 'مسجَّل — ومعه رقم ضريبيّ',
};

/**
 * ملفّ العميل — والقائمة كانت تعرض صفوفه ولا تفتحه.
 *
 * ═══ ورقم الهوية ليس هنا ═══
 *
 * قراءتُه تمرّ بمسارها المُقيَّد الذي يكتب أثرًا بكل مرّة — **وجرُّه في
 * هذه الشاشة يجعل القراءة تقع بلا أن يقصدها أحد وبلا أن تُسجَّل**.
 * فالمعروض هنا حالةُ التوثيق لا الرقم.
 */
/**
 * ═══ والتابز — ونظرةٌ شاملة على العميل ═══
 *
 * الصفحة كانت عمودين فيهما كلُّ شيء: الإعلانات والطلبات والمحفظة
 * والتجاوزات والحساب والأرقام والتوثيق. **ومن يحقّق في شكوى يسأل
 * «ماذا فعل هذا الحساب ومتى»** — ولا ترتيب زمنيّ في الصفحة كلّها:
 * إعلاناته في بطاقة وطلباته في أخرى ومحفظته في ثالثة، وأيُّها سبق
 * الآخر لا يُعرف.
 */
const TABS = [
  { key: null, label: 'نظرة عامة' },
  { key: 'activity', label: 'خطّ الزمن' },
  { key: 'money', label: 'المحفظة والدفتر' },
  { key: 'access', label: 'التوثيق والصلاحيات' },
] as const;

type UserTab = (typeof TABS)[number]['key'];

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'users.view')) redirect('/admin');

  const { id } = await params;
  const user = await adminUserDetail(id);
  if (user === null) notFound();

  const search = await searchParams;
  const raw = typeof search.tab === 'string' ? search.tab : undefined;
  const tab: UserTab = TABS.map((row) => row.key).find((key) => key === raw) ?? null;

  /* **ويُجلَب لتبويبته وحدها** — استعلامه يمرّ على خمسة جداول */
  const events = tab === 'activity' ? await userTimeline(user.id) : [];

  return (
    <AdminShell title="ملفّ العميل" activeHref="/admin/users" admin={admin}>
      <DetailHeader
        backHref="/admin/users"
        backLabel="العملاء"
        // **رقم العميل هو المرجع** — وهو ما يقوله في مكالمة
        reference={user.ref ?? user.phone}
        title={`${user.name} · ${user.phone}`}
        badges={
          <>
            <Badge tone={user.status === 'ACTIVE' ? 'accent' : 'danger'}>{user.status}</Badge>
            <Badge tone={IDENTITY_TONE[user.identityStatus] ?? 'neutral'}>
              {user.idVerified ? 'هوية موثَّقة' : user.identityStatus}
            </Badge>
            {user.dealerName === null ? null : <Badge tone="neutral">{user.dealerName}</Badge>}
          </>
        }
      />

      <DetailStats
        items={[
          { label: 'إعلاناته', value: <ArabicNumber value={user.counts.listings} /> },
          { label: 'اشترى', value: <ArabicNumber value={user.counts.asBuyer} /> },
          { label: 'باع', value: <ArabicNumber value={user.counts.asSeller} /> },
          {
            label: 'رصيد المحفظة',
            value:
              user.wallet === null ? 'لا محفظة' : <Money amount={Number(user.wallet.balance)} />,
          },
          {
            label: 'عضوٌ منذ',
            value: riyadh.format(new Date(user.createdAt)),
          },
        ]}
      />

      <MonitorTabs
        basePath={`/admin/users/${encodeURIComponent(user.id)}`}
        param="tab"
        active={tab}
        tabs={TABS.map((row) => ({
          key: row.key,
          label: row.label,
          ...(row.key === 'money'
            ? { count: user.ledger.length }
            : row.key === 'access'
              ? { count: user.overrides.length }
              : {}),
        }))}
      />

      {tab !== null ? null : (
      <DetailColumns
        main={
          <>
            <DetailCard
              title="الإعلانات"
              note={`المعروض آخر عشرة من ${displayDigits(String(user.counts.listings))}`}
            >
              {user.listings.length === 0 ? (
                <p className="text-2xs opacity-50">لا إعلانات.</p>
              ) : (
                user.listings.map((listing) => (
                  <div
                    key={listing.ref}
                    className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-0"
                  >
                    <Link
                      href={`/admin/listings/${encodeURIComponent(listing.ref)}`}
                      dir="ltr"
                      className="font-num text-start text-2xs font-bold underline underline-offset-4 hover:opacity-70"
                    >
                      {listing.ref}
                    </Link>
                    <span className="flex items-center gap-3 text-3xs opacity-60">
                      <Money amount={Number(listing.askPrice)} showCurrency={false} />
                      <span>{listing.status}</span>
                      {/* مسودّةٌ لم تُنشر بلا تاريخ — والفراغ أصدق من صفر */}
                      <span>{listing.at === null ? 'لم يُنشر' : riyadh.format(new Date(listing.at))}</span>
                    </span>
                  </div>
                ))
              )}
            </DetailCard>

            <DetailCard title="الطلبات" note="من الجانبين — والجانب مكتوب">
              {user.orders.length === 0 ? (
                <p className="text-2xs opacity-50">لا طلبات.</p>
              ) : (
                user.orders.map((order) => (
                  <div
                    key={`${order.side}-${order.ref}`}
                    className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-0"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Link
                        href={`/admin/orders/${encodeURIComponent(order.ref)}`}
                        dir="ltr"
                        className="font-num text-start text-2xs font-bold underline underline-offset-4 hover:opacity-70"
                      >
                        {order.ref}
                      </Link>
                      {/*
                        عميلٌ باع واشترى تُعرض طلباته مختلطةً بلا تمييز
                        فتُقرأ خطأً — والجانب هنا بجانب المرجع.
                      */}
                      <Badge tone="neutral">{order.side === 'buyer' ? 'مشتريًا' : 'بائعًا'}</Badge>
                    </span>
                    <span className="flex items-center gap-3 text-3xs opacity-60">
                      {/*
                        **قراءةٌ واحدة لا قراءتان.** كانت المرحلة
                        بالعربية و`status` خامًّا بالإنجليزية بجوارها:
                        «الدفع  CANCELLED» — جملتان تتناقضان، وإحداهما
                        غير مترجمة في لوحةٍ عربية. والقرار ١٧: «أُلغي
                        عند الدفع».
                      */}
                      <span>{orderStateLabel(order.status, order.stage).text}</span>
                      <span>{riyadh.format(new Date(order.at))}</span>
                    </span>
                  </div>
                ))
              )}
            </DetailCard>

          </>
        }
        side={
          <DetailCard title="لمحة">
            <Field label="الاسم" value={user.name} />
            <Field label="الهاتف" value={user.phone} ltr />
            {user.email === null ? null : <Field label="البريد" value={user.email} ltr />}
            {user.dealerName === null ? null : <Field label="المعرض" value={user.dealerName} />}
          </DetailCard>
        }
      />
      )}

      {tab !== 'activity' ? null : (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-1.5 text-sm font-bold">خطّ الزمن</h2>
          <p className="mb-5 max-w-xl text-3xs leading-loose opacity-55">
            ما فعله هذا الحساب في السوق مرتَّبًا: إنشاؤه، وإعلاناته، وعروضه،
            وما اشتراه وما باعه، وبلاغاتُه، وأثر الفريق عليه.
          </p>
          <Timeline events={events} />
        </section>
      )}

      {tab !== 'money' ? null : (
      <DetailColumns
        main={
          <>
            <DetailCard title="المحفظة" note="الرصيد وحركته وأدوات التعديل">
              <WalletPanel
                userId={user.id}
                balance={user.wallet?.balance ?? '0.00'}
                lines={user.wallet?.lines ?? []}
                pending={user.pendingAdjustment}
                canAdjust={canWrite(admin.role, 'wallet.adjust')}
                meId={admin.id}
              />
            </DetailCard>

            {/*
              **كشف عملياته من الدفتر لا من تجميع طلباته.** والدفتر يقول
              «لماذا تغيّر» لا «كم صار» — وهو ما يُحتاج حين يشكو عميل.
            */}
            <DetailCard
              title="كشف العمليات"
              note={<>آخر <Quantity unit="ledgerLines" count={user.ledger.length} /></>}
            >
              {user.ledger.length === 0 ? (
                <p className="text-2xs opacity-50">
                  لا قيود — ولم تمرّ عليه صفقةٌ مدفوعة بعد.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-2xs">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="p-2 text-start font-bold">الحدث</th>
                        <th className="p-2 text-start font-bold">الحساب</th>
                        <th className="p-2 text-start font-bold">الاتّجاه</th>
                        <th className="p-2 text-start font-bold">المبلغ</th>
                        <th className="p-2 text-start font-bold">الطلب</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.ledger.map((row) => (
                        <tr key={row.id} className="border-b border-line last:border-0">
                          <td dir="ltr" className="font-num p-2 text-start opacity-70">
                            {row.event}
                          </td>
                          <td className="p-2 opacity-70">
                            {LEDGER_ACCOUNT_LABEL[row.account] ?? row.account}
                          </td>
                          <td className="p-2">
                            <Badge tone={row.direction === 'DEBIT' ? 'neutral' : 'accent'}>
                              {row.direction === 'DEBIT' ? 'مدين (له)' : 'دائن (عليه)'}
                            </Badge>
                          </td>
                          <td className="p-2">
                            <ArabicNumber value={Number(row.amount)} decimals={2} />
                          </td>
                          <td dir="ltr" className="font-num p-2 text-start opacity-60">
                            {row.orderRef ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DetailCard>
          </>
        }
        side={
          <DetailCard title="لمحة">
            <Field
              label="الرصيد"
              value={user.wallet === null ? 'لا محفظة' : <Money amount={Number(user.wallet.balance)} />}
              strong
            />
          </DetailCard>
        }
      />
      )}

      {tab !== 'access' ? null : (
      <DetailColumns
        main={
          <>
            {user.overrides.length === 0 ? (
              <DetailCard title="تجاوزات الخصائص">
                {/* **وغيابُه يُقال** — بطاقةٌ تُحذف تجعل القارئ يظنّ أنه لم يبحث */}
                <p className="text-2xs opacity-55">لا تجاوزات على هذا الحساب.</p>
              </DetailCard>
            ) : (
              <DetailCard title="تجاوزات الخصائص" note="بسببها">
                {user.overrides.map((override) => (
                  <Field
                    key={override.id}
                    label={override.reason}
                    value={`${override.entitlementKey} = ${override.value}`}
                    ltr
                  />
                ))}
              </DetailCard>
            )}
          </>
        }
        side={
          <>
            {/* **والحساب والأرقام والتوثيق معًا هنا** — وهي ما يُقرَّر به في هذه التبويبة */}
            <DetailCard title="الحساب">
              <Field label="رقم العميل" value={user.ref ?? 'لم يُمنح بعد'} ltr strong />
              <Field label="الاسم" value={user.name} />
              <Field label="الهاتف" value={user.phone} ltr />
              <Field label="البريد" value={user.email ?? 'لم يُضف'} ltr />
              <Field label="الدور" value={user.role} ltr />
              <Field label="انضمّ" value={riyadh.format(new Date(user.createdAt))} />
              <Field
                label="موافقة التسويق"
                value={user.marketingConsent ? 'موافق' : 'غير موافق'}
              />
            </DetailCard>

            <DetailCard title="الأرقام">
              <Field
                label="إعلانات"
                value={<ArabicNumber value={user.counts.listings} />}
              />
              <Field label="شراءً" value={<ArabicNumber value={user.counts.asBuyer} />} />
              <Field label="بيعًا" value={<ArabicNumber value={user.counts.asSeller} />} />
              <Field
                label="مفضّلة"
                value={<ArabicNumber value={user.counts.favorites} />}
              />
              <Field
                label="رصيد المحفظة"
                value={<Money amount={Number(user.wallet?.balance ?? '0.00')} />}
                strong
              />
            </DetailCard>

            <DetailCard title="التوثيق والضريبة">
              {/*
                ═══ والاطلاع على الهوية هنا لا في القائمة ═══

                كان `IdentityPanel` في جدول العملاء، فلمّا صار الجدول
                كروتًا كادت القدرة كلها تذهب معه — **والدمج يُيتّم ما
                كان في المحذوف**، وهو صنف وقع في هذا المستودع من قبل.

                وموضعها هنا أصح أصلًا: الاطلاع فعل مقصود على **عميل
                واحد** بسبب مكتوب ويُسجَّل باسم من اطّلع — لا شيء
                يُعرض في صف من مئة.
              */}
              <IdentityPanel userId={user.id} allowed={canWrite(admin.role, 'users.viewIdentity')} />
              <div className="h-3" />
              <Field label="حالة الهوية" value={user.identityStatus} ltr />
              {user.identitySubmittedAt === null ? null : (
                <Field
                  label="قُدّمت"
                  value={riyadh.format(new Date(user.identitySubmittedAt))}
                />
              )}
              <Field
                label="الوضع الضريبيّ"
                value={user.taxStatus === null ? 'لم يُسأل بعد' : (TAX_LABEL[user.taxStatus] ?? user.taxStatus)}
              />
              {user.vatNumber === null ? null : (
                <Field label="الرقم الضريبيّ" value={user.vatNumber} ltr />
              )}

              {/*
                ═══ هامشُ الربح — وما كان يُمنح من مكان ═══

                `grantMarginScheme` مبنيّةٌ ولا ينادِيها شيء، فبائعٌ
                مسجَّلٌ يستحقّه تُحتسب عليه الضريبة على **كامل السعر**
                إلى الأبد. وصلاحيّتُه صلاحيةُ المال: المنحُ يغيّر ما
                يُحتسب على كل بيعةٍ له.
              */}
              {canWrite(admin.role, 'wallet.adjust') ? (
                <div className="mt-3 border-t border-line-2 pt-3">
                  <MarginPanel
                    userId={user.id}
                    approved={user.marginSchemeApproved}
                    reference={user.marginSchemeRef}
                    registered={user.vatNumber !== null && user.vatNumber !== ''}
                  />
                </div>
              ) : user.marginSchemeApproved ? (
                <Field label="هامش الربح" value={user.marginSchemeRef ?? 'ممنوح'} ltr />
              ) : null}

              {/*
                **الرقم لا يُقرأ من هنا.** وقراءتُه تمرّ بمسارها المُقيَّد
                الذي يكتب أثرًا — فلا تقع عرَضًا ولا بلا تسجيل.
              */}
              {can(admin.role, 'users.viewIdentity') ? (
                <Link
                  href="/admin/identity"
                  className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
                >
                  طابور توثيق الهوية
                </Link>
              ) : null}
              <p className="mt-2 text-3xs opacity-45">
                رقم الهوية لا يُعرض هنا — قراءته تمرّ بمسارها المقيَّد وتُسجَّل.
              </p>
            </DetailCard>
          </>
        }
      />
      )}
    </AdminShell>
  );
}
