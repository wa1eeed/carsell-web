import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { LegalVersionStatus } from '@/generated/prisma/client';
import {
  acceptanceStats,
  pendingAcceptance,
  recordAcceptance,
  requiredDocuments,
  surfacesFor,
} from '@/lib/domain/legal';
import {
  createDocument,
  discardDraft,
  legalDocuments,
  legalEditor,
  legalSummary,
  legalVersions,
  nextVersion,
  publishDraft,
  saveDraft,
  setRequiredAtSignup,
  validateDraft,
} from '@/lib/domain/admin-legal';
import { LEGAL_SURFACE, LEGAL_VERSION_STATUS } from '@/lib/labels/legal';

/**
 * ═══ A34 — الصفحات القانونية ═══
 *
 * شاشةُ الدخول تشترط تأشير «أوافق على الشروط والأحكام وسياسة
 * الخصوصية» ولا تمضي بدونه، **ولم يكن في القاعدة كلِّها صفٌّ يقول إنّ
 * أحدًا قبِل شيئًا** — فالمنصّة تشترط موافقةً ولا تملك دليلًا عليها.
 *
 * ويحرس هذا الملفّ ثلاثة أشياء: أن القبول يُكتب، وأن النشر يحفظ
 * السابقة، **وأنّ نصَّ المستند يطابق أحدثَ نسخةٍ منشورة** — إذ هما
 * موضعان لنصٍّ واحد، أحدهما حيٌّ والآخر أرشيف.
 */

const NOTICE_DAYS = 14;
const DAY = 86_400_000;

/** **والاختبار يعيد ما غيّره** — فمستندٌ يُنشأ يُحذف ومعه نسخُه. */
const madeKeys: string[] = [];
const madeUsers: string[] = [];

afterAll(async () => {
  if (madeKeys.length > 0) {
    await db.legalDocument.deleteMany({ where: { key: { in: madeKeys } } });
  }
  if (madeUsers.length > 0) {
    await db.user.deleteMany({ where: { id: { in: madeUsers } } });
  }
  await db.$disconnect();
});

async function admin() {
  const row = await db.adminUser.create({
    data: {
      email: `lgl${String(Date.now()).slice(-9)}${String(Math.floor(Math.random() * 1e4))}@carsell.one`,
      name: 'محرّر قانوني',
      role: 'CONTENT',
      passwordHash: 'x',
    },
  });
  return row;
}

async function user() {
  const row = await db.user.create({
    data: { phone: `+96650${String(Date.now()).slice(-7)}`, name: 'قابل الشروط' },
  });
  madeUsers.push(row.id);
  return row;
}

function draft(over: Partial<Parameters<typeof validateDraft>[0]> = {}) {
  return {
    titleAr: 'سياسة تجريبية',
    titleEn: 'Trial policy',
    summaryAr: 'ملخص',
    summaryEn: 'Summary',
    sections: [{ titleAr: 'بند أول', titleEn: 'One', bodyAr: 'نصه', bodyEn: 'Body' }],
    material: false,
    effectiveAt: null,
    ...over,
  };
}

