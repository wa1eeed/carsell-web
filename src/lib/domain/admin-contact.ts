import { db } from '@/lib/db';
import { toLatinDigits } from '@/lib/arabic';

/**
 * ═══ قنوات الدعم — تُقرأ منذ بُنيت ولا يكتبها أحد ═══
 *
 * `supportEmail` و`supportPhone` و`supportWhatsapp` تقرؤها صفحة
 * «تواصل معنا»، **ولا شاشة تضبطها ولا بذرة تملؤها**. فالصفحة تقول
 * «قنوات التواصل غير مضبوطة بعد» لكل زائر منذ بُنيت — وهي آخر وجهة
 * يصلها من لم يجد جوابه.
 *
 * وثلاثة حقول تُقرأ ولا يكتبها كاتب: الصنف نفسه الذي تكرّر في هذا
 * المستودع عشر مرّات.
 *
 * ═══ والصياغة ليست هنا ═══
 *
 * النطاق يعيد مفاتيح وقيمًا، والرسائل في الشاشة (البوابة ١٧).
 */

export type ContactChannels = {
  supportEmail: string | null;
  supportPhone: string | null;
  supportWhatsapp: string | null;
};

export async function contactChannels(): Promise<ContactChannels> {
  const row = await db.platformSetting.findUnique({
    where: { id: 'default' },
    select: { supportEmail: true, supportPhone: true, supportWhatsapp: true },
  });
  return {
    supportEmail: row?.supportEmail ?? null,
    supportPhone: row?.supportPhone ?? null,
    supportWhatsapp: row?.supportWhatsapp ?? null,
  };
}

export type ContactResult =
  | { ok: true; saved: ContactChannels }
  | { ok: false; reason: 'INVALID_EMAIL' | 'INVALID_PHONE' | 'INVALID_WHATSAPP' };

/** فحصٌ يمنع الخطأ المطبعيّ، لا مُتحقّقٌ كامل من البريد. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * ═══ الحقل يقبل كل صيغة لصق ويطبّعها ═══
 *
 * الجوال يُلصق بكل شكل: `+966 50 123 4567` و`0501234567` و
 * `966501234567` و`٠٥٠١٢٣٤٥٦٧`. ومن يمنع اللصق يظنّ أنه يمنع الخطأ
 * وهو يصنعه.
 *
 * فيُطبَّع إلى `+9665XXXXXXXX`: أرقام لاتينية، ورمز الدولة مرّة
 * واحدة. **ورابط واتساب يُبنى من الرقم**، فصيغةٌ ثانية تعني رابطًا
 * مكسورًا لا رقمًا مكتوبًا بشكل آخر.
 */
export function normaliseSaudiPhone(raw: string): string | null {
  /** **وتحويل الأرقام قاعدة مكتوبة مرّة** — `toLatinDigits` لا نسخةٌ هنا. */
  const digits = toLatinDigits(raw).replace(/\D/g, '');
  if (digits === '') return null;

  // 05XXXXXXXX · 5XXXXXXXX · 9665XXXXXXXX · 009665XXXXXXXX
  const body = digits.startsWith('00966')
    ? digits.slice(5)
    : digits.startsWith('966')
      ? digits.slice(3)
      : digits.startsWith('0')
        ? digits.slice(1)
        : digits;

  if (!/^5\d{8}$/.test(body)) return null;
  return `+966${body}`;
}

/** فراغٌ = «لا قناة»، وهو قرارٌ مشروع لا خطأ إدخال. */
const blank = (value: string): boolean => value.trim() === '';

export async function saveContactChannels(
  input: {
    supportEmail: string;
    supportPhone: string;
    supportWhatsapp: string;
    adminId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<ContactResult> {
  const email = input.supportEmail.trim();
  if (!blank(email) && !EMAIL.test(email)) return { ok: false, reason: 'INVALID_EMAIL' };

  const phone = blank(input.supportPhone) ? null : normaliseSaudiPhone(input.supportPhone);
  if (!blank(input.supportPhone) && phone === null) return { ok: false, reason: 'INVALID_PHONE' };

  const whatsapp = blank(input.supportWhatsapp)
    ? null
    : normaliseSaudiPhone(input.supportWhatsapp);
  if (!blank(input.supportWhatsapp) && whatsapp === null) {
    return { ok: false, reason: 'INVALID_WHATSAPP' };
  }

  const saved: ContactChannels = {
    supportEmail: blank(email) ? null : email,
    supportPhone: phone,
    supportWhatsapp: whatsapp,
  };

  const before = await contactChannels();

  await db.platformSetting.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...saved },
    update: saved,
  });

  /** كل إجراء أدمن يكتب أثره — ومنه ما يُغيّر ما يراه كل زائر. */
  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'PlatformSetting',
      entityId: 'default',
      action: 'contact.updated',
      before,
      after: saved,
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, saved };
}
