import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { listBodyTypes } from '@/lib/domain/catalog';
import { isR2Configured } from '@/lib/r2';
import { BodyTypesTable } from './BodyTypesTable';

export const dynamic = 'force-dynamic';

/**
 * A12 أنواع الهياكل — جدول **عرض** لا كيانات.
 *
 * المفاتيح من تعداد `BodyType`، فلا إنشاء ولا حذف: إضافة نوع تعني
 * ترحيلًا في المخطط، وحذفه يترك مركبات تشير إلى نوع بلا اسم. الأدمن
 * يحرّر الاسمين والصورة والترتيب والظهور — لا أكثر.
 */
export default async function BodyTypesPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'catalog.manage')) redirect('/admin');

  const bodyTypes = await listBodyTypes();

  return (
    <AdminShell title="أنواع الهياكل" activeHref="/admin/catalog/body-types" admin={admin}>
      <BodyTypesTable
        bodyTypes={bodyTypes}
        canEdit={canWrite(admin.role, 'catalog.manage')}
        canUpload={canWrite(admin.role, 'catalog.uploadLogo')}
        uploadsReady={isR2Configured()}
      />

      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">القواعد</h2>
        <ul className="flex flex-col gap-2.5 text-sm leading-loose opacity-72">
          <li>المفاتيح ثابتة من تعداد المخطط — لا ينشأ نوع ولا يحذف من هنا.</li>
          <li>الاسمان العربي والإنجليزي إلزاميان.</li>
          <li>
            الصورة ظلية للهيكل بخلفية شفافة. وبلا صورة تعرض البطاقة بالاسم وحده —
            لا حرف أول، فالهيكل شكل لا اسم.
          </li>
          <li>الإخفاء يزيل النوع من صف الرئيسية ولا يمس فلتر البحث ولا الإعلانات.</li>
          <li>النوع بلا إعلان منشور لا يظهر في الرئيسية أصلا، ولو كان ظاهرا هنا.</li>
        </ul>
      </section>
    </AdminShell>
  );
}
