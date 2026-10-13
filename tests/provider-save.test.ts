import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { providerList, saveProvider } from '@/lib/domain/admin-providers';

/**
 * ═══ A28 — المزوّد يُنشأ ويُعدَّل ═══
 *
 * `ServiceProvider` كان **لا يكتبه إلا الزرع**: الشاشة تعرض وتُعطّل
 * وتُفعّل، وذيلُها يَعِد بأن الأدمن «يضيف مزوّدًا ويعدّل بياناته» —
 * ووعدٌ معروضٌ بلا باب هو الصنف الذي يتكرّر في هذا المستودع.
 *
 * وطابورُ طلبات الخدمة يُسنِد إلى مزوّد، فنموُّ الخدمات كان موقوفًا على
 * كتابةٍ يدويّة في القاعدة.
 */

const stamp = String(Date.now()).slice(-9);
const ADMIN = { adminId: `adm${stamp}`, ip: null };
const T0 = new Date('2026-08-04T10:00:00Z');

const made: string[] = [];

function draft(over: Partial<Parameters<typeof saveProvider>[0]['draft']> = {}) {
  return {
    nameAr: `مزوّد اختبار ${stamp}`,
    // الطابع في الاسم اللاتينيّ — وبه ينظّف `global-setup` ما تسرّب
    nameEn: `Test Provider ${stamp}`,
    type: 'INSPECTION',
    contactPhone: null,
    contactEmail: null,
    commissionPct: null,
    slaHours: null,
    cities: [],
    ...over,
  };
}

afterAll(async () => {
  // الاختبار يعيد ما صنعه — وإلّا سقط جارُه في التشغيل التالي
  if (made.length > 0) {
    await db.serviceProvider.deleteMany({ where: { id: { in: made } } });
  }
  await db.auditLog.deleteMany({ where: { actorId: ADMIN.adminId } });
  await db.$disconnect();
});

