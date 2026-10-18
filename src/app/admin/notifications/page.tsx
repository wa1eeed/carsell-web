import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { channelStats, listTemplates } from '@/lib/domain/admin-notifications';
import { TemplatesTable } from './TemplatesTable';

export const dynamic = 'force-dynamic';

/**
 * A8 — الإشعارات والقوالب.
 *
 * **المتغيّر غير المصرَّح به يمنع الحفظ** (معيار القبول): القالب نصّ
 * فيه `{amount}`، والمُرسِل يملأ ما يعرفه فقط. فـ`{frist_name}` تصل
 * المستخدم كما كُتبت — والتصريح ليس توثيقًا بل ما يُقاس عليه النصّ.
 */
export default async function NotificationsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [templates, stats] = await Promise.all([
    listTemplates(),
    channelStats(monthStart),
  ]);

  return (
    <AdminShell title="الإشعارات والقوالب" activeHref="/admin/notifications" admin={admin}>
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Stat
          title="أرسل هذا الشهر"
          value={<ArabicNumber value={stats.sentThisMonth} />}
          note="من جدول الإشعارات — لا عداد مخزن."
        />
        <Stat
          title="مقاطع الرسائل"
          value={<ArabicNumber value={stats.smsSegments} />}
          note="تقدير: المرسل × متوسط مقاطع القوالب."
        />
        <Stat
          title="تكلفة الرسائل"
          value={<Money amount={stats.smsCost} decimals={2} />}
          note="تقدير حتى يصل مزود الرسائل — ولا رقم حقيقي قبله."
        />
      </div>

      <p className="mb-4 text-2xs opacity-70">
        <Quantity unit="transactionalNotifications" count={templates.length} /> · عربي وإنجليزي
      </p>

      <TemplatesTable
        templates={templates}
        canEdit={canWrite(admin.role, 'notifications.manage')}
      />

      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">قواعد الإرسال</h2>
        <ul className="flex flex-col gap-2.5 text-sm leading-loose opacity-72">
          <li>
            <strong>القنوات الحرجة لا يمكن للمستخدم إيقافها</strong> — رمز التحقق والدفع
            والمزاد الذي يشارك فيه. إيقافها يجعل المستخدم يخسر مزادا أو مهلة دفع لأنه
            أطفأ إشعارا ظنه تسويقيا.
          </li>
          <li>عدم الإزعاج 11 م – 8 ص، ويتجاوزه الحرج وحده.</li>
          <li>الإشعارات المتكررة تجمع — عشرة إشعارات مزايدة في دقيقة إشعار واحد.</li>
          <li>
            كل نص يقاس على متغيراته المصرح بها قبل الحفظ، والعربي والإنجليزي معا.
          </li>
        </ul>
      </section>
    
      <ListFooter
        shown={templates.length}
        total={null}
        note="القوالب المعاملاتية — والتسويقية في الحملات"
        can="تحرير نص القالب بلغتيه ومعاينته بقيم."
        cannot="إيقاف إشعار حرج — ما يمس مال المستخدم أو أمن حسابه يصله مهما أوقف."
      />
    </AdminShell>
  );
}

function Stat({
  title,
  value,
  note,
}: {
  title: string;
  value: React.ReactNode;
  note: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-3xs font-bold tracking-[0.14em] opacity-65">{title}</h2>
      <p className="mt-2 mb-1.5 text-xl font-bold">{value}</p>
      <p className="text-3xs leading-relaxed opacity-70">{note}</p>
    </section>
  );
}
