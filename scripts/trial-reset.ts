import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * ═══ تنظيف ما يصنعه التجريب اليدويّ ═══
 *
 * **المشي بالنقر يُنشئ صفوفًا حقيقية.** طلبٌ ودفعةٌ وضمانٌ وحجزٌ في دفتر
 * البوابة — ولا يميّزها شكلٌ عن المزروع، فلا يلتقطها تنظيف
 * `global-setup`. وقد أسقطت واحدةٌ منها اختبار توجيه الدفع فعلًا: حجزٌ
 * قائمٌ على غرض الضمان يجعل «التعطيل يُرفض» صحيحًا في الحالين، فينهار
 * ما يقيسه الاختبار.
 *
 * **والقاعدة نفسها التي للاختبارات**: ما تصنعه أعِده. والمشي بالنقر
 * ليس استثناءً منها — هو تشغيلٌ بلا `afterAll`.
 *
 *   npm run trial:reset
 */

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  const key = match?.[1];
  if (key !== undefined && process.env[key] === undefined) {
    process.env[key] = (match?.[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  console.error('✗ DATABASE_URL غير مضبوط — راجع .env.example');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  console.error('\n✗ لا يُشغَّل في الإنتاج — يحذف طلباتٍ ودفعات.\n');
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: ['error'],
});

async function main(): Promise<void> {
  /**
   * الطلبات التي مرّت بالبوابة التجريبية وحدها — **تُعرَف بدفعتها لا
   * بتاريخها**. وحذفٌ بالتاريخ يبتلع صفوفًا مزروعة يعتمد عليها غيرها.
   */
  const payments = await db.payment.findMany({
    where: { gatewayKey: 'sandbox' },
    select: { id: true, orderId: true },
  });
  const orderIds = [...new Set(payments.map((row) => row.orderId).filter((id) => id !== null))];

  await db.paymentEvent.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
  await db.payment.deleteMany({ where: { gatewayKey: 'sandbox' } });

  let restored = 0;
  for (const orderId of orderIds) {
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (order === null) continue;

    await db.escrow.deleteMany({ where: { orderId } });
    await db.orderEvent.deleteMany({ where: { orderId } });
    await db.taxInvoice.deleteMany({ where: { orderId } }).catch(() => undefined);
    await db.order.delete({ where: { id: orderId } });

    // الإعلان يعود معروضًا — وإلّا بقيت سيارةٌ محجوزة بلا طلب
    await db.listing.update({ where: { id: order.listingId }, data: { status: 'PUBLISHED' } });
    restored += 1;
  }

  /**
   * وإعلانات التجريب — تُعرَف بمرفوعها على القرص لا بتاريخها.
   * ومركبتها معها، وإلّا بقيت يتيمةً تُضخّم كل عدّاد سوق.
   */
  const trialListings = await db.listing.findMany({
    where: { images: { some: { r2Key: { contains: '/listings/' } } }, seller: { email: { contains: '.trial@' } } },
    select: { id: true, vehicleId: true },
  });
  for (const listing of trialListings) {
    /**
     * العروض قبل الإعلان — **وإلّا أسقط القيدُ المرجعيّ التنظيف كلّه**
     * في منتصفه، فيبقى نصف ما صنعتَه ولا يقول الأمر إنه بقي.
     * (وقع: عرضٌ على إعلان تجريب منع حذفه، فمات السكربت بلا رسالة مفهومة.)
     */
    await db.offer.deleteMany({ where: { listingId: listing.id } });
    await db.listingImage.deleteMany({ where: { listingId: listing.id } });
    await db.listing.delete({ where: { id: listing.id } });
    await db.vehicle.delete({ where: { id: listing.vehicleId } }).catch(() => undefined);
  }

  /**
   * ومزايدات التجريب وعرابينها — **الأثر الجديد يُتبَع في الاستعادة
   * المشتركة**. مزايدةٌ تبقى تُغيّر أعلى سعرٍ في مزادٍ مزروع، فيقرأ
   * كل من يفتحه رقمًا صنعتُه أنا.
   */
  const trialBidders = await db.user.findMany({
    where: { email: { contains: '.trial@' } },
    select: { id: true },
  });
  const bidderIds = trialBidders.map((row) => row.id);
  const bids = await db.bid.deleteMany({ where: { bidderId: { in: bidderIds } } });
  await db.deposit.deleteMany({ where: { userId: { in: bidderIds } } });

  const ledger = await db.sandboxTransaction.deleteMany({});

  console.log(
    `\n✓ نُظّف التجريب: ${String(restored)} طلبًا، و${String(payments.length)} دفعة، ` +
      `و${String(trialListings.length)} إعلانًا، و${String(bids.count)} مزايدة، ` +
      `و${String(ledger.count)} قيدًا في دفتر البوابة.\n`,
  );
  await db.$disconnect();
}

void main();
