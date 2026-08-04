import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { isProduction } from '@/lib/env';
import { Prisma } from '@/generated/prisma/client';
import type {
  CancelResult,
  GatewaySettlement,
  HoldInput,
  HoldResult,
  HoldStatus,
  PaymentGatewayPort,
  ReturnResult,
  SettleResult,
} from '../gateway';

/**
 * ═══ بوابة تجريبية — لتكتمل الرحلة قبل وصول المفاتيح ═══
 *
 * بلا بوابةٍ لا يقع شراء واحد: `startHold` يردّ `GATEWAY_NOT_CONFIGURED`،
 * فيقف الطلب عند `PAYMENT` ولا يُمشى ما بعده — لا ضمان ولا مراحل ولا
 * تسوية ولا مستندات. **فالمنصّة تُعرض للتجربة وهي لا تستطيع أن تبيع.**
 *
 * وهذه تُحاكي المزوّد بأمانة: تحجز وتسوّي وتلغي وتردّ جزئيًّا، وتحفظ
 * **دفترها المستقلّ** (`SandboxTransaction`) فتعمل المطابقة اليومية على
 * أصلٍ لا على مرآتنا. ولو قرأت المطابقة من `Payment` لطابقت دائمًا.
 *
 * ═══ ومقيَّدة في الكود لا بالانضباط ═══
 *
 * `createSandboxAdapter` **ترمي في الإنتاج** — وبوابةٌ وهمية تُفتح على
 * مالٍ حقيقيّ تقول للمشتري إن بطاقته سُحبت ولم يُسحب شيء، وهذا أسوأ من
 * غياب البوابة لأن الغياب يُعلن نفسه.
 *
 * **والحدّ `APP_ENV` لا `NODE_ENV`.** الثاني يساوي `production` في
 * staging أيضًا، فالحراسة به تُغلق البوابة على بيئة التجريب نفسها —
 * وstaging **مقيَّدة بـ`TEST` في الكود** أصلًا (`effectiveEnvironment`)،
 * فهي موضع هذه البوابة لا موضع منعها. (كتبتُها بـ`NODE_ENV` أوّلًا،
 * فكانت staging تسقط بلا بوابة وأنا أحسبها محروسة.)
 */

export const SANDBOX_KEY = 'sandbox';

export class SandboxInProductionError extends Error {
  constructor() {
    super('The sandbox gateway cannot be constructed in production.');
    this.name = 'SandboxInProductionError';
  }
}

/**
 * بطاقات الاختبار — **والفشل يُختبَر كما يُختبَر النجاح**.
 *
 * مسارٌ سعيد وحده يترك «ماذا يرى المشتري حين تُرفض بطاقته» بلا جواب،
 * وهي الحال التي يقع فيها الناس فعلًا.
 */
const DECLINE_METHOD = 'test_declined';
const ACTION_METHOD = 'test_3ds';

/**
 * الطريقة تختار المخرَج — `HoldInput` لا يحمل رمز بطاقة، والمُهايئ لا
 * يخترع حقلًا في الحدّ ليختبر نفسه.
 */
function outcomeFor(input: HoldInput): 'OK' | 'DECLINED' | 'REQUIRES_ACTION' {
  if (input.method === DECLINE_METHOD) return 'DECLINED';
  if (input.method === ACTION_METHOD) return 'REQUIRES_ACTION';
  return 'OK';
}

