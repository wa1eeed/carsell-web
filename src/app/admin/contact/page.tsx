import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { contactChannels } from '@/lib/domain/admin-contact';
import { ContactForm } from './ContactForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'قنوات الدعم' };

/**
 * ═══ قنوات الدعم — الشاشة التي لم تكن ═══
 *
 * صفحة «تواصل معنا» في الموقع تقرأ ثلاثة حقول، **ولا شاشة تكتبها**.
 * فكانت تقول «قنوات التواصل غير مضبوطة بعد» لكل زائر منذ بُنيت.
 *
 * ومن يصل تلك الصفحة لم يجد جوابه في الأسئلة الشائعة — فإن وجدها
 * فارغةً ترك المنصّة.
 */
export default async function AdminContactPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const channels = await contactChannels();

  return (
    <AdminShell
      title="قنوات الدعم"
      subtitle="ما يراه الزائر في «تواصل معنا»"
      activeHref="/admin/contact"
      admin={admin}
    >
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-70">
        هذه القنوات تظهر في{' '}
        <Link
          href="/ar/help/contact"
          className="font-bold underline underline-offset-2"
          target="_blank"
        >
          صفحة «تواصل معنا»
        </Link>{' '}
        مباشرة. <b>والقناة الفارغة لا تظهر</b> — فاترك ما لا تريد نشره فارغًا.
      </p>

      <ContactForm
        channels={channels}
        canEdit={canWrite(admin.role, 'notifications.manage')}
      />
    </AdminShell>
  );
}
