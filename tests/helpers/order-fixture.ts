import { db } from '@/lib/db';
import type { Escrow, Listing, Order } from '@/generated/prisma/client';

/**
 * ═══ استعادة الطلب — **في موضع واحد** ═══
 *
 * كل ملف اختبار كان يكتب تنظيفه بيده، فكان كلٌّ منها يعرف الآثار التي
 * كانت قائمة **يوم كُتب**. ثم أصبح `advanceStage` يُصدر عقد بيع، فتسرّب
 * عقدٌ من اختبار المهل إلى قاعدة التطوير: الاختبار لم يخطئ، بل تقادم.
 *
 * والعلاج ليس ترقيع الملفات الثلاثة — بل أن يكون للاستعادة موضعٌ واحد
 * يتبع الأثر الجديد مرّةً واحدة. **الخطأ الذي تكرّر يُغلَق آليًا.**
 */

/**
 * لقطةٌ كاملة للصفّ — والاستعادة تُعيده حرفيًّا لا حقولًا مختارة.
 *
 * **والإعلان معه**: صار `advanceStage` إلى `DONE` يكتب `SOLD`، وحسمُ
 * نزاعٍ بردٍّ كامل يكتب `PUBLISHED` أو `SUSPENDED`. فاختبارٌ يُكمل طلبًا
 * ولا يستعيد إعلانه يسحب سيارةً من السوق ويُسقط جيرانه في التشغيل
 * التالي — وهو الأثر الجديد الذي تتبعه هذه الاستعادة مرّةً واحدة.
 */
export type OrderSnapshot = { order: Order; escrow: Escrow | null; listing: Listing };

export async function snapshotOrder(orderId: string): Promise<OrderSnapshot> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  return {
    order,
    escrow: await db.escrow.findUnique({ where: { orderId } }),
    listing: await db.listing.findUniqueOrThrow({ where: { id: order.listingId } }),
  };
}

export async function restoreOrder(snapshot: OrderSnapshot): Promise<void> {
  const { id } = snapshot.order;

  /**
   * المستندات أوّلًا — وبترتيب الاعتماد: السطور والإشعارات قبل الفاتورة.
   * والحذف هنا لأن الصفّ صنعه اختبار، لا لأن الوثيقة تُحذف في الإنتاج.
   */
  await db.taxInvoiceLine.deleteMany({ where: { invoice: { orderId: id } } });
  await db.creditNote.deleteMany({ where: { invoice: { orderId: id } } });
  await db.taxInvoice.deleteMany({ where: { orderId: id } });
  await db.settlementStatement.deleteMany({ where: { orderId: id } });
  await db.vehicleSaleAgreement.deleteMany({ where: { orderId: id } });

  await db.paymentEvent.deleteMany({ where: { payment: { orderId: id } } });
  await db.payment.deleteMany({ where: { orderId: id } });

  await db.escrow.deleteMany({ where: { orderId: id } });
  if (snapshot.escrow !== null) await db.escrow.create({ data: snapshot.escrow });

  // أحداثٌ صنعها الاختبار — والمزروعة أقدم من اللقطة فتنجو
  await db.orderEvent.deleteMany({
    where: { orderId: id, createdAt: { gt: snapshot.order.stageEnteredAt } },
  });

  /**
   * ═══ وقيودُ الدفتر تُحذف بمعاملتها لا بصاحبها ═══
   *
   * صار الإلغاء يكتب في الدفتر، **فالأثر الجديد يُتبَع في الاستعادة
   * المشتركة** — وإلّا تسرّب قيدٌ إلى التشغيل التالي.
   *
   * والحذف بـ`orderId` وحده **يُفسد الدفتر**: قيدٌ مزدوج طرفُه الثاني
   * بلا `orderId` (حساب المنصّة مثلًا) يبقى يتيمًا، فتصير في الدفتر
   * معاملةٌ غير متوازنة تُسقط كل اختبارٍ يفحص التوازن. فتُجمع
   * المعاملات أوّلًا ثم تُحذف كاملةً.
   */
  const touched = await db.ledgerEntry.findMany({
    where: { orderId: id, createdAt: { gt: snapshot.order.stageEnteredAt } },
    select: { txnId: true },
    distinct: ['txnId'],
  });
  if (touched.length > 0) {
    await db.ledgerEntry.deleteMany({
      where: { txnId: { in: touched.map((entry) => entry.txnId) } },
    });
  }

  /**
   * **والإشعار أثرٌ جديد على كيانٍ مشترك.** صارت رحلةُ الطلب تُخطِر
   * طرفيها، فاختبارٌ يُكمل طلبًا يترك ستّة صفوفٍ في جرس مستخدمٍ مزروع
   * — ولا يراها أحد حتى يعدّ اختبارٌ آخر إشعاراته. والقاعدة واحدة:
   * الأثر الجديد يُتبَع في الاستعادة المشتركة مرّةً واحدة.
   */
  await db.notification.deleteMany({
    where: {
      entityType: 'Order',
      entityId: snapshot.order.ref,
      createdAt: { gt: snapshot.order.stageEnteredAt },
    },
  });

  /**
   * **وتاريخُ المركبة أثرٌ جديد على كيانٍ مشترك.** صار `advanceStage`
   * إلى `DONE` يكتب سطرًا في تاريخ المركبة («نقل ملكية عبر المنصة»)،
   * فاختبارٌ يُكمل طلبًا يترك سطرًا دائمًا في سيارةٍ مزروعة — يقرؤه
   * كلُّ من يفتح صفحتها، ولا يراه أحد حتى يعدّ اختبارٌ آخر سطورها.
   *
   * وهو ثالثُ أثرٍ يُتبَع هنا بعد الدفتر والإشعار، والقاعدة واحدة:
   * **الاستعادة في هذا الملفّ وحده، والأثرُ الجديد يُتبَع فيه مرّة**.
   */
  const listing = await db.listing.findUnique({
    where: { id: snapshot.order.listingId },
    select: { vehicleId: true },
  });
  if (listing !== null) {
    await db.vehicleHistoryItem.deleteMany({
      where: {
        vehicleId: listing.vehicleId,
        occurredAt: { gt: snapshot.order.stageEnteredAt },
      },
    });
  }

  const { id: _id, ...fields } = snapshot.order;
  await db.order.update({ where: { id }, data: fields });

  const { id: _listingId, ...listingFields } = snapshot.listing;
  await db.listing.update({ where: { id: snapshot.listing.id }, data: listingFields });
}

/** أوّل طلبٍ مزروع، مُعادًا إلى حاله مهما فعل الجسد أو رمى. */
export async function withOrder(body: (order: Order) => Promise<void>): Promise<void> {
  const first = await db.order.findFirstOrThrow({ orderBy: { ref: 'asc' } });
  const snapshot = await snapshotOrder(first.id);
  try {
    await body(snapshot.order);
  } finally {
    await restoreOrder(snapshot);
  }
}
