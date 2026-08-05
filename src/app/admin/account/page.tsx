import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { currentAdmin } from '@/lib/auth/admin-session';
import { ownAccount } from '@/lib/domain/admin-account';
import { ADMIN_SESSION_HOURS } from '@/lib/domain/admin-auth';
import { PERMISSION_LIST, can, canWrite } from '@/lib/domain/permissions';
import { toArabicDigits } from '@/lib/arabic';
import { PasswordForm } from './PasswordForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'حسابي' };

const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * حسابي — تغيير كلمة الأدمن.
 *
 * الدخول بالكلمة وحدها منذ أُلغيت المصادقة الثنائية، **ولا باب كان
 * لتغييرها**: من دخل بكلمةٍ مؤقّتة يبقى عليها، ومن ظنّ كلمتَه انكشفت
 * لا يملك إلا أن يطلب من صاحب لوحة النشر تغييرها — وهي أطول طريقٍ
 * ممكن لأعجل حاجة.
 *
 * ═══ ولا صلاحية تُشترط ═══
 *
 * تغييرُ كلمتك ليس صلاحيةً يمنحها دور: **كل من دخل يملكه**. واشتراطُ
 * صلاحيةٍ يجعل أضعف الأدوار عاجزًا عن إغلاق بابٍ انكشف.
 */
export default async function AdminAccountPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');

  const account = await ownAccount(admin.id);
  if (account === null) redirect('/admin/login');

  const mine = PERMISSION_LIST.filter((permission) => can(admin.role, permission));

  return (
    <AdminShell title="حسابي"
      subtitle="حسابك وكلمته" activeHref="/admin/account" admin={admin}>
      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-sm font-bold">الحساب</h2>

          <div className="flex flex-col divide-y divide-line border-y border-line">
            <Row label="الاسم" value={account.name} />
            {/* البريد يُقارن خانةً بخانة — لاتينيّ معزول */}
            <Row label="البريد" value={account.email} ltr />
            <Row label="الدور" value={account.role} ltr />
            <Row
              label="آخر دخول"
              value={
                account.lastSeenAt === null
                  ? 'لم يُسجَّل بعد'
                  : riyadh.format(new Date(account.lastSeenAt))
              }
            />
            <Row
              label="جلسات حيّة"
              value={`${toArabicDigits(String(account.activeSessions))} — صلاحيتها ساعات (${toArabicDigits(String(ADMIN_SESSION_HOURS))})`}
            />
          </div>

          {/*
            **الاسم والدور لا يُغيَّران من هنا.** رفعُ الصلاحية أخطر ما
            في اللوحة، ويمرّ بمتغيّرات النشر — فمن سرق جلسةً لا يرفع
            نفسه بنقرة.
          */}
          <p className="mt-4 text-3xs leading-loose opacity-55">
            الاسم والدور والبريد تُضبط من متغيّرات النشر، لا من هنا — فمن سرق جلسةً لا
            يرفع دوره بنقرة.
          </p>

          <h2 className="mt-9 mb-3.5 text-sm font-bold">
            ما تملكه ({toArabicDigits(String(mine.length))})
          </h2>
          <div className="flex flex-wrap gap-2">
            {mine.map((permission) => (
              <span
                key={permission}
                className="font-num rounded-full border border-line px-3 py-1 text-3xs"
                title={canWrite(admin.role, permission) ? 'قراءة وكتابة' : 'قراءة فقط'}
              >
                {permission}
                {canWrite(admin.role, permission) ? null : (
                  <span className="opacity-45"> · قراءة</span>
                )}
              </span>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold">
            كلمة المرور
            {account.mustChangePassword ? <Badge tone="warn">يلزم تغييرها</Badge> : null}
          </h2>

          <PasswordForm minLength={account.minPasswordLength} />
        </section>
      </div>
    </AdminShell>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-2xs opacity-60">{label}</span>
      <span
        dir={ltr === true ? 'ltr' : undefined}
        className={`truncate text-2xs font-semibold ${ltr === true ? 'font-num' : 'bidi-isolate'}`}
      >
        {value}
      </span>
    </div>
  );
}
