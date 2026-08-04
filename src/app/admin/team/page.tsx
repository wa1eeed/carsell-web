import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { MonitorCards } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { ADMIN_ROLES, PERMISSION_LIST, can, canWrite } from '@/lib/domain/permissions';
import { teamMembers, teamStats } from '@/lib/domain/admin-team';
import { toArabicDigits } from '@/lib/arabic';
import { TeamTable } from './TeamTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الفريق والصلاحيات' };

/**
 * A35 — الفريق والصلاحيات.
 *
 * **ستّة أدوار ومصفوفةٌ واحدة** في `permissions.ts` ولا شاشة تعرضها —
 * فمن يريد أن يعرف ماذا يرى `OPS` يقرأ الشيفرة. والمصفوفة قرارُ
 * حَوكمةٍ يُراجَع لا تفصيلُ تنفيذ.
 */
export default async function AdminTeamPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'team.manage')) redirect('/admin');

  const [rows, stats] = await Promise.all([teamMembers(), teamStats()]);

  return (
    <AdminShell title="الفريق والصلاحيات" activeHref="/admin/team" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        من في الفريق وبأي دور. <b>ولا يُنشأ عضو ولا يُرفع دور من هنا</b> — ذلك يمرّ
        بمتغيّرات النشر، فمن سرق جلسةً لا يصنع لنفسه حسابًا ثانيًا.
      </p>

      <MonitorCards
        cards={[
          { title: 'أعضاء', value: stats.members, note: `أدوار (${toArabicDigits(String(stats.roles))})` },
          { title: 'جلسات نشطة', value: stats.activeSessions, note: `صلاحيتها ساعات (${toArabicDigits(String(stats.sessionHours))})` },
          { title: 'حسابات مقفلة', value: stats.locked, note: 'بعد محاولات فاشلة' },
          { title: 'الصلاحيات', value: PERMISSION_LIST.length, note: 'في المصفوفة' },
        ]}
      />

      <h2 className="mb-3.5 text-sm font-bold">الأعضاء</h2>
      <TeamTable rows={rows} meId={admin.id} />

      {/*
        **المصفوفة تُعرض لأنها قرار حَوكمة.** ومن يراجع «من يستطيع
        الإفراج عن ضمان» لا ينبغي أن يفتح ملف شيفرة ليعرف.
      */}
      <h2 className="mt-10 mb-3.5 text-sm font-bold">مصفوفة الصلاحيات</h2>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-3xl border-collapse text-2xs">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="p-3 text-start font-bold">الصلاحية</th>
              {ADMIN_ROLES.map((role) => (
                <th key={role} className="font-num p-3 text-center font-bold">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_LIST.map((permission) => (
              <tr key={permission} className="border-b border-line last:border-0">
                <td className="font-num p-3 opacity-70">{permission}</td>
                {ADMIN_ROLES.map((role) => {
                  const read = can(role, permission);
                  const write = canWrite(role, permission);
                  return (
                    <td key={role} className="p-3 text-center">
                      {write ? (
                        <span className="text-accent-700" title="قراءة وكتابة">
                          ●
                        </span>
                      ) : read ? (
                        <span className="opacity-45" title="قراءة فقط">
                          ○
                        </span>
                      ) : (
                        <span className="opacity-15">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-4 text-3xs opacity-55">
        <span>
          <span className="text-accent-700">●</span> قراءة وكتابة
        </span>
        <span>
          <span className="opacity-45">○</span> قراءة فقط
        </span>
        <span>
          <span className="opacity-30">—</span> لا يرى البند أصلًا
        </span>
      </p>
    </AdminShell>
  );
}
