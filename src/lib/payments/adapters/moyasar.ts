/**
 * ⚠️ **لم يُختبَر مقابل المزوّد — بُني على الوثائق المنشورة.**
 *
 * لا مفاتيح اختبار بعد، فما تحته لم يلمس Moyasar قطّ. واختباراته
 * تجري على بوابة وهميّة تطبّق الواجهة نفسها، فتُغطّى كل المسارات بلا
 * اتصال — لكنّ **مطابقة الحقول والحالات تبقى غير مُثبَتة** حتى تصل
 * المفاتيح. راجع `docs/api/payments.md` § 8.
 *
 * ═══ هذا الملف وحده يترجم ═══
 *
 * البوابة ١٥ تستثني `src/lib/payments/adapters/` — ومفردات البطاقة
 * مسموحة هنا لأن هذا موضع الترجمة:
 *
 *   hold → authorize · settle → capture · cancel → void
 *   partialReturn → refund
 *
 * ولا تخرج واحدةٌ منها إلى النطاق ولا إلى الشاشة.
 */

import type {
  CancelResult,
  GatewayCapabilities,
  GatewaySettlement,
  HoldInput,
  HoldResult,
  HoldStatus,
  PaymentGatewayPort,
  ReturnResult,
  SettleResult,
} from '../gateway';
import { verifyHmac } from '../signature';

const BASE_URL = 'https://api.moyasar.com/v1';

/**
 * قدرات Moyasar كما في A20.
 *
 * و`maxHoldDays: 7` دون عتبة الضمان (٢١) — فالتحذير الأوكر ينطق حين
 * يُوجَّه إليها الضمان، وهذا مقصود لا عيب.
 */
export const MOYASAR_CAPABILITIES: GatewayCapabilities = {
  supportsHold: true,
  supportsPartialSettle: true,
  supportsRefund: true,
  maxHoldDays: 7,
  settlementDelayHours: 0,
  feePct: 2.75,
  feeFixed: 1,
};

/**
 * المبلغ عند Moyasar **بالهللات** لا بالريالات.
 *
 * وهذا أخطر سطر في الملف: `100` تعني ريالًا واحدًا لا مئة. وخطأٌ هنا
 * يخصم مئة ضعف أو واحدًا من مئة، ولا يكشفه نوعٌ لأن كليهما عدد.
 */
export function toHalalas(amount: string): number {
  const [whole = '0', fraction = ''] = amount.split('.');
  const padded = `${fraction}00`.slice(0, 2);
  return Number(whole) * 100 + Number(padded);
}

export function fromHalalas(halalas: number): string {
  return (halalas / 100).toFixed(2);
}

type MoyasarPayment = {
  id?: string;
  status?: string;
  amount?: number;
  captured?: number;
  source?: { transaction_url?: string | null };
  message?: string | null;
};

