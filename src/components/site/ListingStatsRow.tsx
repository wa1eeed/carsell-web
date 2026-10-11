import { ArabicNumber } from '@/components/ui/ArabicNumber';
import type { ListingStats } from '@/lib/domain/account';

/**
 * ═══ أرقامُ «إعلاناتي» — صفُّ التصميم فوق الجدول ═══
 *
 * والتصميم يكتب «مشاهدات **هذا الأسبوع**»، و`Listing.viewCount` عدّادٌ
 * تراكميّ بلا سجلّ زمنيّ — لا جدول مشاهداتٍ بطوابعها، فلا سبيل إلى
 * نافذة أسبوع. **فالعنوان يقول ما يُحسب**: «المشاهدات» لا «هذا
 * الأسبوع»، ووسمٌ يَعِد بنافذةٍ لا تُحسب أسوأ من رقمٍ أعمّ.
 *
 * **والرقم كان جامدًا أصلًا**: لا شيء يزيد `viewCount` — صار يُعَدّ
 * في المهمّة ١٣٢.
 */
export function ListingStatsRow({ stats }: { stats: ListingStats }) {
  const cards: { label: string; value: number | null; note?: string }[] = [
    { label: 'المشاهدات', value: stats.views },
    { label: 'إضافات للمفضلة', value: stats.favorites },
    { label: 'عروض تنتظر ردّك', value: stats.pendingOffers },
    {
      label: 'متوسط أيام العرض',
      value: stats.avgDaysListed,
      // **ولا منشورَ لا يُقال عنه «صفر يوم»** — صفرٌ هنا يُقرأ «يُباع في يومه»
      note: stats.avgDaysListed === null ? 'لا إعلان منشور بعد' : undefined,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-line p-4">
          <p className="mb-1.5 text-2xs opacity-55">{card.label}</p>
          {card.value === null ? (
            <p className="text-2xs opacity-45">{card.note}</p>
          ) : (
            <ArabicNumber value={card.value} className="text-2xl font-bold" />
          )}
        </div>
      ))}
    </div>
  );
}
