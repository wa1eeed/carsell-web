import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { activeTemplate } from '@/lib/domain/admin-inspection-template';
import { TemplateEditor } from './TemplateEditor';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'قالب الفحص' };

/**
 * قالبُ الفحص — وكان ملفَّ بذرة.
 *
 * إضافةُ بندٍ كانت تحتاج نشرًا، وتصحيحُ صياغةٍ كذلك. وقرار المالك
 * (٢٠٢٦-١٠-١٧) أن يُحرَّر من اللوحة — وهو سببُ نقله إلى جداول.
 */
export default async function InspectionTemplatePage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'services.manage')) redirect('/admin');

  const template = await activeTemplate();

  return (
    <AdminShell title="قالب الفحص" activeHref="/admin/inspection-template" admin={admin}>
      {template === null ? (
        <EmptyState
          title="لا قالب فعّال"
          description="القالبُ يصل بترحيل — وبلا واحدٍ فعّال لا تُفتح مسودّةُ فحص."
        />
      ) : (
        <TemplateEditor template={template} />
      )}
    </AdminShell>
  );
}
