import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { db } from '@/lib/db';
import { resolveEntitlements } from '@/lib/domain/entitlements';
import { dealerTeam } from '@/lib/domain/dealer-team';
import { DealerShell } from '@/components/dealer/DealerShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'الاشتراك والباقة — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ الاشتراك والباقة ═══
 *
 * **والباقةُ تُقرأ ولا تُغيَّر من هنا**: الترقيةُ تمرّ بدفعٍ وفاتورة،
 * ولا شيء من ذلك مبنيّ — وكلُّ باقةٍ بصفرٍ اليوم. وزرُّ «رقِّ باقتك»
 * يفتح على لا شيء.
 *
 * **والقدراتُ تُعرض بقيمها لا بأسمائها**: «الرفع الجماعي» وحدها لا
 * تقول أمُتاحٌ هو، و«٨ مقاعد» تقول. والسقفُ `-1` بلا حدّ — ورقمٌ
 * سالبٌ معروضًا يُقرأ عطلًا.
 */
export default async function DealerSubscription() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  /** **والاشتراكُ للمالك وحده** (مصفوفة `D9`). */
  if (actor.role !== 'OWNER') redirect('/dealer');

  const [subscription, grants, team] = await Promise.all([
    db.subscription.findFirst({
      where: { userId: actor.userId, status: 'active' },
      orderBy: { startsAt: 'desc' },
      include: { plan: true },
    }),
    resolveEntitlements({ userId: actor.userId, dealerId: actor.dealerId }),
    dealerTeam(actor.dealerId),
  ]);

  const definitions = await db.entitlement.findMany({ orderBy: { key: 'asc' } });

  const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Riyadh',
  });

  const show = (key: string, type: string): React.ReactNode => {
    const value = grants[key];
    if (type === 'bool') {
      return value === true ? <Badge tone="accent">متاح</Badge> : <Badge>غير متاح</Badge>;
    }
    if (typeof value !== 'number') return <span className="opacity-70">—</span>;
    /** **و`-1` تعني «بلا حدّ»** — وعرضُها رقمًا سالبًا يُقرأ عطلًا. */
    if (value < 0) return <span className="text-2xs font-bold">بلا حد</span>;
    /** **وعلامةُ النسبة من `ArabicNumber`** — لغةٌ لا زينة (البوابة ٥١). */
    return (
      <span className="text-2xs font-bold">
        <ArabicNumber value={value} percent={type === 'percent'} />
      </span>
    );
  };

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/subscription"
      title="الاشتراك والباقة"
      subtitle={subscription === null ? 'لا اشتراك نشط' : subscription.plan.nameAr}
    >
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line p-5">
          <h2 className="mb-3 text-3xs font-bold tracking-wide opacity-70">باقتك</h2>
          {subscription === null ? (
            <p className="text-2xs opacity-75">
              لا اشتراك نشط على حسابك — وتسري عليك القيم الافتراضية في الجدول أدناه.
            </p>
          ) : (
            <>
              <p className="text-base font-bold">{subscription.plan.nameAr}</p>
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line-2 pt-2.5">
                <span className="text-2xs opacity-70">الاشتراك الشهري</span>
                {/*
                  **وصفرُ السعر يُقال لا يُطبع رقمًا**: «٠ ريال» تحت
                  اشتراكٍ تُقرأ عطلَ تسعير، و«مجانية» تقول القرار.
                */}
                {subscription.plan.price.isZero() ? (
                  <span className="text-2xs font-bold text-accent-700">مجانية حاليا</span>
                ) : (
                  <Money amount={subscription.plan.price.toFixed(2)} decimals={2} size="sm" />
                )}
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-line-2 pt-2.5">
                <span className="text-2xs opacity-70">بدأت في</span>
                <span className="text-2xs">{date.format(subscription.startsAt)}</span>
              </div>
            </>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-3 text-3xs font-bold tracking-wide opacity-70">مقاعد الفريق</h2>
          {/**
            ═══ و«من» لا شرطةٌ مائلة ═══

            **والفاصلُ المحايد بين رقمين ينقلب في RTL**: «١ / ٨»
            تُرسم «٨ / ١»، فيقرأ المالكُ أنّه استهلك ثمانيةً من واحد.
            وهو مسلكُ الإشارة السالبة نفسُه (`ArabicNumber` تعزلها).
            و«من» كلمةٌ عربية لها اتّجاهُها، فلا تنقلب.

            **و`null` تعني «بلا سقف» لا صفرًا** — وقسمةٌ على غائبٍ
            تُطبع «٦ / » فتُقرأ عطلًا.
          */}
          <p className="text-2xl font-bold">
            <ArabicNumber value={team.seatsUsed} />
            {team.seatsTotal === null ? null : (
              <>
                <span className="mx-2 text-base font-normal opacity-70">من</span>
                <ArabicNumber value={team.seatsTotal} />
              </>
            )}
          </p>
          <p className="mt-2 text-2xs leading-loose opacity-75">
            الدعوة المعلقة تشغل مقعدا كما يشغله العضو — وإلا دعوت فوق مقاعدك ورد من قبلت
            دعوته بعد أن قيل له أهلا.
          </p>
        </section>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-start">
          <thead>
            <tr className="border-b border-line bg-surface text-3xs opacity-70">
              <th scope="col" className="px-5 py-3 text-start font-bold">القدرة</th>
              <th scope="col" className="px-5 py-3 text-start font-bold">ما يسري عليك</th>
            </tr>
          </thead>
          <tbody>
            {definitions.map((definition) => (
              <tr key={definition.key} className="border-b border-line-2 last:border-b-0">
                <td className="px-5 py-3.5 text-2xs">{definition.description}</td>
                <td className="px-5 py-3.5">{show(definition.key, definition.type)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-5 rounded-xl border border-line bg-surface p-5 text-2xs leading-loose opacity-75">
        تغيير الباقة يتم اليوم من فريق المنصة — راسلنا وسنحولك. والعمولة المطبقة عليك
        تثبت لقطة في كل طلب وقت إنشائه، فتغيير الباقة لا يغير طلبا قائما.
      </p>
    </DealerShell>
  );
}
