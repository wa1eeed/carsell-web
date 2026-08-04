import type { Prisma } from '@/generated/prisma/client';

/**
 * ═══ المراجع المتسلسلة — من الأعلى لا من العدد ═══
 *
 * كانت تُبنى بـ`count() + 1`، **والعدد ليس الأعلى**: يكفي أن يُحذف
 * طلبٌ واحد أو يُلغى ليصير التالي مصادمًا لمرجعٍ قائم، فيسقط الإنشاء
 * بـ«Unique constraint failed» — ولا يقول الخطأ أن السبب فجوةٌ في
 * التسلسل، بل يتّهم الإنشاء نفسه.
 *
 * (وقع فعلًا: أوّل صفقة اكتملت تركت `ORD-2026-1013`، فصار كل طلبٍ
 * جديد يصطدم به لأن العدّ يقول ١٠١٢.)
 *
 * **والقاعدة تُكتب مرّة**: كانت منسوخة في `offers.ts` و`orders.ts`،
 * ونسختان تتباعدان أوّل تصحيح.
 *
 * ═══ والأعلى يُحسب في الشيفرة لا في SQL ═══
 *
 * جرّبتُ `MAX(CAST(SUBSTRING(...)))` فعاد بأقلّ من الحقيقة: Prisma
 * تُمرّر موضع `SUBSTRING` معاملًا مربوطًا، وPostgres لا يقبله هناك
 * فيُقرأ غير ما قُصد — **بلا خطأ**، وهو أسوأ من السقوط.
 *
 * والترتيب النصّيّ لا يصلح بديلًا: `'999' > '1000'` نصًّا، فيعود
 * العدّاد إلى الوراء عند تجاوز الألف. فتُقرأ مراجع السنة وتُقارن
 * أعدادًا — والحجم مقيَّد بسنةٍ واحدة.
 */

const ORDER_START = 1000;

/** أعلى تسلسلٍ قائم — والذيل غير الرقميّ يُتجاهَل لا يُسقط الحساب. */
function highestAfter(
  rows: readonly { ref: string }[],
  prefix: string,
  floor: number,
): number {
  let highest = floor;
  for (const row of rows) {
    const value = Number(row.ref.slice(prefix.length));
    if (Number.isInteger(value) && value > highest) highest = value;
  }
  return highest;
}
const LISTING_PAD = 4;

/**
 * رقم الطلب — سنة وتسلسل، يُقتبَس في مكالمة.
 * `ORD-2026-1013`
 */
export async function nextOrderRef(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const year = now.getFullYear();
  const prefix = `ORD-${year}-`;

  const rows = await tx.order.findMany({
    where: { ref: { startsWith: prefix } },
    select: { ref: true },
  });

  return `${prefix}${String(highestAfter(rows, prefix, ORDER_START) + 1)}`;
}

/**
 * مرجع الإعلان — `ADS2026A0061`.
 * والحرف `A` فاصلٌ بين السنة والتسلسل، والتسلسل مُصفَّر إلى أربع خانات.
 */
export async function nextListingRef(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const year = now.getFullYear();
  const prefix = `ADS${year}A`;

  const rows = await tx.listing.findMany({
    where: { ref: { startsWith: prefix } },
    select: { ref: true },
  });

  const next = highestAfter(rows, prefix, 0) + 1;
  return `${prefix}${String(next).padStart(LISTING_PAD, '0')}`;
}

/**
 * مرجع البلاغ — `RPT-2026-0188`.
 *
 * والمعرّف الداخليّ (cuid) لا يُقتبَس في مكالمة ولا يُقرأ في شاشة،
 * فالبلاغ كالطلب: له مرجعٌ يقوله صاحبه.
 */
export async function nextReportRef(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const year = now.getFullYear();
  const prefix = `RPT-${year}-`;

  const rows = await tx.report.findMany({
    where: { ref: { startsWith: prefix } },
    select: { ref: true },
  });

  const next = highestAfter(rows, prefix, 0) + 1;
  return `${prefix}${String(next).padStart(LISTING_PAD, '0')}`;
}
