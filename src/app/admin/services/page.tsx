import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { listServicesForAdmin } from '@/lib/domain/admin-services';
import { ServicesTable } from './ServicesTable';

export const dynamic = 'force-dynamic';

/**
 * A7 — الخدمات وأسعارها.
 *
 * **تغيير السعر لا يمسّ القائم** (معيار القبول). والحماية بنيوية:
 * `ServiceRequest.amount` عمود مستقلّ يُملأ وقت الإنشاء، ولا استعلام
 * يقرأ السعر من `Service` بعدها.
 */
export default async function AdminServicesPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'services.manage')) redirect('/admin');

  const services = await listServicesForAdmin();

  return (
    <AdminShell title="الخدمات وأسعارها" activeHref="/admin/services" admin={admin}>
      <ServicesTable services={services} canEdit={canWrite(admin.role, 'services.manage')} />

      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-45">قواعد التسعير</h2>
        <ul className="flex flex-col gap-2.5 text-sm leading-loose opacity-72">
          <li>
            السعر <strong>لقطة في الطلب</strong>: عميلٌ طلب فحصًا بـ٣٥٠ ثم رُفع السعر
            يدفع ٣٥٠. تغييرُ العقد بعد انعقاده ليس تسعيرًا.
          </li>
          <li>عمود «طلبات قائمة» يقول كم طلبًا يبقى بالسعر القديم — الأثر قبل الضغط لا بعده.</li>
          <li>إخفاء خدمة يمنع طلبات جديدة ولا يمسّ القائم.</li>
          <li>كل تغيير سعر يُكتب في سجلّ التدقيق بالقيمتين وبعدد الطلبات التي لم تُمَسّ.</li>
        </ul>
      </section>
    </AdminShell>
  );
}
