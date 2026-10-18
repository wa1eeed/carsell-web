import { redirect } from 'next/navigation';
import { Counted } from '@/components/ui/Counted';
import { AdminShell } from '@/components/admin/AdminShell';
import { ChannelDefault } from './ChannelDefault';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import {
  PUSH_BODY_LIMIT,
  PUSH_TITLE_LIMIT,
  STALE_TOKEN_DAYS,
  deviceStats,
  listChannels,
  pushTemplateFit,
} from '@/lib/domain/push-channels';
import { PushPreview } from '@/components/admin/PushPreview';

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
  // والقراءة تدخل، والكتابة وحدها ترى الزرّ — والخادم يفحصها ثانيةً
  const writable = canWrite(admin.role, 'notifications.manage');

  const [channels, devices, templates] = await Promise.all([
    listChannels(),
    deviceStats(),
    pushTemplateFit(),
  ]);

  /** المتجاوزون — وهم ما يحتاج عملًا، فيُعدّون في الصدر. */
  const over = templates.filter((row) => row.titleOver || row.bodyOver);

  return (
    <AdminShell title="إشعارات الدفع" activeHref="/admin/push" admin={admin}>
      <p className="mb-4 text-2xs opacity-70">
        FCM لأندرويد و APNs لآيفون · التسجيل والإرسال يفعلان مع التطبيق
      </p>

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Stat title="أجهزة مسجلة" value={devices.total} />
        <Stat title="آيفون" value={devices.ios} />
        <Stat title="أندرويد" value={devices.android} />
        <Stat
          title="رموز ميتة"
          value={devices.stale}
          note={<Counted message="unseenSince" count={STALE_TOKEN_DAYS} />}
        />
      </div>

      <section className="mb-5 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[560px] text-2xs">
          <thead className="border-b border-line text-3xs opacity-65">
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
                  <span className="font-num block text-3xs opacity-65" dir="ltr">
                    {channel.key}
                  </span>
                </td>
                <td className="p-3.5">
                  {channel.userControllable ? (
                    <Badge tone="neutral">نعم</Badge>
                  ) : (
                    /* «لا — حرِجة» كما في الترميز: السبب مع الحكم */
                    <Badge tone="warn">لا — حرجة</Badge>
                  )}
                </td>
                <td className="p-3.5">
                  {/*
                    **حالٌ كانت تُعرض ولا تُبدَّل.** `updateChannel`
                    مبنيّةٌ ولا ينادِيها شيء، فتبديلُ ما يصل المستخدمَ
                    الجديد افتراضًا كان يحتاج صفًّا في القاعدة بيد.
                  */}
                  {writable ? (
                    <ChannelDefault
                      channelKey={channel.key}
                      defaultOn={channel.defaultOn}
                      controllable={channel.userControllable}
                    />
                  ) : (
                    <span className="opacity-70">{channel.defaultOn ? 'مفتوحة' : 'مغلقة'}</span>
                  )}
                </td>
                <td className="p-3.5 text-end">
                  {channel.userControllable ? (
                    <ArabicNumber value={channel.disabledBy} />
                  ) : (
                    <span className="opacity-65">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/*
        ═══ معاينة على الجهاز — والقاعدة تُقاس لا تُكتب ═══

        التصميم يضع المعاينة ثمّ يكتب تحتها الحدّ الآمن. وكانت الشاشة
        تكتب القاعدة **ولا تقيس عليها شيئًا** — ولا أحد يعدّ حروف
        ثمانيةٍ وثلاثين قالبًا بيده.
      */}
      <section className="mb-5 grid gap-5 rounded-lg border border-line bg-surface p-5.5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div>
          <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">
            معاينة على الجهاز
          </h2>
          <PushPreview
            template={templates[0] ?? null}
            titleLimit={PUSH_TITLE_LIMIT}
            bodyLimit={PUSH_BODY_LIMIT}
          />
        </div>

        <div className="min-w-0">
          <h2 className="mb-3 flex flex-wrap items-center gap-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">
            قوالب الدفع مقيسة بالحد
            {over.length === 0 ? null : (
              <Badge tone="warn">
                {/* **والعدد لا يحكم المعدود بيدٍ** — ستّ صيغ جمعٍ لا تُكتب نصًّا */}
                <Quantity unit="truncatedTemplates" count={over.length} />
              </Badge>
            )}
          </h2>

          {templates.length === 0 ? (
            <p className="text-2xs opacity-70">لا قوالب دفع مفعلة.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {templates.slice(0, 8).map((row) => (
                <li key={row.key} className="flex items-center gap-3 py-2.5 text-2xs">
                  <span className="min-w-0 flex-1 truncate">{row.titleAr}</span>
                  <span dir="ltr" className="font-num shrink-0 opacity-70">
                    <ArabicNumber value={row.titleChars} grouped={false} />
                    <span className="opacity-65"> · </span>
                    <ArabicNumber value={row.bodyChars} grouped={false} />
                  </span>
                  {row.titleOver || row.bodyOver ? (
                    <Badge tone="warn">سيختصر</Badge>
                  ) : (
                    <span aria-hidden className="shrink-0 text-accent-700">✓</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2.5 text-3xs leading-loose opacity-65">
            العنوان ثم المتن بالحروف — والحد{' '}
            <Quantity unit="characters" count={PUSH_TITLE_LIMIT} /> و
            <Quantity unit="characters" count={PUSH_BODY_LIMIT} />.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">قواعد مفعلة</h2>
        <ul className="flex flex-col gap-2.5 text-sm leading-loose opacity-72">
          <li>
            <strong>الحرجة لا تطفأ</strong> — المزاد الذي يشارك فيه، والطلبات والدفع. ومن
            يخسر مزادا لأنه أطفأ إشعارا ظنه تسويقيا لا يعنيه أين كان الفحص، فالمنع في
            المجال لا في الشاشة.
          </li>
          <li>التسويقي مغلق افتراضيا — الموافقة تطلب لا تفترض.</li>
          <li>
            الحد الآمن للنص: <Quantity unit="characters" count={PUSH_TITLE_LIMIT} /> للعنوان و
            <Quantity unit="characters" count={PUSH_BODY_LIMIT} /> للمتن — وما زاد سيختصر على
            أندرويد.
          </li>
          <li>طلب الإذن بعد أول تفاعل ذي قيمة لا عند التشغيل.</li>
          <li>تجميع إشعارات المزاد الواحد في إشعار متحدث، واستبدال القديم بالمعرف نفسه.</li>
          <li>حذف رمز الجهاز عند أول رفض من المزود — والرمز الميت يطارد بلا فائدة.</li>
          <li>
            إن كان المستخدم داخل التطبيق وعلى الشاشة المعنية فلا إشعار دفع — تحديث حي فقط.
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
      <h2 className="text-3xs font-bold tracking-[0.14em] opacity-65">{title}</h2>
      <p className="mt-2 text-2xl font-bold">
        <ArabicNumber value={value} />
      </p>
      {note === undefined ? null : <p className="mt-1 text-3xs opacity-65">{note}</p>}
    </section>
  );
}
