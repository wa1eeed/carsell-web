import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  contactChannels,
  normaliseSaudiPhone,
  saveContactChannels,
} from '@/lib/domain/admin-contact';

/**
 * ═══ قنوات الدعم ═══
 *
 * ثلاثة حقول كانت تُقرأ في صفحة «تواصل معنا» ولا يكتبها أحد. وهذا
 * الاختبار يحرس الطرفين: **أن الكتابة تصل القراءة**، وأن التطبيع
 * يقبل كل صيغة لصق.
 */

/**
 * **والاختبار يعيد ما غيّره.** صفُّ `platformSetting` مزروع تقرؤه
 * شاشاتٌ كثيرة، فتبديلُه بلا استعادة يُسقط جيرانه في التشغيل التالي.
 */
const seeded = { supportEmail: 'info@carz.sa', supportPhone: null, supportWhatsapp: null };

afterEach(async () => {
  await db.platformSetting.update({ where: { id: 'default' }, data: seeded });
});

afterAll(async () => {
  await db.$disconnect();
});

async function admin() {
  return db.adminUser.create({
    data: {
      email: `ctc${String(Date.now()).slice(-9)}@carsell.one`,
      name: 'محرّر',
      role: 'CONTENT',
      passwordHash: 'x',
    },
  });
}

describe('═══ التطبيع ═══ الحقل يقبل كل صيغة لصق', () => {
  it('الصيغ الخمس تؤدّي إلى رقم واحد', () => {
    const expected = '+966501234567';
    expect(normaliseSaudiPhone('0501234567')).toBe(expected);
    expect(normaliseSaudiPhone('501234567')).toBe(expected);
    expect(normaliseSaudiPhone('+966 50 123 4567')).toBe(expected);
    expect(normaliseSaudiPhone('00966501234567')).toBe(expected);
    // أرقام عربية-هندية: تُلصق من رسالة ويجب أن تُقبل
    expect(normaliseSaudiPhone('٠٥٠١٢٣٤٥٦٧')).toBe(expected);
  });

  it('ما ليس جوّالًا سعوديًّا يُرفض ولا يُحفظ نصفه', () => {
    expect(normaliseSaudiPhone('0112345678')).toBeNull(); // أرضي
    expect(normaliseSaudiPhone('05012345')).toBeNull(); // ناقص
    expect(normaliseSaudiPhone('050123456789')).toBeNull(); // زائد
    expect(normaliseSaudiPhone('هاتف')).toBeNull();
  });
});

describe('═══ الكتابة تصل القراءة ═══', () => {
  it('ما تحفظه الشاشة هو ما تقرؤه صفحة التواصل', async () => {
    const operator = await admin();

    const result = await saveContactChannels({
      supportEmail: '  info@carz.sa  ',
      supportPhone: '050 111 2222',
      supportWhatsapp: '٠٥٠١١١٣٣٣٣',
      adminId: operator.id,
      ip: null,
    });

    expect(result.ok).toBe(true);

    const read = await contactChannels();
    expect(read.supportEmail).toBe('info@carz.sa');
    expect(read.supportPhone).toBe('+966501112222');
    expect(read.supportWhatsapp).toBe('+966501113333');
  });

  it('الفراغ يعني «لا قناة» فلا تظهر — ولا يُحفظ نصًّا فارغًا', async () => {
    const operator = await admin();

    await saveContactChannels({
      supportEmail: 'info@carz.sa',
      supportPhone: '',
      supportWhatsapp: '',
      adminId: operator.id,
      ip: null,
    });

    const read = await contactChannels();
    expect(read.supportPhone).toBeNull();
    expect(read.supportWhatsapp).toBeNull();
  });

  it('البريد الخاطئ يُرفض ولا يمسّ المحفوظ', async () => {
    const operator = await admin();
    const before = await contactChannels();

    const result = await saveContactChannels({
      supportEmail: 'info-at-carz',
      supportPhone: '0501112222',
      supportWhatsapp: '',
      adminId: operator.id,
      ip: null,
    });

    expect(result).toEqual({ ok: false, reason: 'INVALID_EMAIL' });
    // **والرفض لا يكتب نصفًا**: الهاتف كان صحيحًا ولم يُحفظ
    expect(await contactChannels()).toEqual(before);
  });

  it('رقم الواتساب الخاطئ يُسمّى باسمه لا باسم الهاتف', async () => {
    const operator = await admin();

    const result = await saveContactChannels({
      supportEmail: '',
      supportPhone: '0501112222',
      supportWhatsapp: '0112345678',
      adminId: operator.id,
      ip: null,
    });

    expect(result).toEqual({ ok: false, reason: 'INVALID_WHATSAPP' });
  });
});

describe('═══ الأثر ═══ كل إجراء أدمن يُسجَّل', () => {
  it('الحفظ يكتب AuditLog باسم من فعله وبما كان وبما صار', async () => {
    const operator = await admin();

    await saveContactChannels({
      supportEmail: 'info@carz.sa',
      supportPhone: '0509998888',
      supportWhatsapp: '',
      adminId: operator.id,
      ip: '10.0.0.9',
    });

    const entry = await db.auditLog.findFirst({
      where: { actorId: operator.id, action: 'contact.updated' },
      orderBy: { createdAt: 'desc' },
    });

    expect(entry).not.toBeNull();
    expect(entry?.entity).toBe('PlatformSetting');
    expect(entry?.ip).toBe('10.0.0.9');
    // الرقم المسجَّل هو المطبَّع لا الملصوق
    expect(JSON.stringify(entry?.after)).toContain('+966509998888');
  });
});
