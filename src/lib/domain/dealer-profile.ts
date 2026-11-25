import { db } from '@/lib/db';
import type { DealerHours } from './dealer-page';

/**
 * ═══ الملفُّ العامّ للمعرض — `D10` ═══
 *
 * **وما يُحرَّر هنا غيرُ ما يُعرض.** الترميزُ يرسم في بطاقة «الهوية»
 * السجلَّ التجاريَّ والرقمَ الضريبيَّ ويكتب تحتها: «شارة تاجر موثّق
 * تأتي من الأدمن بعد التحقّق من السجل التجاري — لا تُمنح من هنا».
 *
 * فالسجلُّ والرقمُ **يُعرضان ولا يُكتبان**: المعرضُ يغيّر رقمَه
 * الضريبيّ فتخرج فواتيرُه برقمٍ لم يتحقّق منه أحد. وكذلك `verified`
 * و`ratingAvg` — محسوبان، وتعليقُ الترميز يقولها صراحةً.
 */
export type EditableProfile = {
  nameAr: string;
  nameEn: string;
  aboutAr: string | null;
  aboutEn: string | null;
  address: string | null;
  phone: string | null;
  hours: DealerHours | null;
};

export type ReadOnlyProfile = {
  slug: string;
  city: string;
  crNumber: string | null;
  vatNumber: string | null;
  verified: boolean;
  ratingAvg: string | null;
  ratingCount: number;
};

export async function dealerProfile(
  dealerId: string,
): Promise<{ editable: EditableProfile; readOnly: ReadOnlyProfile } | null> {
  const dealer = await db.dealer.findUnique({
    where: { id: dealerId },
    select: {
      slug: true, nameAr: true, nameEn: true, aboutAr: true, aboutEn: true,
      city: true, address: true, phone: true, hours: true,
      crNumber: true, vatNumber: true, verified: true,
      ratingAvg: true, ratingCount: true,
    },
  });
  if (dealer === null) return null;

  return {
    editable: {
      nameAr: dealer.nameAr,
      nameEn: dealer.nameEn,
      aboutAr: dealer.aboutAr,
      aboutEn: dealer.aboutEn,
      address: dealer.address,
      phone: dealer.phone,
      hours: Array.isArray(dealer.hours) ? (dealer.hours as unknown as DealerHours) : null,
    },
    readOnly: {
      slug: dealer.slug,
      city: dealer.city,
      crNumber: dealer.crNumber,
      vatNumber: dealer.vatNumber,
      verified: dealer.verified,
      ratingAvg: dealer.ratingAvg === null ? null : dealer.ratingAvg.toFixed(2),
      ratingCount: dealer.ratingCount,
    },
  };
}

export type ProfileFailure = 'NAME_REQUIRED' | 'ABOUT_TOO_LONG' | 'NOT_FOUND';

const ABOUT_MAX = 600;

export async function saveDealerProfile(input: {
  dealerId: string;
  actorId: string;
  nameAr: string;
  nameEn: string;
  aboutAr: string;
  address: string;
  phone: string;
}): Promise<{ ok: true } | { ok: false; reason: ProfileFailure }> {
  const nameAr = input.nameAr.trim();
  const nameEn = input.nameEn.trim();
  if (nameAr === '' || nameEn === '') return { ok: false, reason: 'NAME_REQUIRED' };

  const aboutAr = input.aboutAr.trim();
  if (aboutAr.length > ABOUT_MAX) return { ok: false, reason: 'ABOUT_TOO_LONG' };

  const updated = await db.dealer.updateMany({
    where: { id: input.dealerId },
    data: {
      nameAr,
      nameEn,
      aboutAr: aboutAr === '' ? null : aboutAr,
      address: input.address.trim() === '' ? null : input.address.trim(),
      phone: input.phone.trim() === '' ? null : input.phone.trim(),
    },
  });
  if (updated.count === 0) return { ok: false, reason: 'NOT_FOUND' };

  /**
   * **وكلُّ تغييرٍ في ملفٍّ عامّ يُكتب في السجلّ.** الاسمُ يظهر في
   * فواتيرَ صدرت وفي صفحةٍ يقرؤها مشترون — ومن غيّره يُسمّى.
   */
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      actorType: 'user',
      action: 'dealer.profile.update',
      entity: 'dealer',
      entityId: input.dealerId,
      after: { nameAr, nameEn },
    },
  });

  return { ok: true };
}
