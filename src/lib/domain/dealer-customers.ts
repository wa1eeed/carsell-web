import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';

/**
 * ═══ عملاءُ المعرض ═══
 *
 * **والعميلُ من تعامل لا من تصفّح.** قائمةٌ تُبنى من المشاهدات تُنتج
 * آلافًا بلا معنى، والمعرضُ يريد من راسله أو اشترى منه.
 *
 * **ومصدرُها الطلبُ والعرضُ معًا**: قائمةٌ من الطلبات وحدها تُسقط كلَّ
 * من فاوض ولم يُتمّ — وهم أكثرُ من يُعاود، وهو درسُ «العمودُ الذي
 * يقول ما لم يصل يُبنى من مصدره لا من الصندوق».
 */
function scope(dealerId: string, branchId: string | null) {
  return { dealerId, ...(branchId === null ? {} : { branchId }) };
}

export type DealerCustomer = {
  /**
   * ═══ ومفتاحُ الصفّ ليس دائمًا حسابًا ═══
   *
   * دفترُ العملاء كان يُبنى من الطلبات والعروض، وكلاهما لحسابٍ عندنا —
   * **فمن اشترى من منضدة المعرض لا يظهر في دفتر عملاءِ معرضِه
   * إطلاقًا**، وهو من حضر إليه ودفع. فمفتاحُ ذاك جوالُه
   * (`counter:+9665…`)، ومفتاحُ صاحبِ الحساب معرّفُه.
   */
  key: string;
  /** أمن المنضدة هو؟ — فالصفّان يُقرآن ولا يُخلطان. */
  walkIn: boolean;
  name: string | null;
  city: string | null;
  orders: number;
  offers: number;
  /** مجموعُ ما أتمّه من صفقات — بالهللات. */
  spent: string;
  lastAt: string;
};

export const DEALER_CUSTOMER_CAP = 200;

/** **والمنضدةُ تجمع من عاد بجواله** — ومن اشترى بلا جوالٍ صفٌّ وحده. */
const counterKey = (phone: string | null, saleId: string): string =>
  phone === null || phone.trim() === '' ? `sale:${saleId}` : `counter:${phone.trim()}`;

export async function dealerCustomers(
  dealerId: string,
  branchId: string | null,
): Promise<DealerCustomer[]> {
  const mine = { listing: { vehicle: scope(dealerId, branchId) } };

  const [orders, offers] = await Promise.all([
    db.order.findMany({
      where: mine,
      select: {
        buyerId: true, createdAt: true, status: true,
        agreedPrice: true, settlementAmount: true,
        buyer: { select: { name: true, city: true } },
      },
    }),
    db.offer.findMany({
      where: mine,
      select: { buyerId: true, createdAt: true, buyer: { select: { name: true, city: true } } },
    }),
  ]);

  /**
   * **وعميلُ الصالة من واقعةِ البيع**: اسمُه وجوالُه كُتبا في المنضدة،
   * ولا حسابَ له عندنا — فلا طلبَ ولا عرضَ يدلّ عليه.
   */
  const counter = await db.dealerSale.findMany({
    where: { channel: 'COUNTER', ...scope(dealerId, branchId) },
    select: { id: true, buyerName: true, buyerPhone: true, price: true, soldAt: true },
  });

  const byUser = new Map<string, DealerCustomer & { last: Date }>();

  const touch = (
    key: string,
    person: { name: string | null; city: string | null; walkIn?: boolean },
    at: Date,
  ): DealerCustomer & { last: Date } => {
    const found = byUser.get(key);
    if (found !== undefined) {
      if (at.getTime() > found.last.getTime()) found.last = at;
      return found;
    }
    const fresh = {
      key,
      walkIn: person.walkIn === true,
      name: person.name,
      city: person.city,
      orders: 0,
      offers: 0,
      spent: '0.00',
      lastAt: at.toISOString(),
      last: at,
    };
    byUser.set(key, fresh);
    return fresh;
  };

  const spent = new Map<string, Prisma.Decimal>();

  for (const order of orders) {
    const row = touch(order.buyerId, order.buyer, order.createdAt);
    row.orders += 1;
    /**
     * **وما لم يكتمل ليس إنفاقًا**: طلبٌ أُلغي عند الدفع لم يدفع فيه
     * صاحبُه ريالًا، وجمعُه يُنتج عميلًا «أنفق مليونًا» ولم يُتمّ شيئًا.
     */
    if (order.status === 'COMPLETED') {
      const value = order.settlementAmount ?? order.agreedPrice;
      spent.set(order.buyerId, (spent.get(order.buyerId) ?? new Prisma.Decimal(0)).plus(value));
    }
  }

  for (const offer of offers) {
    touch(offer.buyerId, offer.buyer, offer.createdAt).offers += 1;
  }

  /**
   * **وبيعةُ المنضدة طلبٌ تمّ** — فتُعَدّ في «الطلبات» وفي «ما أتمّه»:
   * من دفع في الصالة أتمّ، وعرضُه صفرًا يجعله يبدو متفرّجًا.
   * **والمدينةُ لا تُخترع له**: لا حسابَ له، فلا مدينةَ مسجَّلة.
   */
  for (const sale of counter) {
    const key = counterKey(sale.buyerPhone, sale.id);
    const row = touch(key, { name: sale.buyerName, city: null, walkIn: true }, sale.soldAt);
    row.orders += 1;
    spent.set(key, (spent.get(key) ?? new Prisma.Decimal(0)).plus(sale.price));
  }

  return [...byUser.values()]
    .map((row) => ({
      key: row.key,
      walkIn: row.walkIn,
      name: row.name,
      city: row.city,
      orders: row.orders,
      offers: row.offers,
      spent: (spent.get(row.key) ?? new Prisma.Decimal(0)).toFixed(2),
      lastAt: row.last.toISOString(),
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0, DEALER_CUSTOMER_CAP);
}
