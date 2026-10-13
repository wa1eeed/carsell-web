import type { OrderStage } from '@/generated/prisma/enums';
import { notify, type NotifyInput } from './notifications';
import type { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

/**
 * ═══ إشعارات الطلب — ورحلتُه كانت صامتة من أوّلها إلى آخرها ═══
 *
 * **قِيس**: تسعةٌ وعشرون قالبًا من واحدٍ وأربعين في
 * `prisma/seed-data/notification-templates.json` **بلا كاتب** — ومنها
 * رحلةُ الطلب كلّها. فالبائع يُنشر إعلانه، ويُطلب، ويُدفع ثلاثون ألفًا
 * في ضمانه، وتتقدّم المراحل، ويُفرَج عن المال — **ولا يرنّ جرسُه مرّة
 * واحدة**. وأشدُّها: مشترٍ يَطلب مركبةً فتُحجَز على صاحبها ولا يعلم.
 *
 * ولم يكن الصنف خفيًّا: `offer.*` موصولةٌ كلّها منذ بُنيت، فالآلة
 * موجودة والطلب وحده خارجها.
 *
 * ═══ ولماذا ملفٌّ واحد ═══
 *
 * الطلب يُنشأ في ثلاثة مواضع (مباشر · قبول عرض · مزاد) ويتقدّم في
 * موضعين ويُلغى في ثالث. ونسخُ `notify` في كلٍّ يجعل مَن يُخطَر قاعدةً
 * مكرّرة ستّ مرّات تتباعد أوّل تعديل — **ومن يُخطَر قاعدةُ عمل**: مَن
 * لم يفعل الفعل هو من يحتاج خبره.
 *
 * ═══ والنطاق لا يصوغ جملة ═══
 *
 * الحمولة مفاتيحُ وأرقام، والنصّ في القالب — فلا تُبنى هنا عبارةٌ
 * عربية (البوابة ١٧)، ولا يُمرَّر اسمُ مرحلةٍ خامًا إلى نصٍّ يقرؤه
 * إنسان.
 */

/** ما يقبله الكاتب: معاملةٌ جارية أو العميل نفسه خارجها. */
type Writer = Prisma.TransactionClient | typeof db;

type Parties = { ref: string; buyerId: string; sellerId: string };

async function send(tx: Writer, input: NotifyInput): Promise<void> {
  await notify(input, tx);
}

/**
 * طلبٌ جديد.
 *
 * **والبائع هو المقصود الأوّل**: مركبتُه حُجزت وعروضُها الأخرى رُفضت،
 * وهو لم يفعل شيئًا ليعلم. والمشتري يُخطَر إلّا إن كان قد أُخطر في
 * المعاملة نفسها برسالةٍ أدقّ — «قُبل عرضك» أو «فزت بالمزاد» — فرسالتان
 * في ثانيةٍ واحدة عن واقعةٍ واحدة ضجيج.
 */
export async function notifyOrderCreated(
  tx: Writer,
  order: Parties & { amount: number | string },
  options: { buyer: boolean } = { buyer: true },
): Promise<void> {
  const payload = { ref: order.ref, amount: String(order.amount) };

  await send(tx, {
    userId: order.sellerId,
    templateKey: 'order.received',
    priority: 'critical',
    payload,
    entityType: 'Order',
    entityId: order.ref,
  });

  if (!options.buyer) return;

  await send(tx, {
    userId: order.buyerId,
    templateKey: 'order.created',
    priority: 'critical',
    payload: { ref: order.ref },
    entityType: 'Order',
    entityId: order.ref,
  });
}

/**
 * تقدّمت المرحلة — **ويُخطَر من لم يحرّكها**.
 *
 * من ضغط الزرّ رأى نتيجته على الشاشة، ومن ينتظر هو من لا يعرف. و`actorId`
 * فارغٌ حين يحرّكها النظام (حجزُ المال مثلًا) فيُخطَر الطرفان.
 */
export async function notifyStageAdvanced(
  tx: Writer,
  order: Parties,
  to: OrderStage,
  actorId: string | null,
): Promise<void> {
  const payload = { ref: order.ref, stage: to };

  for (const userId of [order.buyerId, order.sellerId]) {
    if (userId === actorId) continue;
    await send(tx, {
      userId,
      templateKey: 'order.stage_changed',
      priority: 'high',
      payload,
      entityType: 'Order',
      entityId: order.ref,
    });
  }
}

/**
 * حُجز المال.
 *
 * **وهي لحظة البائع**: المشتري ضغط «ادفع» ورأى نتيجته، والبائع كان
 * ينتظر مالًا لا يعرف أوصل أم لا. والأولوية حرجة لأنها تفتح عليه
 * واجبًا: يبدأ النقل.
 */
export async function notifyEscrowHeld(
  tx: Writer,
  order: Parties,
  amount: number | string,
): Promise<void> {
  await send(tx, {
    userId: order.sellerId,
    templateKey: 'escrow.held',
    priority: 'critical',
    payload: { ref: order.ref, amount: String(amount) },
    entityType: 'Order',
    entityId: order.ref,
  });
}

/** أُفرج عن المال — وهي خبرُ البائع وحده: المشتري دفع من قبل. */
export async function notifyEscrowReleased(
  tx: Writer,
  order: { ref: string; sellerId: string },
  amount: number | string,
): Promise<void> {
  await send(tx, {
    userId: order.sellerId,
    templateKey: 'escrow.released',
    priority: 'critical',
    payload: { ref: order.ref, amount: String(amount) },
    entityType: 'Order',
    entityId: order.ref,
  });
}

/**
 * أُلغي الطلب — **ويُخطَر الطرف الآخر**.
 *
 * ومن أُلغي عليه طلبُه يحقّ له أن يعرف **فورًا**: البائع ليُعيد عرض
 * مركبته، والمشتري لأنّ مركبةً كان ينتظرها لن تصله. والسبب يُمرَّر كما
 * كتبه صاحبه — فـ«أُلغي» بلا سببٍ سؤالٌ لا خبر.
 */
export async function notifyOrderCancelled(
  tx: Writer,
  order: Parties,
  cancelledBy: string | null,
  reason: string | null,
): Promise<void> {
  const payload = { ref: order.ref, reason: reason ?? '' };

  for (const userId of [order.buyerId, order.sellerId]) {
    if (userId === cancelledBy) continue;
    await send(tx, {
      userId,
      templateKey: 'order.cancelled',
      priority: 'critical',
      payload,
      entityType: 'Order',
      entityId: order.ref,
    });
  }
}

/** تمّت الصفقة — «بِيعت مركبتك»، وهي خبرُ البائع. */
export async function notifyListingSold(
  tx: Writer,
  order: { ref: string; sellerId: string },
  amount: number | string,
): Promise<void> {
  await send(tx, {
    userId: order.sellerId,
    templateKey: 'listing.sold',
    priority: 'high',
    payload: { ref: order.ref, amount: String(amount) },
    entityType: 'Order',
    entityId: order.ref,
  });
}
