import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { MonitorCards, MonitorList, MonitorTabs } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { db } from '@/lib/db';
import { adminWebhookEvents, webhookOutcomeCounts } from '@/lib/domain/webhooks';
import { WebhookRowView } from './WebhookRowView';
import type { WebhookOutcome } from '@/generated/prisma/enums';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ردود بوابة الدفع' };

const OUTCOMES: readonly WebhookOutcome[] = [
  'APPLIED',
  'UNMAPPED',
  'REFUSED',
  'BAD_SIGNATURE',
  'RECEIVED',
];

/**
 * ═══ ردودُ البوّابة — والجدولُ كان بلا قارئٍ ═══
 *
 * كلُّ ردٍّ من بوّابة الدفع يُخزَّن بحمولته كاملةً منذ بُني المسار،
 * **ولا شيء يقرؤه** (البوابة ٦٤). فحين يسقط دفعٌ يكون الدليلُ في
 * الجدول ولا بابَ إليه: يقول المشتري «دفعتُ» ويقول دفترُنا «لم يصل»،
 * ولا سبيل إلى ما قالته البوّابة بنصّه.
 *
 * **والشاشةُ تُجيب ثلاثة أسئلة** لا تُعرض فيها حمولةٌ لذاتها:
 *   · أوصل ردٌّ عن هذه الدفعة أصلًا؟
 *   · وهل غيّر حالَها — أم وصل ولم يُغيّر شيئًا؟
 *   · وإن لم يُغيّر، فلماذا؟
 */
export default async function AdminWebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  /**
   * **وصلاحيتُه صلاحيةُ المال**: الحمولةُ تحمل مبالغَ ومراجعَ بوّابة،
   * ومن يقرأ ردًّا يقرأ معاملةً. و`finance.view` هي الموجودة فعلًا —
   * فلا تُخترع صلاحيةٌ باسمٍ لا يمنحه أحد (البوابة ٢٩).
   */
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const { outcome } = await searchParams;
  const active =
    outcome !== undefined && (OUTCOMES as readonly string[]).includes(outcome)
      ? (outcome as WebhookOutcome)
      : null;

  const [rows, counts] = await Promise.all([
    adminWebhookEvents(active === null ? {} : { outcome: active }),
    webhookOutcomeCounts(),
  ]);

  /**
   * **والمرجعُ يُعرض بالطلب لا بمعرّف الدفعة**: المشغّل يعرف طلبه
   * `ORD-1042` ولا يعرف `cmg3f…`، ومن الطلب يفتح الصفحة التي يعمل فيها.
   */
  const payments =
    rows.length === 0
      ? []
      : await db.payment.findMany({
          where: { id: { in: [...new Set(rows.flatMap((r) => (r.paymentId === null ? [] : [r.paymentId])))] } },
          select: { id: true, purpose: true, order: { select: { ref: true } } },
        });
  const byPayment = new Map(payments.map((p) => [p.id, p]));

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <AdminShell
      title="ردود بوابة الدفع"
      subtitle="ما قالته البوابة بنصه — وما ترتب عليه عندنا"
      activeHref="/admin/webhooks"
      admin={admin}
    >
      <p className="mb-7 max-w-2xl text-sm leading-loose opacity-70">
        كل رد تستقبله المنصة من بوابة الدفع يحفظ هنا بحمولته كاملة.{' '}
        <b>والمهم ليس أنه وصل بل ماذا ترتب عليه</b>: رد متأخر قد يرفضه النظام لأن
        الدفعة تجاوزته، ونوع لا يقابله حال في دفتر الضمان يسجل ولا يغير شيئا — وفي
        الحالتين تبقى الدفعة كما هي، <b>والسبب هنا</b>.
      </p>

      <MonitorCards
        cards={[
          { title: 'إجمالي الردود', value: total, note: 'منذ أول رد' },
          { title: 'غيرت حال دفعة', value: counts.APPLIED ?? 0, note: 'طبقت كما وصلت' },
          { title: 'وصلت ولم تغير', value: (counts.UNMAPPED ?? 0) + (counts.REFUSED ?? 0), note: 'نوع لا يقابله حال أو رفض' },
          { title: 'توقيع لا يطابق', value: counts.BAD_SIGNATURE ?? 0, note: 'مفتاح دور خطأ أو من يجرب' },
        ]}
      />

      <MonitorTabs
        basePath="/admin/webhooks"
        param="outcome"
        active={active}
        tabs={[
          { key: null, label: 'الكل', count: total },
          { key: 'APPLIED', label: 'طبقت', count: counts.APPLIED ?? 0 },
          { key: 'UNMAPPED', label: 'بلا مقابل', count: counts.UNMAPPED ?? 0 },
          { key: 'REFUSED', label: 'مرفوضة', count: counts.REFUSED ?? 0 },
          { key: 'BAD_SIGNATURE', label: 'توقيع خاطئ', count: counts.BAD_SIGNATURE ?? 0 },
          { key: 'RECEIVED', label: 'لم تكتمل', count: counts.RECEIVED ?? 0 },
        ]}
      />

      <MonitorList
        empty={{
          title: 'لا ردود',
          description: 'البوابة لم تستدع المنصة بعد — أو البوابة التجريبية تؤكد فورا بلا رد.',
        }}
        note="الاحتفاظ بالحمولة كما وصلت، ولا تعدل من هنا."
      >
        {rows.map((row) => {
          const payment = row.paymentId === null ? undefined : byPayment.get(row.paymentId);
          return (
            <WebhookRowView
              key={row.id}
              row={row}
              orderRef={payment?.order?.ref ?? null}
              purpose={payment?.purpose ?? null}
            />
          );
        })}
      </MonitorList>

      <ListFooter
        shown={rows.length}
        total={total}
        note="الأحدث أولا"
        can="القراءة والترشيح وفتح الحمولة كما وصلت."
        cannot="إعادة إرسال رد أو تعديله — ما قالته البوابة ليس لنا أن نكتبه."
      />

      <p className="mt-6 max-w-2xl text-2xs leading-loose opacity-65">
        وإعادة المحاولة من طرف البوابة: ترسل الرد نفسه عند أي شك، ونرده بنجاح
        فلا يتكرر الأثر. وعدد المحاولات على كل صف —{' '}
        <Link href="/admin/payments" className="underline underline-offset-2">
          توجيه المدفوعات والبوابات
        </Link>
        .
      </p>
    </AdminShell>
  );
}
