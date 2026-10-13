import Link from 'next/link';
import { Money } from '@/components/ui/Money';
import type { ListingService } from '@/lib/domain/listing-detail';

/**
 * ═══ خدمات تُطلب على هذه المركبة ═══
 *
 * التصميم `Wc` يضع «تقرير موجز الرسمي — سجل الملّاك والبلاغات والممشى
 * الموثّق وحالة الرهن — اطلبه بـ ٢٥ ر.س» في عمود الصفحة.
 *
 * **وصفحتُها مبنيّة** (`/services/mojaz` تُفتح) ولا رابط يصلها من هنا
 * — وهنا موضعُها: من يقرأ عن مركبةٍ بعينها هو من يحتاج سجلّ ملّاكها.
 *
 * والسعرُ يُقال قبل النقر: «اطلبه» بلا ثمنٍ يُقرأ التزامًا مجهولًا،
 * فيُترك.
 */
export function ListingServices({
  services,
  ownVehicleId,
}: {
  services: readonly ListingService[];
  /**
   * ═══ والرابط يحمل المركبة لصاحبها ═══
   *
   * كان يذهب إلى الخدمة **بلا أن يقول أيّ مركبة**، فيصل صاحبُها إلى
   * قائمةٍ تطلب منه أن يختار ما كان يقف عليه قبل نقرة.
   *
   * **ولمن يملكها وحده**: النطاق يردّ `VEHICLE_NOT_YOURS` لغيره (تقرير
   * الفحص يُعلَّق على الإعلان ويقرؤه كل مشترٍ، فطلبُه من غير المالك
   * يُدخل في صفحة بائعٍ تقريرًا لم يطلبه). فحملُه إلى غيره وعدٌ يُردّ.
   */
  ownVehicleId: string | null;
}) {
  if (services.length === 0) return null;

  return (
    <section className="rounded-xl border border-line p-5">
      <h3 className="mb-3.5 text-xs font-bold">خدمات على هذه المركبة</h3>

      <ul className="flex flex-col gap-2.5">
        {services.map((service) => (
          <li key={service.key}>
            <Link
              href={
                ownVehicleId === null
                  ? service.path
                  : `${service.path}?vehicle=${encodeURIComponent(ownVehicleId)}`
              }
              className="flex flex-col gap-1.5 rounded-lg border border-line p-3.5 transition-colors hover:border-ink"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-2xs font-bold">{service.name}</span>
                {/* **والمجّانيّ يُقال كلمةً لا صفرًا** — والصفر يُقرأ عطلًا */}
                {Number(service.price) === 0 ? (
                  <span className="text-3xs font-bold text-accent-700">مجّانًا</span>
                ) : (
                  <Money amount={Number(service.price)} size="sm" showCurrency={false} />
                )}
              </span>
              <span className="text-3xs leading-relaxed opacity-60">{service.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
