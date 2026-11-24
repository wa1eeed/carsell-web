import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { REQUIRED_APPROVALS, selfApprovalBlocked, soloQuorum } from '@/lib/domain/approvals';

/**
 * ═══ §٤١ — لا إجراءَ يحتاج شخصًا ثانيًا ═══
 *
 * قرارُ المالك ٢٠٢٦-١١-٢٤: «المفروض عنده سلطه كسوبر ادمن ... طبعاً
 * كلامي عن كل القرارات اللي من هالنوع». وهو تأكيدٌ لقرار ٢٠٢٦-١٠-١٤
 * (§٣٥) **وتوسيعٌ له إلى الصنف كلِّه**.
 *
 * و§٣٥ بدّل الثابتَ في ملفٍّ وتَرَك أثرَه في موضعين لم يُقاسا:
 *
 * ① **افتراضيُّ المخطّط** بقي `2`، فمسارُ إنشاءٍ ينسى الحقل يُعيد
 *    النصابَ صامتًا — وطلبٌ يُكتب به يبقى معلّقًا ينتظر من لن يأتي.
 * ② **الصفوفُ المخزَّنة**: `selfApprovalBlocked` تقرأ `requiredApprovals`
 *    **من الصفّ لا من الثابت**، فخفضُ الثابت لا يبلغ صفًّا قديمًا.
 *
 * ولا يحرس هذا الملفُّ النصّ — ذاك البوابة ١٩ — بل الرقمَ وما يتبعه.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('النصاب واحد، ومن مصدرٍ واحد', () => {
  it('الثابتُ واحد، والطالبُ هو النصاب', () => {
    expect(REQUIRED_APPROVALS).toBe(1);
    expect(soloQuorum()).toBe(true);
  });

  it('منعُ الذاتية يتبع الرقم — فلا يَمنع عند الواحد', () => {
    expect(selfApprovalBlocked({ requestedBy: 'a', requiredApprovals: 1 }, 'a')).toBe(false);
    /** **ورفعُه إلى اثنين يُعيد السلوك القديم بلا تعديلٍ آخر.** */
    expect(selfApprovalBlocked({ requestedBy: 'a', requiredApprovals: 2 }, 'a')).toBe(true);
    expect(selfApprovalBlocked({ requestedBy: 'a', requiredApprovals: 2 }, 'b')).toBe(false);
  });

  /**
   * ═══ والافتراضيّان اثنان لا واحد ═══
   *
   * `prisma.create` بلا الحقل **لا يترك القاعدةَ تملأه**: العميلُ
   * يطبّق افتراضيَّ المخطّط ويُرسل القيمة. فهذا الفحصُ يقيس المخطّطَ
   * وحده — وهو ما تمرّ به كلُّ كتابةٍ في التطبيق.
   *
   * **وقِيس بكسره**: أعدتُ عمودَ القاعدة إلى `2` فبقي أخضر، فانكشف
   * أنّه لا يراه. فصار الفحصان اثنين، لكلِّ افتراضيٍّ واحد.
   */
  it('المخطّطُ يملأ الحقل بواحد — فكلُّ كتابةٍ تحمله', async () => {
    const row = await db.approvalRequest.create({
      data: {
        kind: 'WALLET_ADJUSTMENT',
        entityType: 'QuorumProbe',
        entityId: `probe-${String(Date.now())}`,
        payload: {},
        requestedBy: 'probe',
        approvedBy: [],
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    try {
      expect(row.requiredApprovals).toBe(1);
      expect(selfApprovalBlocked(row, 'probe')).toBe(false);
    } finally {
      /** **والاختبار يعيد ما غيّره.** */
      await db.approvalRequest.delete({ where: { id: row.id } });
    }
  });

  /**
   * **وعمودُ القاعدة يُقرأ من القاعدة.** كتابةٌ من خارج Prisma — ترحيلٌ
   * أو إصلاحٌ بيدٍ في psql — تأخذ هذا الافتراضيّ لا ذاك.
   */
  it('وعمودُ القاعدة افتراضيُّه واحد', async () => {
    const rows = await db.$queryRaw<{ column_default: string | null }[]>`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'ApprovalRequest' AND column_name = 'requiredApprovals'
    `;
    expect(rows[0]?.column_default).toBe('1');
  });

  it('ولا صفَّ معلَّقًا في القاعدة يشترط أكثر من واحد', async () => {
    const stuck = await db.approvalRequest.count({
      where: { status: 'PENDING', requiredApprovals: { gt: 1 } },
    });
    expect(stuck).toBe(0);
  });
});
