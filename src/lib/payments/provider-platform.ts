import type { ProviderAccountStatus } from '@/generated/prisma/enums';

/**
 * ═══ حدّ بوّابة المزوّدين — ومنصّةٌ متعدّدة التجّار لا بوّابةُ بطاقة ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٤): بوّابتان لا واحدة. **بوّابة المنصّة** حسابُ
 * تاجرٍ عاديّ لبيع المركبات، و**بوّابة المزوّدين** منصّةٌ تُسجَّل فيها
 * حساباتُ دفعٍ للمزوّدين وتوزَّع عليها الدفعات.
 *
 * والفرق بنيويّ لا إداريّ: في الأولى يدخل المال حسابَنا ثمّ نحوّله،
 * وفي الثانية **يذهب إلى المزوّد مباشرةً من البوّابة المرخَّصة** وحصّتُنا
 * تُقتطع توزيعًا في الدفعة نفسها. فلا نحوز مالَ غيرنا ولا نُجمِّعه،
 * وهو شرط النظام لا تفضيلُ هندسة.
 *
 * ═══ ولماذا منفذٌ مستقلّ عن `PaymentGatewayPort` ═══
 *
 * ذاك يعرف الحجز والتسوية والاسترجاع — أفعالًا على **دفعة**. وهذا يعرف
 * فتحَ حساب ومتابعةَ حاله ومعرفةَ رصيده — أفعالًا على **حسابٍ**. وحشوُ
 * الاثنين في منفذٍ واحد يجعل كل بوّابة بطاقةٍ تدّعي ما لا تفعل.
 *
 * ═══ والمفردات هنا مفرداتُنا ═══
 *
 * البوابة ١٥ تمنع مفردة المزوّد خارج `adapters/`. فـ«حسابٌ» و«معرّفُ
 * تحويل» و«توزيع» — ولا كلمةَ من قاموس المزوّد تعبر هذا الملف.
 */

/** حالٌ لا نعرفها من المزوّد — ولا تُطوى في «غير مفعَّل» فتُخفي سببها. */
export type AccountState = {
  /** معرّفُ الحساب في إدارة المنصّة */
  accountRef: string;
  /**
   * المعرّف الذي يُوجَّه إليه التوزيع — **غيرُ `accountRef`**.
   * وخلطُهما يُرسل المال إلى عدم، فيُفصلان في النوع لا في الانضباط.
   */
  payoutRef: string | null;
  status: ProviderAccountStatus;
  /** ما ينقص الحساب كما قاله المزوّد — يُعرض للمشغّل بلا ترجمةٍ تخمينية */
  note: string | null;
  /** رابطُ توقيع العقد حين يكون مطلوبًا */
  signatureUrl: string | null;
  documentsComplete: boolean;
};

/** ما يُفتح به حسابٌ جديد — وكلُّه مطلوبٌ لدى الجهة المنظِّمة. */
export type AccountDraft = {
  /** صفة المنشأة: فرد · مؤسسة · شركة … */
  kind: 'FREELANCER' | 'ESTABLISHMENT' | 'COMPANY' | 'GOVERNMENT' | 'CHARITY';
  /** اسمٌ آليّ — حروفٌ وأرقامٌ وشرطةٌ سفلية */
  slug: string;
  publicName: string;
  /** بريدُ المنشأة للتواصل */
  email: string;
  /** بريدُ من يُمنَح إدارةَ الحساب — تصله دعوة */
  adminEmail: string;
  website: string;
  /** عددُ المُلّاك كما في السجلّ التجاريّ — يحدّد عدد الهويات المطلوبة */
  ownersCount: number;
  /** من يملك التوقيع: مالكٌ · عقدٌ تجاريّ · وكالة */
  signatory: 'OWNER' | 'COMMERCIAL_CONTRACT' | 'POWER_OF_ATTORNEY';
  signatoryCount: number | null;
  /** أيحتاج نشاطُه ترخيصًا خاصًّا */
  licenceRequired: boolean;
};

/**
 * رصيدٌ لدى البوّابة — **بالوحدة الكبرى** لا بأصغرها.
 *
 * ═══ ويُقرأ بمفتاح الحساب نفسه لا بمفتاح المنصّة ═══
 *
 * قِيس على البيئة التجريبية: `GET /balance` بمفتاح المنصّة يردّ **٤٠٣
 * `User not authorized`**. والوثيقة تقولها بكلمةٍ واحدة — «using the
 * **entity** secret API key» — وقد قرأتُها «رصيد المنصّة» فبنيتُ
 * دالّةً لا تعمل. **ولا يكشفها إلّا نداءٌ حقيقيّ**: الشكل صحيح،
 * والمسار موجود، والمفتاح صالح — والردّ رفض.
 *
 * فالرصيد رصيدُ **حسابٍ بعينه**، ويُقرأ بمفتاحه هو. ومفاتيحُ الحساب
 * تُعاد عند إنشائه (`api_keys`)، فما لم تُحفظ فلا رصيد يُقرأ — وهي
 * حالٌ تُعرض سطرًا لا خطأً.
 */
