import { redirect, notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';

import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

/**
 * ═══ «أضف سيارة» — وجهةٌ تبقى، واستمارةٌ واحدة ═══
 *
 * **كانت استمارتان لسؤالٍ واحد.** هذه الشاشة تسأل بيانات المركبة ثمّ
 * تحفظها في المرآب، و`/sell` تسأل البيانات نفسَها ثمّ تنشر — نفس
 * الحقول في ملفّين، **ونسختان لاستمارةٍ واحدة تتباعدان أوّل حقلٍ
 * يُضاف إلى إحداهما**. (وهو الصنف الذي أُغلق في حمولة المركبة
 * بالبوابة ٦٠، وفي حقولها بـ`VehicleFields`.)
 *
 * فصار السؤال يُطرح مرّةً في أوّل المسار — «اعرضها للبيع» أو «أضفها
 * إلى سياراتي» — والحقولُ بعده واحدة (طلب المالك ٢٠٢٦-١٠-١٨).
 *
 * **والرابطُ يبقى**: «أضف سيارة» في «سياراتي» يشير إليه، وروابطُ
 * المستخدمين المحفوظة، وفحصُ الوجهات. ويقود إلى المسار نفسه بالقصد
 * محدَّدًا — فمن ضغط «أضف سيارة» لا يُسأل ما الذي يريده.
 */
export default async function AddVehiclePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  redirect(`/${locale}/sell?intent=garage`);
}
