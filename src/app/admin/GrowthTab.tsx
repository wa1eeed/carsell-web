import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Quantity } from '@/components/ui/Quantity';
import { Sparkline } from '@/components/ui/Sparkline';
import {
  dashboardCards,
  deltaPct,
  listingsByCity,
  type MetricCard,
} from '@/lib/domain/admin-dashboard';
import { dailyOrders } from '@/lib/domain/admin-charts';
import { dayTick } from '@/lib/labels/charts';
import { toArabicDigits } from '@/lib/arabic';
import {
  DASHBOARD_CARD_LABEL,
  DASHBOARD_SEGMENT_LABEL,
  LISTING_TYPE_LABEL,
  ORDER_STATUS_LABEL,
  AUCTION_STATUS_LABEL,
  REST_OF_CITIES,
  REST_OF_CITIES_LABEL,
} from '@/lib/labels/admin';


const RANGE_DAYS = 30;

/**
 * A1 — لوحة القيادة: نمو وأعداد.
 *
 * ═══ معيار القبول ═══ **كل رقم من قاعدة البيانات، لا رقم ثابت.**
 *
 * والرقم الثابت لا يدخل رقمًا مكتوبًا، بل يدخل «مؤقّتًا حتى تصل بيانات
 * المصدر». فما لا مصدر له لا يُعرض هنا أصلًا: البطاقة الغائبة سؤال
 * يُطرح، والبطاقة الكاذبة جواب يُصدَّق.
 */
export async function GrowthTab() {

  const to = new Date();
  const from = new Date(to.getTime() - RANGE_DAYS * 86_400_000);

  const [cards, cities, daily] = await Promise.all([
    dashboardCards(from, to),
    listingsByCity(from, to),
    dailyOrders(RANGE_DAYS, to),
  ]);

  const topCity = cities.reduce((most, city) => Math.max(most, city.count), 0);
  const cityTotal = cities.reduce((total, city) => total + city.count, 0);

  return (
    <>
      <p className="mb-4 text-2xs opacity-55">
        آخر <Quantity unit="days" count={RANGE_DAYS} /> · المقارنة بالمدى المساوي الذي يسبقه
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.key} card={card} />
        ))}
      </div>

      <div className="mt-9 mb-3.5 flex items-baseline gap-3">
        <h2 className="text-md font-bold">حجم الطلبات اليومي</h2>
        <span className="text-2xs opacity-45">
          أيّام ({toArabicDigits(String(RANGE_DAYS))})
        </span>
        <span className="h-px flex-1 bg-line" aria-hidden />
      </div>
      {/* السلسلة تُحسب لحظة الفتح — فتتحرّك بين زيارتين بلا أن يمسّها أحد */}
      <Sparkline
        points={daily.map((point) => ({ label: dayTick(point.day), value: point.count }))}
      />

      <section className="mt-9 rounded-lg border border-line bg-surface p-5.5">
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          <h2 className="text-sm font-bold">الإعلانات حسب المدينة</h2>
          <span className="text-3xs opacity-45">
            من <Quantity unit="listings" count={cityTotal} /> نُشرت في المدى
          </span>
        </div>

        {cities.length === 0 ? (
          <p className="text-2xs opacity-45">لا إعلانات نُشرت في هذا المدى.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {cities.map((city) => (
              <div key={city.city} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-2xs opacity-70">
                  {city.city === REST_OF_CITIES ? REST_OF_CITIES_LABEL : city.city}
                </span>
                {/*
                  الشريط يُقارَن بالعين، والرقم إلى جانبه لأنه يُقرأ.
                  والعرض نسبةٌ إلى الأعلى لا إلى المجموع: النسبة إلى
                  المجموع تجعل كل الأشرطة قصيرة حين تكثر المدن.
                */}
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${String(topCity === 0 ? 0 : (city.count / topCity) * 100)}%` }}
                  />
                </span>
                <span className="w-14 shrink-0 text-end text-2xs">
                  <ArabicNumber value={city.count} />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-4 text-3xs leading-relaxed opacity-45">
        بطاقتا «المستخدم النشط» و«مصدر التسجيل» في التصميم لا مصدر لهما في المخطّط بعد —
        الأولى تحتاج سجلّ نشاط والثانية عمودًا في المستخدم. وعرضهما بأرقام مقدَّرة كان
        سيجعلهما تُصدَّقان.
      </p>
    </>
  );
}

function Card({ card }: { card: MetricCard }) {
  const delta = deltaPct(card.total, card.previous);

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="flex-1 text-3xs font-bold tracking-[0.14em] opacity-45">
          {DASHBOARD_CARD_LABEL[card.key] ?? card.key}
        </h2>
        {delta === null ? null : (
          <Badge tone={delta >= 0 ? 'accent' : 'danger'}>
            <span className="bidi-isolate" dir="ltr">
              {delta >= 0 ? '+' : '−'}
              <ArabicNumber value={Math.abs(delta)} grouped={false} />٪
            </span>
          </Badge>
        )}
      </div>

      <p className="mb-3 text-2xl font-bold">
        <ArabicNumber value={card.total} />
      </p>

      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
        {card.segments.length === 0 ? (
          <p className="text-2xs opacity-45">لا تفصيل في هذا المدى.</p>
        ) : (
          card.segments.map((segment) => (
            <p key={segment.key} className="flex items-baseline justify-between gap-3 text-2xs">
              <span className="truncate opacity-65">{segmentLabel(segment)}</span>
              <ArabicNumber value={segment.count} />
            </p>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * تسمية الشريحة — **من خرائط الواجهة لا من النطاق**.
 *
 * والخدمة استثناء ظاهر: اسمها بيانٌ في قاعدة البيانات لا تسمية واجهة،
 * فيعيده النطاق ويُعرض كما هو.
 */
function segmentLabel(segment: { key: string; serviceName?: string | null }): string {
  if (segment.serviceName != null) return segment.serviceName;
  return (
    DASHBOARD_SEGMENT_LABEL[segment.key] ??
    LISTING_TYPE_LABEL[segment.key] ??
    ORDER_STATUS_LABEL[segment.key] ??
    AUCTION_STATUS_LABEL[segment.key] ??
    segment.key
  );
}
