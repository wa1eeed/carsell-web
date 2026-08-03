import type { IntegrationEnv, PaymentPurpose } from '@/generated/prisma/enums';

/**
 * حدّ بوابة الدفع — **بلغة الضمان لا بلغة البطاقة** (قرار ٣٤).
 *
 * لأن ترتيب الضمان قد يتغيّر **بنيويًّا لا اسميًّا**: حساب أمانة بنكيّ
 * يجعل `hold` تحويلًا يستغرق يومًا، والإفراج تحويلًا لا استدعاءً
 * فوريًّا. وشاشةٌ سمّت المفهوم بمفردة بطاقةٍ تصير كاذبةً يومها، ولا
 * يكشفها المترجم لأن الاسم يظلّ يترجم.
 *
 * ومفردات البوابة لا تعبر المُهايئ — البوابة ١٥ في `check-tokens.mjs`
 * تحرس ذلك، ولا تستثني إلا `src/lib/payments/adapters/`.
 */

/**
 * ═══ القاعدة ١ ═══ **النتيجة غير متزامنة بالعقد.**
 *
 * لا نجاح فوريّ في أي دالّة. البطاقة تؤكّد لحظيًّا فتعود `CONFIRMED`،
 * وحساب الأمانة يبقى `PENDING` حتى يصل الويبهوك.
 *
 * **والنطاق ينتظر الحالة لا الاستدعاء** — فيوم يصير الترتيب بنكيًّا لا
 * يحتاج مسارًا جديدًا، بل بوابةً تبقى نتائجها `PENDING` أطول.
 */
export type CallState = 'PENDING' | 'CONFIRMED' | 'FAILED';

export type HoldResult =
  | { state: 'CONFIRMED'; holdRef: string; expiresAt: Date | null }
  | { state: 'PENDING'; holdRef: string; expiresAt: Date | null }
  | { state: 'REQUIRES_ACTION'; holdRef: string; actionUrl: string }
  | { state: 'FAILED'; code: string; message: string };

export type SettleResult =
  | { state: 'CONFIRMED'; settleRef: string; settledAmount: string }
  | { state: 'PENDING'; settleRef: string }
  | { state: 'FAILED'; code: string; message: string };

export type CancelResult =
  | { state: 'CONFIRMED' }
  | { state: 'PENDING' }
  | { state: 'FAILED'; code: string; message: string };

export type ReturnResult =
  | { state: 'CONFIRMED'; returnRef: string; returnedAmount: string }
  | { state: 'PENDING'; returnRef: string }
  | { state: 'FAILED'; code: string; message: string };

export type HoldStatus = {
  state: CallState;
  /** حالة المال لدى البوابة كما تقولها هي — لا كما نتذكّرها. */
  held: boolean;
  settled: boolean;
  cancelled: boolean;
  settledAmount: string | null;
  expiresAt: Date | null;
};

/**
 * ═══ القاعدة ٢ ═══ **القدرات معلَنة، والنطاق يقرأها.**
 *
 * ولا يفترض أن الحجز يدوم إلى الأبد: `maxHoldDays` هو الفرق بين
 * ترتيبٍ يصمد إلى نقل الملكية وترتيبٍ ينهار في اليوم السابع.
 */
export type GatewayCapabilities = {
  supportsHold: boolean;
  supportsPartialSettle: boolean;
  supportsRefund: boolean;
  /** أقصى مدّة يصمد فيها الحجز. */
  maxHoldDays: number;
  /** كم حتى يصل المال إلى البائع بعد التسوية. */
  settlementDelayHours: number;
  feePct: number;
  feeFixed: number;
};

export type HoldInput = {
  purpose: PaymentPurpose;
  /** مرجعنا نحن — رقم الطلب أو المزاد، لا معرّف داخليّ. */
  ref: string;
  amount: string;
  currency: string;
  method: string;
  /** يعود إليه المتصفّح بعد تحدّي 3DS. */
  returnUrl: string;
  idempotencyKey: string;
};

export type PaymentGatewayPort = {
  readonly key: string;
  readonly capabilities: GatewayCapabilities;

  hold: (input: HoldInput) => Promise<HoldResult>;
  settle: (holdRef: string, amount?: string) => Promise<SettleResult>;
  cancel: (holdRef: string) => Promise<CancelResult>;
  partialReturn: (settleRef: string, amount: string) => Promise<ReturnResult>;
  status: (ref: string) => Promise<HoldStatus>;

  verifySignature: (rawBody: string, signature: string) => boolean;
};

/** ما يحتاجه كل غرض — والبوابة التي تنقصه لا تظهر في القائمة أصلًا. */
export const PURPOSE_REQUIREMENTS: Record<
  PaymentPurpose,
  { needs: (keyof GatewayCapabilities)[]; minHoldDays: number; labelAr: string }
