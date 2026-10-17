import { db } from '@/lib/db';

/**
 * ═══ المهل الزمنية — إعدادٌ يديره المشغّل لا ثابتٌ في الشيفرة ═══
 *
 * كانت اثنتين وعشرين ثابتة موزّعة على أحد عشر ملفًّا، تغييرُ أيٍّ منها
 * يحتاج نشرًا. وهي **قواعد عمل** يقرّرها المشغّل: مهلة الدفع تُقصَّر
 * حين يزدحم الطلب وتُطال في المواسم، ومهلة نقل الملكية تتبع دوام
 * المرور لا دورة إصدارنا.
 *
 * ═══ وما لا يُعدَّل من هنا ═══
 *
 * **ونافذة الاسترجاع أُزيلت** — أُلغيت بقرار المصمّم (الإفراج يتبع
 * تأكيد النقل)، وإعدادٌ يبقى في اللوحة بلا أثر أسوأ من غيابه: يُعدَّل
 * فيُظنّ أنّ شيئًا تغيّر.
 *
 * **المؤقّتات الأمنية ليست مهلًا تشغيلية**: جلسة الأدمن (٨ ساعات)،
 * وقفل المحاولات (١٥ دقيقة)، ومهلة رمز الدخول (٥ دقائق) — تعديلها
 * إضعافٌ للأمان لا ضبطٌ لتجربة، ومن يملك الشاشة يملك تمديد جلسته.
 * وكذلك نوافذ طلبات الموافقة (٤٨ و٧٢ ساعة): هي حدود حَوكمة، وتمديدها
 * من داخل اللوحة يُبطل معناها.
 *
 * ═══ والمهلة تُقرأ عند الإنشاء لا عند العرض ═══
 *
 * الطلب يُنشأ فيُخزَّن `paymentDueAt` محسوبًا — فتغييرُ الإعداد لاحقًا
 * **لا يُحرّك مهلة طلبٍ قائم**. ولو قُرئت عند العرض لتغيّرت مهل آلاف
 * الطلبات الجارية بضغطة واحدة، وهو ما لا يقبله من دفع على وعدٍ سابق.
 */

export type DeadlineKey =
  | 'offerTtlHours'
  | 'paymentWindowHours'
  | 'transferDeadlineDays'
  | 'transferExtensionDays'
  | 'sellerDecisionHours'
  | 'disputeSlaHours'
  | 'settleWindowHours'
  | 'auctionExtendWindowSeconds'
  | 'auctionExtendBySeconds'
  | 'reportValidityDays'
  /**
   * ═══ ومتى يُذكَّر — لا متى تنقضي ═══
   *
   * **التذكير يسبق لحظة الحاجة.** مهلةُ الدفع تُقاس بـ
   * `paymentWindowHours`، وهذه تقول كم قبل انقضائها يُنبَّه صاحبُها —
   * فمن يكتشف المهلة بعد سقوطها اكتشفها بعد أن خسر.
   */
  | 'paymentReminderHours'
  /** وكم دقيقة قبل إغلاق المزاد يُنبَّه من زايد فيه. */
  | 'auctionClosingReminderMinutes'
  /** وكم ساعة قبل سقوط العرض يُنبَّه طرفاه. */
  | 'offerReminderHours'
  /**
   * مهلةُ البائع ليأذن بفحصٍ طلبه مشترٍ على مركبته.
   *
   * **وانقضاؤها رفضٌ لا قبول**: فحصٌ يمضي بلا إذنٍ يُرسل فاحصًا إلى
   * بابِ من لم يوافق، ويكشف بياناته لمن لم يأذن له.
   */
  | 'serviceConsentHours'
  /**
   * كم قبل الموعد يُذكَّر طرفا المعاينة.
   *
   * **والتذكير يسبق لحظة الحاجة**: موعدٌ اتُّفق عليه قبل أسبوعين
   * يُنسى، فيذهب أحدُهما ولا يجد الآخر — وليس بينهما عقدٌ ولا مال،
   * فلا شيء يُلزمهما غير أنهما تذكّرا.
   */
  | 'viewingReminderHours';

/**
 * القيَم الافتراضية — **هي الثوابت التي كانت في الشيفرة حرفيًّا**.
 * فسلوك المنتج لا يتغيّر حتى يعدّل المشغّل شيئًا، والترحيل بلا أثر.
 */
export const DEADLINE_DEFAULTS: Readonly<Record<DeadlineKey, number>> = {
  offerTtlHours: 48,
  paymentWindowHours: 24,
  transferDeadlineDays: 7,
  transferExtensionDays: 7,
  sellerDecisionHours: 24,
  disputeSlaHours: 48,
  settleWindowHours: 72,
  auctionExtendWindowSeconds: 60,
  auctionExtendBySeconds: 300,
  reportValidityDays: 90,
  paymentReminderHours: 6,
  auctionClosingReminderMinutes: 15,
  offerReminderHours: 6,
  serviceConsentHours: 24,
  /** يومٌ قبله — يكفي لتعديل خطّة اليوم التالي، ولا يُنسى قبل أن يحين */
  viewingReminderHours: 24,
};

