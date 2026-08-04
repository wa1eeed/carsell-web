import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  breachedRequests,
  providerList,
  providerStats,
  toggleProvider,
} from '@/lib/domain/admin-providers';
import { exportLog, exportStats, runReport } from '@/lib/domain/admin-reports-export';
import { REPORTS } from '@/lib/domain/report-catalog';
import { can } from '@/lib/domain/permissions';

/**
 * ═══ A28 — المزوّدون · A36 — التقارير والتصدير ═══
 *
 * `ServiceProvider` مزروعٌ بكل ما تحتاجه الشاشة ولا شاشة تقرؤه، و`dueAt`
 * مكتوبٌ في كل طلبٍ ولا شيء يقارنه بالزمن.
 */

const stamp = String(Date.now()).slice(-9);
const ADMIN = { adminId: `adm${stamp}`, ip: null };
const T0 = new Date('2026-08-04T10:00:00Z');

const createdRequests: string[] = [];

afterAll(async () => {
  // **الاختبار يعيد ما صنعه** — وإلّا سقط جارُه في التشغيل التالي
  if (createdRequests.length > 0) {
    await db.serviceRequest.deleteMany({ where: { id: { in: createdRequests } } });
  }
  await db.auditLog.deleteMany({ where: { actorId: ADMIN.adminId } });
});

describe('A28 — المزوّدون', () => {
  it('يُقرأون بحملهم ومدنهم وخدماتهم', async () => {
    const rows = await providerList(T0);
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(row.openRequests).toBeGreaterThanOrEqual(0);
      expect(row.breached).toBeLessThanOrEqual(row.openRequests);
    }
  });

  it('المدن تُحسب من المفعّلين وحدهم', async () => {
    const [rows, stats] = await Promise.all([providerList(T0), providerStats(T0)]);
    const active = rows.filter((row) => row.active);

    expect(stats.active).toBe(active.length);
    expect(stats.cities).toBe(new Set(active.flatMap((row) => row.cities)).size);
  });

  /**
   * **التجاوز من `dueAt` والزمن معًا** — لا من راية. وطلبٌ حالتُه
   * `IN_PROGRESS` ومهلتُه انقضت متأخّرٌ ولو لم يمرّ عليه شيء.
   */
  it('يعدّ الطلب متجاوزًا حين تنقضي مهلته وهو مفتوح', async () => {
    const provider = await db.serviceProvider.findFirstOrThrow();
    const service = await db.service.findFirstOrThrow();
    const user = await db.user.findFirstOrThrow();

    const before = (await providerStats(T0)).breached;

    const late = await db.serviceRequest.create({
      data: {
        ref: `SRV-T-${stamp}-1`,
        serviceId: service.id,
        userId: user.id,
        providerId: provider.id,
        status: 'IN_PROGRESS',
        amount: 450,
        dueAt: new Date(T0.getTime() - 5 * 3_600_000),
      },
    });
    createdRequests.push(late.id);

    // منتهٍ ومهلتُه انقضت — **لا يُعدّ متجاوزًا**: لا أحد ينتظره
    const done = await db.serviceRequest.create({
      data: {
        ref: `SRV-T-${stamp}-2`,
        serviceId: service.id,
        userId: user.id,
        providerId: provider.id,
        status: 'DONE',
        amount: 450,
        dueAt: new Date(T0.getTime() - 9 * 3_600_000),
      },
    });
    createdRequests.push(done.id);

    expect((await providerStats(T0)).breached).toBe(before + 1);

    const breached = await breachedRequests(T0);
    const mine = breached.find((row) => row.ref === late.ref);
    expect(mine).toBeDefined();
    expect(mine?.overdueHours).toBe(5);
    expect(breached.some((row) => row.ref === done.ref)).toBe(false);
  });

  /**
   * **والتعطيل يمنع الإسناد الجديد ولا يمسّ الجاري.** وإسقاطُ طلبٍ
   * جارٍ يترك عميلًا دفع بلا من ينفّذ — والعقوبة على المزوّد لا عليه.
   */
  it('التعطيل لا يمسّ الطلبات الجارية', async () => {
    const provider = await db.serviceProvider.findFirstOrThrow({ where: { active: true } });
    const openBefore = await db.serviceRequest.count({
      where: { providerId: provider.id, status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] } },
    });

    const off = await toggleProvider({ providerId: provider.id, active: false, ...ADMIN }, T0);
    expect(off).toEqual({ ok: true, active: false, openRequests: openBefore });

    const stillOpen = await db.serviceRequest.count({
      where: { providerId: provider.id, status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] } },
    });
    expect(stillOpen).toBe(openBefore);

    const audit = await db.auditLog.findFirst({
      where: { actorId: ADMIN.adminId, action: 'provider.disabled' },
    });
    expect(audit).not.toBeNull();

    await toggleProvider({ providerId: provider.id, active: true, ...ADMIN }, T0);
  });

  it('مزوّد لا وجود له يُردّ لا يُنشأ', async () => {
    const result = await toggleProvider({ providerId: `nope${stamp}`, active: false, ...ADMIN }, T0);
    expect(result).toEqual({ ok: false, reason: 'PROVIDER_NOT_FOUND' });
  });
});