describe('A28 — إنشاء المزوّد', () => {
  it('يُنشأ ويظهر في القائمة', async () => {
    const result = await saveProvider({ providerId: null, draft: draft(), ...ADMIN }, T0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    made.push(result.id);
    expect(result.created).toBe(true);

    const rows = await providerList(T0);
    expect(rows.some((row) => row.id === result.id)).toBe(true);
  });

  it('يكتب AuditLog بالفعل والمعرّف', async () => {
    const result = await saveProvider({ providerId: null, draft: draft(), ...ADMIN }, T0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    made.push(result.id);

    const log = await db.auditLog.findFirst({
      where: { entityId: result.id, action: 'provider.created' },
      select: { entity: true, actorType: true },
    });
    expect(log).not.toBeNull();
    expect(log?.entity).toBe('ServiceProvider');
    expect(log?.actorType).toBe('admin');
  });

  /**
   * **الهاتف يُطبَّع لا يُرفض.** من يلصق «+966 50 123 4567» من موقع
   * الشركة لم يخطئ — ومن يمنع اللصق يصنع الخطأ الذي يظنّ أنه يمنعه.
   */
  it('يقبل كل صيغة هاتف ويطبّعها', async () => {
    for (const typed of ['+966 50 123 4567', '0501234567', '00966501234567']) {
      const result = await saveProvider(
        { providerId: null, draft: draft({ contactPhone: typed }), ...ADMIN },
        T0,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      made.push(result.id);

      const row = await db.serviceProvider.findUnique({
        where: { id: result.id },
        select: { contactPhone: true },
      });
      expect(row?.contactPhone).toBe('+966501234567');
    }
  });

  it('المدن تُنقّى من الفراغ والتكرار', async () => {
    const result = await saveProvider(
      { providerId: null, draft: draft({ cities: ['الرياض', ' الرياض ', '', 'جدة'] }), ...ADMIN },
      T0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    made.push(result.id);

    const row = await db.serviceProvider.findUnique({
      where: { id: result.id },
      select: { cities: true },
    });
    expect(row?.cities).toEqual(['الرياض', 'جدة']);
  });

  /** العمولة `Decimal` لا `Float` — و«٧٫٥٪» تبقى ٧٫٥ بعد دورة كتابةٍ وقراءة. */
  it('العمولة تُحفظ بدقّتها', async () => {
    const result = await saveProvider(
      { providerId: null, draft: draft({ commissionPct: '7.5' }), ...ADMIN },
      T0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    made.push(result.id);

    const row = await db.serviceProvider.findUnique({
      where: { id: result.id },
      select: { commissionPct: true },
    });
    expect(row?.commissionPct?.toString()).toBe('7.5');
  });
});

describe('A28 — التحقّق', () => {
  /**
   * **والخطأ يعود كاملًا مرّة.** استمارةٌ فيها أربعة أخطاء تُردّ بأربعة
   * مفاتيح لا بواحد — ومن يُصلح حقلًا ثم يُفاجأ بالتالي يملأ الاستمارة
   * أربع مرّات.
   */
  it('يردّ كل الحقول الخاطئة دفعةً', async () => {
    const result = await saveProvider(
      {
        providerId: null,
        draft: draft({
          nameAr: '  ',
          nameEn: '',
          type: 'NOT_A_TYPE',
          commissionPct: '150',
          slaHours: '99999',
          contactEmail: 'not-an-email',
          contactPhone: '123',
        }),
        ...ADMIN,
      },
      T0,
    );

    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== 'VALIDATION') throw new Error('توقّعتُ رفضًا');
    expect(result.fields).toEqual({
      nameAr: 'REQUIRED',
      nameEn: 'REQUIRED',
      type: 'INVALID',
      commissionPct: 'RANGE',
      slaHours: 'RANGE',
      contactEmail: 'INVALID',
      contactPhone: 'INVALID',
    });
  });

  it('معرّفٌ غير موجود يُردّ بـPROVIDER_NOT_FOUND', async () => {
    const result = await saveProvider(
      { providerId: 'no-such-provider', draft: draft(), ...ADMIN },
      T0,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('PROVIDER_NOT_FOUND');
  });
});

describe('A28 — التعديل', () => {
  /**
   * **ولا يُمَسُّ `active` من هنا.** التفعيل قرارُ إسنادٍ له أثرُه على
   * الطلبات الجارية — ودمجُه في الحفظ يجعل تصحيحَ رقم هاتفٍ يُعطّل
   * شركةً بالسهو، لأن استمارةً لا ترسله كانت تُقرأ «عطِّل».
   */
  it('يحفظ الحقول ولا يمسّ التفعيل', async () => {
    const created = await saveProvider({ providerId: null, draft: draft(), ...ADMIN }, T0);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    made.push(created.id);

    await db.serviceProvider.update({ where: { id: created.id }, data: { active: false } });

    const edited = await saveProvider(
      {
        providerId: created.id,
        draft: draft({ slaHours: '24', commissionPct: '9', cities: ['الرياض'] }),
        ...ADMIN,
      },
      T0,
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.created).toBe(false);

    const row = await db.serviceProvider.findUnique({
      where: { id: created.id },
      select: { slaHours: true, commissionPct: true, cities: true, active: true },
    });
    expect(row?.slaHours).toBe(24);
    expect(row?.commissionPct?.toString()).toBe('9');
    expect(row?.cities).toEqual(['الرياض']);
    expect(row?.active).toBe(false);
  });

  it('يكتب before وafter في السجلّ', async () => {
    const created = await saveProvider(
      { providerId: null, draft: draft({ slaHours: '48' }), ...ADMIN },
      T0,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    made.push(created.id);

    await saveProvider(
      { providerId: created.id, draft: draft({ slaHours: '12' }), ...ADMIN },
      T0,
    );

    const log = await db.auditLog.findFirst({
      where: { entityId: created.id, action: 'provider.updated' },
      select: { before: true, after: true },
    });
    expect((log?.before as { slaHours?: number } | null)?.slaHours).toBe(48);
    expect((log?.after as { slaHours?: number } | null)?.slaHours).toBe(12);
  });
});
