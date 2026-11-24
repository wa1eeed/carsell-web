import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminLink } from '@/components/admin/AdminLink';
import { ListFooter } from '@/components/admin/ListFooter';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { sendLog } from '@/lib/domain/push-delivery';
import { PUSH_SEND_STATUS_LABEL } from '@/lib/labels/admin';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'سجل الإرسال' };

/**
 * ═══ سجلّ الإرسال — A10 ═══
 *
 * الترميز يضع في ترويسة «إشعارات الدفع» زرَّين: «اختبار على جهازي»
 * و«سجل الإرسال». والثاني مبنيٌّ هنا، والأوّل لا يمكن أن يعمل: لا
 * دافعَ إلى FCM/APNs في المنتج، **و`DeviceToken` معلَّقٌ بـ`User` لا
 * بـ`AdminUser`** — فليس للمشغّل جهازٌ يُرسَل إليه أصلًا. والسببُ
 * مسجَّلٌ في `DESIGN-DEVIATIONS.md`، وزرٌّ ميّت أسوأ من غيابه.
 *
 * ═══ ولماذا يُبنى سجلٌّ فارغ ═══
 *
 * `PushSend` يُكتب في المنتج اليوم (`notifications.ts` تنادي
 * `queueSend` لكل إشعارٍ على قناةِ دفعٍ لصاحب جهاز) — **فالكاتب قائم،
 * والصفوف صفرٌ لأن لا أجهزة بلا تطبيق**. وهي حالٌ تنتهي بالتطبيق لا
 * فراغٌ دائم، والشاشةُ تقول ذلك بنصّها.
 *
 * وبلا هذا السجلّ تُقرأ `PushSend` بالعدّ وحده: أربعُ نسبٍ تقول **كم**
 * ولا شيء يقول **لمن**. وسؤال المشغّل حين يكتب له مستخدم «لم يصلني
 * إشعار» ليس نسبة.
 */
const GROUPS = [
  { key: null, label: 'الكل' },
  { key: 'queued', label: 'في الانتظار' },
  { key: 'sent', label: 'أرسل' },
  { key: 'delivered', label: 'سلم' },
  { key: 'failed', label: 'فشل' },
] as const;

const TONE: Readonly<Record<string, 'neutral' | 'accent' | 'warn' | 'danger'>> = {
  queued: 'neutral',
  sent: 'warn',
  delivered: 'accent',
  failed: 'danger',
};

export default async function PushLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const search = await searchParams;
  const raw = typeof search.status === 'string' ? search.status : null;
  const active = GROUPS.find((row) => row.key === raw)?.key ?? null;

  const log = await sendLog(active);

  const tabs: MonitorTab[] = GROUPS.map((row) => ({
    key: row.key,
    label: row.label,
    count:
      row.key === null
        ? Object.values(log.byStatus).reduce((sum, value) => sum + value, 0)
        : (log.byStatus[row.key] ?? 0),
    ...(row.key === 'failed' ? { tone: 'danger' as const } : {}),
  }));

  return (
    <AdminShell
      title="سجل الإرسال"
      subtitle="ما أرسل لكل مستخدم وقناة، وأين وقف"
      activeHref="/admin/push"
      admin={admin}
    >
      <p className="mb-5 max-w-xl text-2xs leading-loose opacity-70">
        كل صف هنا إشعار دفع استحق الإرسال لمستخدم بعينه. ويفتح الصف عند الاستحقاق لا
        عند النجاح، فحاله يقول أين وقف.{' '}
        <AdminLink href="/admin/push" className="font-bold text-accent-700">
          عد إلى القنوات
        </AdminLink>
      </p>

      <MonitorTabs tabs={tabs} active={active} basePath="/admin/push/log" param="status" />

      {log.rows.length === 0 ? (
        <EmptyState
          title="لا إرسال مسجل بعد"
          description="الصف يفتح لمستخدم له جهاز مسجل، ولا أجهزة قبل التطبيق. والكاتب قائم: كل إشعار على قناة دفع يفتح صفه هنا."
        />
      ) : (
        <section className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[820px] text-2xs">
            <thead className="border-b border-line text-3xs opacity-65">
              <tr>
                <th className="p-3.5 text-start font-bold">القناة</th>
                <th className="p-3.5 text-start font-bold">القالب</th>
                <th className="p-3.5 text-start font-bold">المستخدم</th>
                <th className="p-3.5 text-start font-bold">الجهاز</th>
                <th className="p-3.5 text-start font-bold">الحال</th>
                <th className="p-3.5 text-start font-bold">أرسل</th>
                <th className="p-3.5 text-start font-bold">سلم</th>
                <th className="p-3.5 text-start font-bold">فتح</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {log.rows.map((row) => (
                <tr key={row.id}>
                  <td className="p-3.5">{row.channelNameAr}</td>
                  <td className="min-w-0 p-3.5">
                    {/* **والقالبُ بعنوانه لا بمفتاحه** — المفتاح يُقرأ شيفرةً. */}
                    <span className="block max-w-56 truncate">
                      {row.templateTitleAr ?? row.templateKey ?? '—'}
                    </span>
                  </td>
                  <td className="p-3.5">{row.userName ?? '—'}</td>
                  <td className="p-3.5 font-num" dir="ltr">
                    {row.platform ?? '—'}
                  </td>
                  <td className="p-3.5">
                    <Badge tone={TONE[row.status] ?? 'neutral'}>
                      {PUSH_SEND_STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                    {/* **والسببُ يُقال** — «فشل» بلا سبب لا يُتصرَّف فيه. */}
                    {row.failReason === null ? null : (
                      <span className="mt-1 block text-3xs opacity-70">{row.failReason}</span>
                    )}
                  </td>
                  <td className="p-3.5 font-num" dir="ltr">
                    {stamp(row.sentAt)}
                  </td>
                  <td className="p-3.5 font-num" dir="ltr">
                    {stamp(row.deliveredAt)}
                  </td>
                  <td className="p-3.5 font-num" dir="ltr">
                    {stamp(row.openedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <ListFooter
        shown={log.rows.length}
        total={log.total}
        note="الأحدث أولا"
        can="قراءة ما أرسل ومتى سلم وفتح، وسبب الفشل حين يقع."
        cannot="إعادة الإرسال من هنا — الصف أثر لا أمر، والإشعار يعاد من مصدره."
      />
    </AdminShell>
  );
}

/**
 * وقتٌ قصير — **يوم وساعة بلا سنة**: السجلّ يُقرأ على أيّامٍ قليلة،
 * والسنةُ في كل صفٍّ ضجيجٌ يزيح ما يُقرأ.
 */
function stamp(iso: string | null): string {
  if (iso === null) return '—';
  return iso.slice(5, 16).replace('T', ' ');
}
