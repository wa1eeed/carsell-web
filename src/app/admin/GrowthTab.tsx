import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Counted } from '@/components/ui/Counted';
import { Badge } from '@/components/ui/Badge';
import { Percent, Quantity } from '@/components/ui/Quantity';
import { Sparkline } from '@/components/ui/Sparkline';
import {
  dashboardCards,
  deltaPct,
  listingsByCity,
  type MetricCard,
} from '@/lib/domain/admin-dashboard';
import { dailyOrders } from '@/lib/domain/admin-charts';
import { growthKpis } from '@/lib/domain/admin-kpis';
import { KpiCard } from '@/components/admin/KpiCard';
import { FUNNEL_LABEL, NOT_MEASURED } from '@/lib/labels/kpis';
import { dayTick } from '@/lib/labels/charts';
import { displayDigits } from '@/lib/arabic';
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

  const [cards, cities, daily, growth] = await Promise.all([
    dashboardCards(from, to),
    listingsByCity(from, to),
    dailyOrders(RANGE_DAYS, to),
    growthKpis(from, to),
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

      {/*
        ═══ مؤشرات النمو ═══

        البطاقات فوق تقول «كم». وهذه تقول **هل نكبر، وهل يعود العميل،
        وأين يتسرب في الرحلة** — وهي أسئلة مدير النمو والمستثمر.

        ولكل مؤشر اختصاره المتعارف عليه وأيقونة تشرح ما هو وكيف يُحسب
        وكيف يتحسن.
      */}
      <Section title="المال والسوق" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(['gmv', 'aov', 'takeRate', 'sellThrough'] as const).map((key) => (
          <KpiCard key={key} kpi={growth.kpis[key]} />
        ))}
      </div>

      <Section title="العميل — قيمته وعودته" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(['repeatRate', 'return90', 'ordersPerBuyer', 'buyerLifespan'] as const).map((key) => (
          <KpiCard key={key} kpi={growth.kpis[key]} />
        ))}
      </div>

      <Section title="الرحلة — من التسجيل إلى البيع" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(['timeToFirstOrder', 'offerToOrder', 'daysToSell', 'activeBuyers'] as const).map((key) => (
          <KpiCard key={key} kpi={growth.kpis[key]} />
        ))}
      </div>

      <Section title="القمع" />
      <Funnel steps={growth.funnel} />

      <div className="mt-9 mb-3.5 flex items-baseline gap-3">
        <h2 className="text-md font-bold">حجم الطلبات اليومي</h2>
        <span className="text-2xs opacity-45">
          <Quantity unit="days" count={RANGE_DAYS} />
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
            <Counted message="ofListings" count={cityTotal} /> نُشرت في المدى
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
        {/*
          ═══ والصياغة واحدة ═══

          كانت الإشارة تُبنى هنا بيد، فـ«+٠٪» تقول نموًّا لم يقع —
          وصفرٌ لا اتّجاه له. و`Percent` تعرف القاعدة (الإشارة للفرق،
          ولا إشارة للصفر)، ونسختان لرقمٍ واحد تتباعدان.
        */}
        {delta === null ? null : (
          <Badge tone={delta >= 0 ? 'accent' : 'danger'}>
            <Percent signed value={delta} />
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

/** فاصل قسم — عنوان وخط، فالفصل بالخطوط لا بالظلال. */
function Section({ title }: { title: string }) {
  return (
    <div className="mt-9 mb-3.5 flex items-baseline gap-3">
      <h2 className="text-md font-bold">{title}</h2>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}

/**
 * ═══ القمع — وأين يتسرب الناس ═══
 *
 * خمس خطوات بعددها ونسبة من بقي من الخطوة التي قبلها. **والنسبة من
 * السابقة لا من الأولى**: «٣٪ من المسجلين اشتروا» رقم صحيح لا يقول
 * أين الخلل، و«من كل عشرة عروض ينتهي واحد بطلب» يقول.
 *
 * **ولا خطوة بلا سابقة تُقارن بها**: الأولى تعرض عددها وحده.
 */
function Funnel({ steps }: { steps: readonly { key: string; count: number }[] }) {
  const top = steps.reduce((most, step) => Math.max(most, step.count), 0);

  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((step, at) => {
        const before = at === 0 ? null : (steps[at - 1]?.count ?? 0);
        const share = top === 0 ? 0 : step.count / top;

        return (
          <li key={step.key} className="flex items-center gap-4">
            <span className="w-32 shrink-0 text-2xs opacity-70">{FUNNEL_LABEL[step.key] ?? step.key}</span>

            <span className="h-7 flex-1 overflow-hidden rounded-md bg-ink/6">
              <span
                className="flex h-full items-center justify-end rounded-md bg-accent/25 px-2.5"
                style={{ width: `${Math.max(share * 100, step.count > 0 ? 6 : 0)}%` }}
              >
                <ArabicNumber value={step.count} className="text-2xs font-bold" />
              </span>
            </span>

            <span className="w-24 shrink-0 text-start text-3xs opacity-45">
              {before === null || before === 0 ? (
                ''
              ) : (
                <>
                  {displayDigits(((step.count / before) * 100).toFixed(0))}٪ من السابقة
                </>
              )}
            </span>
          </li>
        );
      })}

      {/*
        **وما لا يُقاس يُقال.** بطاقة بصفر تُقرأ «لا أحد يزورنا»،
        والصمت يُقرأ «لم نفكر فيه» — وكلاهما غير صحيح.
      */}
      <li className="mt-3 rounded-lg border border-line bg-surface p-4">
        <p className="mb-2 text-3xs font-bold opacity-55">ما لا يُقاس اليوم</p>
        <ul className="flex flex-col gap-1.5">
          {NOT_MEASURED.map((line) => (
            <li key={line} className="text-3xs leading-relaxed opacity-55">
              {line}
            </li>
          ))}
        </ul>
      </li>
    </ol>
  );
}
