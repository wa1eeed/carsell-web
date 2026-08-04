import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { accountBalance } from './ledger';
import { netToSeller } from './money';

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
 * نُقلت الملكية · انقضت نافذة الإرجاع · لا نزاع مفتوح. ولا يُعاد
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
  /** ما يمنع الصرف الآن — و`null` يعني جاهزًا */
  blockedBy: 'NOT_TRANSFERRED' | 'RETURN_WINDOW_OPEN' | 'DISPUTED' | null;
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
  const date = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', {
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

  const lines: BookLine[] = [];

  for (const order of orders) {
    const gatewayFee = order.settlement?.gatewayFee ?? zero;
    // القاعدة في `money.ts` — وتقرؤها شاشة الإفراج أيضًا
    const net = netToSeller({ ...order, gatewayFee });

    sales = sales.plus(order.agreedPrice);
    commission = commission.plus(order.commissionAmount);
    commissionVat = commissionVat.plus(order.vatAmount);
    gatewayFees = gatewayFees.plus(gatewayFee);
    govtFees = govtFees.plus(order.transferFee);

    /**
     * **الحارس نفسه الذي يفرض الإفراج** — `canSettle` لا نسخةٌ منه.
     * والنزاع المفتوح يُقدَّم عليه: `canSettle` تقرأ `status` والطلب
     * المتنازَع عليه `DISPUTED`، لكنّ نزاعًا في مرحلةٍ أخرى قد لا
     * يبلغها — فيُفحص صراحةً.
     */
    const guard = order.disputes.length > 0
      ? ({ allowed: false, reason: 'DISPUTED' } as const)
      : canSettle({
          stage: order.stage,
          status: order.status,
          returnWindowEndsAt: order.returnWindowEndsAt,
        });

    if (!guard.allowed && order.escrow?.status === 'HELD') held = held.plus(net);

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
      commission: str(order.commissionAmount),
      commissionVat: str(order.vatAmount),
      gatewayFee: str(gatewayFee),
      govtFee: str(order.transferFee),
      net: str(net),
      blockedBy: guard.allowed ? null : guard.reason,
      releasesAt: order.returnWindowEndsAt === null ? null : date.format(order.returnWindowEndsAt),
    });
  }

  return {
    totals: {
      sales: str(sales),
      commission: str(commission),
      commissionVat: str(commissionVat),
      gatewayFees: str(gatewayFees),
      govtFees: str(govtFees),
      earned: str(sales.minus(commission).minus(commissionVat).minus(gatewayFees).minus(govtFees)),
    },
    held: str(held),
    payable: str(payable),
    paidOut: str(paidOut),
    lines,
  };
}
