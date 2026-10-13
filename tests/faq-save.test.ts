import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { faqList, faqStats, saveFaq, toggleFaq } from '@/lib/domain/admin-content';

/**
 * ═══ A33 — السؤال يُكتب ويُصحَّح ═══
 *
 * `FaqItem` كان **لا يكتبه إلا الزرع**: تُخفيه الشاشة وتُظهره وتضبط
 * مواضعه، ولا تملك إضافة سؤالٍ ولا تصحيح حرفٍ فيه. **وهي تعدّ «ترجمة
 * ناقصة» وتضع وسمًا على كل صفٍّ ينقصه الإنجليزيّ** — مشكلةٌ تُحصى
 * ويُسمّى أصحابُها ولا بابَ لحلّها.
 */

const stamp = String(Date.now()).slice(-9);
const ADMIN = { adminId: `adm${stamp}`, ip: null };
const T0 = new Date('2026-08-04T10:00:00Z');

const made: string[] = [];

function draft(over: Partial<Parameters<typeof saveFaq>[0]['draft']> = {}) {
  return {
    // الطابع في النصّ — وبه ينظّف `global-setup` ما تسرّب من تشغيلٍ مقتول
    questionAr: `سؤال اختبار ${stamp}؟`,
    questionEn: `Test question ${stamp}?`,
    answerAr: 'جواب الاختبار.',
    answerEn: 'Test answer.',
    category: 'buying',
    ...over,
  };
}

afterAll(async () => {
  // الاختبار يعيد ما صنعه — وإلّا سقط جارُه في التشغيل التالي
  if (made.length > 0) {
    await db.faqPlacement.deleteMany({ where: { faqId: { in: made } } });
    await db.faqItem.deleteMany({ where: { id: { in: made } } });
  }
  await db.auditLog.deleteMany({ where: { actorId: ADMIN.adminId } });
  await db.$disconnect();
});

describe('A33 — إنشاء السؤال', () => {
  it('يُنشأ ويظهر في القائمة', async () => {
    const result = await saveFaq({ id: null, draft: draft(), ...ADMIN }, T0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    made.push(result.id);
    expect(result.created).toBe(true);

    const rows = await faqList();
    expect(rows.some((row) => row.id === result.id)).toBe(true);
  });

  /**
   * **والترتيب يُشتقّ من الأعلى لا من العدد.** `count() + 1` يصطدم بأوّل
   * صفٍّ محذوف — وهو العطل نفسه الذي وقع في `Order` و`Listing`.
   */
  it('الترتيب الفارغ يضعه بعد آخر أسئلة تصنيفه', async () => {
    const top = await db.faqItem.findFirst({
      where: { category: 'selling' },
      orderBy: { sort: 'desc' },
      select: { sort: true },
    });

    const result = await saveFaq(
      { id: null, draft: draft({ category: 'selling', sort: null }), ...ADMIN },
      T0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    made.push(result.id);

    const row = await db.faqItem.findUnique({ where: { id: result.id }, select: { sort: true } });
    expect(row?.sort).toBe((top?.sort ?? 0) + 1);
  });

  /**
   * **والإنجليزيّ يُحذَّر منه ولا يُمنع.** سؤالٌ عربيٌّ عاجل خيرٌ من لا
   * سؤال، والشاشة تعدّ ناقصي الترجمة وتسمّيهم — فمنعُ الحفظ يدفع المحرّر
   * إلى إنجليزيّةٍ رديئة ليمرّ.
   */
  it('يُحفظ بلا إنجليزية ويُوسَم', async () => {
    const before = await faqStats();
    const result = await saveFaq(
      { id: null, draft: draft({ questionEn: '', answerEn: '' }), ...ADMIN },
      T0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    made.push(result.id);

    const rows = await faqList();
    expect(rows.find((row) => row.id === result.id)?.missingEn).toBe(true);
    expect((await faqStats()).missingEn).toBe(before.missingEn + 1);
  });

  it('يكتب AuditLog بالفعل والكيان', async () => {
    const result = await saveFaq({ id: null, draft: draft(), ...ADMIN }, T0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    made.push(result.id);

    const log = await db.auditLog.findFirst({
      where: { entityId: result.id, action: 'faq.created' },
      select: { entity: true, actorType: true },
    });
    expect(log?.entity).toBe('FaqItem');
    expect(log?.actorType).toBe('admin');
  });
});

describe('A33 — التحرير', () => {
  /**
   * **ولا يُخفى من هنا.** الإخفاء يسحب السؤال من الموقع فورًا، واستمارةٌ
   * لا ترسل `active` كانت ستُقرأ «أخفِه» — فتصحيحُ حرفٍ يسحب سؤالًا.
   */
  it('يملأ الترجمة ولا يمسّ الظهور', async () => {
    const created = await saveFaq(
      { id: null, draft: draft({ questionEn: '', answerEn: '' }), ...ADMIN },
      T0,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    made.push(created.id);

    await toggleFaq({ id: created.id, active: false, ...ADMIN }, T0);

    const edited = await saveFaq(
      {
        id: created.id,
        draft: draft({ questionEn: 'Filled in later?', answerEn: 'Yes.' }),
        ...ADMIN,
      },
      T0,
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.created).toBe(false);

    const row = await db.faqItem.findUnique({
      where: { id: created.id },
      select: { questionEn: true, answerEn: true, active: true },
    });
    expect(row?.questionEn).toBe('Filled in later?');
    expect(row?.active).toBe(false);

    const rows = await faqList();
    expect(rows.find((item) => item.id === created.id)?.missingEn).toBe(false);
  });

  it('يكتب before وafter في السجلّ', async () => {
    const created = await saveFaq(
      { id: null, draft: draft({ answerAr: 'الأوّل.' }), ...ADMIN },
      T0,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    made.push(created.id);

    await saveFaq({ id: created.id, draft: draft({ answerAr: 'الثاني.' }), ...ADMIN }, T0);

    const log = await db.auditLog.findFirst({
      where: { entityId: created.id, action: 'faq.updated' },
      select: { before: true, after: true },
    });
    expect((log?.before as { answerAr?: string } | null)?.answerAr).toBe('الأوّل.');
    expect((log?.after as { answerAr?: string } | null)?.answerAr).toBe('الثاني.');
  });

  it('معرّفٌ غير موجود يُردّ بـNOT_FOUND', async () => {
    const result = await saveFaq({ id: 'no-such-faq', draft: draft(), ...ADMIN }, T0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NOT_FOUND');
  });
});

describe('A33 — التحقّق', () => {
  it('يردّ كل الحقول الخاطئة دفعةً', async () => {
    const result = await saveFaq(
      {
        id: null,
        draft: { questionAr: ' ', questionEn: '', answerAr: '', answerEn: '', category: '', sort: '99999' },
        ...ADMIN,
      },
      T0,
    );
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== 'VALIDATION') throw new Error('توقّعتُ رفضًا');
    expect(result.fields).toEqual({
      questionAr: 'REQUIRED',
      answerAr: 'REQUIRED',
      category: 'REQUIRED',
      sort: 'RANGE',
    });
  });
});
