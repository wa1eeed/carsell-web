import type { User } from '@/generated/prisma/client';

/**
 * الحقول الناقصة قبل أول معاملة.
 *
 * HANDOFF §٤٫٨: البريد والآيبان والتوثيق مطلوبة **قبل أول شراء أو بيع
 * فقط، لا عند التسجيل**. التصفّح متاح فورًا برقم الجوال وحده — وهذا
 * ما يجعل التسجيل لا يخسر مستخدمًا.
 *
 * الترتيب هو ترتيب العرض في Wm وWf.
 */
export type MissingField =
  | 'email'
  | 'idVerification'
  | 'iban'
  | 'city'
  | 'bankName'
  | 'taxStatus'
  /** للمنشأة وحدها — السجلّ التجاريّ وعنوانها. */
  | 'crNumber'
  | 'address';

/**
 * ═══ ومتطلّباتُ المنشأة غيرُ متطلّبات الفرد ═══
 *
 * الفرد: بريدٌ وهويةٌ ومدينةٌ ووضعٌ ضريبيّ ومصرفٌ وآيبان.
 * والمنشأة تزيد السجلّ التجاريّ والعنوان — ولا تُسأل عن مدينةٍ مفردة
 * لأن عنوانها يحملها.
 *
 * **والقائمة تُكتب مرّة**: الشاشة تعرضها، والبنر يعدّها، والحارس
 * يقرؤها — وثلاثُ نسخٍ تتباعد أوّل حقلٍ يُضاف.
 */
const INDIVIDUAL_FIELDS: readonly MissingField[] = [
  'email',
  'idVerification',
  'city',
  'taxStatus',
  'bankName',
  'iban',
];

const BUSINESS_FIELDS: readonly MissingField[] = [
  'email',
  'idVerification',
  'crNumber',
  'address',
  'taxStatus',
  'bankName',
  'iban',
];

export type ProfileCompletion = {
  missing: MissingField[];
  /** ما طُلب منه — فالنسبة تُقرأ على مقامها لا على عددٍ مطلق. */
  required: readonly MissingField[];
  /**
   * نسبةُ الاكتمال صحيحةً من مئة — **محسوبةٌ لا مكتوبة**، والمعروضُ
   * هو المحسوب: شارةٌ تُحسب من رقمٍ ويُعرض غيرُه رقمان متناقضان.
   */
  percent: number;
  canBuy: boolean;
  canSell: boolean;
};

function filled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

export function profileCompletion(
  user: User,
  /** بيانات المنشأة حين تُحمَّل — و`null` للفرد أو لمن لا معرض له. */
  dealer: { crNumber: string | null; address: string | null } | null = null,
): ProfileCompletion {
  const isBusiness = user.accountType === 'BUSINESS';
  const required = isBusiness ? BUSINESS_FIELDS : INDIVIDUAL_FIELDS;

  const has: Record<MissingField, boolean> = {
    email: filled(user.email),
    idVerification: user.idVerified,
    iban: filled(user.iban),
    city: filled(user.city),
    bankName: filled(user.bankName),
    /**
     * **والوضع الضريبيّ يُجاب لا يُملأ.** «لا تنطبق عليّ» جوابٌ كامل،
     * فالحقل يكتمل بـ`taxStatusSetAt` لا بوجود رقم — وإلّا بقي ملفُّ
     * كلِّ فردٍ غير مسجَّل ناقصًا إلى الأبد.
     */
    taxStatus: user.taxStatusSetAt !== null,
    crNumber: filled(user.crNumber) || filled(dealer?.crNumber),
    /**
     * **ومن الحساب لا من المعرض.** `Dealer.address` عنوانُ واجهةِ عرضٍ
     * تُبنى لاحقًا — فقراءتُه منها تترك كلَّ حسابٍ تجاريّ ناقصًا بلا
     * حقلٍ يملؤه، وهو قفلٌ بلا مفتاح.
     */
    address: filled(user.address) || filled(dealer?.address),
  };

  const missing = required.filter((field) => !has[field]);
  const done = required.length - missing.length;

  return {
    missing,
    required,
    // والكسر يُقرَّب إلى الأقرب — و«٩٩٪» على ملفٍّ مكتمل تُقلق بلا سبب
    percent: required.length === 0 ? 100 : Math.round((done / required.length) * 100),
    /**
     * **والحارس على ما كان يحرسه.** الشراء يحتاج بريدًا وهوية، والبيع
     * يزيد الآيبان — ولا يُمنع أحدٌ لأن مدينتَه ناقصة.
     */
    canBuy: has.email && has.idVerification,
    canSell: has.email && has.idVerification && has.iban,
  };
}

/** ما يخرج في `GET /me` — لا حقول داخلية ولا `iban` كاملًا. */
export function toPublicUser(user: User): Record<string, unknown> {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    locale: user.locale,
    role: user.role,
    status: user.status,
    idVerified: user.idVerified,
    // الآيبان مشفّر ولا يُعاد كاملًا — وجوده فقط
    hasIban: user.iban !== null && user.iban !== '',
    dealerId: user.dealerId,
    createdAt: user.createdAt,
  };
}