describe('سجلّ القبول', () => {
  it('يكتب صفًّا لكل مستندٍ مشترط، ولا يُكرّره', async () => {
    const required = await requiredDocuments();
    expect(required.length).toBeGreaterThan(0);

    const subject = await user();
    expect(await pendingAcceptance(subject.id)).toHaveLength(required.length);

    const first = await recordAcceptance(subject.id, 'signup');
    expect(first).toBe(required.length);
    expect(await pendingAcceptance(subject.id)).toHaveLength(0);

    /** **والثاني لا يُنشئ صفًّا ولا يرمي** — فإعادةُ الطلب لا تُفشل طلبَها. */
    expect(await recordAcceptance(subject.id, 'reaccept')).toBe(0);

    const rows = await db.legalAcceptance.findMany({ where: { userId: subject.id } });
    expect(rows).toHaveLength(required.length);
    /** **والنسخةُ لحظتَها لا مرجعٌ يتغيّر** — فالصفّ يحمل رقم النسخة نصًّا. */
    for (const row of rows) {
      const doc = required.find((item) => item.key === row.documentKey);
      expect(row.version).toBe(doc?.version);
    }
  });

  it('التسجيل من المسار يكتب القبول — وهو ما كانت الشاشة تَعِد به', async () => {
    const { completeRegistration } = await import('@/lib/domain/registration');
    const subject = await user();

    const result = await completeRegistration(subject.id, {
      accountType: 'INDIVIDUAL',
      name: 'مسجّل جديد',
      city: 'الرياض',
      password: 'kalimat-sirr-1',
    });
    expect(result.ok).toBe(true);

    expect(await pendingAcceptance(subject.id)).toHaveLength(0);
    const rows = await db.legalAcceptance.findMany({ where: { userId: subject.id } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.context === 'signup')).toBe(true);
  });

  it('نسخةٌ جديدة تُعيد المستند إلى الانتظار — فالقبول بالنسخة', async () => {
    const subject = await user();
    await recordAcceptance(subject.id, 'signup');
    expect(await pendingAcceptance(subject.id)).toHaveLength(0);

    const terms = await db.legalDocument.findUniqueOrThrow({ where: { key: 'terms' } });
    await db.legalDocument.update({
      where: { key: 'terms' },
      data: { version: `${terms.version}-قياس` },
    });

    try {
      const pending = await pendingAcceptance(subject.id);
      expect(pending.map((doc) => doc.key)).toContain('terms');
    } finally {
      await db.legalDocument.update({
        where: { key: 'terms' },
        data: { version: terms.version },
      });
    }
  });

  it('النسبة تُحسب على كل حساب — ولا تُختلَق لمن لا صفَّ له', async () => {
    const stats = await acceptanceStats();
    expect(stats.users).toBeGreaterThan(0);
    expect(stats.accepted).toBeLessThanOrEqual(stats.users);
    expect(stats.pct).toBe(Math.round((stats.accepted / stats.users) * 100));
    expect(stats.required).toBe((await requiredDocuments()).length);
  });
});

describe('«يظهر في» يُشتقّ', () => {
  it('السطحُ من الحقل الذي يقرؤه التسجيل نفسُه', () => {
    expect(surfacesFor({ active: true, requiredAtSignup: true })).toEqual(['SIGNUP', 'LEGAL']);
    expect(surfacesFor({ active: true, requiredAtSignup: false })).toEqual(['LEGAL']);
    /** **ومستندٌ غير منشورٍ لا سطحَ له** — وهو ما يعرضه العمود «لم تنشر». */
    expect(surfacesFor({ active: false, requiredAtSignup: false })).toEqual([]);
  });

  it('لكل قيمة تعدادٍ تسميةٌ — ولا مفتاحٌ خام في شاشة', () => {
    for (const status of Object.values(LegalVersionStatus)) {
      expect(LEGAL_VERSION_STATUS[status]).toBeTruthy();
    }
    expect(Object.keys(LEGAL_SURFACE).sort()).toEqual(['LEGAL', 'SIGNUP']);
  });
});

describe('رقمُ النسخة التالية', () => {
  it('من الأعلى لا من العدد — فالفجوة لا تُصادم', () => {
    expect(nextVersion(['1.0'])).toBe('1.1');
    expect(nextVersion(['1.0', '1.1', '1.2'])).toBe('1.3');
    /** **والفجوةُ هي الحالة**: ثلاثُ نسخٍ وأعلاها ٩ ⇒ التالية ١٠ لا ٤. */
    expect(nextVersion(['1.0', '1.9', '1.3'])).toBe('1.10');
    expect(nextVersion(['2.4', '1.9'])).toBe('2.5');
    expect(nextVersion([])).toBe('1.1');
    /** ونصٌّ لا يُقرأ لا يُسقط الحساب. */
    expect(nextVersion(['نسخة', '1.2'])).toBe('1.3');
  });
});

