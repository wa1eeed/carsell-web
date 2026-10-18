import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { adminTrustMarks, trustMarks, updateTrustMark } from '@/lib/domain/trust-marks';
import { ADMIN_NAV } from '@/components/admin/nav';

const ROOT = process.cwd();
const admin = { id: 'test-admin-trustmark' };

/** **والاختبار يعيد ما غيّره** — والصفُّ مزروع لا مصنوع هنا. */
const touched = new Map<string, { registrationNo: string | null; verifyUrl: string | null; active: boolean }>();

afterAll(async () => {
  for (const [key, before] of touched) {
    await db.trustMark.update({ where: { key }, data: before });
  }
  await db.auditLog.deleteMany({ where: { actorId: admin.id } });
});

async function borrow(): Promise<string> {
  const row = await db.trustMark.findFirstOrThrow({ orderBy: { sort: 'asc' } });
  if (!touched.has(row.key)) {
    touched.set(row.key, {
      registrationNo: row.registrationNo,
      verifyUrl: row.verifyUrl,
      active: row.active,
    });
  }
  return row.key;
}

/**
 * ═══ علامةُ الموثوقية دعوى — ولم يكن لها باب ═══
 *
 * `TrustMark` كان **بلا كاتبٍ إطلاقًا**: لا شاشة ولا مسار ولا دالّة
 * نطاق. فالتذييل يعرض أربعَ جهاتٍ نظامية بلا رقمٍ واحد، والوثيقة
 * تقول إنّ الرقم ورابطَ التحقّق «يُضبطان من اللوحة» — تعليقٌ يَعِد
 * بما لا يقع. وقيل للمالك «أكّد ما تملكه وأطفئ ما لا تملك» وهو لا
 * يستطيع: شرطٌ يُفرَض ولا بابَ لاستيفائه.
 */
describe('علامات الموثوقية تُحرَّر من اللوحة', () => {
  it('الوجهة في الملاحة، ولها شاشة ومسار', () => {
    const entries = ADMIN_NAV.flatMap((group) => group.items);
    const entry = entries.find((item) => item.href === '/admin/trust-marks');
    expect(entry).toBeDefined();

    expect(() => readFileSync(join(ROOT, 'src/app/admin/trust-marks/page.tsx'))).not.toThrow();
    expect(() =>
      readFileSync(join(ROOT, 'src/app/api/v1/admin/trust-marks/[key]/route.ts')),
    ).not.toThrow();
  });

  it('الرقم يُكتب ويصل القراءة العامة', async () => {
    const key = await borrow();
    const result = await updateTrustMark(admin, key, { registrationNo: ' 300000000000003 ' }, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    /** **ويُقلَّم قبل التخزين** — ومسافةٌ طرفية تجعل المطابقة تخطئ. */
    expect(result.mark.registrationNo).toBe('300000000000003');

    const shown = await trustMarks(result.mark.kind);
    expect(shown.find((row) => row.key === key)?.registrationNo).toBe('300000000000003');
  });

  /** **والفارغُ سحبٌ للدعوى** — من مسح الرقم أراد مسحه. */
  it('والفارغ يمحو الرقم لا يتركه', async () => {
    const key = await borrow();
    await updateTrustMark(admin, key, { registrationNo: '300000000000003' }, null);
    const result = await updateTrustMark(admin, key, { registrationNo: '' }, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mark.registrationNo).toBeNull();
  });

  /**
   * **ورابطُ التحقّق يُفحص**: نصٌّ ليس عنوانًا يُطبع في `href` فيقود
   * إلى لا شيء، و`http` على صفحةٍ آمنة يُحذّر منه المتصفّح.
   */
  it('ورابط التحقق لا يُقبل إلا https', async () => {
    const key = await borrow();
    const bad = await updateTrustMark(admin, key, { verifyUrl: 'ليس رابطا' }, null);
    expect(bad).toEqual({ ok: false, reason: 'INVALID_URL' });

    const insecure = await updateTrustMark(admin, key, { verifyUrl: 'http://zatca.gov.sa' }, null);
    expect(insecure).toEqual({ ok: false, reason: 'INVALID_URL' });

    const good = await updateTrustMark(admin, key, { verifyUrl: 'https://zatca.gov.sa' }, null);
    expect(good.ok).toBe(true);
  });

  /**
   * **والإطفاء هو كيف يسحب المالكُ دعوى لم تعد قائمة** — وعلامةٌ
   * تبقى معروضةً بعد انقضائها أسوأ من ألّا تكون، لأنها تُقرأ سارية.
   */
  it('والمطفأة تختفي من التذييل وتبقى في اللوحة', async () => {
    const key = await borrow();
    const result = await updateTrustMark(admin, key, { active: false }, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const shown = await trustMarks(result.mark.kind);
    expect(shown.some((row) => row.key === key)).toBe(false);

    /** واللوحةُ تعرض المطفأة — وإلّا فلا سبيل إلى إعادتها. */
    const all = await adminTrustMarks();
    expect(all.some((row) => row.key === key)).toBe(true);
  });

  /** **وكلُّ إجراء أدمن يكتب `AuditLog`** — ودعوى الموثوقية أولاها. */
  it('وكل تعديل يكتب سجل تدقيق', async () => {
    const key = await borrow();
    const before = await db.auditLog.count({ where: { entity: 'TrustMark', entityId: key } });
    await updateTrustMark(admin, key, { registrationNo: '399999999999993' }, '10.0.0.1');
    const after = await db.auditLog.count({ where: { entity: 'TrustMark', entityId: key } });
    expect(after).toBe(before + 1);
  });

  it('والمفتاح المجهول يُردّ ولا يُنشئ صفا', async () => {
    const before = await db.trustMark.count();
    const result = await updateTrustMark(admin, 'لا-وجود-له', { active: true }, null);
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(await db.trustMark.count()).toBe(before);
  });
});
