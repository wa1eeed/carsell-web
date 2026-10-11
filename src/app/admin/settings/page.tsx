import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ADMIN_NAV, SETTINGS_PREFIX } from '@/components/admin/nav';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الإعدادات' };

/**
 * ═══ الإعدادات — مكانٌ واحد ═══
 *
 * ستّةَ عشرَ بندًا من ثلاثين في الشريط كانت إعدادات: تُضبط مرّةً في
 * الشهر وتزاحم العمل اليوميّ في كل يوم. **ومن يبحث عن «أين أغيّر مهلة
 * الدفع» كان يقرأ ثلاثين سطرًا ليجدها.**
 *
 * فصارت للإعدادات صفحةٌ واحدة بأقسامها ووصفِ كل بند — والشريط يعرض
 * «الإعدادات» بندًا واحدًا **ما لم تكن فيها**، فإن دخلتَها انفتحت
 * أقسامُها في الشريط نفسه.
 *
 * ═══ وما لا يملكه الداخل لا يُعرض ═══
 *
 * الصلاحية تُفحص هنا كما تُفحص في الشريط: قسمٌ خلا من بنودٍ يملكها
 * لا يُعرض عنوانُه — لا يُعرض فارغًا.
 */
export default async function AdminSettingsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');

  const sections = ADMIN_NAV
    .filter((group) => group.title.startsWith(SETTINGS_PREFIX))
    .map((group) => ({
      title: group.title.replace(`${SETTINGS_PREFIX} — `, ''),
      items: group.items.filter(
        (item) => item.href !== null
          && (item.permission === undefined || can(admin.role, item.permission)),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <AdminShell
      title="الإعدادات"
      subtitle="ما يُضبط مرّةً ويحكم ما بعده"
      activeHref="/admin/settings"
      admin={admin}
    >
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        هنا ما يحكم سلوك المنصّة: الأسعار والمهل والقواعد والقوالب. <b>وما تغيّره
        هنا يسري على ما بعده لا على ما مضى</b> — طلبٌ قائم يحتفظ بالمهلة والسعر
        اللذين قُرئا يوم أُنشئ.
      </p>

      <div className="flex flex-col gap-9">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="mb-3.5 text-3xs font-bold tracking-wider opacity-45">
              {section.title}
            </h2>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href ?? '/admin'}
                  className="flex flex-col gap-1.5 rounded-xl border border-line p-4 hover:bg-surface"
                >
                  <span className="text-xs font-bold">{item.label}</span>
                  {/*
                    **والوصف يقول ما يُضبط لا ما اسمُه.** «الرسوم
                    والضرائب» لا تقول أين تُغيَّر نسبة الضريبة، والسطر
                    تحتها يقولها.
                  */}
                  <span className="text-2xs leading-relaxed opacity-55">
                    {item.description ?? '—'}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
