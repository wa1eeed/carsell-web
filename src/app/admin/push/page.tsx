import { redirect } from 'next/navigation';
import { Counted } from '@/components/ui/Counted';
import { AdminLink } from '@/components/admin/AdminLink';
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
import { TemplatePicker } from './TemplatePicker';
import { ChannelFlag } from './ChannelFlag';
import {
  OPT_OUT_WINDOW_HOURS,
  type PushRate,
  channelImpact,
  pushImpact,
  ratePct,
} from '@/lib/domain/push-delivery';

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

  const [channels, devices, templates, impact, perChannel] = await Promise.all([
    listChannels(),
    deviceStats(),
    pushTemplateFit(),
    pushImpact(),
    channelImpact(),
  ]);
  const byChannel = new Map(perChannel.map((row) => [row.channelKey, row]));

  return (
    <AdminShell title="إشعارات الدفع" activeHref="/admin/push" admin={admin}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-2xs opacity-70">
          FCM لأندرويد و APNs لآيفون · التسجيل والإرسال يفعلان مع التطبيق
        </p>
        {/*
          ═══ زرّا الترميز: «اختبار على جهازي» و«سجل الإرسال» ═══

          الثاني مبنيّ. **والأوّل لا يمكن أن يعمل**: لا دافعَ إلى
          FCM/APNs في المنتج، و`DeviceToken` معلَّقٌ بـ`User` لا
          بـ`AdminUser` — فليس للمشغّل جهازٌ يُرسَل إليه أصلًا. وزرٌّ
          يُرى عاملًا ويردّ خطأً بعد الضغط أسوأ من غيابه، والسببُ
          مسجَّلٌ في `DESIGN-DEVIATIONS.md`.

          والحاجةُ التي وُضع لها — «أرِني كيف يبدو قبل أن يخرج» —
          يسدّها اختيارُ القالب في المعاينة أدناه.
        */}
        <AdminLink
          href="/admin/push/log"
          className="rounded-btn border border-line px-3.5 py-2.25 text-3xs font-bold hover:border-ink"
        >
          سجل الإرسال
        </AdminLink>
      </div>

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

      {/*
        ═══ قياس الأثر لا العدد — قاعدة A10 بنصّها ═══

        البطاقات الأربع فوق الجدول في الترميز، وكانت الشاشة تعرض
        **عدد الأجهزة وحده**. والعدد لا يقول أوصل الإشعار ولا فُتح ولا
        أطفأ أحدٌ قناةً بعده.

        **ولا واحدةٌ منها تطبع صفرًا حين لا بيانات**: «معدّل التسليم
        ٠٪» يُقرأ عطلًا في الإرسال، والحقيقة أنه لا إرسال بعد.
      */}
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <RateStat title="أذونات ممنوحة" rate={impact.permission} note="ممن سئل" />
        <RateStat title="معدل التسليم" rate={impact.delivery} note="مما أرسل" />
        <RateStat title="معدل الفتح" rate={impact.open} note="مما سلم" />
        <RateStat
          title="إيقاف بعد إشعار"
          rate={impact.optOut}
          note={<Counted message="withinHours" count={OPT_OUT_WINDOW_HOURS} />}
        />
      </div>

      <section className="mb-5 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[860px] text-2xs">
          <thead className="border-b border-line text-3xs opacity-65">
            <tr>
              <th className="p-3.5 text-start font-bold">قناة الإشعار</th>
              <th className="p-3.5 text-start font-bold">يقدر المستخدم يوقفها</th>
              <th className="p-3.5 text-start font-bold">الافتراض</th>
              <th className="p-3.5 text-start font-bold">الصوت</th>
              <th className="p-3.5 text-start font-bold">شارة</th>
              <th className="p-3.5 text-end font-bold">التسليم</th>
              <th className="p-3.5 text-end font-bold">الفتح</th>
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
                <td className="p-3.5">
                  {writable ? (
                    <ChannelFlag
                      channelKey={channel.key}
                      field="sound"
                      value={channel.sound}
                      onLabel="بصوت"
                      offLabel="صامتة"
                    />
                  ) : (
                    <span className="opacity-70">{channel.sound ? 'بصوت' : 'صامتة'}</span>
                  )}
                </td>
                <td className="p-3.5">
                  {writable ? (
                    <ChannelFlag
                      channelKey={channel.key}
                      field="badge"
                      value={channel.badge}
                      onLabel="تعد"
                      offLabel="لا تعد"
                    />
                  ) : (
                    <span className="opacity-70">{channel.badge ? 'تعد' : 'لا تعد'}</span>
                  )}
                </td>
                <td className="p-3.5 text-end">
                  <Rate value={byChannel.get(channel.key)?.delivery} />
                </td>
                <td className="p-3.5 text-end">
                  <Rate value={byChannel.get(channel.key)?.open} />
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

      <TemplatePicker
        templates={templates}
        titleLimit={PUSH_TITLE_LIMIT}
        bodyLimit={PUSH_BODY_LIMIT}
      />

      {/*
        ═══ «قواعد مفعلة» كانت تَعِد بأربعٍ لا يفرضها شيء ═══

        العنوان يقول «مفعّلة» وتحته سبعٌ: ثلاثٌ يفرضها النطاق فعلًا
        (`setPreference` و`isChannelEnabled` و`NEVER_DEFAULT_ON`
        و`pushTemplateFit`)، **وأربعٌ لا موضع لها في المنتج كلّه** —
        توقيتُ طلب الإذن وتجميعُ الإشعارات وحذفُ الرمز الميّت وكتمُ
        الإشعار داخل التطبيق. وكلُّها تحتاج التطبيق أو دافعًا إلى
        FCM/APNs، ولا وجود لأيّهما.

        فمن قرأ العنوان حسبها كلَّها قائمة — **وهو نصٌّ يَعِد بحارسٍ لا
        وجود له**، وهو الصنف الذي يقف عنده هذا المستودع. فالقائمتان
        منفصلتان، ولكلِّ قاعدةٍ مؤجَّلة ما ينقصها مكتوبًا بجوارها.
      */}
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5.5">
          <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">
            مفعلة الآن — يفرضها الخادم
          </h2>
          <ul className="flex flex-col gap-2.5 text-sm leading-loose opacity-72">
            <li>
              <strong>الحرجة لا تطفأ:</strong> المزاد الذي يشارك فيه، والطلبات والدفع.
              المنع في المجال نفسه، فلا يستطيع المستخدم إطفاءها من إعداداته.
            </li>
            <li>التسويقي مغلق افتراضيا، ولا يفتح إلا بموافقة صريحة.</li>
            <li>
              الحد الآمن للنص: <Quantity unit="characters" count={PUSH_TITLE_LIMIT} /> للعنوان
              و<Quantity unit="characters" count={PUSH_BODY_LIMIT} /> للمتن، ويقاس على كل قالب
              في الجدول أعلاه. وما زاد يختصر على أندرويد.
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-line bg-surface p-5.5">
          <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">
            تنتظر التطبيق والدافع
          </h2>
          <ul className="flex flex-col gap-2.5 text-sm leading-loose opacity-72">
            <li>طلب الإذن بعد أول تفاعل ذي قيمة لا عند التشغيل — يقرره التطبيق.</li>
            <li>
              تجميع إشعارات المزاد الواحد في إشعار متحدث، واستبدال القديم بالمعرف نفسه —
              يحتاج دافعا يبني الحمولة.
            </li>
            <li>
              حذف رمز الجهاز عند أول رفض من المزود — يحتاج دافعا يستقبل الرفض؛ والرموز
              الميتة اليوم تحسب بالزمن لا بالرفض.
            </li>
            <li>
              كتم إشعار الدفع حين يكون المستخدم على الشاشة المعنية — يقرره التطبيق.
            </li>
          </ul>
          <p className="mt-3 text-3xs leading-loose opacity-65">
            مكتوبة هنا لأنها قواعد المنتج، لا لأنها قائمة. ولا دافع إلى FCM أو APNs في
            المنتج بعد، فلا حمولة تبنى ولا رفض يصل.
          </p>
        </section>
      </div>

      {/*
        ═══ لوحان في الترميز لم يكونا في الشاشة ═══

        «التوجيه بحسب الحالة» و«قياس الأثر لا العدد» قاعدتان مكتوبتان
        في A10، وكانتا غائبتين — فمن يفتح الشاشة لا يعرف لماذا لا يصله
        إشعارٌ وهو داخل التطبيق، ولا ماذا يفعل بقناةٍ يتجاوز إيقافها
        الحدّ.
      */}
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5.5">
          <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">
            التوجيه بحسب الحالة
          </h2>
          <p className="text-sm leading-loose opacity-72">
            إن كان المستخدم داخل التطبيق وعلى الشاشة المعنية فلا يرسل إشعار دفع — يظهر
            تحديث حي فقط. وإن كان داخل التطبيق على شاشة أخرى، يظهر شريط علوي بدل إشعار
            النظام.
          </p>
        </section>

        <section className="rounded-lg border border-line bg-surface p-5.5">
          <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">
            قياس الأثر لا العدد
          </h2>
          <p className="text-sm leading-loose opacity-72">
            لكل قناة يقاس: الفتح، والإجراء بعد الفتح، ومعدل إيقاف الإشعارات{' '}
            <Counted message="withinHours" count={OPT_OUT_WINDOW_HOURS} />. وأي قناة
            يتجاوز إيقافها الحد تراجع.
          </p>
          <p className="mt-2.5 text-3xs leading-loose opacity-65">
            والأرقام تبدأ مع التطبيق: التسليم والفتح يسجلهما الجهاز، ولا يعرفهما الخادم
            وحده.
          </p>
        </section>
      </div>
    </AdminShell>
  );
}

