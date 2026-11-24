import { db } from '@/lib/db';
import { DUPLICATE_MAX_DISTANCE, hammingDistance, matchPercent } from '@/lib/images/phash';

/**
 * ═══ كشفُ الصورة المكرّرة — قاعدةٌ واحدة في موضعٍ واحد ═══
 *
 * كانت `findDuplicate` ترفع الراية بمسافة هامينغ على **كل** صور الإعلان،
 * وشاشةُ المراجعة تجمع الدليل بتطابقٍ **تامّ** على **أوّل** صورة — فإعلانٌ
 * رُشّح بمسافة ٣، أو بصورته الثالثة، يُعرض للمراجع **بلا دليلٍ أصلًا**:
 * وسمٌ يقول «صورة مكرّرة» ولا صورة يراها ولا مرجعَ يفتحه. فالقرار يقع على
 * اسمِ الراية لا على ما رفعها.
 *
 * فالبحثُ هنا وحده: من يرفع الراية ومن يجمع دليلَها يقرآن الدالّة نفسها.
 * وهي بلا `sharp` ليستوردها الأدمن بلا أن يجرّ المعالجة معه.
 */
/**
 * صورة مكرّرة من إعلان آخر.
 *
 * القرار ٣٣ يُدخل الإعلان المراجعةَ عند التكرار — **ولا يرفضه**: صاحب
 * إعلانين لسيارة واحدة قد يعيد نفس الصورة بحسن نيّة، والرفض يعاقبه
 * بينما المراجعة تكشف الناسخ.
 */
export async function findDuplicate(
  phash: string,
  except?: { listingId?: string; sellerId?: string },
): Promise<{ listingRef: string; distance: number } | null> {
  /**
   * **التكرار يُقاس مع إعلان مستخدمٍ آخر.**
   *
   * وبائعٌ يعيد صورة سيارته في إعلانٍ ثانٍ له ليس ناسخًا — وإدخالُه
   * المراجعة يعاقب سلوكًا مشروعًا ويُغرق طابور A15 بما لا يستحقّه.
   * وهذا نصّ القرار ٣٣ على `ReviewReason.DUPLICATE_IMAGE`.
   */
  const candidates = await db.listingImage.findMany({
    where: {
      phash: { not: null },
      ...(except?.listingId === undefined ? {} : { listingId: { not: except.listingId } }),
      ...(except?.sellerId === undefined
        ? {}
        : { listing: { sellerId: { not: except.sellerId } } }),
    },
    select: { phash: true, listing: { select: { ref: true } } },
  });

  for (const candidate of candidates) {
    if (candidate.phash === null) continue;
    const distance = hammingDistance(phash, candidate.phash);
    if (distance <= DUPLICATE_MAX_DISTANCE) {
      return { listingRef: candidate.listing.ref, distance };
    }
  }
  return null;
}

export type DuplicateMatch = {
  /** الصورة المرفوعة — ما يراه المراجع في اليسار */
  selfKey: string;
  otherKey: string;
  otherRef: string;
  /** المسافة هي الحقيقة، والنسبة صياغتُها */
  distance: number;
  matchPct: number;
  otherClosedAt: Date | null;
  /** أالإعلانُ الآخر معروضٌ الآن؟ — صورةٌ واحدة في إعلانين قائمين أثقل */
  otherLive: boolean;
};

/**
 * دليلُ التكرار للمراجعة — **يُجمع كما تُرفع الراية**.
 *
 * كلُّ صور الإعلان في مقابل كل صور غيره، بمسافة هامينغ لا بتطابقٍ تامّ،
 * واستثناءُ البائع نفسِه كما في `findDuplicate` (قرار ٣٣: من يعيد صورةَ
 * سيارته في إعلانه الثاني ليس ناسخًا). ويُعاد **أقربُ** مطابقٍ لا أوّلُه:
 * المراجع يحكم على أقوى دليلٍ قائم.
 *
 * ولا يُخزَّن — الإعلان المطابق يُحذف ويُغلق، فدليلٌ محفوظ يقول «٩٤٪» ولا
 * شيء يطابقه اليوم.
 */
export async function duplicateEvidence(input: {
  listingId: string;
  sellerId: string;
}): Promise<DuplicateMatch | null> {
  const own = await db.listingImage.findMany({
    where: { listingId: input.listingId, phash: { not: null } },
    select: { phash: true, r2Key: true },
    orderBy: { sort: 'asc' },
  });
  if (own.length === 0) return null;

  const candidates = await db.listingImage.findMany({
    where: {
      phash: { not: null },
      listingId: { not: input.listingId },
      listing: { sellerId: { not: input.sellerId } },
    },
    select: {
      phash: true,
      r2Key: true,
      listing: { select: { ref: true, status: true, closedAt: true } },
    },
  });

  let best: DuplicateMatch | null = null;

  for (const mine of own) {
    if (mine.phash === null) continue;
    for (const candidate of candidates) {
      if (candidate.phash === null) continue;
      const distance = hammingDistance(mine.phash, candidate.phash);
      if (distance > DUPLICATE_MAX_DISTANCE) continue;
      if (best !== null && distance >= best.distance) continue;

      best = {
        selfKey: mine.r2Key,
        otherKey: candidate.r2Key,
        otherRef: candidate.listing.ref,
        distance,
        matchPct: matchPercent(distance),
        otherClosedAt: candidate.listing.closedAt,
        otherLive: candidate.listing.status === 'PUBLISHED',
      };
      // لا أقربَ من التامّ — فلا يُقرأ الباقي
      if (distance === 0) return best;
    }
  }

  return best;
}
