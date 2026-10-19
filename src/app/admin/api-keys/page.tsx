import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { adminApiKeys } from '@/lib/domain/api-keys';
import { ApiKeysPanel } from './ApiKeysPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مفاتيح الواجهة العامة' };

/**
 * ═══ قفلٌ بلا مفتاح — وهذه الشاشة هي المفتاح ═══
 *
 * ثلاثةُ مسارات تحت `/api/public/v1` تطلب مفتاحًا، والمصادقةُ مبنيّة
 * والحدُّ مبنيّ و`mintKey` مبنيّة — **ولا شيء في المنتج يُصدر مفتاحًا**.
 * فالواجهةُ العامّة لم يكن ممكنًا أن تُنادى في أيّ بيئةٍ وُجدت.
 *
 * **والسرُّ يُعرض مرّةً واحدة.** لا يُخزَّن خامًّا، ولا يُسترجَع، ومن
 * ضيّعه يأخذ مفتاحًا جديدًا — فـ«أرني مفتاحي» بابٌ خلفيّ على كلّ
 * تكاملٍ يستعمله.
 */
export default async function AdminApiKeysPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'integrations.view')) redirect('/admin');

  const keys = await adminApiKeys();

  return (
    <AdminShell
      title="مفاتيح الواجهة العامة"
      subtitle="من يقرأ كتالوجنا من خارج الموقع — وبأي حد"
      activeHref="/admin/api-keys"
      admin={admin}
    >
      <p className="mb-7 max-w-2xl text-sm leading-loose opacity-70">
        الواجهة العامة للقراءة فقط: الإعلانات المنشورة وفهرس المعارض — ولا شيء عن
        المشترين أو الطلبات أو المدفوعات. <b>وكل طلب يحمل مفتاحا</b>، والحد يحسب
        لكل مفتاح لا لكل عنوان، فعميل خلف شبكة مشتركة لا يعاقب بغيره.
        <br />
        <b>والمفتاح يعرض مرة واحدة عند إصداره</b> ولا يسترجع بعدها — مخزن مجزأ،
        فقاعدة مسروقة لا تعطي سارقها مفتاحا يعمل. ومن ضاع مفتاحه يأخذ جديدا ويسحب
        القديم.{' '}
        <Link
          href="/admin/integrations"
          className="font-bold underline underline-offset-2"
        >
          تكاملات المنصة
        </Link>{' '}
        موضع آخر.
      </p>

      <ApiKeysPanel
        keys={keys}
        canEdit={canWrite(admin.role, 'integrations.rotateKeys')}
      />
    </AdminShell>
  );
}
