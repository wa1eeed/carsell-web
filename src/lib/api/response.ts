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
  ACCOUNT_BLOCKED: {
    code: 'ACCOUNT_BLOCKED',
    messageAr: 'هذا الحساب موقوف. تواصل مع الدعم.',
    messageEn: 'This account is suspended. Contact support.',
  },
} as const;
