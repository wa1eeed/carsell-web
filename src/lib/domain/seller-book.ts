import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { accountBalance } from './ledger';
import { netToSeller } from './money';
import { AR_DATE_LOCALE } from '@/lib/arabic';

/**
 * ═══ الملفّ المالي للبائع — دفترٌ لا محفظة ═══
 *
 * **الفرق ليس لفظيًّا.** المحفظة رصيدٌ يملك صاحبه سحبه متى شاء، وهي
 * خدمةٌ ماليّة منظَّمة. وهذا **بيانُ حقوق**: يقول ما لك، وممّ خُصم،
 * ومتى يصلك — والمال نفسه لدى مزوّد الدفع المرخَّص لا لدينا.
 *
 * ═══ وحالات المال الثلاث ═══
 *
 * · **محتجز** — قُبض من المشتري ولم يُستحقّ بعد.
 * · **جاهز للصرف** — استُحقّ ولم يُحوَّل.
 * · **محوَّل** — وصل.
 *
 * **والانتقال من الأولى إلى الثانية تقوله `settleGuard` وحدها**:
 * نُقلت الملكية · لا نزاع مفتوح. (ونافذة الإرجاع أُلغيت في المهمّة ٣٧.)
 * ولا يُعاد
 * حسابها هنا — شرطان يُكتبان مرّتين يتباعدان أوّل تعديل، فيصير للسؤال
 * الواحد جوابان: واحدٌ في الشاشة وآخرٌ في الإفراج.
 */

export type BookLine = {
  orderRef: string;
  title: string;
  soldAt: string;
  /** قيمة المركبة كما اتُّفق عليها */
  gross: string;
  commission: string;
  commissionVat: string;
  gatewayFee: string;
  govtFee: string;
  net: string;
  /**
   * ما يمنع الصرف الآن — و`null` يعني جاهزًا.
   *
   * **و`AWAITING_PAYMENT` تسبق `NOT_TRANSFERRED`.** طلبٌ لم يدفع
   * المشتري فيه ريالًا كان يُوسم «بانتظار نقل الملكية» — وهو بانتظار
   * الدفع، ولا ملكيةَ تُنقل قبله. فالوسم يسمّي المانع الحقيقيّ،
   * وإلّا انتظر البائع المرورَ وهو ينتظر مشتريًا.
   */
  blockedBy: 'AWAITING_PAYMENT' | 'NOT_TRANSFERRED' | 'DISPUTED' | null;
  /**
   * أُفرج عن ضمانه — **فلا يُقال «جاهز للصرف» بعد أن صُرف**.
   *
   * `blockedBy === null` تعني «لا مانع»، وهي صادقةٌ قبل الإفراج
   * وبعده معًا — فكان السطر يحمل «جاهز للصرف» إلى الأبد، ولو وصل
   * المال آيبان صاحبه. وسطرٌ يقول ذلك فوق بطاقةٍ تقول «حُوِّل إليك
   * ٢٨٬٠٠٠» رقمان متناقضان في شاشةٍ واحدة.
   */
  settled: boolean;
  releasesAt: string | null;
};

export type SellerBook = {
  totals: {
    /** إجمالي المبيعات — **وليس إيرادك**: منه تُخصم العمولة والرسوم */
    sales: string;
    commission: string;
    commissionVat: string;
    gatewayFees: string;
    govtFees: string;
    /** صافي ما استُحقّ لك عبر التاريخ */
    earned: string;
  };
  /** ما لم يُستحقّ بعد — عند المزوّد باسم صفقاتك */
  held: string;
  /** استُحقّ ولم يُحوَّل — وهو **حقّك القائم** */
  payable: string;
  /** ما وصلك فعلًا */
  paidOut: string;
  /**
   * ما لم يُحسب في الإجمالي — **ورقمٌ محذوفٌ بلا ذكرٍ يبدو خطأً**.
   *
   * صفقاتٌ قائمة لم يصل مالها، فلا تدخل المبيعات ولا المستحقّ. وحذفُها
   * صامتةً يجعل البائع يجمع أسطره فلا تساوي إجماليه.
   */
  awaitingPayment: { count: number; amount: string };
  lines: BookLine[];
};

const zero = new Prisma.Decimal(0);
const str = (value: Prisma.Decimal): string => value.toFixed(2);

/**
 * دفتر بائعٍ واحد.
 *
 * والأرقام من مصدرين متمايزين عمدًا: **الأرصدة من دفتر الأستاذ**
 * (فهي الحقيقة المحاسبية)، **والأسطر من الطلبات** (فهي ما يفهمه
 * البائع: أي سيارة، ومتى). ولو اشتُقّت الأرصدة من الأسطر لعادت
 * المشكلة التي بُني الدفتر لحلّها.
 */
