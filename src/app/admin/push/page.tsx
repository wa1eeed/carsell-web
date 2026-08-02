import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import {
  PUSH_BODY_LIMIT,
  PUSH_TITLE_LIMIT,
  STALE_TOKEN_DAYS,
  deviceStats,
  listChannels,
} from '@/lib/domain/push-channels';

export const dynamic = 'force-dynamic';

/**
 * A10 — إشعارات الدفع.
 *
 * ═══ معيار القبول ═══ **الإشعارات الحرِجة لا يمكن إيقافها.**
 *
 * وهي هنا بلا مفتاح أصلًا: مفتاحٌ معطَّل يقول «ممنوع»، وغيابُه يقول
 * «ليست خيارًا». والحراسة الحقيقية في `setPreference` لا في هذه
 * الشاشة — فمفتاحٌ في الواجهة يُلتفّ عليه بطلب واحد.
 */
export default async function PushPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const [channels, devices] = await Promise.all([listChannels(), deviceStats()]);

  return (
    <AdminShell title="إشعارات الدفع" activeHref="/admin/push" admin={admin}>
      <p className="mb-4 text-2xs opacity-55">
        FCM لأندرويد و APNs لآيفون · التسجيل والإرسال يُفعَّلان مع التطبيق
      </p>

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Stat title="أجهزة مسجّلة" value={devices.total} />
        <Stat title="آيفون" value={devices.ios} />
        <Stat title="أندرويد" value={devices.android} />
        <Stat
          title="رموز ميّتة"
          value={devices.stale}
          note={<>لم تُرَ منذ <Quantity unit="days" count={STALE_TOKEN_DAYS} /></>}
        />
      </div>

      <section className="mb-5 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[560px] text-2xs">
          <thead className="border-b border-line text-3xs opacity-45">
            <tr>
              <th className="p-3.5 text-start font-bold">قناة الإشعار</th>
              <th className="p-3.5 text-start font-bold">يقدر المستخدم يوقفها</th>
              <th className="p-3.5 text-start font-bold">الافتراض</th>
              <th className="p-3.5 text-end font-bold">أوقفوها</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {channels.map((channel) => (
              <tr key={channel.key}>
                <td className="p-3.5">
                  <span className="font-bold">{channel.nameAr}</span>
                  <span className="font-num block text-3xs opacity-40" dir="ltr">
                    {channel.key}
                  </span>
                </td>
                <td className="p-3.5">
                  {channel.userControllable ? (
                    <Badge tone="neutral">نعم</Badge>
                  ) : (
                    /* «لا — حرِجة» كما في الترميز: السبب مع الحكم */
                    <Badge tone="warn">لا — حرِجة</Badge>
                  )}
                </td>
                <td className="p-3.5 opacity-70">{channel.defaultOn ? 'مفتوحة' : 'مغلقة'}</td>
                <td className="p-3.5 text-end">
                  {channel.userControllable ? (
                    <ArabicNumber value={channel.disabledBy} />
                  ) : (
                    <span className="opacity-40">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-45">قواعد مفعّلة</h2>
        <ul className="flex flex-col gap-2.5 text-sm leading-loose opacity-72">
          <li>
            <strong>الحرِجة لا تُطفأ</strong> — المزاد الذي يشارك فيه، والطلبات والدفع. ومن
            يخسر مزادًا لأنه أطفأ إشعارًا ظنّه تسويقيًّا لا يعنيه أين كان الفحص، فالمنع في
            المجال لا في الشاشة.
          </li>
          <li>التسويقي مغلق افتراضيًا — الموافقة تُطلب لا تُفترض.</li>
          <li>
            الحدّ الآمن للنصّ: <Quantity unit="characters" count={PUSH_TITLE_LIMIT} /> للعنوان و
            <Quantity unit="characters" count={PUSH_BODY_LIMIT} /> للمتن — وما زاد يُقتطع على
            أندرويد.
          </li>
          <li>طلب الإذن بعد أوّل تفاعل ذي قيمة لا عند التشغيل.</li>
          <li>تجميع إشعارات المزاد الواحد في إشعار متحدّث، واستبدال القديم بالمعرّف نفسه.</li>
          <li>حذف رمز الجهاز عند أوّل رفض من المزوّد — والرمز الميّت يُطارَد بلا فائدة.</li>
          <li>
            إن كان المستخدم داخل التطبيق وعلى الشاشة المعنيّة فلا إشعار دفع — تحديث حيّ فقط.
          </li>
        </ul>
      </section>
    </AdminShell>
  );
}

function Stat({
  title,
  value,
  note,
}: {
  title: string;
  value: number;
  note?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-3xs font-bold tracking-[0.14em] opacity-45">{title}</h2>
      <p className="mt-2 text-2xl font-bold">
        <ArabicNumber value={value} />
      </p>
      {note === undefined ? null : <p className="mt-1 text-3xs opacity-45">{note}</p>}
    </section>
  );
}
