import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { holdDeposit, placeBid, publishBid } from '@/lib/domain/auctions';

export const runtime = 'nodejs';

const Body = z.object({ amount: z.number().int().positive().max(100_000_000) });

const MESSAGES: Record<string, { ar: string; en: string }> = {
  NOT_LIVE: { ar: 'المزاد لم يبدأ بعد.', en: 'This auction is not live yet.' },
  ENDED: { ar: 'انتهى المزاد.', en: 'This auction has ended.' },
  OWN_AUCTION: { ar: 'لا تزايد على مركبتك.', en: 'You cannot bid on your own vehicle.' },
  BELOW_MINIMUM: { ar: 'المبلغ دون أقلّ مزايدة مقبولة.', en: 'Below the minimum next bid.' },
  NO_DEPOSIT: { ar: 'يلزم حجز العربون قبل المزايدة.', en: 'A deposit is required before bidding.' },
  PROFILE_INCOMPLETE: {
    ar: 'أكمل بريدك وتوثيق هويتك قبل المزايدة.',
    en: 'Complete your email and identity before bidding.',
  },
  NOT_OPEN: { ar: 'المزاد لا يقبل عربونًا الآن.', en: 'This auction is not accepting deposits.' },
};

function message(code: string, locale: 'ar' | 'en'): string {
  const entry = MESSAGES[code];
  if (entry === undefined) return locale === 'ar' ? 'تعذّرت المزايدة.' : 'Could not place the bid.';
  return locale === 'ar' ? entry.ar : entry.en;
}

/**
 * `POST /api/v1/auctions/{ref}/bids` — مزايدة.
 *
 * **ولم يكن له وجود.** `placeBid` و`holdDeposit` مبنيّتان ومختبَرتان
 * منذ المهمة ١٩، والمسار يصدّر `GET` وحده، وزرّ «زايد» في الشاشة بلا
 * `onClick` — فالمزاد يُعرض ولا يُزايَد فيه.
 *
 * ═══ والعربون يُحجز قبل المزايدة — القاعدة ٩ ═══
 *
 * ⚠️ **وحجزُه اليوم دفتريّ لا ماليّ**: `holdDeposit` تكتب `HELD` بيدها
 * ولا تمرّ ببوابة. والغرض `AUCTION_DEPOSIT` موجّهٌ ومضبوط ولا يناديه
 * أحد. فالعربون لا يجعل المزايدة التزامًا ما دام لا مال محجوزًا —
 * والمصادرة عند الانسحاب تصادر رقمًا في جدولنا. مذكورٌ في NOTES.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ amount: 'INVALID' }), 422);

  const { ref } = await params;
  const auction = await db.auction.findFirst({
    where: { listing: { ref } },
    select: { id: true },
  });
  if (auction === null) return fail(ERRORS.NOT_FOUND, 404);

  /**
   * **الملف يُفحص هنا كما في الشراء والنشر** — والمزايدة التزامٌ ماليّ
   * مثلهما. والقاعدة في `profileCompletion` وحدها فلا تتباعد المواضع.
   */
  const { profileCompletion } = await import('@/lib/domain/profile');
  if (!profileCompletion(user).canBuy) {
    return fail(
      { code: 'PROFILE_INCOMPLETE', messageAr: message('PROFILE_INCOMPLETE', 'ar'), messageEn: message('PROFILE_INCOMPLETE', 'en') },
      428,
    );
  }

  /**
   * العربون أوّلًا — و«محجوزٌ سلفًا» ليست خطأً: من زايد مرّةً لا
   * يُطالَب بعربونٍ ثانٍ، والمزايدة تمضي.
   */
  const deposit = await holdDeposit({ auctionId: auction.id, userId: user.id });
  if (!deposit.ok && deposit.reason !== 'ALREADY_HELD') {
    return fail(
      { code: deposit.reason, messageAr: message(deposit.reason, 'ar'), messageEn: message(deposit.reason, 'en') },
      409,
    );
  }

  const result = await placeBid({
    auctionId: auction.id,
    bidderId: user.id,
    amount: parsed.data.amount,
  });

  if (!result.ok) {
    return fail(
      { code: result.reason, messageAr: message(result.reason, 'ar'), messageEn: message(result.reason, 'en') },
      result.reason === 'AUCTION_NOT_FOUND' ? 404 : 409,
    );
  }

  // البثّ بعد نجاح المعاملة — ومزايدةٌ تُبثّ ثم تسقط تُري الجميع سعرًا لم يقع
  await publishBid(result, auction.id, user.name).catch(() => undefined);

  return ok(result, undefined, { status: 201 });
}