/** حقن `fetch` — الاختبار يمرّر بديلًا، والإنتاج يستعمل العالميّ. */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export function createMoyasarAdapter(
  secretKey: string,
  webhookSecret: string,
  fetcher: Fetcher = fetch,
): PaymentGatewayPort {
  const auth = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;

  async function call(path: string, body?: Record<string, unknown>): Promise<{
    ok: boolean;
    payment: MoyasarPayment;
    code: string;
  }> {
    try {
      const response = await fetcher(`${BASE_URL}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: auth, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      const payment = (await response.json()) as MoyasarPayment;
      if (!response.ok) {
        return { ok: false, payment, code: `HTTP_${String(response.status)}` };
      }
      return { ok: true, payment, code: '' };
    } catch {
      /**
       * الشبكة سقطت — و**النتيجة غير معروفة لا فاشلة**.
       *
       * الطلب قد يكون وصل ونُفِّذ، فإعلانُه فشلًا يجعل النطاق يعيد
       * المحاولة فيُخصم مرّتين. `PENDING` تُبقي القرار للويبهوك أو
       * لـ`status()`.
       */
      return { ok: false, payment: {}, code: 'NETWORK_UNKNOWN' };
    }
  }

  return {
    key: 'moyasar',
    capabilities: MOYASAR_CAPABILITIES,

    /** hold → authorize: `manual: true` يحجز بلا تحصيل. */
    async hold(input: HoldInput): Promise<HoldResult> {
      const result = await call('/payments', {
        amount: toHalalas(input.amount),
        currency: input.currency,
        description: `${input.purpose} ${input.ref}`,
        callback_url: input.returnUrl,
        manual: true,
        metadata: { ref: input.ref, idempotency_key: input.idempotencyKey },
        source: { type: input.method },
      });

      const id = result.payment.id;
      if (result.code === 'NETWORK_UNKNOWN') {
        // لا مرجع بعد — والنطاق يبقى منتظرًا لا يعيد المحاولة
        return { state: 'PENDING', holdRef: input.idempotencyKey, expiresAt: null };
      }
      if (!result.ok || id === undefined) {
        return {
          state: 'FAILED',
          code: result.code === '' ? 'GATEWAY_REJECTED' : result.code,
          message: result.payment.message ?? 'Gateway rejected the hold.',
        };
      }

      const challenge = result.payment.source?.transaction_url;
      if (challenge != null && challenge !== '') {
        return { state: 'REQUIRES_ACTION', holdRef: id, actionUrl: challenge };
      }

      // `authorized` وحدها تعني حجزًا مؤكَّدًا — وغيرها ينتظر
      return result.payment.status === 'authorized'
        ? { state: 'CONFIRMED', holdRef: id, expiresAt: expiryFrom(new Date()) }
        : { state: 'PENDING', holdRef: id, expiresAt: expiryFrom(new Date()) };
    },

    /** settle → capture: بمبلغ أقلّ حين تكون التسوية جزئية. */
    async settle(holdRef: string, amount?: string): Promise<SettleResult> {
      const result = await call(
        `/payments/${holdRef}/capture`,
        amount === undefined ? {} : { amount: toHalalas(amount) },
      );

      if (result.code === 'NETWORK_UNKNOWN') return { state: 'PENDING', settleRef: holdRef };
      if (!result.ok) {
        return {
          state: 'FAILED',
          code: result.code === '' ? 'CAPTURE_REJECTED' : result.code,
          message: result.payment.message ?? 'Gateway rejected the settle.',
        };
      }

      const captured = result.payment.captured ?? result.payment.amount ?? 0;
      return result.payment.status === 'captured' || result.payment.status === 'paid'
        ? { state: 'CONFIRMED', settleRef: holdRef, settledAmount: fromHalalas(captured) }
        : { state: 'PENDING', settleRef: holdRef };
    },

    /** cancel → void: الحجز يسقط ولا مال تحرّك، فلا استرجاع. */
    async cancel(holdRef: string): Promise<CancelResult> {
      const result = await call(`/payments/${holdRef}/void`, {});
      if (result.code === 'NETWORK_UNKNOWN') return { state: 'PENDING' };
      if (!result.ok) {
        return {
          state: 'FAILED',
          code: result.code === '' ? 'VOID_REJECTED' : result.code,
          message: result.payment.message ?? 'Gateway rejected the cancel.',
        };
      }
      return result.payment.status === 'voided' ? { state: 'CONFIRMED' } : { state: 'PENDING' };
    },

    /** partialReturn → refund: بعد التسوية وحدها. */
    async partialReturn(settleRef: string, amount: string): Promise<ReturnResult> {
      const result = await call(`/payments/${settleRef}/refund`, { amount: toHalalas(amount) });
      if (result.code === 'NETWORK_UNKNOWN') return { state: 'PENDING', returnRef: settleRef };
      if (!result.ok) {
        return {
          state: 'FAILED',
          code: result.code === '' ? 'REFUND_REJECTED' : result.code,
          message: result.payment.message ?? 'Gateway rejected the return.',
        };
      }
      return result.payment.status === 'refunded'
        ? { state: 'CONFIRMED', returnRef: settleRef, returnedAmount: amount }
        : { state: 'PENDING', returnRef: settleRef };
    },

    /**
     * حالة المال **كما تقولها البوابة** لا كما نتذكّرها.
     *
     * وهي المدخل الذي يُصحّح دفترنا حين يضيع ويبهوك أو تسقط شبكة —
     * فدفترنا مرآة، والمرآة تُقارَن بالأصل.
     */
    async status(ref: string): Promise<HoldStatus> {
      const result = await call(`/payments/${ref}`);
      if (!result.ok) {
        return {
          state: 'FAILED',
          held: false, settled: false, cancelled: false,
          settledAmount: null, expiresAt: null,
        };
      }

      const status = result.payment.status ?? '';
      const captured = result.payment.captured ?? 0;
      return {
        state: 'CONFIRMED',
        held: status === 'authorized',
        settled: status === 'captured' || status === 'paid',
        cancelled: status === 'voided',
        settledAmount: captured > 0 ? fromHalalas(captured) : null,
        expiresAt: null,
      };
    },

    /**
     * تسوية يوم — **غير مبنيّة حتى تصل مفاتيح الاختبار**.
     *
     * وشكل استجابة `/payouts` عندهم غير مؤكَّد من الوثائق وحدها، وبناؤه
     * تخمينًا يُنتج مطابقةً تُطمئن بلا أن تطابق شيئًا. فتُعلن غيابها،
     * والمطابقة تُسجّل «تعذّرت القراءة» لا «تطابقت».
     */
    settlementFor(): Promise<GatewaySettlement> {
      return Promise.resolve({ available: false, reason: 'SETTLEMENT_API_NOT_WIRED' });
    },

    verifySignature(rawBody: string, signature: string): boolean {
      return verifyHmac(rawBody, signature, webhookSecret);
    },
  };
}

function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + MOYASAR_CAPABILITIES.maxHoldDays * 86_400_000);
}
