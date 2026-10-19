import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { adminSeoTemplates } from '@/lib/domain/seo';
import { landingCombinations } from '@/lib/domain/landing';
import { SeoTemplatesForm } from './SeoTemplatesForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'نصوص صفحات البحث' };

/**
 * ═══ نصوصُ السيو — والجدولُ كان بلا قارئٍ ولا محرِّر ═══
 *
 * سمّته البوابةُ ٦٣ «نموذجًا لا يعدّله شيء»، والقياسُ أخرج أسوأ: **لا
 * شيء يقرؤه كذلك**. صفٌّ واحد مزروع ولا استعلامَ يلمس الجدول في
 * `src/` كلّه — فالقرار ٢٦ لم يُوصَل من طرفيه.
 *
 * وما تطبعه الصفحاتُ اليوم من `src/messages/*.json`: **فتغييرُ عنوانٍ
 * يُفهرسه محرّكُ بحثٍ كان يحتاج نشرًا كاملًا**، والمقدّمةُ والخاتمةُ
 * لم تُبنَ قطّ.
 *
 * **وهذه الصفحةُ تُري ما سيُطبع لا ما كُتب**: «{count} سيارة {brand}»
 * لا تقول ما تقوله «١٢ سيارة تويوتا معروضة في الرياض»، والنصُّ يقرؤه
 * محرّكُ بحثٍ قبل أن يقرأه إنسان.
 */
export default async function AdminSeoPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const [templates, combinations] = await Promise.all([
    adminSeoTemplates(),
    landingCombinations(),
  ]);

  /**
   * **ورابطُ معاينةٍ حقيقيّ لكلّ سطح.** من يحرّر نصًّا لا يرى أين
   * يقع يحرّره على الثقة؛ والتركيباتُ تُقرأ من الإعلانات المنشورة،
   * فالرابطُ يفتح صفحةً قائمة الآن لا مثالًا مكتوبًا بيد.
   */
  const brandSample = combinations.find((entry) => entry.modelSlug === null) ?? null;
  const modelSample = combinations.find((entry) => entry.modelSlug !== null) ?? null;

  const sampleHref: Record<string, string | null> = {
    search: '/ar/cars',
    landing_brand:
      brandSample === null ? null : `/ar/browse/${brandSample.citySlug}/${brandSample.brandSlug}`,
    landing_model:
      modelSample === null
        ? null
        : `/ar/browse/${modelSample.citySlug}/${modelSample.brandSlug}/${modelSample.modelSlug ?? ''}`,
  };

  return (
    <AdminShell
      title="نصوص صفحات البحث"
      subtitle="العنوان والوصف والفقرات التي يقرأها محرك البحث قبل الزائر"
      activeHref="/admin/seo"
      admin={admin}
    >
      <p className="mb-7 max-w-2xl text-sm leading-loose opacity-70">
        صفحات الهبوط — مدينة × ماركة × طراز — تبنى من قالب واحد لكل سطح، لا من
        نص يكتب لكل تركيبة. <b>والمتغير بين قوسين تملؤه الصفحة من بياناتها</b>:
        عدد السيارات المعروضة فيها، ومدى أسعارها، وكم منها بتقرير فحص منشور.
        <br />
        <b>وفقرة ينقص أحد متغيراتها تحذف كاملة</b> ولا تطبع ناقصة — فلا تظهر
        «منها ٠ سيارة مفحوصة» على صفحة تفهرس.
      </p>

      <SeoTemplatesForm
        templates={templates}
        sampleHref={sampleHref}
        canEdit={canWrite(admin.role, 'notifications.manage')}
      />
    </AdminShell>
  );
}