describe('A36 — التقارير والتصدير', () => {
  it('كل تقرير في الكتالوج يُنفَّذ ويُعيد ترويسةً', async () => {
    for (const report of REPORTS) {
      const result = await runReport({ key: report.key, ...ADMIN }, T0);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      // **BOM ثم الترويسة** — وبلا BOM تُقرأ العربية حروفًا مشوّشة في Excel
      expect(result.csv.startsWith('﻿')).toBe(true);
      expect(result.csv.split('\r\n')[0]?.length).toBeGreaterThan(0);
      expect(result.filename.endsWith('.csv')).toBe(true);
    }
  });

  it('تقريرٌ لا وجود له يُردّ', async () => {
    const result = await runReport({ key: 'no_such_report', ...ADMIN }, T0);
    expect(result).toEqual({ ok: false, reason: 'UNKNOWN_REPORT' });
  });

  /**
   * **ما يحمل بيانات شخصية يُقيَّد، وما لا يحملها لا يُقيَّد.** وتقييد
   * كل تصدير يُغرق السجلّ فيضيع فيه ما يهمّ.
   */
  it('يُقيّد تصدير البيانات الشخصية وحده — بعدد صفوفه', async () => {
    const before = await db.auditLog.count({
      where: { actorId: ADMIN.adminId, action: 'report.exported' },
    });

    const aggregate = await runReport({ key: 'sales_commissions', ...ADMIN }, T0);
    expect(aggregate.ok).toBe(true);
    expect(
      await db.auditLog.count({ where: { actorId: ADMIN.adminId, action: 'report.exported' } }),
    ).toBe(before);

    const personal = await runReport({ key: 'customers', ...ADMIN }, T0);
    expect(personal.ok).toBe(true);
    if (!personal.ok) return;

    const entry = await db.auditLog.findFirstOrThrow({
      where: { actorId: ADMIN.adminId, action: 'report.exported' },
      orderBy: { createdAt: 'desc' },
    });
    // العدد يفرّق بين «صدّر عميلًا» و«صدّر أربعمئة»
    expect((entry.after as { rows?: number }).rows).toBe(personal.rows);
  });

  /**
   * **حقن الصيغ.** خليّةٌ تبدأ بـ`=` تُنفَّذ صيغةً في Excel — فاسمٌ
   * يكتبه مستخدم يصير أمرًا على جهاز من يفتح الملف.
   */
  it('يُهرّب ما يبدأ بعلامة صيغة', async () => {
    const user = await db.user.findFirstOrThrow();
    const original = user.name;

    await db.user.update({ where: { id: user.id }, data: { name: '=1+1' } });
    const result = await runReport({ key: 'customers', ...ADMIN }, T0);
    await db.user.update({ where: { id: user.id }, data: { name: original } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.csv).toContain("'=1+1");
    expect(result.csv).not.toMatch(/,=1\+1/);
  });

  it('العدّادات تُحسب من الكتالوج وسجلّ التدقيق', async () => {
    const [stats, log] = await Promise.all([exportStats(T0), exportLog()]);

    expect(stats.reports).toBe(REPORTS.length);
    expect(stats.personalReports).toBe(REPORTS.filter((report) => report.personal).length);
    expect(log.every((row) => row.rows >= 0)).toBe(true);
  });

  /**
   * **وصلاحية تقرير العملاء أضيق من صلاحية عرضهم.** من يرى القائمة في
   * الشاشة ليس بالضرورة من يُخرجها ملفًّا لا يعود.
   */
  it('تقرير البيانات الشخصية لا يفتحه دورٌ تشغيليّ', () => {
    const customers = REPORTS.find((report) => report.key === 'customers');
    expect(customers?.permission).toBe('users.viewIdentity');
    expect(can('OPS', 'users.viewIdentity')).toBe(false);
  });
});
