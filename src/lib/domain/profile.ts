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
export type MissingField = 'email' | 'idVerification' | 'iban';

export type ProfileCompletion = {
  missing: MissingField[];
  canBuy: boolean;
  canSell: boolean;
};

export function profileCompletion(user: User): ProfileCompletion {
  const missing: MissingField[] = [];

  if (user.email === null || user.email === '') missing.push('email');
  if (!user.idVerified) missing.push('idVerification');
  if (user.iban === null || user.iban === '') missing.push('iban');

  return {
    missing,
    // الشراء لا يحتاج آيبان — الآيبان لاستلام المال لا لدفعه
    canBuy: !missing.includes('email') && !missing.includes('idVerification'),
    canSell: missing.length === 0,
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
