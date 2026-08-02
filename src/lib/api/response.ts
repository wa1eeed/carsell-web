import { NextResponse } from 'next/server';

/**
 * غلاف الاستجابة الموحّد (القسم ٦):
 *   نجاح  { data, meta? }
 *   خطأ   { error: { code, messageAr, messageEn, fields? } }
 *
 * لا مسار يعيد كائنًا خامًا. والرسالة بلغتين لأن العميل قد يكون
 * التطبيق أو الويب، ولا نريد جدول ترجمة أخطاء في كل عميل.
 */

export type ApiMeta = Record<string, unknown>;

export type ApiError = {
  code: string;
  messageAr: string;
  messageEn: string;
  fields?: Record<string, string>;
};

export function ok<T>(data: T, meta?: ApiMeta, init?: ResponseInit): NextResponse {
  return NextResponse.json(meta === undefined ? { data } : { data, meta }, init);
}

export function fail(error: ApiError, status: number, init?: ResponseInit): NextResponse {
  return NextResponse.json({ error }, { ...init, status });
}

/** أخطاء معرَّفة مركزيًا — لا نصّ خطأ مكتوب داخل مسار. */
export const ERRORS = {
  VALIDATION: (fields: Record<string, string>): ApiError => ({
    code: 'VALIDATION_FAILED',
    messageAr: 'تحقّق من الحقول المعلَّمة.',
    messageEn: 'Check the highlighted fields.',
    fields,
  }),
  INVALID_PHONE: {
    code: 'INVALID_PHONE',
    messageAr: 'رقم الجوال غير صحيح. اكتبه بصيغة ٠٥XXXXXXXX.',
    messageEn: 'Invalid mobile number. Use the format 05XXXXXXXX.',
  },
  OTP_RATE_LIMITED: {
    code: 'OTP_RATE_LIMITED',
    messageAr: 'تجاوزت عدد المحاولات المسموح. أعد المحاولة بعد ساعة.',
    messageEn: 'Too many requests. Try again in an hour.',
  },
  OTP_COOLDOWN: {
    code: 'OTP_COOLDOWN',
    messageAr: 'انتظر قليلًا قبل طلب رمز جديد.',
    messageEn: 'Wait a moment before requesting a new code.',
  },
  OTP_INVALID: {
    code: 'OTP_INVALID',
    messageAr: 'الرمز غير صحيح.',
    messageEn: 'Incorrect code.',
  },
  OTP_EXPIRED: {
    code: 'OTP_EXPIRED',
    messageAr: 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.',
    messageEn: 'The code has expired. Request a new one.',
  },
  OTP_CONSUMED: {
    code: 'OTP_CONSUMED',
    messageAr: 'استُخدم هذا الرمز. اطلب رمزًا جديدًا.',
    messageEn: 'This code was already used. Request a new one.',
  },
  OTP_ATTEMPTS_EXHAUSTED: {
    code: 'OTP_ATTEMPTS_EXHAUSTED',
    messageAr: 'استنفدت محاولات التحقّق. اطلب رمزًا جديدًا.',
    messageEn: 'No verification attempts left. Request a new code.',
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    messageAr: 'يلزم تسجيل الدخول.',
    messageEn: 'Sign-in required.',
  },
  FORBIDDEN: {
    code: 'FORBIDDEN',
    messageAr: 'لا تملك صلاحية هذا الإجراء.',
    messageEn: 'You do not have permission for this action.',
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    messageAr: 'غير موجود.',
    messageEn: 'Not found.',
  },
  BRAND_HAS_CHILDREN: {
    code: 'BRAND_HAS_CHILDREN',
    messageAr: 'لا تُحذف ماركة لها طرازات أو مركبات. أخفِها بدل حذفها.',
    messageEn: 'A brand with models or vehicles cannot be deleted. Hide it instead.',
  },
  CATALOG_HAS_CHILDREN: {
    code: 'CATALOG_HAS_CHILDREN',
    messageAr: 'لا يُحذف عنصر له فئات أو مركبات. أخفِه بدل حذفه.',
    messageEn: 'An entry with trims or vehicles cannot be deleted. Hide it instead.',
  },
  FEATURE_LINKED: {
    code: 'FEATURE_LINKED',
    messageAr: 'لا تُحذف ميزة مربوطة بفئة أو بإعلان. أخفِها بدل حذفها.',
    messageEn: 'A feature linked to a trim or listing cannot be deleted. Hide it instead.',
  },
  UPLOAD_NOT_CONFIGURED: {
    code: 'UPLOAD_NOT_CONFIGURED',
    messageAr: 'تخزين الوسائط غير مضبوط في هذه البيئة.',
    messageEn: 'Media storage is not configured in this environment.',
  },
  UPLOAD_REJECTED: {
    code: 'UPLOAD_REJECTED',
    messageAr: 'نوع الملف أو حجمه غير مقبول. PNG أو SVG أو WebP حتى ٨ ميجابايت.',
    messageEn: 'File type or size not accepted. PNG, SVG or WebP up to 8 MB.',
  },
  ADMIN_INVALID_CREDENTIALS: {
    code: 'ADMIN_INVALID_CREDENTIALS',
    // رسالة واحدة لبريد مجهول ولكلمة خاطئة — تمييزهما يجعل
    // النقطة أداةَ تعداد لحسابات الفريق
    messageAr: 'البريد أو كلمة المرور غير صحيحة.',
    messageEn: 'Incorrect email or password.',
  },
  ADMIN_INVALID_CODE: {
    code: 'ADMIN_INVALID_CODE',
    messageAr: 'رمز التحقّق غير صحيح.',
    messageEn: 'Incorrect verification code.',
  },
  ADMIN_LOCKED: {
    code: 'ADMIN_LOCKED',
    messageAr: 'قُفل الحساب مؤقتًا بعد محاولات فاشلة. أعد المحاولة بعد ربع ساعة.',
    messageEn: 'Account temporarily locked after failed attempts. Try again in 15 minutes.',
  },
  ADMIN_INACTIVE: {
    code: 'ADMIN_INACTIVE',
    messageAr: 'هذا الحساب غير مفعّل. راجع مدير النظام.',
    messageEn: 'This account is not active. Contact the system administrator.',
  },
  ADMIN_NOT_ENROLLED: {
    code: 'ADMIN_NOT_ENROLLED',
    messageAr: 'لم يُسجَّل التحقّق بخطوتين بعد. راجع مدير النظام.',
    messageEn: 'Two-factor authentication is not enrolled. Contact the system administrator.',
  },
  ACCOUNT_BLOCKED: {
    code: 'ACCOUNT_BLOCKED',
    messageAr: 'هذا الحساب موقوف. تواصل مع الدعم.',
    messageEn: 'This account is suspended. Contact support.',
  },
} as const;
