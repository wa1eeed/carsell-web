import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { draftView, ensureDraft } from '@/lib/domain/inspection-draft';
import { completionFormFor } from '@/lib/domain/completion-schema';
import { providerRequestView } from '@/lib/domain/provider-queue';
import { ProviderBar } from '../../ProviderBar';
import { InspectionForm } from './InspectionForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'نموذج الفحص' };

/**
 * ═══ نموذجُ الفحص — وكان مُعلَنًا ولا يُرسَم ═══
 *
 * `form: 'INSPECTION'` مكتوبٌ في `STEPS_BY_TYPE` منذ بُنيت، ولا شيء
 * يرسمه: فالفاحصُ يضغط «أنهِ» ولا يُسأل عن شيء، و`InspectionReport`
 * لا يُنشئه إلّا الزرع. **فالعرضُ العامّ بُني فوق بياناتٍ لا يصنعها
 * المنتج.**
 *
 * **والحراسةُ في النطاق**: نوعُ المزوّد وملكيّةُ الطلب يُفحصان في
 * `ensureDraft` — والشاشةُ تتبع الحارس لا تسبقه.
 */
export default async function InspectionFormPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const user = await currentProviderUser();
  if (user === null) redirect('/provider/login');

  const { ref } = await params;
  const decoded = decodeURIComponent(ref);

  const gate = await ensureDraft({
    ref: decoded,
    providerId: user.providerId,
    providerUserId: user.id,
  });

  /**
   * **و«ليس فاحصًا» و«ليس طلبك» كلاهما ٤٠٤ هنا.** أن يعرف مزوّدٌ أنّ
   * المرجع قائمٌ لغيره معلومةٌ لا تلزمه — والفرقُ بينهما في المسار
   * لا في الشاشة.
   */
  if (!gate.ok && gate.reason !== 'NOT_EDITABLE') {
    /**
     * **ونموذجُ الصنف الآخر تحويلٌ لا بابٌ مسدود**: طلبُ شحنٍ أو نقلِ
     * ملكيةٍ نموذجُه `/complete`، ومن وصل هنا بمرجعٍ قديمٍ أو إشارةٍ
     * محفوظة يُدلّ على بابه لا يُترك أمام صفحةٍ ميّتة.
     */
    const view = await providerRequestView(decoded, user.providerId);
    if (view !== null && view.mine && view.type !== null && completionFormFor(view.type) === 'FIELDS') {
      redirect(`/provider/${encodeURIComponent(decoded)}/complete`);
    }
    notFound();
  }

  const view = await draftView(decoded, user.providerId);
  if (view === null) notFound();

  return (
    <>
      <ProviderBar name={user.name} />

      <main className="mx-auto w-full max-w-3xl p-6">
        <Link
          href={`/provider/${encodeURIComponent(decoded)}`}
          className="mb-4 inline-block py-1 text-2xs opacity-70 underline underline-offset-4 hover:opacity-100"
        >
          ← عودة إلى الطلب
        </Link>

        <h1 className="mb-1.5 text-2xl font-bold tracking-tight">نموذج الفحص</h1>
        <p className="mb-6 text-sm opacity-70">
          <span dir="ltr" className="bidi-ltr font-num">{view.ref}</span>
        </p>

        <InspectionForm view={view} />
      </main>
    </>
  );
}
