import type { DealerRole } from '@/generated/prisma/enums';

/**
 * ═══ من يردّ على العرض — طرفٌ لا شخص ═══
 *
 * قواعدُ التفاوض بُنيت ليومٍ كان البائعُ فيه فردًا: `sellerId` عمودٌ
 * واحد، والردُّ لصاحبه وحده. ثمّ صار للمعرض فريقٌ وأدوار — **وبقي
 * الشرطُ شخصيًّا**: `acceptOffer` تفحص `accepter !== actorId`، فمديرٌ
 * أو بائعٌ في المعرض يرى العرضَ في لوحته وفوقه «اقبل» ويردّ الخادمُ
 * «لست البائع».
 *
 * وهو صنفُ «الشاشة تَعِد بما لا يقع» بعينه: `deskOffers` تجمع عروضَ
 * **المعرض** (لا عروضَ المالك)، والشريطُ يُظهر الشاشة لـ`SALES`
 * و`MANAGER`، والبوابةُ تردّهما. فالزرُّ معروضٌ لمن لا يستطيع.
 *
 * ═══ والعلاجُ طرفٌ واحد يُسأل عنه مرّةً ═══
 *
 * فالطرفُ المستقبِل ليس «المستخدم صاحب العمود» بل **جهةٌ**: مشترٍ،
 * أو بائعٌ هو فردٌ أو معرضٌ بفريقه. ويُحسب هنا — دالّةٌ خالصة بلا
 * `db` — فيقرؤها القبولُ والمقابلُ والرفض، ولا ثلاثُ نسخٍ تتباعد.
 */
export type OfferActor = {
  userId: string;
  /**
   * عضويّتُه في معرضٍ إن دخل من اللوحة. و`null` للفرد — **ولا تُشتقّ
   * من جلسة المتجر**: من يردّ باسم معرضٍ يفعلها وجلستُه جلسةُ لوحته،
   * فيبقى الأثرُ منسوبًا إلى دورٍ لا إلى حسابٍ عامّ.
   */
  dealer?: { dealerId: string; role: DealerRole } | null;
};

export type OfferSides = {
  /** مقابلٌ أرسله البائع — فالمستقبِلُ مشترٍ. */
  parentOfferId: string | null;
  buyerId: string;
  sellerId: string;
  /** معرضُ **مركبة** الإعلان — و`null` لبائعٍ فرد. */
  listingDealerId: string | null;
};

/**
 * **ومن يبيع يفاوض** — والمحاسبُ لا. وهي أدوارُ شاشة العروض نفسُها
 * (`page.tsx` يردّ `ACCOUNTANT`)، فلو تباعدتا لرأى زرًّا يُردّ عليه.
 */
const SELLING_ROLES: readonly DealerRole[] = ['OWNER', 'MANAGER', 'SALES'];

export type OfferSide = 'BUYER' | 'SELLER' | null;

/** على أيّ طرفٍ يقف هذا الفاعل من هذا العرض؟ */
export function offerSide(sides: OfferSides, actor: OfferActor): OfferSide {
  if (actor.userId === sides.buyerId) return 'BUYER';
  if (actor.userId === sides.sellerId) return 'SELLER';

  const membership = actor.dealer ?? null;
  if (
    membership !== null &&
    sides.listingDealerId !== null &&
    membership.dealerId === sides.listingDealerId &&
    SELLING_ROLES.includes(membership.role)
  ) {
    return 'SELLER';
  }

  return null;
}

/**
 * **والمُرسِلُ لا يردّ على نفسه**: الأصلُ من المشتري فيُجيبه البائع،
 * والمقابلُ من البائع فيُجيبه المشتري. (وهي القاعدة القائمة في
 * `acceptOffer` و`declineOffer` — نُقلت ولم تُبدَّل.)
 */
export function mayAnswerOffer(sides: OfferSides, actor: OfferActor): boolean {
  const recipient: OfferSide = sides.parentOfferId !== null ? 'BUYER' : 'SELLER';
  return offerSide(sides, actor) === recipient;
}

/** والمقابلُ من البائع وحده — كما كان. */
export function mayCounterOffer(sides: OfferSides, actor: OfferActor): boolean {
  return offerSide(sides, actor) === 'SELLER';
}