describe('تحقّقُ المسوّدة', () => {
  const now = new Date('2026-11-24T09:00:00.000Z');

  it('يعيد مفاتيح لا جُملًا', () => {
    expect(validateDraft(draft({ titleAr: '  ' }), NOTICE_DAYS, now).titleAr).toBe('REQUIRED');
    expect(validateDraft(draft({ sections: [] }), NOTICE_DAYS, now).sections).toBe('REQUIRED');
    expect(
      validateDraft(
        draft({ sections: [{ titleAr: '', titleEn: '', bodyAr: 'نصّ', bodyEn: '' }] }),
        NOTICE_DAYS,
        now,
      ).sections,
    ).toBe('SECTION_TITLE');
    expect(
      validateDraft(
        draft({ sections: [{ titleAr: 'عنوان', titleEn: '', bodyAr: '', bodyEn: '' }] }),
        NOTICE_DAYS,
        now,
      ).sections,
    ).toBe('SECTION_BODY');
  });

  /**
   * ═══ والحدُّ يُختبَر بتجاوزه ═══
   *
   * اختبارٌ يفحص حدًّا لا تبلغه مدخلاتُه أخضرُ أعمى. فالثلاثةُ هنا:
   * أقلُّ من الحدّ، والحدُّ بالضبط، وأكثر — ويقع الخطأ على الأوّل وحده.
   */
  it('الجوهريُّ لا يُنشر قبل مهلة الإخطار', () => {
    const at = (days: number): string =>
      new Date(now.getTime() + days * DAY).toISOString().slice(0, 10);

    expect(
      validateDraft(draft({ material: true, effectiveAt: at(5) }), NOTICE_DAYS, now).effectiveAt,
    ).toBe('TOO_SOON');

    /** الحدُّ بالضبط يمرّ — ولا يُقاس بـ«أقلّ من» ما هو «لا أقلّ من». */
    expect(
      validateDraft(draft({ material: true, effectiveAt: at(15) }), NOTICE_DAYS, now).effectiveAt,
    ).toBeUndefined();

    expect(
      validateDraft(draft({ material: true, effectiveAt: at(40) }), NOTICE_DAYS, now).effectiveAt,
    ).toBeUndefined();

    /** **والجوهريُّ بلا تاريخٍ لا يسري** — فالإخطارُ يُحتسب من موعد. */
    expect(
      validateDraft(draft({ material: true, effectiveAt: null }), NOTICE_DAYS, now).effectiveAt,
    ).toBe('REQUIRED');

    /** وغيرُ الجوهريّ يسري فورًا بلا تاريخ. */
    expect(
      validateDraft(draft({ material: false, effectiveAt: null }), NOTICE_DAYS, now).effectiveAt,
    ).toBeUndefined();

    expect(
      validateDraft(draft({ effectiveAt: 'ليس تاريخًا' }), NOTICE_DAYS, now).effectiveAt,
    ).toBe('INVALID');
  });
});

describe('المستند الجديد', () => {
  it('يُولد مسوّدةً غيرَ سارية — فلا يراه زائر قبل النشر', async () => {
    const editor = await admin();
    const key = `probe-${String(Date.now()).slice(-7)}`;
    madeKeys.push(key);

    const result = await createDocument({
      ...draft(),
      key,
      requiredAtSignup: false,
      adminId: editor.id,
      ip: null,
      noticeDays: NOTICE_DAYS,
    });
    expect(result).toEqual({ ok: true, key });

    const doc = await db.legalDocument.findUniqueOrThrow({
      where: { key },
      include: { versions: true },
    });
    expect(doc.active).toBe(false);
    expect(doc.versions).toHaveLength(1);
    expect(doc.versions[0]?.status).toBe('DRAFT');
    expect(doc.versions[0]?.version).toBe('1.0');

    /** **ولا سطحَ له وهو غير منشور** — وهو ما يعرضه عمود «يظهر في». */
    const rows = await legalDocuments();
    expect(rows.find((row) => row.key === key)?.surfaces).toEqual([]);

    const audit = await db.auditLog.findFirst({
      where: { entity: 'LegalDocument', entityId: key, action: 'legal.document_created' },
    });
    expect(audit).not.toBeNull();
  });

  it('يردّ مفتاحًا يُظلّله مسارٌ ثابت، ومفتاحًا مستعملًا', async () => {
    const editor = await admin();
    const base = { ...draft(), requiredAtSignup: false, adminId: editor.id, ip: null, noticeDays: NOTICE_DAYS };

    for (const key of ['new', 'history']) {
      const result = await createDocument({ ...base, key });
      expect(result).toEqual({ ok: false, reason: 'VALIDATION', fields: { key: 'RESERVED' } });
    }

    expect(await createDocument({ ...base, key: 'ما-لا-يُقرأ' })).toEqual({
      ok: false,
      reason: 'VALIDATION',
      fields: { key: 'INVALID' },
    });

    expect(await createDocument({ ...base, key: 'terms' })).toEqual({
      ok: false,
      reason: 'KEY_TAKEN',
    });
  });
});