/**
 * الحدّ الأدنى والأعلى لكل مهلة.
 *
 * **بلا حدّ يصير الإعداد سلاحًا**: مهلة دفعٍ بصفر ساعة تُسقط كل طلب
 * فور إنشائه، ومهلة نقلٍ بألف يوم تحبس مال المشترين سنوات. والحدود
 * تُفحص في الخادم لا في الشاشة.
 */
export const DEADLINE_BOUNDS: Readonly<Record<DeadlineKey, { min: number; max: number }>> = {
  offerTtlHours: { min: 1, max: 720 },
  paymentWindowHours: { min: 1, max: 168 },
  transferDeadlineDays: { min: 1, max: 90 },
  transferExtensionDays: { min: 1, max: 90 },
  sellerDecisionHours: { min: 1, max: 168 },
  disputeSlaHours: { min: 1, max: 336 },
  settleWindowHours: { min: 1, max: 720 },
  auctionExtendWindowSeconds: { min: 10, max: 3600 },
  auctionExtendBySeconds: { min: 30, max: 3600 },
  reportValidityDays: { min: 7, max: 365 },
  /** أقلُّه ساعة — وتذكيرٌ قبل دقيقة ليس تذكيرًا. والسقف دون أطول نافذة دفع. */
  paymentReminderHours: { min: 1, max: 72 },
  auctionClosingReminderMinutes: { min: 1, max: 720 },
  offerReminderHours: { min: 1, max: 168 },
  serviceConsentHours: { min: 1, max: 168 },
  /** **وتذكيرٌ قبل ساعةٍ ليس تذكيرًا** — والسقف أسبوعٌ، فما قبله يُنسى ثانيةً */
  viewingReminderHours: { min: 2, max: 168 },
};

export const DEADLINE_KEYS = Object.keys(DEADLINE_DEFAULTS) as DeadlineKey[];

export type Deadlines = Record<DeadlineKey, number>;

function isKey(value: string): value is DeadlineKey {
  return Object.prototype.hasOwnProperty.call(DEADLINE_DEFAULTS, value);
}

/**
 * كل المهل السارية — والمفقود يأخذ افتراضيّه.
 *
 * ولا يُخزَّن شيء عند القراءة: صفٌّ ينشأ من قراءةٍ يجعل كل استعلامٍ
 * كتابةً، ويجعل الافتراضيّ يتجمّد في القاعدة فلا يتبع تغييرَه في الكود.
 */
export async function currentDeadlines(): Promise<Deadlines> {
  const rows = await db.deadlineSetting.findMany();
  const values = { ...DEADLINE_DEFAULTS } as Deadlines;

  for (const row of rows) {
    if (isKey(row.key)) values[row.key] = row.value;
  }
  return values;
}

/** مهلةٌ واحدة — لمن لا يحتاج الباقي. */
export async function deadline(key: DeadlineKey): Promise<number> {
  const row = await db.deadlineSetting.findUnique({ where: { key } });
  return row?.value ?? DEADLINE_DEFAULTS[key];
}

export type SaveFailure = 'UNKNOWN_KEY' | 'OUT_OF_BOUNDS';
export type SaveResult = { ok: true; value: number } | { ok: false; reason: SaveFailure };

/**
 * تعديل مهلة — **بحدودها، وبأثرٍ مكتوب**.
 *
 * وكل إجراء أدمن يكتب `AuditLog`: مهلةٌ تُقصَّر ثم تُسقط مئة طلب يجب
 * أن يُعرف من قصّرها ومتى وممّ.
 */
export async function setDeadline(
  input: { key: string; value: number; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<SaveResult> {
  if (!isKey(input.key)) return { ok: false, reason: 'UNKNOWN_KEY' };

  const bounds = DEADLINE_BOUNDS[input.key];
  if (!Number.isInteger(input.value) || input.value < bounds.min || input.value > bounds.max) {
    return { ok: false, reason: 'OUT_OF_BOUNDS' };
  }

  const before = await db.deadlineSetting.findUnique({ where: { key: input.key } });

  await db.deadlineSetting.upsert({
    where: { key: input.key },
    create: { key: input.key, value: input.value, updatedBy: input.adminId, updatedAt: now },
    update: { value: input.value, updatedBy: input.adminId, updatedAt: now },
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'DeadlineSetting',
      entityId: input.key,
      action: 'deadline.changed',
      before: { value: before?.value ?? DEADLINE_DEFAULTS[input.key] },
      after: { value: input.value },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, value: input.value };
}

export type DeadlineRow = {
  key: DeadlineKey;
  value: number;
  isDefault: boolean;
  min: number;
  max: number;
  updatedAt: string | null;
};

/** ما تعرضه شاشة الأدمن — والمعدَّل يُميَّز عن الافتراضيّ. */
export async function listDeadlines(): Promise<DeadlineRow[]> {
  const rows = await db.deadlineSetting.findMany();

  return DEADLINE_KEYS.map((key) => {
    const row = rows.find((entry) => entry.key === key);
    return {
      key,
      value: row?.value ?? DEADLINE_DEFAULTS[key],
      isDefault: row === undefined,
      min: DEADLINE_BOUNDS[key].min,
      max: DEADLINE_BOUNDS[key].max,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });
}
