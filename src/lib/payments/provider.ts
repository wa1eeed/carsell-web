import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * حدّ مزوّد الدفع.
 *
 * **الواجهة أوّلًا والمزوّد بعدها**: الترميز يذكر Moyasar وHyperPay معًا،
 * واختيار أحدهما قرارٌ ماليّ لم يُتّخذ. وبناء المنطق حول اسم مزوّد يجعل
 * تغييره إعادةَ كتابة — بينما ما تحته (الحالات والتكرار والتحقّق من
 * التوقيع) واحدٌ عند الجميع.
 */

export type ChargeInput = {
  amount: string;
  currency: string;
  method: string;
  orderRef: string;
  /** يعود إليه المتصفّح بعد تحدّي 3DS. */
  returnUrl: string;
  idempotencyKey: string;
};

export type ChargeResult =
  | { ok: true; providerRef: string; requires3ds: false }
  | { ok: true; providerRef: string; requires3ds: true; threeDsUrl: string }
  | { ok: false; code: string; message: string };

export type PaymentProvider = {
  readonly name: string;
  charge: (input: ChargeInput) => Promise<ChargeResult>;
  capture: (providerRef: string) => Promise<{ ok: boolean; code?: string }>;
  refund: (providerRef: string, amount: string) => Promise<{ ok: boolean; code?: string }>;
  verifySignature: (rawBody: string, signature: string) => boolean;
};

/**
 * المزوّد قبل اختيار مزوّد — **يفشل صراحةً**.
 *
 * وهذا نقيض قاعدة «كل تكامل خلف راية يسقط بصمت»: تلك للمساعِد
 * المؤجَّل (جلب بيانات المركبة)، وسقوطه الصامت يترك للمستخدم مسارًا
 * يدويًّا. أمّا الدفع فلا مسار بديل له، وصمتُه يعني شاشةً تدور بلا نهاية
 * ومستخدمًا لا يعرف أدُفع أم لا. فالخطأ صريح ومسمّى.
 */
export const PENDING_PROVIDER: PaymentProvider = {
  name: 'pending',
  charge: () =>
    Promise.resolve({
      ok: false,
      code: 'PROVIDER_NOT_CONFIGURED',
      message: 'لم يُفعَّل مزوّد الدفع بعد.',
    }),
  capture: () => Promise.resolve({ ok: false, code: 'PROVIDER_NOT_CONFIGURED' }),
  refund: () => Promise.resolve({ ok: false, code: 'PROVIDER_NOT_CONFIGURED' }),
  // لا سرّ ⇒ لا توقيع صحيح. و`true` هنا تقبل أيّ ويب هوك من أيّ جهة
  verifySignature: () => false,
};

/**
 * تحقّق HMAC من توقيع الويب هوك — **بمقارنة ثابتة الزمن**.
 *
 * المقارنة بـ`===` تفشل عند أوّل بايت مختلف، وفرقُ التوقيت بين محاولةٍ
 * وأخرى يكشف التوقيع الصحيح حرفًا حرفًا. والفرق ميكروثوانٍ — وهو كافٍ.
 */
export function verifyHmac(rawBody: string, signature: string, secret: string): boolean {
  if (signature === '' || secret === '') return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }

  // `timingSafeEqual` ترمي على اختلاف الطول — والطول ليس سرًّا
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

/** يبني مزوّدًا من إعداداته — و`null` تعني «غير مضبوط» لا «معطّل». */
export function providerFor(secret: string | null): PaymentProvider {
  if (secret === null || secret === '') return PENDING_PROVIDER;

  return {
    ...PENDING_PROVIDER,
    name: 'hmac-verified',
    verifySignature: (rawBody, signature) => verifyHmac(rawBody, signature, secret),
  };
}
