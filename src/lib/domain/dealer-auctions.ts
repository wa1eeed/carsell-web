import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import type { AuctionStatus } from '@/generated/prisma/enums';

/**
 * ═══ مزاداتُ المعرض — `D4` ═══
 *
 * **والاحتياطيُّ يُعرض لصاحبه وحده.** `reservePrice` لا يخرج في أيّ
 * استجابةٍ عامّة (قرار ٢٩)، **وهذه ليست عامّة**: المعرضُ يراه على
 * مزاداته هو — وبدونه لا يستطيع أن يقرّر عند الإغلاق. والحصرُ في
 * الاستعلام لا بعده.
 */
function scope(dealerId: string, branchId: string | null) {
  return { dealerId, ...(branchId === null ? {} : { branchId }) };
}

/**
 * شرائحُ الترميز الثلاث.
 *
 * **و«جارية» بالحالة والوقت معًا** (قاعدةٌ مسجَّلة): مزادٌ انقضى وقتُه
 * ولم تمرّ عليه الوظيفةُ الدورية حالتُه `LIVE` بعد — فيُعرض «مباشر»
 * بعدّادٍ سالب.
 */
export type AuctionBucket = 'LIVE' | 'SCHEDULED' | 'UNMET';

export const AUCTION_BUCKETS: readonly AuctionBucket[] = ['LIVE', 'SCHEDULED', 'UNMET'];

function bucketWhere(bucket: AuctionBucket, now: Date): Prisma.AuctionWhereInput {
  switch (bucket) {
    case 'LIVE':
      return { status: 'LIVE', endsAt: { gt: now } };
    case 'SCHEDULED':
      return { status: 'SCHEDULED' };
    case 'UNMET':
      return { status: 'ENDED_UNMET' };
  }
}

export type DealerAuction = {
  listingRef: string;
  vehicle: string;
  status: AuctionStatus;
  startsAt: string;
  endsAt: string;
  /** **أقلُّ تقديرٍ للوقت**: الحالةُ وحدها تكذب بعد انقضاء الموعد. */
  overdue: boolean;
  bidderCount: number;
  topBid: string | null;
  /** احتياطيُّ صاحبه — و`null` حين لا احتياطيَّ له. */
  reserve: string | null;
  /** الفارقُ عن الاحتياطيّ: موجبٌ تجاوزه، وسالبٌ دونه، و`null` بلا احتياطي. */
  gap: string | null;
  /** مهلةُ قرار البائع حين لم يبلغ الاحتياطي. */
  decisionDueAt: string | null;
};

export async function dealerAuctions(
  dealerId: string,
  branchId: string | null,
  bucket: AuctionBucket = 'LIVE',
  now: Date = new Date(),
): Promise<DealerAuction[]> {
  const rows = await db.auction.findMany({
    where: {
      AND: [{ listing: { vehicle: scope(dealerId, branchId) } }, bucketWhere(bucket, now)],
    },
    orderBy: { endsAt: 'asc' },
    take: 100,
    select: {
      status: true, startsAt: true, endsAt: true, reservePrice: true,
      sellerDecisionDueAt: true,
      listing: {
        select: {
          ref: true,
          vehicle: {
            select: {
              year: true,
              brand: { select: { nameAr: true } },
              model: { select: { nameAr: true } },
              trim: { select: { nameAr: true } },
            },
          },
        },
      },
      bids: { orderBy: { amount: 'desc' }, select: { amount: true, bidderId: true } },
    },
  });

  return rows.map((row) => {
    const top = row.bids[0]?.amount ?? null;
    const reserve = row.reservePrice;
    const vehicle = [
      row.listing.vehicle.brand.nameAr,
      row.listing.vehicle.model.nameAr,
      row.listing.vehicle.trim?.nameAr,
      String(row.listing.vehicle.year),
    ]
      .filter((part) => part !== null && part !== undefined && part !== '')
      .join(' ');

    return {
      listingRef: row.listing.ref,
      vehicle,
      status: row.status,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      overdue: row.endsAt.getTime() <= now.getTime(),
      /** **والمزايدون عددُ أشخاصٍ لا عددُ مزايدات.** */
      bidderCount: new Set(row.bids.map((bid) => bid.bidderId)).size,
      topBid: top === null ? null : top.toFixed(2),
      reserve: reserve === null ? null : reserve.toFixed(2),
      gap: reserve === null || top === null ? null : top.minus(reserve).toFixed(2),
      decisionDueAt: row.sellerDecisionDueAt?.toISOString() ?? null,
    };
  });
}

export async function dealerAuctionBuckets(
  dealerId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<Record<AuctionBucket, number>> {
  const mine: Prisma.AuctionWhereInput = { listing: { vehicle: scope(dealerId, branchId) } };
  const counts = await Promise.all(
    AUCTION_BUCKETS.map((bucket) =>
      db.auction.count({ where: { AND: [mine, bucketWhere(bucket, now)] } }),
    ),
  );
  return Object.fromEntries(
    AUCTION_BUCKETS.map((bucket, index) => [bucket, counts[index] ?? 0]),
  ) as Record<AuctionBucket, number>;
}

/**
 * يتحقّق أنّ هذا المزاد على مركبةٍ يملكها هذا المعرض، في فرعِ عضوه.
 *
 * **والسؤالُ غيرُ سؤال المتجر**: مسارُ القرار العامّ يسأل «أأنت
 * البائع؟»، ومديرُ المعرض ليس بائعًا والمزادُ على مركبة معرضه.
 * ويُرجَع `null` لا «ممنوع» — وجودُ المزاد نفسُه معلومة.
 */
export async function dealerAuctionId(
  dealerId: string,
  branchId: string | null,
  listingRef: string,
): Promise<string | null> {
  const auction = await db.auction.findFirst({
    where: { listing: { ref: listingRef, vehicle: scope(dealerId, branchId) } },
    select: { id: true },
  });
  return auction?.id ?? null;
}