/** الحجز يصمد بقدر ما تعلن القدرات — لا إلى الأبد. */
function holdExpiry(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

async function record(
  ref: string,
  kind: 'HOLD' | 'SETTLE' | 'RETURN',
  amount: string,
  state: string,
  parentRef: string | null,
  method: string,
): Promise<void> {
  await db.sandboxTransaction.create({
    data: { ref, kind, amount: new Prisma.Decimal(amount), state, parentRef, method },
  });
}

export function createSandboxAdapter(capabilities: PaymentGatewayPort['capabilities']): PaymentGatewayPort {
  if (isProduction) throw new SandboxInProductionError();

  return {
    key: SANDBOX_KEY,
    capabilities,

    async hold(input: HoldInput): Promise<HoldResult> {
      const outcome = outcomeFor(input);

      if (outcome === 'DECLINED') {
        return {
          state: 'FAILED',
          code: 'CARD_DECLINED',
          message: 'The sandbox card was declined.',
        };
      }

      const ref = `sbx_${randomUUID()}`;
      await record(ref, 'HOLD', input.amount, 'HELD', null, input.method);

      if (outcome === 'REQUIRES_ACTION') {
        /**
         * تحدّي 3DS يُحاكى بصفحةٍ محلّية تُكمِل أو تُلغي — فيُمشى
         * المسار الذي يقع فيه أكثر المشترين حقيقةً.
         */
        return {
          state: 'REQUIRES_ACTION',
          holdRef: ref,
          actionUrl: `/api/dev/sandbox/3ds/${ref}`,
        };
      }

      // البطاقة تؤكّد لحظيًّا — والبنكيّ يبقى `PENDING` حتى يصل الويبهوك
      return { state: 'CONFIRMED', holdRef: ref, expiresAt: holdExpiry(capabilities.maxHoldDays) };
    },

    async settle(holdRef: string, amount?: string): Promise<SettleResult> {
      const held = await db.sandboxTransaction.findUnique({ where: { ref: holdRef } });
      if (held === null || held.kind !== 'HOLD') {
        return { state: 'FAILED', code: 'HOLD_NOT_FOUND', message: 'Unknown hold reference.' };
      }
      if (held.state !== 'HELD') {
        return { state: 'FAILED', code: 'HOLD_NOT_HELD', message: `Hold is ${held.state}.` };
      }

      // التسوية الجزئية لا تتجاوز المحجوز — كما يفعل المزوّد
      const value = amount ?? held.amount.toString();
      if (new Prisma.Decimal(value).greaterThan(held.amount)) {
        return { state: 'FAILED', code: 'AMOUNT_EXCEEDS_HOLD', message: 'Above the held amount.' };
      }

      const ref = `sbx_stl_${randomUUID()}`;
      await db.sandboxTransaction.update({
        where: { ref: holdRef },
        data: { state: 'SETTLED' },
      });
      await record(ref, 'SETTLE', value, 'SETTLED', holdRef, held.method);

      return { state: 'CONFIRMED', settleRef: ref, settledAmount: value };
    },

    async cancel(holdRef: string): Promise<CancelResult> {
      const held = await db.sandboxTransaction.findUnique({ where: { ref: holdRef } });
      if (held === null) {
        return { state: 'FAILED', code: 'HOLD_NOT_FOUND', message: 'Unknown hold reference.' };
      }
      if (held.state === 'SETTLED') {
        return { state: 'FAILED', code: 'ALREADY_SETTLED', message: 'Settled holds cannot be cancelled.' };
      }
      await db.sandboxTransaction.update({ where: { ref: holdRef }, data: { state: 'CANCELLED' } });
      return { state: 'CONFIRMED' };
    },

    async partialReturn(settleRef: string, amount: string): Promise<ReturnResult> {
      const settled = await db.sandboxTransaction.findUnique({ where: { ref: settleRef } });
      if (settled === null || settled.kind !== 'SETTLE') {
        return { state: 'FAILED', code: 'SETTLE_NOT_FOUND', message: 'Unknown settlement reference.' };
      }
      if (new Prisma.Decimal(amount).greaterThan(settled.amount)) {
        return { state: 'FAILED', code: 'AMOUNT_EXCEEDS_SETTLEMENT', message: 'Above the settled amount.' };
      }

      const ref = `sbx_rtn_${randomUUID()}`;
      await record(ref, 'RETURN', amount, 'RETURNED', settleRef, settled.method);
      return { state: 'CONFIRMED', returnRef: ref, returnedAmount: amount };
    },

    /**
     * حال المال **كما تقولها البوابة** لا كما نتذكّره — وهذا كل معنى
     * الاستعلام: مرجعٌ مجهول ليس «غير محجوز»، بل `FAILED` صريح.
     */
    async status(ref: string): Promise<HoldStatus> {
      const row = await db.sandboxTransaction.findUnique({ where: { ref } });
      if (row === null) {
        return {
          state: 'FAILED',
          held: false, settled: false, cancelled: false,
          settledAmount: null, expiresAt: null,
        };
      }

      const settled = await db.sandboxTransaction.findFirst({
        where: { parentRef: ref, kind: 'SETTLE' },
      });

      return {
        state: 'CONFIRMED',
        held: row.state === 'HELD',
        settled: row.state === 'SETTLED',
        cancelled: row.state === 'CANCELLED',
        settledAmount: settled?.amount.toString() ?? null,
        expiresAt: row.state === 'HELD' ? holdExpiry(capabilities.maxHoldDays) : null,
      };
    },

    /**
     * تسوية اليوم من دفتر البوابة — بالمعاملات لا بالمجموع وحده.
     * **الفرق حدثٌ يُعالَج**، ومجموعٌ لا يقول أيّ معاملةٍ اختلفت لا يُعالَج.
     */
    async settlementFor(date: Date): Promise<GatewaySettlement> {
      const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const end = new Date(start.getTime() + 86_400_000);

      const rows = await db.sandboxTransaction.findMany({
        where: { createdAt: { gte: start, lt: end }, kind: { in: ['SETTLE', 'RETURN'] } },
        orderBy: { createdAt: 'asc' },
      });

      const total = rows.reduce(
        (sum, row) =>
          row.kind === 'RETURN' ? sum.minus(row.amount) : sum.plus(row.amount),
        new Prisma.Decimal(0),
      );

      return {
        available: true,
        date: start.toISOString().slice(0, 10),
        currency: 'SAR',
        total: total.toString(),
        entries: rows.map((row) => ({
          ref: row.ref,
          amount: row.amount.toString(),
          kind: row.kind === 'RETURN' ? ('RETURN' as const) : ('SETTLE' as const),
        })),
      };
    },

    /**
     * التجريبية لا توقّع — **وتقول ذلك بـ`false` لا بـ`true`**.
     * وقبولُ كل توقيع هنا يجعل مسار الويب‑هوك يمرّ في التطوير ويسقط
     * أوّل يومٍ في الإنتاج، وهو أسوأ وقتٍ لاكتشافه.
     */
    verifySignature(): boolean {
      return false;
    },
  };
}