/**
 * ═══ نسبةٌ أو «لا قياس بعد» — ولا صفر ═══
 *
 * بطاقةٌ تقول «معدّل التسليم ٠٪» تتّهم الإرسال، والحقيقةُ أنه لا
 * إرسال بعد. والفرقُ بينهما هو ما تحمله `measured`.
 */
function RateStat({
  title,
  rate,
  note,
}: {
  title: string;
  rate: PushRate;
  note?: React.ReactNode;
}) {
  const pct = ratePct(rate);

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-3xs font-bold tracking-[0.14em] opacity-65">{title}</h2>
      {pct === null ? (
        <p className="mt-2 text-sm font-bold opacity-65">لا قياس بعد</p>
      ) : (
        <p className="mt-2 text-2xl font-bold">
          <ArabicNumber value={pct} decimals={1} percent />
        </p>
      )}
      <p className="mt-1 text-3xs opacity-65">
        {pct === null ? 'يبدأ مع التطبيق' : note}
      </p>
    </section>
  );
}

/** والنسبةُ نفسُها في خليّةِ جدول — شرطةٌ حين لا مقام. */
function Rate({ value }: { value?: PushRate }) {
  const pct = value === undefined ? null : ratePct(value);
  if (pct === null) return <span className="opacity-65">—</span>;
  return <ArabicNumber value={pct} decimals={1} percent />;
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
