import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { DetailCard, DetailColumns, DetailHeader, Field } from '@/components/admin/DetailShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { adminServiceRequestDetail } from '@/lib/domain/admin-detail-readers';
import { toArabicDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';

const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

const STATUS_TONE: Record<string, 'accent' | 'warn' | 'danger' | 'neutral'> = {
  DONE: 'accent',
  IN_PROGRESS: 'warn',
  ASSIGNED: 'warn',
  NEW: 'neutral',
  FAILED: 'danger',
  REFUNDED: 'danger',
};

/** الالتزام نصًّا — والوحدة في التسمية لا بعد الرقم (البوابة ١٨). */
function sla(hours: number | null): string {
  if (hours === null) return 'بلا التزام';
  if (hours === 0) return 'فوريّ';
  if (hours < 72) return `ساعات (${toArabicDigits(String(hours))})`;
  return `أيّام (${toArabicDigits(String(Math.round(hours / 24)))})`;
}

/**
 * تفاصيل طلب الخدمة — المزوّد والالتزام والنتيجة.
 *
 * **والتأخّر يُقاس من المهلة والزمن والحالة معًا**: طلبٌ منتهٍ فات
 * موعدُه ليس متأخّرًا — لا أحد ينتظره.
 */
export default async function AdminServiceRequestDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'serviceRequests.handle')) redirect('/admin');

  const { ref } = await params;
  const request = await adminServiceRequestDetail(decodeURIComponent(ref));
  if (request === null) notFound();

  return (
    <AdminShell title="تفاصيل طلب الخدمة" activeHref="/admin/service-requests" admin={admin}>
      <DetailHeader
        backHref="/admin/service-requests"
        backLabel="طلبات الخدمات"
        reference={request.ref}
        title={`${request.service.nameAr} — ${request.customer.name}`}
        badges={
          <>
            <Badge tone={STATUS_TONE[request.status] ?? 'neutral'}>{request.status}</Badge>
            {request.overdue ? <Badge tone="danger">تجاوز الالتزام</Badge> : null}
          </>
        }
      />

      <DetailColumns
        main={
          <>
            <DetailCard title="الخدمة">
              <Field label="الاسم" value={request.service.nameAr} />
              <Field label="الفئة" value={request.service.category} ltr />
              <Field label="السعر" value={<Money amount={Number(request.amount)} />} strong />
              {/*
                رسمنا الإداريّ سطرٌ ثانٍ مستقلّ — ودمجُه في السعر يُسقط
                وصف الصرف عن المبلغ كلّه فتُستحقّ الضريبة على كامله.
              */}
              <Field label="رسمنا الإداريّ" value={<Money amount={Number(request.adminFee)} />} />
            </DetailCard>

            {request.inspectionScore === null && request.resultUrl === null ? null : (
              <DetailCard title="النتيجة">
                {request.inspectionScore === null ? null : (
                  <Field
                    label="درجة الفحص"
                    value={<ArabicNumber value={request.inspectionScore} />}
                    strong
                  />
                )}
                {request.resultUrl === null ? (
                  <p className="text-2xs opacity-50">لم يُرفع تقرير بعد.</p>
                ) : (
                  <Field label="التقرير" value={request.resultUrl} ltr />
                )}
              </DetailCard>
            )}
          </>
        }
        side={
          <>
            <DetailCard title="التوقيت">
              <Field label="قُدّم" value={riyadh.format(new Date(request.createdAt))} />
              {request.dueAt === null ? (
                <Field label="الموعد" value="بلا موعد" />
              ) : (
                <Field
                  label="الموعد"
                  value={
                    <span className={request.overdue ? 'text-danger' : undefined}>
                      {riyadh.format(new Date(request.dueAt))}
                    </span>
                  }
                  strong
                />
              )}
            </DetailCard>

            <DetailCard title="المزوّد">
              {request.provider === null ? (
                <p className="text-2xs opacity-50">
                  لم يُسنَد بعد — والإسناد آليّ لمزوّدٍ مفعّل في مدينة العميل بأقلّ حِمل.
                </p>
              ) : (
                <>
                  <Field label="الاسم" value={request.provider.nameAr} />
                  <Field label="الالتزام" value={sla(request.provider.slaHours)} />
                  <Link
                    href="/admin/providers"
                    className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
                  >
                    افتح المزوّدين
                  </Link>
                </>
              )}
            </DetailCard>

            <DetailCard title="العميل والإعلان">
              <Field label="العميل" value={request.customer.name} />
              {request.listingRef === null ? null : (
                <Field label="الإعلان" value={request.listingRef} ltr />
              )}
              <div className="mt-3 flex flex-wrap gap-4">
                <Link
                  href={`/admin/users/${request.customer.id}`}
                  className="text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
                >
                  افتح ملفّه
                </Link>
                {request.listingRef === null ? null : (
                  <Link
                    href={`/admin/listings/${encodeURIComponent(request.listingRef)}`}
                    className="text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
                  >
                    افتح الإعلان
                  </Link>
                )}
              </div>
            </DetailCard>
          </>
        }
      />
    </AdminShell>
  );
}
