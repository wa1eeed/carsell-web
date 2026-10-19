import { db } from '@/lib/db';
import type { PaymentStatus, WebhookOutcome } from '@/generated/prisma/enums';
import type { Prisma } from '@/generated/prisma/client';

/**
 * ═══ ما قالته البوّابة — وما ترتّب عليه ═══
 *
 * `WebhookEvent` يُكتب منذ بُني **ولا يقرؤه شيء** (البوابة ٦٤): كلُّ
 * ردٍّ من بوّابة الدفع يُخزَّن بحمولته كاملةً، فحين يسقط دفعٌ يكون
 * الدليلُ في الجدول ولا بابَ إليه.
 *
 * وقياسُ المسار أخرج ما هو أسوأ من غياب الشاشة: نتيجةُ `applyState`
 * تُهمَل، فويبهوكٌ متأخّر يُرفض انتقالُه ويُكتب الصفُّ «معالَجًا»
 * **ولا أثرَ للرفض في مكان**. فالنتيجة تُسجَّل مع الحمولة هنا.
 */

/**
 * ما ترسله البوّابة ⇒ ما نكتبه عندنا — **مصدرٌ واحد**.
 *
 * كانت في ملفّ المسار وحده، وصارت تقرؤها الشاشةُ أيضًا لتقول «نوعٌ
 * لا يقابله حالٌ عندنا». ونسختان تتباعدان أوّلَ نوعٍ يُضاف، فتقول
 * الشاشةُ «مهمَل» عن حدثٍ يُطبَّق.
 */
export const WEBHOOK_STATUS: Record<string, PaymentStatus> = {
  payment_authorized: 'HELD',
  payment_captured: 'SETTLED',
  payment_paid: 'SETTLED',
  payment_voided: 'CANCELLED',
  payment_refunded: 'RETURNED',
  payment_failed: 'FAILED',
};

/**
 * ═══ سقفُ المرفوضات لكلّ دفعة ═══
 *
 * المرفوضُ توقيعُه يُخزَّن الآن — وهو ما يُري المشغّلَ مفتاحًا دُوِّر
 * خطأً أو من يُجرّب. **ويُخزَّن محدودًا**: المرجعُ يطابق دفعةً عندنا
 * (فالمدى محصورٌ بدفعاتنا لا بالإنترنت)، ولكلّ دفعة سقفٌ بعده نكتفي
 * — فمن يملك مرجعًا ويبدّل معرّف الحدث لا يملأ الجدول.
 */
export const BAD_SIGNATURE_CAP = 20;

export type WebhookRow = {
  id: string;
  provider: string;
  type: string;
  signatureOk: boolean;
  outcome: WebhookOutcome;
  appliedStatus: PaymentStatus | null;
  note: string | null;
  repeats: number;
  receivedAt: Date;
  processedAt: Date | null;
  paymentId: string | null;
  payload: Prisma.JsonValue;
};

const COLUMNS = {
  id: true, provider: true, type: true, signatureOk: true, outcome: true,
  appliedStatus: true, note: true, repeats: true, receivedAt: true,
  processedAt: true, paymentId: true, payload: true,
} as const;

/**
 * يُكتب **قبل** المعالجة — فحارسُ التكرار هو المفتاح الأساسيّ نفسُه،
 * وإعادةُ الإرسال تصطدم به. و`null` تعني «وصل قبلُ».
 */
export async function openWebhook(input: {
  id: string;
  provider: string;
  type: string;
  paymentId: string;
  payload: Prisma.InputJsonValue;
}): Promise<boolean> {
  const created = await db.webhookEvent
    .create({ data: { ...input, signatureOk: true, outcome: 'RECEIVED' } })
    .catch(() => null);
  return created !== null;
}

/**
 * **وإعادةُ الإرسال تُعدّ.** كانت تُردّ ٢٠٠ بلا أثر، وثمانيةُ
 * تسليماتٍ لحدثٍ واحد تقول إنّ ردَّنا لا يصل أو أنّ البوّابة تشكّ.
 */
export async function countRepeat(id: string): Promise<void> {
  await db.webhookEvent.update({ where: { id }, data: { repeats: { increment: 1 } } });
}

/** يُغلق الصفّ بما ترتّب عليه فعلًا — ولا يبقى على `RECEIVED`. */
export async function closeWebhook(
  id: string,
  outcome: Exclude<WebhookOutcome, 'RECEIVED' | 'BAD_SIGNATURE'>,
  appliedStatus: PaymentStatus | null,
  note: string | null,
): Promise<void> {
  await db.webhookEvent.update({
    where: { id },
    data: { outcome, appliedStatus, note, processedAt: new Date() },
  });
}

/**
 * توقيعٌ لا يطابق — ومرجعُه مع ذلك دفعةٌ عندنا، فالحادثة تُسجَّل.
 * ويُردّ `false` حين يبلغ السقف، فيبقى الردّ ٤٠١ بلا كتابة.
 */
export async function recordBadSignature(input: {
  id: string;
  provider: string;
  type: string;
  paymentId: string;
  payload: Prisma.InputJsonValue;
}): Promise<boolean> {
  const seen = await db.webhookEvent.count({
    where: { paymentId: input.paymentId, outcome: 'BAD_SIGNATURE' },
  });
  if (seen >= BAD_SIGNATURE_CAP) return false;

  const created = await db.webhookEvent
    .create({
      data: { ...input, signatureOk: false, outcome: 'BAD_SIGNATURE', processedAt: new Date() },
    })
    .catch(() => null);
  return created !== null;
}

export type WebhookFilters = {
  outcome?: WebhookOutcome;
  provider?: string;
  paymentId?: string;
  limit?: number;
};

/** قائمةُ اللوحة — الأحدثُ أوّلًا، فالمشغّل يأتي من عطلٍ وقع الآن. */
export async function adminWebhookEvents(filters: WebhookFilters = {}): Promise<WebhookRow[]> {
  return db.webhookEvent.findMany({
    where: {
      ...(filters.outcome === undefined ? {} : { outcome: filters.outcome }),
      ...(filters.provider === undefined ? {} : { provider: filters.provider }),
      ...(filters.paymentId === undefined ? {} : { paymentId: filters.paymentId }),
    },
    orderBy: { receivedAt: 'desc' },
    take: filters.limit ?? 60,
    select: COLUMNS,
  });
}

/** عدّادُ كلّ نتيجة — والشريطُ يُبنى منه لا من رقمٍ مكتوب. */
export async function webhookOutcomeCounts(): Promise<Record<string, number>> {
  const rows = await db.webhookEvent.groupBy({ by: ['outcome'], _count: { _all: true } });
  return Object.fromEntries(rows.map((row) => [row.outcome, row._count._all]));
}

/**
 * ويبهوكاتُ دفعاتٍ بعينها — **وهي الباب عند موضع الحاجة**: المشغّل
 * يقف على طلبٍ متعثّر، فالسؤال يقع هناك لا في شاشةٍ أخرى.
 */
export async function webhooksForPayments(paymentIds: string[]): Promise<WebhookRow[]> {
  if (paymentIds.length === 0) return [];
  return db.webhookEvent.findMany({
    where: { paymentId: { in: paymentIds } },
    orderBy: { receivedAt: 'desc' },
    select: COLUMNS,
  });
}

/** مزوّدو الدفع الذين وصلت منهم أحداث — للمرشّح، بلا قائمة مكتوبة. */
export async function webhookProviders(): Promise<string[]> {
  const rows = await db.webhookEvent.findMany({
    distinct: ['provider'],
    select: { provider: true },
    orderBy: { provider: 'asc' },
  });
  return rows.map((row) => row.provider);
}
