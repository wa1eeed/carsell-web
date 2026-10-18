import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { integrationSummary, listIntegrations } from '@/lib/domain/admin-integrations';
import { INTEGRATION_CATEGORY_LABEL } from '@/lib/labels/admin';
import { IntegrationsList } from './IntegrationsList';

export const dynamic = 'force-dynamic';

/**
 * A11 — التكاملات ومفاتيح الربط.
 *
 * ═══ معيار القبول ═══ **المفاتيح مشفّرة ولا تُعرض، والتدوير بموافقة
 * عضوين.**
 *
 * وما يصل هذه الشاشة تلميحاتٌ مخزَّنة نصًّا عاديًا وقت الكتابة — فلا
 * سرّ يُفكّ تشفيره لأجل العرض، ولو سُرِّبت حمولة الصفحة لما خرج معها
 * مفتاح.
 */
export default async function IntegrationsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'integrations.view')) redirect('/admin');

  const [integrations, summary] = await Promise.all([
    listIntegrations(),
    integrationSummary(),
  ]);

  const groups = new Map<string, typeof integrations>();
  for (const integration of integrations) {
    const label =
      INTEGRATION_CATEGORY_LABEL[integration.category as keyof typeof INTEGRATION_CATEGORY_LABEL] ??
      integration.category;
    groups.set(label, [...(groups.get(label) ?? []), integration]);
  }

  return (
    <AdminShell title="التكاملات ومفاتيح الربط" activeHref="/admin/integrations" admin={admin}>
      <div className="mb-4 grid gap-4 md:grid-cols-5">
        {/*
          **و«تحذير» صارت «بلا مفاتيح».** البطاقة كانت تعدّ `DEGRADED`
          وهي حالٌ لا يكتبها شيء، فتقرأ صفرًا دائمًا. والعدّ الآن على
          ما يُعرَف فعلًا: مفعَّلٌ بلا سرٍّ لبيئته العاملة.
        */}
        <Stat title="تعمل" value={summary.connected} />
        <Stat title="بلا مفاتيح" value={summary.warning} />
        <Stat title="غير مفعلة" value={summary.inactive} />
        <Stat title="مفاتيح تنتظر الاستبدال" value={summary.pendingRotations} />
        {/*
          **والبيئة عدّادٌ مستقلّ.** كانت تُضمّ إلى الاستبدال، فطلبُ
          نقلٍ إلى الإنتاج — أخطر ما يُطلب في هذه الشاشة — يُقرأ
          مفتاحًا ينتظر تدويرًا.
        */}
        <Stat title="بيئة تنتظر اعتمادا" value={summary.pendingEnvSwitches} />
      </div>

      <IntegrationsList
        groups={[...groups.entries()].map(([label, rows]) => ({ label, rows }))}
        adminId={admin.id}
        canManage={canWrite(admin.role, 'integrations.rotateKeys')}
      />

      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">حوكمة المفاتيح</h2>
        <ul className="flex flex-col gap-2.5 text-sm leading-loose opacity-72">
          <li>
            <strong>السر لا يعرض كاملا أبدا</strong> — ولا حتى لمن كتبه. ما تراه تلميح
            مشتق وقت الحفظ ومخزن نصا عاديا، فالعرض لا يمر بالتشفير أصلا.
          </li>
          <li>الأسرار مخزنة بـAES-256-GCM، والعبث بالنص المشفر يكشف ولا يفك إلى قمامة.</li>
          <li>
            <strong>التدوير بعضوين</strong> — والطالب لا يوافق على طلبه، وإلا صار «عضوان»
            عضوا واحدا يضغط مرتين.
          </li>
          <li>السر الجديد يبقى في الطلب حتى تكتمل الموافقة — فالتدوير لا يقع قبل إقراره.</li>
          <li>كل طلب وموافقة وفحص يكتب في سجل التدقيق باسم من فعله.</li>
        </ul>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">سلوك التعطل</h2>
        <p className="text-sm leading-loose opacity-72">
          لكل تكامل مسار بديل معلن، مكتوب في صفه أعلاه ومخزن معه لا في هذه الفقرة —
          <strong> لا شاشة خطأ بلا مخرج</strong>. وسطر في وثيقة لا ينفذ؛ الحقل يقرأ.
        </p>
      </section>
    </AdminShell>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-3xs font-bold tracking-[0.14em] opacity-65">{title}</h2>
      <p className="mt-2 text-2xl font-bold">
        <ArabicNumber value={value} />
      </p>
    </section>
  );
}
