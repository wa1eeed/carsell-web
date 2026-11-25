import { ArabicNumber } from '@/components/ui/ArabicNumber';
import type { ListingStats } from '@/lib/domain/account';

/**
 * ═══ أرقامُ «إعلاناتي» — صفُّ التصميم فوق الجدول ═══
 *
 * **والرقم كان جامدًا أصلًا**: لا شيء يزيد `viewCount` — صار يُعَدّ
 * في المهمّة ١٣٢.
 *
 * ═══ ثمّ صارت النافذةُ تُحسب ═══
 *
 * كان العنوان «المشاهدات» لأنّ `viewCount` تراكميٌّ بلا زمن، والترميز
 * يكتب «مشاهدات **هذا الأسبوع**». و`ListingViewDay` يكتب صفًّا لكلّ
 * يومٍ شوهد فيه الإعلان، فصارت النافذةُ محسوبةً لا موعودة.
 *
 * **والرقمان معًا جواب**: مجموعٌ كبيرٌ فوق أسبوعٍ ساكن يعني إعلانًا
 * مات، وأسبوعٌ قويّ فوق مجموعٍ صغير يعني إعلانًا بدأ يُرى. وأحدُهما
 * وحده يُقرأ خطأً في الاتّجاهين.
 */
export function ListingStatsRow({ stats }: { stats: ListingStats }) {
  const cards: { label: string; value: number | null; note?: string }[] = [
    { label: 'مشاهدات هذا الأسبوع', value: stats.viewsThisWeek },
    { label: 'المشاهدات منذ النشر', value: stats.views },
    { label: 'إضافات للمفضلة', value: stats.favorites },
    { label: 'عروض تنتظر ردك', value: stats.pendingOffers },
    {
      label: 'متوسط أيام العرض',
      value: stats.avgDaysListed,
      // **ولا منشورَ لا يُقال عنه «صفر يوم»** — صفرٌ هنا يُقرأ «يُباع في يومه»
      note: stats.avgDaysListed === null ? 'لا إعلان منشور بعد' : undefined,
    },
  ];

  /*
    **وعمودان من أصغر مقاس.** كانت `sm:grid-cols-2` فتتكدّس الأربع
    واحدةً فوق أخرى دون ٦٤٠px — ويُدفع أوّلُ إعلانٍ إلى ٦٨١px، فيمرّر
    البائع أربع بطاقاتٍ قبل أن يرى ما جاء لأجله. وشبكةُ ٢×٢ تقرأ
    الأربعة في لمحة.
  */
  return (
    // خمسُ بطاقاتٍ الآن: عمودان على الهاتف وخمسةٌ على الشاشة الواسعة
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-line p-4">
          <p className="mb-1.5 text-2xs opacity-70">{card.label}</p>
          {card.value === null ? (
            <p className="text-2xs opacity-65">{card.note}</p>
          ) : (
            <ArabicNumber value={card.value} className="text-2xl font-bold" />
          )}
        </div>
      ))}
    </div>
  );
}
