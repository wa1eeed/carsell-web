import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { resolveForPayment, resolveGateway } from '@/lib/payments/resolve';
import { postEntries } from './ledger';

/**
 * ═══ العربون مالٌ لا وسم ═══
 *
 * كان `holdDeposit` يكتب صفًّا بـ`HELD` **ولا يمرّ ببوابة**: لا خصم،
 * ولا قيد، ولا دفعة. فالمزايدة ليست التزامًا، و`forfeitDeposit` تصادر
 * رقمًا في جدولنا — والغرض `AUCTION_DEPOSIT` موجَّهٌ ومضبوط ولا
 * يناديه أحد.
 *
 * ═══ وقرار المالك ═══
 *
 * **الحجز ببطاقة** لا بمحفظة: المحفظة تحتاج شحنًا مسبقًا، ومزايدٌ
 * برصيدٍ فارغ لا يستطيع أن يزايد أصلًا. **والمُصادَر للمنصّة** —
 * فقيدُه إيراد.
 *
 * ═══ وحدود ما هنا ═══
 *
 * هذه الوحدة تمسّ المال وحده: الحجز والإلغاء والتحصيل وقيودها.
 * وحالةُ `Deposit` تبقى في `auctions.ts` حيث منطق المزاد — فلا
 * يُقسَّم قرارٌ واحد على ملفّين.
 */

export type DepositHoldFailure =
  | 'NO_ROUTE'
  | 'ROUTE_DISABLED'
  | 'GATEWAY_FAILED'
  | 'REQUIRES_ACTION';

export type DepositHoldResult =
  | { ok: true; paymentId: string }
  | { ok: false; reason: DepositHoldFailure; code?: string; actionUrl?: string };

/**
 * حجزٌ حقيقيّ لعربون — دفعةٌ بلا طلب.
 *
 * **و`Payment.orderId` اختياريّ منذ المخطّط الأوّل**، فالصفّ ممثَّل
 * بلا افتعال طلبٍ وهميّ يظهر في كل عدّاد.
 */
export async function holdDepositMoney(
  input: {
    auctionRef: string;
    amount: Prisma.Decimal;
    method: string;
    returnUrl: string;
    idempotencyKey: string;
  },
  now: Date = new Date(),
): Promise<DepositHoldResult> {
  const resolved = await resolveGateway('AUCTION_DEPOSIT');
  if (resolved === null) return { ok: false, reason: 'NO_ROUTE' };
  // الغرض المعطَّل يمنع الجديد ولا يمسّ القائم
  if (!resolved.enabled) return { ok: false, reason: 'ROUTE_DISABLED' };

  const payment = await db.payment.create({
    data: {
      purpose: 'AUCTION_DEPOSIT',
      // **لقطة لا إعداد**: الحجز يُفرَج من حيث أُنشئ
      gatewayKey: resolved.gatewayKey,
      environment: resolved.environment,
      amount: input.amount,
      method: input.method,
      status: 'CREATED',
      createdAt: now,
    },
  });

  const result = await resolved.gateway.hold({
    purpose: 'AUCTION_DEPOSIT',
    ref: input.auctionRef,
    amount: input.amount.toString(),
    currency: 'SAR',
    method: input.method,
    returnUrl: input.returnUrl,
    idempotencyKey: input.idempotencyKey,
  });

  if (result.state === 'FAILED') {
    /**
     * **فشل البوابة يُسجَّل ولا يُبتلع.** والمزايد يحتاج أن يعرف أن
     * بطاقته رُفضت لا أن «المزايدة لم تُقبل» — فيُصلح ما يملك إصلاحه.
     */
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failedAt: now, failureCode: result.code },
    });
    return { ok: false, reason: 'GATEWAY_FAILED', code: result.code };
  }

  if (result.state === 'REQUIRES_ACTION') {
    /**
     * **وتحدّي التحقّق في وسط المزاد حالٌ متوقَّعة لا عطل.** تُعاد
     * وجهتُه ليُكمل، والمزايدة لا تقع حتى يُحجز العربون — فلا تُقبل
     * مزايدةٌ بلا التزامٍ خلفها.
     */
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'REQUIRES_ACTION', holdRef: result.holdRef, actionUrl: result.actionUrl },
    });
    return { ok: false, reason: 'REQUIRES_ACTION', actionUrl: result.actionUrl ?? undefined };
  }

  await db.payment.update({
    where: { id: payment.id },
    data: { status: 'HELD', holdRef: result.holdRef, heldAt: now },
  });

  return { ok: true, paymentId: payment.id };
}

/**
 * إلغاء حجزِ عربونٍ — لغير الفائزين، ولمن ردّ البائع مزايدته.
 *
 * **وفشلُ الإلغاء لا يُبطل الإغلاق**: المزاد انتهى وقعًا، وحجزٌ لم
 * يُلغَ يسقط وحده عند البوابة بعد مدّته. فيُبلَّغ ويُعاد، ولا يُحتجز
 * الإغلاق كلّه على نداءٍ تعثّر.
 */
export async function cancelDepositHold(paymentId: string, now: Date = new Date()): Promise<void> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, holdRef: true, gatewayKey: true, environment: true },
  });
  if (payment === null || payment.status !== 'HELD' || payment.holdRef === null) return;

  // **من لقطتها لا من التوجيه الجاري** — الحجز يُفرَج من حيث أُنشئ
  const gateway = await resolveForPayment(payment.gatewayKey, payment.environment);
  const result = await gateway.cancel(payment.holdRef);
  if (result.state !== 'CONFIRMED') return;

  await db.payment.update({
    where: { id: payment.id },
    data: { status: 'CANCELLED', cancelledAt: now },
  });
}

/**
 * ═══ المصادرة — تحصيلٌ وقيد ═══
 *
 * **والمُصادَر للمنصّة** (قرار المالك): يُحصَّل الحجز ويُقيَّد إيرادًا.
 * وبلا قيدٍ تصير مصادرةٌ مالًا يدخل حسابنا ولا يظهر في دفترنا — وهو
 * بالضبط ما يكشفه أوّل تدقيق.
 */
export async function captureForfeitedDeposit(
  paymentId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true, status: true, holdRef: true, amount: true,
      gatewayKey: true, environment: true,
    },
  });
  if (payment === null || payment.status !== 'HELD' || payment.holdRef === null) return false;

  const gateway = await resolveForPayment(payment.gatewayKey, payment.environment);
  const settled = await gateway.settle(payment.holdRef, payment.amount.toString());

  /**
   * **و`PENDING` ليست نجاحًا.** تسويةٌ لم تُؤكَّد بعد لا تُقيَّد
   * إيرادًا — والقيد على ما لم يقع يُظهر ربحًا يُردّ.
   */
  if (settled.state !== 'CONFIRMED') return false;

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SETTLED',
        settleRef: settled.settleRef,
        settledAmount: payment.amount,
        settledAt: now,
      },
    });

    /**
     * القيد: نقدٌ يدخل، وإيرادٌ يُعترَف به. **والاعتراف عند الاستحقاق**
     * — وقد استُحقّ: المزايد أخلّ، والعربون صار لنا بشرطٍ معلَن.
     */
    await postEntries(tx, {
      event: 'deposit.forfeited',
      postings: [
        { account: 'PLATFORM_CASH', direction: 'DEBIT', amount: payment.amount, note: 'deposit.forfeited' },
        { account: 'PLATFORM_REVENUE', direction: 'CREDIT', amount: payment.amount, note: 'deposit.forfeited' },
      ],
    });
  });

  return true;
}
