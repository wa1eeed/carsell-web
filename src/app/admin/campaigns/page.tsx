import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import {
  COOLDOWN_HOURS,
  MARKETING_CAP_PER_MONTH,
  listCampaigns,
  listSegments,
} from '@/lib/domain/admin-campaigns';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'مسودّة',
  SCHEDULED: 'مجدولة',
  RUNNING: 'جارية',
  SENT: 'أُرسلت',
  CANCELLED: 'ملغاة',
};

const CHANNEL_LABEL: Record<string, string> = {
  email: 'بريد',
  sms: 'رسالة',
  push: 'دفع',
};

/**
 * A9 — الحملات التسويقية.
 *
 * ═══ معيار القبول ═══ **الشريحة تُحوسَب وقت الإرسال لا وقت الحفظ.**
 *
 * والأرقام أدناه تُحسب لحظة فتح الصفحة — ولهذا تتحرّك بين زيارتين بلا
 * أن يمسّها أحد. وهذا هو المقصود: قائمةٌ محفوظة كانت ستُظهر رقمًا ثابتًا
 * صحيحًا يوم كُتب.
 */
export default async function CampaignsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const [campaigns, segments] = await Promise.all([listCampaigns(), listSegments()]);

  return (
    <AdminShell title="الحملات التسويقية" activeHref="/admin/campaigns" admin={admin}>
      <p className="mb-4 text-2xs opacity-55">
        بريد ورسائل وإشعارات دفع · <strong>منفصلة تمامًا عن المعاملاتية</strong>
      </p>

      <section className="mb-5 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[720px] text-2xs">
          <thead className="border-b border-line text-3xs opacity-45">
            <tr>
              <th className="p-3.5 text-start font-bold">الحملة</th>
              <th className="p-3.5 text-start font-bold">القناة</th>
              <th className="p-3.5 text-start font-bold">الشريحة</th>
              <th className="p-3.5 text-end font-bold">أُرسل</th>
              <th className="p-3.5 text-end font-bold">فُتح</th>
              <th className="p-3.5 text-end font-bold">نُقر</th>
              <th className="p-3.5 text-end font-bold">تحويل</th>
              <th className="p-3.5 text-start font-bold">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center opacity-45">
                  لا حملات بعد — الإرسال يُفعَّل مع التطبيق.
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td className="p-3.5">{campaign.nameAr}</td>
                  <td className="p-3.5">
                    {campaign.channels.map((channel) => CHANNEL_LABEL[channel] ?? channel).join(' + ')}
                  </td>
                  <td className="p-3.5 opacity-70">{campaign.segmentName}</td>
                  <td className="p-3.5 text-end">
                    <ArabicNumber value={campaign.sent} />
                  </td>
                  <td className="p-3.5 text-end">
                    <Percent value={campaign.openedPct} />
                  </td>
                  <td className="p-3.5 text-end">
                    <Percent value={campaign.clickedPct} />
                  </td>
                  <td className="p-3.5 text-end">
                    <ArabicNumber value={campaign.converted} />
                  </td>
                  <td className="p-3.5">
                    <Badge tone={campaign.status === 'SENT' ? 'accent' : 'neutral'}>
                      {STATUS_LABEL[campaign.status] ?? campaign.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <h2 className="mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-45">الشرائح</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {segments.length === 0 ? (
          <p className="text-2xs opacity-45">لا شرائح معرَّفة بعد.</p>
        ) : (
          segments.map((segment) => (
            <section key={segment.id} className="rounded-lg border border-line bg-surface p-5">
              <h3 className="text-xs font-bold">{segment.nameAr}</h3>
              <p className="font-num mb-3 text-3xs opacity-45" dir="ltr">
                {segment.key}
              </p>

              <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                <Line label="مطابقون" value={segment.counts.matched} />
                <Line label="وافقوا على التسويق" value={segment.counts.consented} />
                <Line label="سيصلهم فعلًا" value={segment.counts.reachable} strong />
              </div>
            </section>
          ))
        )}
      </div>

      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-45">
          ضوابط تحمي المستخدم والسمعة
        </h2>
        <ul className="flex flex-col gap-2.5 text-sm leading-loose opacity-72">
          <li>
            <strong>الشريحة حيّة</strong> — تُعاد حوسبتها وقت الإرسال لا وقت الحفظ، فلا تصل
            الرسالة لمن خرج من شرطها بين اللحظتين.
          </li>
          <li>
            حدّ أقصى <Quantity unit="messages" count={MARKETING_CAP_PER_MONTH} /> تسويقية شهريًا
            لكل مستخدم.
          </li>
          <li>
            تهدئة <Quantity unit="hours" count={COOLDOWN_HOURS} /> بين حملتين على المستخدم نفسه.
          </li>
          <li>موافقة التسويق شرطٌ لا يُتجاوَز — ومن لم يوافق لا يدخل أيّ شريحة إرسال.</li>
          <li>
            <strong>التسويقي ≠ المعاملاتي</strong>: نطاق فرعي ومزوّد منفصلان، حتى لا تؤثّر
            شكوى أو إلغاء اشتراك على وصول رمز التحقق وإشعارات الدفع.
          </li>
        </ul>
      </section>
    </AdminShell>
  );
}

function Percent({ value }: { value: number | null }) {
  // لم يُرسَل بعد ⇒ «—» لا «٠٪»؛ والصفر يُقرأ فشلًا وهو ليس كذلك
  return value === null ? (
    <span className="opacity-40">—</span>
  ) : (
    <span className="font-num">
      <ArabicNumber value={value} grouped={false} />٪
    </span>
  );
}

function Line({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-3 text-2xs">
      <span className={strong ? 'font-bold' : 'opacity-65'}>{label}</span>
      <ArabicNumber value={value} className={strong ? 'font-bold' : ''} />
    </p>
  );
}