export async function sellerBook(sellerId: string, locale = 'ar'): Promise<SellerBook> {
  const [payable, orders] = await Promise.all([
    accountBalance('SELLER_PAYABLE', { userId: sellerId }),
    db.order.findMany({
      where: { sellerId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        listing: {
          select: {
            ref: true,
            vehicle: { select: { brandName: true, modelName: true, trimName: true, year: true } },
          },
        },
        escrow: { select: { status: true } },
        // المفتوح والمحقَّق فيه وحدهما — والمحسوم لا يمنع الصرف
        disputes: {
          where: { status: { in: ['OPEN', 'INVESTIGATING'] } },
          select: { id: true },
          take: 1,
        },
        settlement: { select: { gatewayFee: true, netToSeller: true } },
      },
    }),
  ]);

  const paidOut = await db.ledgerEntry
    .aggregate({
      where: { userId: sellerId, account: 'SELLER_PAYABLE', direction: 'DEBIT', event: 'payout.sent' },
      _sum: { amount: true },
    })
    .then((row) => row._sum.amount ?? zero);

  const { canSettle } = await import('./transfer-windows');
  const date = new Intl.DateTimeFormat(locale === 'ar' ? AR_DATE_LOCALE : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let sales = zero;
  let commission = zero;
  let commissionVat = zero;
  let gatewayFees = zero;
  let govtFees = zero;
  let held = zero;
  let earned = zero;
  let awaiting = zero;
  let awaitingCount = 0;

  const lines: BookLine[] = [];

  for (const order of orders) {
    const gatewayFee = order.settlement?.gatewayFee ?? zero;
    // القاعدة في `money.ts` — ويقرؤها كشف التسوية وشاشة الإفراج
    const net = netToSeller({ ...order, gatewayFee });

    /**
     * ═══ وما لم يُقبض ليس مبيعًا ═══
     *
     * كان الإجمالي يمرّ على **كل** طلبٍ قائم، فيدخل فيه طلبٌ عند مرحلة
     * «موافقة» لم يدفع المشتري فيه ريالًا — وقِيس: بائعٌ يقرأ «صافي ما
     * استُحقّ لك ١٥٣٬٧٤٥» وبطاقاتُه فوقها تقول محتجز ٧٤٬٢٠٥ وجاهز صفر
     * وحُوِّل صفر. فالرقمان في شاشةٍ واحدة لا يلتقيان، والفرق صفقةٌ قد
     * تُلغى غدًا فتتبخّر.
     *
     * **والدفتر يعترف عند `HELD`** (`recordOrderPaid`)، فالبيان يتبع
     * الحدث نفسه الذي يتبعه الدفتر — وإلّا صار لرقمٍ واحد مصدران.
     * و`PENDING` ليست قبضًا: المشتري عند البوابة ولم يُحجز شيء.
     */
    const collected = order.escrow !== null && order.escrow.status !== 'PENDING';

    if (!collected) {
      awaitingCount += 1;
      awaiting = awaiting.plus(net);
    } else {
      sales = sales.plus(order.agreedPrice);
      // **عمولته هو** — و`commissionAmount` مجموع الطرفين، فعرضُه يُحمّله نصيب المشتري
      commission = commission.plus(order.sellerCommission);
      commissionVat = commissionVat.plus(order.vatAmount);
      gatewayFees = gatewayFees.plus(gatewayFee);
      govtFees = govtFees.plus(order.transferFee);
    }

    /**
     * **الحارس نفسه الذي يفرض الإفراج** — `canSettle` لا نسخةٌ منه.
     * والنزاع المفتوح يُقدَّم عليه: `canSettle` تقرأ `status` والطلب
     * المتنازَع عليه `DISPUTED`، لكنّ نزاعًا في مرحلةٍ أخرى قد لا
     * يبلغها — فيُفحص صراحةً.
     */
    const guard = order.disputes.length > 0
      ? ({ allowed: false, reason: 'DISPUTED' } as const)
      : !collected
        ? ({ allowed: false, reason: 'AWAITING_PAYMENT' } as const)
        : canSettle({ stage: order.stage, status: order.status });

    if (!guard.allowed && order.escrow?.status === 'HELD') held = held.plus(net);
    if (collected) earned = earned.plus(net);

    lines.push({
      orderRef: order.ref,
      title: [
        order.listing.vehicle.brandName,
        order.listing.vehicle.modelName,
        order.listing.vehicle.trimName,
      ]
        .filter((part) => part !== null && part !== '')
        .join(' '),
      soldAt: date.format(order.createdAt),
      gross: str(order.agreedPrice),
      commission: str(order.sellerCommission),
      commissionVat: str(order.vatAmount),
      gatewayFee: str(gatewayFee),
      govtFee: str(order.transferFee),
      net: str(net),
      blockedBy: guard.allowed ? null : guard.reason,
      settled: order.escrow?.status === 'RELEASED',
      releasesAt: null,
    });
  }

  return {
    totals: {
      sales: str(sales),
      commission: str(commission),
      commissionVat: str(commissionVat),
      gatewayFees: str(gatewayFees),
      govtFees: str(govtFees),
      /**
       * **مجموع صوافي الأسطر لا حسابٌ ثانٍ.**
       *
       * كان يُطرح هنا رسمُ النقل والضريبة أيضًا — وكلاهما دفعه
       * المشتري، فيرى البائع مجموعًا أقلّ من مجموع أسطره هو. وحسابان
       * لرقمٍ واحد يتباعدان أوّل تعديل.
       */
      earned: str(earned),
    },
    held: str(held),
    payable: str(payable),
    paidOut: str(paidOut),
    awaitingPayment: { count: awaitingCount, amount: str(awaiting) },
    lines,
  };
}
