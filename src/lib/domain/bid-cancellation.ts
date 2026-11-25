import { db } from '@/lib/db';
import { notify } from './notifications';

/**
 * ═══ إلغاء مزايدة — قرار المالك ٢٠٢٦-١١-٢٥ ═══
 *
 * كان `AuctionEventKind` يحمل تعليقًا: «ولا قيمةَ هنا بلا كاتب —
 * والإلغاء قاعدةُ عملٍ لم تُقرَّر بعد، فلا تُعرَّف قيمتُه قبل أن
 * يُعرَف من يملكه وبأيّ سبب». وقد قُرِّر.
 *
 * ═══ وللأدمن وحده ═══
 *
 * مزايدٌ يسحب متى شاء يُفرغ المزاد من معناه — وهي علّةُ العربون نفسُها
 * (القاعدة ٩): مزايدةٌ بلا كلفةِ انسحاب ليست التزامًا. فالإلغاء
 * لسببٍ يراه الفريق — إخلالٌ بالشروط، حسابٌ مُنتحَل، رقمٌ كُتب بخانةٍ
 * زائدة — لا رأيًا يبدو لصاحبها.
 *
 * ═══ وما دام المزاد حيًّا وحده ═══
 *
 * بعد الإغلاق للمزايدة أثرٌ في العالم: فائزٌ أُعلن، وعرابينُ سُوّيت،
 * وطلبٌ قد أُنشئ. فنقضُها هناك ليس حذفَ صفٍّ بل فكَّ معاملة — وطريقُه
 * النزاع. والترميزُ نفسُه يرسم البطاقة على مزادٍ جارٍ.
 */
export type CancelBidFailure =
  | 'BID_NOT_FOUND'
  | 'AUCTION_CLOSED'
  | 'REASON_REQUIRED';

export type CancelBidResult =
  | {
      ok: true;
      listingRef: string;
      /** ما استقرّ عليه السعر بعد خروجها — و`null` إن لم تبقَ مزايدة. */
      topAmount: string | null;
      /** من صار في الصدارة — و`null` إن لم تبقَ مزايدة. */
      topBidderId: string | null;
    }
  | { ok: false; reason: CancelBidFailure };

/** أقصرُ سببٍ مقبول — و«خطأ» وحدها لا تقول للمزايد شيئًا. */
const MIN_REASON = 6;

export async function cancelBid(
  input: { bidId: string; adminId: string; reason: string; ip?: string | null },
  now: Date = new Date(),
): Promise<CancelBidResult> {
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) return { ok: false, reason: 'REASON_REQUIRED' };

  return db.$transaction(async (tx) => {
    const bid = await tx.bid.findUnique({
      where: { id: input.bidId },
      include: {
        auction: {
          select: {
            id: true,
            status: true,
            endsAt: true,
            listing: { select: { ref: true } },
          },
        },
      },
    });
    if (bid === null) return { ok: false, reason: 'BID_NOT_FOUND' };

    /**
     * **والحالةُ وانقضاءُ الوقت معًا** — قاعدةٌ مسجَّلة: `LIVE` مخزَّنة
     * والوظيفةُ الدورية لم تمرّ بعد، فمزادٌ انقضى وقتُه يُقرأ حيًّا.
     */
    if (bid.auction.status !== 'LIVE' || bid.auction.endsAt <= now) {
      return { ok: false, reason: 'AUCTION_CLOSED' };
    }

    /**
     * **وتنتقل لا تُعلَّم.** ثمانيةٌ وثلاثون موضعًا تقرأ `Bid`، وعَلَمٌ
     * يُلزمها كلَّها بتذكّر مرشّحه — ومنسيٌّ واحد يعرض سعرًا أُلغي.
     */
    await tx.cancelledBid.create({
      data: {
        auctionId: bid.auctionId,
        bidderId: bid.bidderId,
        amount: bid.amount,
        isAuto: bid.isAuto,
        placedAt: bid.createdAt,
        cancelledAt: now,
        cancelledById: input.adminId,
        reason,
      },
    });
    await tx.bid.delete({ where: { id: bid.id } });

    await tx.auctionEvent.create({
      data: { auctionId: bid.auctionId, kind: 'BID_CANCELLED', createdAt: now },
    });

    /**
     * **ولا يُلمَس العربون.** الإلغاء قرارٌ في مزايدةٍ لا في مزايد:
     * عربونُه باقٍ وله أن يزايد من جديد. ومن استحقّ إيقافًا فبابُه
     * `users.suspend`، وخلطُهما يجعل خطأً في رقمٍ عقوبةً على حساب.
     */
    const top = await tx.bid.findFirst({
      where: { auctionId: bid.auctionId },
      orderBy: { amount: 'desc' },
      select: { amount: true, bidderId: true },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.adminId,
        actorType: 'admin',
        entity: 'Bid',
        entityId: bid.id,
        action: 'bid.cancel',
        before: { amount: bid.amount.toString(), bidderId: bid.bidderId, isAuto: bid.isAuto },
        after: { reason, topAfter: top === null ? null : top.amount.toString() },
        ip: input.ip ?? null,
        createdAt: now,
      },
    });

    /**
     * **ويُخبَر صاحبُها بسببها.** إلغاءٌ صامت يجعل من رأى مزايدتَه
     * تختفي يحسب العطل في النظام، فيعيدها — أو يترك المزاد.
     */
    await notify(
      {
        userId: bid.bidderId,
        templateKey: 'auction.bid_cancelled',
        priority: 'critical',
        payload: {
          ref: bid.auction.listing.ref,
          reason,
          amount: bid.amount.toString(),
        },
        entityType: 'Auction',
        entityId: bid.auctionId,
      },
      tx,
    );

    /**
     * **ومن عاد إلى الصدارة يُخبَر كما يُخبَر من فقدها.** قُرئ له
     * «تم تجاوزك» قبل قليل، فيبقى يحسب نفسه خاسرًا وهو المتصدّر —
     * وذاك يُسكته عن المزاد في وقتٍ هو أحوج ما يكون فيه إلى متابعته.
     */
    if (top !== null && top.bidderId !== bid.bidderId) {
      await notify(
        {
          userId: top.bidderId,
          templateKey: 'auction.lead_restored',
          priority: 'critical',
          payload: { ref: bid.auction.listing.ref, amount: top.amount.toString() },
          entityType: 'Auction',
          entityId: bid.auctionId,
        },
        tx,
      );
    }

    return {
      ok: true,
      listingRef: bid.auction.listing.ref,
      topAmount: top === null ? null : top.amount.toString(),
      topBidderId: top?.bidderId ?? null,
    };
  });
}