export type AccountBalance = {
  currency: string;
  total: string;
  available: string;
  transferred: string;
};

/**
 * حصّةٌ من دفعة.
 *
 * **ومجموع الحصص يساوي الدفعة حتمًا** — ونقصُه أو زيادتُه تردّه
 * البوّابة، فيُفحص عندنا أوّلًا كيلا يفشل دفعُ عميلٍ على حسابٍ خاطئ.
 */
export type Share = {
  payoutRef: string;
  /** بالوحدة الكبرى — والمُهايئ يحوّلها */
  amount: string;
  /** مرجعُنا لتتبّعه في كشف التسوية */
  reference?: string;
  description?: string;
  /**
   * من تُخصم منه رسومُ البوّابة.
   * **وواحدةٌ على الأكثر**: بلا تحديدٍ تختار البوّابة أكبرَ حصّةِ تاجر،
   * وهو ما يجعل المزوّد يدفع رسمًا لم يتّفق عليه.
   */
  bearsGatewayFee?: boolean;
};

export type PlatformFailure =
  | 'NOT_CONFIGURED'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'INVALID'
  | 'UPSTREAM';

export type PlatformResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: PlatformFailure; message: string | null };

export type ProviderPlatformPort = {
  readonly key: string;
  /**
   * معرّفُنا نحن حصّةً في التوزيع — فالمنصّة أحد المستفيدين لا طرفٌ
   * خارجه. ويُقرأ من المزوّد لا يُكتب بيد.
   */
  platformPayoutRef: () => Promise<PlatformResult<string>>;
  openAccount: (draft: AccountDraft) => Promise<PlatformResult<AccountState>>;
  accountState: (accountRef: string) => Promise<PlatformResult<AccountState>>;
  /** يُقدَّم للمراجعة بعد اكتمال مستنداته */
  submitForReview: (accountRef: string) => Promise<PlatformResult<AccountState>>;
  /**
   * **بمفتاح الحساب لا بمفتاح المنصّة** — قِيس: الثاني يردّ ٤٠٣.
   * و`null` حين لا نحفظ مفتاحه، فتُعاد `NOT_CONFIGURED`.
   */
  balance: (entityKey: string | null) => Promise<PlatformResult<AccountBalance>>;
  /** حساباتُ المنصّة — **وردُّها مغلَّف بصفحات** (`merchants` + `meta`). */
  listAccounts: () => Promise<PlatformResult<AccountState[]>>;
  /**
   * يتحقّق من صحّة التوزيع **قبل** أن يُرسَل مع دفعة.
   *
   * ودفعةٌ تُرفض لخللٍ في حصصها تُرفض **بعد** أن أدخل العميل بطاقته —
   * فيُقرأ خللُنا عطلًا في بطاقته.
   */
  checkShares: (total: string, shares: readonly Share[]) => PlatformResult<true>;
};

/**
 * ═══ فحصُ الحصص — قاعدةٌ واحدة يقرؤها المُهايئ والنطاق ═══
 *
 * لا تنادي شبكةً، فهي هنا لا في المُهايئ: كلُّ مُهايئٍ يفرضها بنفسه
 * يُنتج نسخةً تتباعد، والقاعدة من المزوّد نفسه — «مجموع الحصص يساوي
 * الدفعة» و«حاملُ الرسم واحدٌ على الأكثر».
 */
export function checkShares(total: string, shares: readonly Share[]): PlatformResult<true> {
  if (shares.length === 0) {
    return { ok: false, reason: 'INVALID', message: 'NO_SHARES' };
  }

  const bearers = shares.filter((share) => share.bearsGatewayFee === true).length;
  if (bearers > 1) {
    return { ok: false, reason: 'INVALID', message: 'MANY_FEE_BEARERS' };
  }

  /** القروش لا الريالات — والجمع العشريّ يُنتج فروقًا لا وجود لها. */
  const sum = shares.reduce((acc, share) => acc + halalas(share.amount), 0);
  if (sum !== halalas(total)) {
    return { ok: false, reason: 'INVALID', message: 'SUM_MISMATCH' };
  }

  if (shares.some((share) => share.payoutRef === '')) {
    return { ok: false, reason: 'INVALID', message: 'MISSING_RECIPIENT' };
  }

  return { ok: true, value: true };
}

/**
 * ريالاتٌ إلى قروش — **والتقريب قبل الضرب لا بعده**.
 *
 * `0.1 + 0.2` ليست `0.3` في العائم، ومجموعُ حصصٍ محسوبٍ عشريًّا يخالف
 * الدفعة بقرشٍ فتُرفض — وقرشٌ واحد يمنع صفقةً كاملة.
 */
export function halalas(amount: string | number): number {
  return Math.round(Number(amount) * 100);
}