> = {
  /**
   * واحد وعشرون يومًا — **مشتقّة من القاعدتين لا مقدَّرة**:
   *
   *   ٢٤ ساعة دفعًا + ٧ أيام سقفًا للنقل + ٧ أيام نافذةَ استرجاع = ١٥،
   *   ومع التمديد الواحد المسموح = ٢٢.
   *
   * فالعتبة بينهما: تحت الحدّ الأدنى لا يصمد الحجز إلى نهاية مساره
   * الاعتيادي أصلًا.
   *
   * ومرحلة النقل نفسها بلا موعد مجدول — تتقدّم بتأكيد الإجراء — لكنّها
   * **ليست بلا سقف**: سقفها ٧ أيام من الدفع، وهو ما جعل الاشتقاق ممكنًا.
   *
   * والنتيجة بحالها: بوابة بطاقة (٧ أو ٦ أيام) دون العتبة، ومن يوجّه
   * الضمان إليها يبني وعدًا لا يملك الوفاء به.
   */
  VEHICLE_ESCROW: {
    // التسوية الجزئية لازمة: النزاع قد يُحسم بتسوية جزئية (قرار ١)
    needs: ['supportsHold', 'supportsPartialSettle'],
    minHoldDays: 21,
    labelAr: 'بيع المركبات — الضمان',
  },
  /** مزادٌ قد يمتدّ ٧ أيام ← ٢٤ ساعة مهلة البائع ← ٢٤ ساعة دفع الفائز. */
  AUCTION_DEPOSIT: {
    needs: ['supportsHold'],
    minHoldDays: 10,
    labelAr: 'العربون في المزادات',
  },
  WALLET_TOPUP: {
    // تحصيل فوري بلا حجز — فلا يشترط `supportsHold`
    needs: ['supportsRefund'],
    minHoldDays: 0,
    labelAr: 'شحن رصيد المحفظة',
  },
  SERVICE_PURCHASE: {
    needs: ['supportsRefund'],
    minHoldDays: 0,
    labelAr: 'شراء الخدمات',
  },
  /** تُحصَّل مع مبلغ الطلب فتتبع مدّته — لا مدّة لها مستقلّة. */
  TRANSFER_FEE: {
    needs: ['supportsHold'],
    minHoldDays: 21,
    labelAr: 'رسوم نقل الملكية',
  },
  SUBSCRIPTION: {
    needs: [],
    minHoldDays: 0,
    labelAr: 'اشتراكات الباقات',
  },
};

/**
 * التحذير **بيانات لا نصّ جاهز**.
 *
 * نصٌّ يُبنى هنا يُنتج «٦ يومًا» و«21» — أرقامًا لاتينية وجمعًا خاطئًا
 * داخل جملة عربية، ولا يستطيع النطاق تصحيحهما لأنه لا يعرف اللغة ولا
 * يملك `Quantity`. فالصياغة في الشاشة، والنطاق يقول الأرقام وحدها.
 */
export type HoldShortfall = { maxHoldDays: number; neededDays: number };

export type Eligibility =
  | { eligible: true; shortfall: HoldShortfall | null }
  | { eligible: false; missing: (keyof GatewayCapabilities)[] };

/**
 * هل تصلح هذه البوابة لهذا الغرض؟
 *
 * **القدرة الناقصة تُخفي البوابة، ومدّة الحجز القصيرة تُحذّر ولا تمنع.**
 * والفرق مقصود: الأولى استحالة، والثانية مفاضلة يعرفها المشغّل ولا
 * يعرفها الكود — قد يقبل الأثر لأن صفقاته تنتهي في ثلاثة أيام.
 */
export function eligibility(
  purpose: PaymentPurpose,
  capabilities: GatewayCapabilities,
): Eligibility {
  const requirement = PURPOSE_REQUIREMENTS[purpose];
  const missing = requirement.needs.filter((need) => capabilities[need] !== true);
  if (missing.length > 0) return { eligible: false, missing };

  if (requirement.minHoldDays > 0 && capabilities.maxHoldDays < requirement.minHoldDays) {
    return {
      eligible: true,
      shortfall: {
        maxHoldDays: capabilities.maxHoldDays,
        neededDays: requirement.minHoldDays,
      },
    };
  }

  return { eligible: true, shortfall: null };
}

export function readCapabilities(value: unknown): GatewayCapabilities {
  const raw = (value !== null && typeof value === 'object' ? value : {}) as Partial<GatewayCapabilities>;
  return {
    supportsHold: raw.supportsHold === true,
    supportsPartialSettle: raw.supportsPartialSettle === true,
    supportsRefund: raw.supportsRefund === true,
    maxHoldDays: Number(raw.maxHoldDays ?? 0),
    settlementDelayHours: Number(raw.settlementDelayHours ?? 0),
    feePct: Number(raw.feePct ?? 0),
    feeFixed: Number(raw.feeFixed ?? 0),
  };
}

/**
 * بوابة غير مضبوطة — **تفشل صراحةً**.
 *
 * نقيض قاعدة «كل تكامل خلف راية يسقط بصمت»: تلك للمساعِد المؤجَّل الذي
 * له مسار يدويّ بديل. والدفع لا بديل له، وصمتُه شاشةٌ تدور بلا نهاية
 * ومستخدمٌ لا يعرف أدُفع أم لا.
 */
export function pendingGateway(key: string, env: IntegrationEnv): PaymentGatewayPort {
  const fail = { state: 'FAILED' as const, code: 'GATEWAY_NOT_CONFIGURED', message: `البوابة «${key}» غير مضبوطة في بيئة ${env}.` };
  return {
    key,
    capabilities: readCapabilities(null),
    hold: () => Promise.resolve(fail),
    settle: () => Promise.resolve(fail),
    cancel: () => Promise.resolve(fail),
    partialReturn: () => Promise.resolve(fail),
    status: () =>
      Promise.resolve({
        state: 'FAILED' as const,
        held: false, settled: false, cancelled: false,
        settledAmount: null, expiresAt: null,
      }),
    // لا سرّ ⇒ لا توقيع صحيح. و`true` هنا تقبل أيّ ويبهوك من أيّ جهة
    verifySignature: () => false,
  };
}
