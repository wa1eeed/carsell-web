import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  approveRuleChange,
  grantMarginScheme,
  invoiceTotals,
  listTaxRules,
  requestRuleChange,
  summarize,
} from '@/lib/domain/admin-tax';

afterAll(async () => {
  await db.$disconnect();
});

let seq = 0;
async function admin(role: 'SUPER_ADMIN' | 'FINANCE' = 'FINANCE') {
  seq += 1;
  return db.adminUser.create({
    data: {
      email: `atx${String(Date.now()).slice(-8)}${String(seq)}@carsell.one`,
      name: 'مشغّل', role, passwordHash: 'x',
    },
  });
}

describe('A21 — القواعد تُعرض كلّها', () => {
  /**
   * **المعطَّلة تُعرض ولا تُخفى.** وهي أكبر انكشافٍ ماليّ في المنتج،
   * وإخفاؤها يجعله غير مرئيّ لمن يديره.
   */
  it('الملخّص يفصل المفعَّل عن المنتظِر', async () => {
    const rules = await listTaxRules();
    const summary = summarize(rules);
    expect(summary.total).toBe(rules.length);
    expect(summary.active + summary.awaiting).toBe(summary.total);
    expect(summary.awaiting).toBeGreaterThan(0);
  });

  it('كل صفّ يحمل عدد ما صدر به — فيُعرف أثر تعديله', async () => {
    const rules = await listTaxRules();
    expect(rules.every((rule) => Number.isInteger(rule.issuedCount))).toBe(true);
  });

  it('المجاميع تُحسب من الصفوف لا من عمود', async () => {
    const totals = await invoiceTotals();
    expect(totals.all).toBe(await db.taxInvoice.count());
    expect(totals.bySupply.reduce((n, row) => n + row.count, 0)).toBe(totals.all);
  });
});

describe('تعديل القاعدة بنصاب عضوين', () => {
  /**
   * **ما يحتاج حراسةً يُبنى محروسًا.** ولا يوجد مسارٌ يعدّل قاعدةً بيدٍ
   * واحدة: تفعيلُ صفٍّ ينتظر مذكرة قد ينقل الضريبة من ١٥٠ إلى ١٥٬٠٠٠.
   */
  it('الطلب وحده لا يغيّر شيئًا — والثاني ينفّذ', async () => {
    const [one, two] = await Promise.all([admin(), admin()]);
    const rule = await db.taxRule.findFirstOrThrow({ where: { active: false } });

    try {
      const asked = await requestRuleChange(
        one,
        rule.id,
        {
          taxableBase: rule.taxableBase,
          ratePct: rule.ratePct === null ? null : Number(rule.ratePct),
          invoiceIssuer: rule.invoiceIssuer,
          active: true,
          note: 'وصل التصنيف',
        },
        null,
      );
      expect(asked).toMatchObject({ ok: true, state: 'PENDING', approvals: 1, required: 2 });

      // لم يتغيّر شيء بعد
      expect((await db.taxRule.findUniqueOrThrow({ where: { id: rule.id } })).active).toBe(false);

      const request = await db.approvalRequest.findFirstOrThrow({
        where: { kind: 'TAX_RULE_CHANGE', entityId: rule.id, status: 'PENDING' },
      });

      // ولا يوافق الطالب على نفسه
      expect(await approveRuleChange(one, request.id, null)).toEqual({
        ok: false,
        reason: 'SELF_APPROVAL',
      });
      expect((await db.taxRule.findUniqueOrThrow({ where: { id: rule.id } })).active).toBe(false);

      expect(await approveRuleChange(two, request.id, null)).toEqual({
        ok: true,
        state: 'APPLIED',
      });
      expect((await db.taxRule.findUniqueOrThrow({ where: { id: rule.id } })).active).toBe(true);
    } finally {
      await db.taxRule.update({
        where: { id: rule.id },
        data: { active: rule.active, note: rule.note, updatedBy: rule.updatedBy },
      });
      await db.approvalRequest.deleteMany({ where: { entityId: rule.id } });
      const ids = [one.id, two.id];
      await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
      await db.adminUser.deleteMany({ where: { id: { in: ids } } });
    }
  });
});

describe('منح هامش الربح', () => {
  const VAT = '300000000000003';

  it('لا يُمنح لغير مسجَّل، ولا بلا مرجع', async () => {
    const operator = await admin('SUPER_ADMIN');
    const user = await db.user.create({
      data: { phone: `+96650${String(Date.now()).slice(-7)}`, name: 'اختبار هامش' },
    });
    try {
      // غير مسجَّل ⇒ يُرفض
      expect(await grantMarginScheme(operator, user.id, { approved: true, ref: 'X' }, null)).toEqual(
        { ok: false, reason: 'NOT_REGISTERED' },
      );

      await db.user.update({
        where: { id: user.id },
        data: { taxStatus: 'VAT_REGISTERED', vatNumber: VAT },
      });

      /**
       * والمرجع إلزاميّ: اعتمادٌ بلا مستندٍ يُشار إليه لا يُدافَع عنه
       * أمام مدقّق، وحقلٌ اختياريّ يُترك فارغًا في أوّل يوم ضغط.
       */
      expect(await grantMarginScheme(operator, user.id, { approved: true, ref: '' }, null)).toEqual(
        { ok: false, reason: 'REF_REQUIRED' },
      );

      expect(
        await grantMarginScheme(operator, user.id, { approved: true, ref: 'ZATCA-991' }, null),
      ).toEqual({ ok: true, approved: true });

      const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.marginSchemeApproved).toBe(true);
      expect(after.marginSchemeBy).toBe(operator.id);

      // والسحب يمحو المرجع فلا يبقى صفٌّ يقول «غير معتمَد» ويحمل مرجعًا
      await grantMarginScheme(operator, user.id, { approved: false, ref: null }, null);
      const revoked = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(revoked.marginSchemeApproved).toBe(false);
      expect(revoked.marginSchemeRef).toBeNull();
    } finally {
      await db.auditLog.deleteMany({ where: { actorId: operator.id } });
      await db.adminUser.delete({ where: { id: operator.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });
});
