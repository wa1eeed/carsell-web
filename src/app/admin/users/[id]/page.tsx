import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  DetailCard,
  DetailColumns,
  DetailHeader,
  Field,
} from '@/components/admin/DetailShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { adminUserDetail } from '@/lib/domain/admin-entity-detail';
import { STAGE_LABEL } from '@/lib/labels/charts';
import { toArabicDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';

const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
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
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'users.view')) redirect('/admin');

  const { id } = await params;
  const user = await adminUserDetail(id);
  if (user === null) notFound();

  return (
    <AdminShell title="ملفّ العميل" activeHref="/admin/users" admin={admin}>
      <DetailHeader
        backHref="/admin/users"
        backLabel="العملاء"
        reference={user.phone}
        title={user.name}
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

      <DetailColumns
        main={
          <>
            <DetailCard
              title="الإعلانات"
              note={`المعروض آخر عشرة من ${toArabicDigits(String(user.counts.listings))}`}
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
                      <span>{STAGE_LABEL[order.stage] ?? order.stage}</span>
                      <span>{order.status}</span>
                      <span>{riyadh.format(new Date(order.at))}</span>
                    </span>
                  </div>
                ))
              )}
            </DetailCard>

            {user.overrides.length === 0 ? null : (
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
            <DetailCard title="الحساب">
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
              {user.wallet === null ? null : (
                <Field
                  label="رصيد المحفظة"
                  value={<Money amount={Number(user.wallet.balance)} />}
                  strong
                />
              )}
            </DetailCard>

            <DetailCard title="التوثيق والضريبة">
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
    </AdminShell>
  );
}
