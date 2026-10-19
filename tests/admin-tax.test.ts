import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { issueInvoice } from '@/lib/domain/tax';
import {
  approveRuleChange,
  grantMarginScheme,
  invoiceTotals,
  listInvoices,
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

  /**
   * ═══ وجدولٌ فارغ لا يُثبت شيئًا ═══
   *
   * الفحوص أعلاه تمرّ على صفر فاتورة: المجاميع صفرٌ، والصفوف لا
   * تُقرأ، **وفرعُ الجدول الذي يعرضها لا يُصيَّر قطّ**. وقد سقط ذلك
   * الفرع من قبل بتمرير دالّةٍ عبر حدّ الخادم، فلم يكشفه إلّا طلبٌ
   * بـ`curl` — لأن لا فاتورة في القاعدة ولا اختبارٍ يصنع واحدة.
   *
   * وصفرُ الفواتير اليوم **صحيح**: عمولتنا ٠٪ وقاعدة المركبة تنتظر
   * المذكّرة الضريبية. فالاختبار يُصدر فاتورته بنفسه ويحذفها.
   */
  it('الصفّ يُقرأ كما يُعرض — على فاتورةٍ حقيقية', async () => {
    const issued = await issueInvoice({
      sellerType: 'INDIVIDUAL',
      buyerType: 'INDIVIDUAL',
      supplyType: 'COMMISSION',
      amount: '2300.00',
      supplierName: 'كارز CARZ',
      customerName: 'مشترٍ للاختبار',
      description: 'commission',
      suppliedAt: new Date(),
    });

    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    try {
      const rows = await listInvoices(5, 'COMMISSION');
      const row = rows.find((entry) => entry.number === issued.number);

      expect(row).toBeDefined();
      expect(row?.supplyType).toBe('COMMISSION');
      /** **والضريبة مضمَّنة**: ١٥/١١٥ من المبلغ، لا ١٥٪ فوقه. */
      expect(Number(row?.total)).toBeCloseTo(2300, 2);
      expect(Number(row?.subtotal) + Number(row?.taxTotal)).toBeCloseTo(2300, 2);
      expect(Number(row?.taxTotal)).toBeGreaterThan(0);

      const totals = await invoiceTotals();
      expect(totals.all).toBeGreaterThan(0);
      expect(totals.bySupply.some((entry) => entry.count > 0)).toBe(true);
    } finally {
      /** **والاختبار يعيد ما غيّره** — والفاتورة تحمل تسلسلًا. */
      await db.taxInvoiceLine.deleteMany({ where: { invoiceId: issued.invoiceId } });
      await db.taxInvoice.delete({ where: { id: issued.invoiceId } });
    }
  });
});

describe('تعديل القاعدة بنصاب عضوين', () => {
  /**
   * **ما يحتاج حراسةً يُبنى محروسًا.** ولا يوجد مسارٌ يعدّل قاعدةً بيدٍ
   * واحدة: تفعيلُ صفٍّ ينتظر مذكرة قد ينقل الضريبة من ١٥٠ إلى ١٥٬٠٠٠.
   */
  /** ═══ ونصابُ الواحد: الطلبُ يُطبِّق (قرار المالك ٢٠٢٦-١٠-١٤) ═══ */
  it('الطلب يطبّق في النداء نفسه، ولا يُعتمد مرّتين', async () => {
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
      expect(asked).toMatchObject({ ok: true, state: 'APPLIED' });

      // والقاعدة تبدّلت في النداء نفسه
      expect((await db.taxRule.findUniqueOrThrow({ where: { id: rule.id } })).active).toBe(true);

      // ولم يبقَ معلَّقٌ ينتظر أحدًا
      const request = await db.approvalRequest.findFirstOrThrow({
        where: { kind: 'TAX_RULE_CHANGE', entityId: rule.id },
        orderBy: { id: 'desc' },
      });
      expect(request.status).not.toBe('PENDING');
      /** الطالبُ يُكتب ساعةَ الطلب، ثمّ يُضاف عند التنفيذ — فيظهر مرّتين. */
      expect(request.approvedBy[0]).toBe(one.id);

      // ولا يُعتمد مرّتين
      expect(await approveRuleChange(two, request.id, null)).toMatchObject({ ok: false });
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

describe('هامشُ الربح — والقراءة التي تعرضه', () => {
  /**
   * ═══ ومُنِح من لا باب له ═══
   *
   * `grantMarginScheme` مبنيّةٌ ومختبَرة منذ كُتبت، **ولا ينادِيها
   * شيء في المنتج**. فبائعٌ مسجَّلٌ يستحقّ احتساب الضريبة على الهامش
   * تُحتسب عليه على **كامل السعر** إلى الأبد — فرقٌ يخرج من جيبه في
   * كل بيعة. وصفحةُ المعرض تعرض «مرجع هامش الربح» متى مُنح: تعرض ما
   * لا سبيل إلى منحه.
   *
   * فالفحص هنا على **ما تراه الشاشة**: القراءة التي تُغذّي لوحة المنح.
   */
  it('قراءةُ العميل تُظهر المنح ومرجعه', async () => {
    const { adminUserDetail } = await import('@/lib/domain/admin-entity-detail');
    const operator = await admin('SUPER_ADMIN');
    const user = await db.user.create({
      data: {
        phone: `+96650${String(Date.now()).slice(-7)}`,
        name: 'اختبار قراءة الهامش',
        taxStatus: 'VAT_REGISTERED',
        vatNumber: '300000000000003',
      },
    });

    const before = await adminUserDetail(user.id);
    expect(before?.marginSchemeApproved).toBe(false);

    const granted = await grantMarginScheme(
      operator, user.id, { approved: true, ref: 'ZATCA-2026-001' }, null,
    );
    expect(granted.ok).toBe(true);

    const after = await adminUserDetail(user.id);
    expect(after?.marginSchemeApproved).toBe(true);
    expect(after?.marginSchemeRef).toBe('ZATCA-2026-001');
    /** والتاريخ يُعرض — فالمراجع يسأل «متى مُنح» لا «أمُنح». */
    expect(after?.marginSchemeAt).not.toBeNull();

    await grantMarginScheme(operator, user.id, { approved: false, ref: null }, null);
    const revoked = await adminUserDetail(user.id);
    expect(revoked?.marginSchemeApproved).toBe(false);
    // **والمرجع يُمسح مع السحب** — ومرجعٌ باقٍ بلا منحٍ يُقرأ منحًا
    expect(revoked?.marginSchemeRef).toBeNull();

    // الاختبار يعيد ما صنعه
    await db.auditLog.deleteMany({ where: { entityId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});