describe('المسوّدة والنشر', () => {
  it('النشر يُسلّم السابقةَ إلى الأرشيف، ونصُّ المستند يطابق المنشورة', async () => {
    const editor = await admin();
    const key = `cycle-${String(Date.now()).slice(-7)}`;
    madeKeys.push(key);

    await createDocument({
      ...draft(),
      key,
      requiredAtSignup: false,
      adminId: editor.id,
      ip: null,
      noticeDays: NOTICE_DAYS,
    });

    /** النسخةُ الأولى تُنشر، فيصير المستند ساريًا. */
    const first = await publishDraft({ key, adminId: editor.id, ip: null });
    expect(first).toMatchObject({ ok: true, version: '1.0' });

    let doc = await db.legalDocument.findUniqueOrThrow({ where: { key } });
    expect(doc.active).toBe(true);
    expect(doc.version).toBe('1.0');

    /** ثمّ مسوّدةٌ ثانية — **والمنشورُ لا يُمَسّ حتى تُنشر**. */
    const saved = await saveDraft({
      ...draft({ titleAr: 'سياسة تجريبية — نص ثان' }),
      key,
      adminId: editor.id,
      ip: null,
      noticeDays: NOTICE_DAYS,
    });
    expect(saved).toEqual({ ok: true, version: '1.1' });

    doc = await db.legalDocument.findUniqueOrThrow({ where: { key } });
    expect(doc.titleAr).toBe('سياسة تجريبية');
    expect(doc.version).toBe('1.0');

    /** والحفظُ ثانيةً يُعدّل المسوّدةَ ولا يُنشئ ثالثة. */
    await saveDraft({
      ...draft({ titleAr: 'سياسة تجريبية — نص ثالث' }),
      key,
      adminId: editor.id,
      ip: null,
      noticeDays: NOTICE_DAYS,
    });
    expect(await db.legalVersion.count({ where: { documentKey: key, status: 'DRAFT' } })).toBe(1);

    const second = await publishDraft({ key, adminId: editor.id, ip: null });
    expect(second).toMatchObject({ ok: true, version: '1.1' });

    const versions = await db.legalVersion.findMany({
      where: { documentKey: key },
      orderBy: { version: 'asc' },
    });
    expect(versions.map((row) => [row.version, row.status])).toEqual([
      ['1.0', 'SUPERSEDED'],
      ['1.1', 'PUBLISHED'],
    ]);

    /**
     * ═══ والتطابقُ هو ما يجعل النسختين واحدةً لا اثنتين ═══
     *
     * المستندُ يحمل نصَّ المنشور ليقرأه الزائر في استعلامٍ واحد،
     * والنسخةُ أرشيف. فإن تباعدا صارا مصدرين لنصٍّ واحد.
     */
    doc = await db.legalDocument.findUniqueOrThrow({ where: { key } });
    const live = versions.find((row) => row.status === 'PUBLISHED');
    expect(doc.version).toBe(live?.version);
    expect(doc.titleAr).toBe(live?.titleAr);
    expect(JSON.stringify(doc.sections)).toBe(JSON.stringify(live?.sections));
    expect(doc.effectiveAt.toISOString()).toBe(live?.effectiveAt?.toISOString());
    expect(live?.publishedBy).toBe(editor.id);

    expect(await publishDraft({ key, adminId: editor.id, ip: null })).toEqual({
      ok: false,
      reason: 'NO_DRAFT',
    });

    const audit = await db.auditLog.count({
      where: { entity: 'LegalDocument', entityId: key, action: 'legal.published' },
    });
    expect(audit).toBe(2);
  });

  it('المسوّدةُ وحدها تُسقط — ولا يحذف المسارُ مستندًا', async () => {
    const editor = await admin();
    const key = `drop-${String(Date.now()).slice(-7)}`;
    madeKeys.push(key);

    await createDocument({
      ...draft(),
      key,
      requiredAtSignup: false,
      adminId: editor.id,
      ip: null,
      noticeDays: NOTICE_DAYS,
    });

    expect(await discardDraft({ key, adminId: editor.id, ip: null })).toEqual({ ok: true });
    expect(await db.legalVersion.count({ where: { documentKey: key } })).toBe(0);
    expect(await db.legalDocument.findUnique({ where: { key } })).not.toBeNull();
    expect(await discardDraft({ key, adminId: editor.id, ip: null })).toEqual({
      ok: false,
      reason: 'NO_DRAFT',
    });
  });

  it('المسوّدةُ تُولد من المنشور — فلا يُعاد كتابةُ المستند لتصحيح سطر', async () => {
    const state = await legalEditor('terms');
    expect(state).not.toBeNull();
    expect(state?.draft).toBeNull();
    expect(state?.current.sections.length).toBeGreaterThan(0);
    expect(state?.published?.version).toBe(state?.current.version);
  });

  it('المستندُ المفقود يُردّ ولا يُنشأ', async () => {
    const editor = await admin();
    expect(
      await saveDraft({
        ...draft(),
        key: 'لا-وجود-له',
        adminId: editor.id,
        ip: null,
        noticeDays: NOTICE_DAYS,
      }),
    ).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(await publishDraft({ key: 'لا-وجود-له', adminId: editor.id, ip: null })).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });
});

