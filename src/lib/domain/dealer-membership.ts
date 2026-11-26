import type { DealerRole } from '@/generated/prisma/enums';

/**
 * ═══ «أهذا عضوٌ في معرضٍ معتمد؟» — سؤالٌ له جوابٌ واحد ═══
 *
 * كان يُجاب في ثلاثة مواضع، **ومنها موضعٌ يقرأ عمودًا آخر**: بابُ
 * اللوحة في صفحة الحساب كان يفحص `dealerId` وحده، و`openDealerSession`
 * تفحص `dealerRole`. فحسابٌ له `dealerId` بلا دورٍ — وهو حالُ كلّ صفٍّ
 * زُرع قبل أن يوجد العمود — **يرى زرَّ «لوحة المعرض» ثمّ يُقال له
 * «لست عضوا في أي معرض»**. والتعليقُ هناك كان يَعِد بأنّ الشرطين واحد.
 *
 * فالشرطُ هنا وحده، يقرؤه الحارسُ والشاشتان معًا — وإلّا عادت نسخةٌ
 * تتساهل فتعرض بابًا يردّ، أو تتشدّد فتخفي بابًا يفتح.
 *
 * **وهذه الوحدةُ بلا Prisma** ليستوردها مكوّنُ العميل (`EnterPanel`)
 * بلا أن يجرّ `db` إلى حزمة المتصفّح.
 */
export const DEALER_MEMBERSHIP_SELECT = {
  dealerRole: true,
  dealer: { select: { id: true, nameAr: true, status: true, verified: true } },
} as const;

export type DealerMembershipRow = {
  dealerRole: DealerRole | null;
  dealer: { id: string; nameAr: string; status: string; verified: boolean } | null;
};

export type DealerMembership =
  | {
      state: 'MEMBER';
      dealerId: string;
      dealerName: string;
      role: DealerRole;
      /**
       * **أفُحص سجلُّه التجاريّ؟** — غيرُ «أيعمل؟». قرار المالك
       * ٢٠٢٦-١١-٢٦: المعرضُ يعمل من أوّل دقيقة ولا يصل السوقَ منه
       * إعلانٌ حتى تُراجَع أوراقُه. فتقرؤه الشاشةُ لتقوله قبل أن
       * يبذل الجهد، والحارسُ في `publish.ts` ليفرضه.
       */
      verified: boolean;
    }
  | { state: 'NOT_A_MEMBER' }
  | { state: 'DEALER_NOT_ACTIVE'; dealerName: string };

/**
 * **والعمودان يُفحصان معًا لا أحدُهما.** `dealerId` بلا `dealerRole`
 * ليس عضويّةً ناقصةً يُتساهَل فيها: هو صفٌّ لا يعرف هذا المنتجُ
 * كتابتَه — الكاتبُ الوحيد (قبولُ الدعوة) يكتب الاثنين معًا.
 */
export function dealerMembership(row: DealerMembershipRow | null): DealerMembership {
  if (row === null || row.dealer === null || row.dealerRole === null) {
    return { state: 'NOT_A_MEMBER' };
  }
  if (row.dealer.status !== 'ACTIVE') {
    return { state: 'DEALER_NOT_ACTIVE', dealerName: row.dealer.nameAr };
  }
  return {
    state: 'MEMBER',
    dealerId: row.dealer.id,
    dealerName: row.dealer.nameAr,
    role: row.dealerRole,
    verified: row.dealer.verified,
  };
}
