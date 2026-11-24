import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminLink } from '@/components/admin/AdminLink';
import { ListFooter } from '@/components/admin/ListFooter';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { TimeAgo } from '@/components/ui/TimeAgo';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { notificationLog } from '@/lib/domain/admin-notifications';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'سجل الإرسال' };

/**
 * ═══ سجلّ الإرسال — A8 ═══
 *
 * بطاقاتُ الشاشة تقول **كم** أُرسل، ولا شيء يقول **لمن**. وحين يكتب
 * مستخدمٌ «لم يصلني إشعار» لا يُجاب بنسبة: يُفتح صفُّه باسمه ووقته.
 *
 * **و«أقرأه» أقربُ ما عندنا إلى «وصل»** — لا مزوّدَ يردّ إيصالًا، فلا
 * يُقال «سُلّم» عمّا لا نعرفه.
 */
export default async function NotificationLogPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const { key } = await searchParams;
  const rows = await notificationLog(key === undefined || key === '' ? {} : { templateKey: key });
  /** لحظةٌ واحدة للصفحة كلّها — فلا يختلف صفّان قُرئا في الطلب نفسه */
  const now = new Date().toISOString();

  return (
    <AdminShell
      title="سجل الإرسال"
      subtitle="ما كتب في جرس المستخدمين — بأسمائهم وأوقاتهم"
      activeHref="/admin/notifications"
      admin={admin}
    >
      <p className="mb-5 max-w-xl text-2xs leading-loose opacity-70">
        هذا ما وصل جرس المستخدم داخل المنتج. وإشعارات الدفع إلى الأجهزة لها{' '}
        <AdminLink href="/admin/push/log">سجلها الخاص</AdminLink> — ولا تخرج قبل التطبيق.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="لا إشعارات بعد"
          description="أول إشعار يكتبه المنتج لمستخدم يظهر هنا بوقته ومن كتب له."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[640px] text-2xs">
            <thead className="border-b border-line text-3xs opacity-65">
              <tr>
                <th className="p-3.5 text-start font-bold">الإشعار</th>
                <th className="p-3.5 text-start font-bold">المستلم</th>
                <th className="p-3.5 text-start font-bold">الأولوية</th>
                <th className="p-3.5 text-start font-bold">الوقت</th>
                <th className="p-3.5 text-start font-bold">قرأه</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="p-3.5">
                    <span className="block font-bold">{row.subjectAr ?? row.templateKey}</span>
                    <span className="font-num block text-3xs opacity-65" dir="ltr">
                      {row.templateKey}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <span className="bidi-isolate block">{row.recipientName}</span>
                    <span className="font-num block text-3xs opacity-65" dir="ltr">
                      {row.recipientPhone}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <Badge tone={row.priority === 'critical' ? 'warn' : 'neutral'}>
                      {row.priority === 'critical'
                        ? 'حرج'
                        : row.priority === 'high'
                          ? 'عالي'
                          : 'عادي'}
                    </Badge>
                  </td>
                  <td className="p-3.5">
                    <TimeAgo at={row.at} now={now} />
                  </td>
                  <td className="p-3.5">
                    {row.readAt === null ? (
                      <span className="opacity-65">لم يقرأ</span>
                    ) : (
                      <TimeAgo at={row.readAt} now={now} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ListFooter
        shown={rows.length}
        total={null}
        note="الأحدث أولا"
        can="قراءة ما أرسل ومتى قرئ."
        cannot="إعادة الإرسال أو الحذف. الإشعار أثر لا يعدل."
        automatic="يكتب الصف مع كل إشعار يرسله المنتج."
      />
    </AdminShell>
  );
}