describe('عدّادات الشاشة وسجلّها', () => {
  it('السجلُّ يبدأ ممّا في القاعدة — ولكل مستندٍ نسخةٌ منشورة', async () => {
    const docs = await db.legalDocument.findMany({ where: { active: true } });
    const rows = await legalVersions();

    for (const doc of docs) {
      const live = rows.find(
        (row) => row.documentKey === doc.key && row.status === 'PUBLISHED',
      );
      expect(live, `لا نسخة منشورة لـ${doc.key}`).toBeDefined();
      expect(live?.version).toBe(doc.version);
    }
  });

  it('المسوّداتُ تُعدّ من الصفوف لا من القائمة', async () => {
    const editor = await admin();
    const key = `count-${String(Date.now()).slice(-7)}`;
    madeKeys.push(key);

    const before = await legalSummary();
    await createDocument({
      ...draft(),
      key,
      requiredAtSignup: false,
      adminId: editor.id,
      ip: null,
      noticeDays: NOTICE_DAYS,
    });

    const after = await legalSummary();
    expect(after.drafts).toBe(before.drafts + 1);
    expect(after.total).toBe(before.total + 1);
    expect(after.unpublished).toBe(before.unpublished + 1);

    /** **والعدّاد يساوي ما تفتحه القائمة** — فلا رقمٌ مكتوب في اختبار. */
    const rows = await legalDocuments();
    expect(after.total).toBe(rows.length);
    expect(after.drafts).toBe(rows.filter((row) => row.draftVersion !== null).length);
  });

  it('«إلزاميّ للتسجيل» يبدّل الشرطَ والعمودَ معًا', async () => {
    const editor = await admin();
    const key = `req-${String(Date.now()).slice(-7)}`;
    madeKeys.push(key);

    await createDocument({
      ...draft(),
      key,
      requiredAtSignup: false,
      adminId: editor.id,
      ip: null,
      noticeDays: NOTICE_DAYS,
    });
    await publishDraft({ key, adminId: editor.id, ip: null });

    const beforeKeys = (await requiredDocuments()).map((doc) => doc.key);
    expect(beforeKeys).not.toContain(key);

    expect(await setRequiredAtSignup({ key, required: true, adminId: editor.id, ip: null })).toEqual(
      { ok: true },
    );

    /** الشرطُ والعمودُ مصدرُهما حقلٌ واحد، فيتحرّكان معًا. */
    expect((await requiredDocuments()).map((doc) => doc.key)).toContain(key);
    const row = (await legalDocuments()).find((item) => item.key === key);
    expect(row?.surfaces).toEqual(['SIGNUP', 'LEGAL']);

    const subject = await user();
    expect((await pendingAcceptance(subject.id)).map((doc) => doc.key)).toContain(key);

    expect(
      await setRequiredAtSignup({ key: 'لا-وجود-له', required: true, adminId: editor.id, ip: null }),
    ).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});
