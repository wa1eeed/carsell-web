import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { mayAnswerOffer, mayCounterOffer, offerSide } from '@/lib/domain/offer-authority';
import { acceptOffer, declineOffer } from '@/lib/domain/offers';
import { deskCounts, deskOffers } from '@/lib/domain/dealer-desk';
import { attachPanel, openPanel } from '@/lib/auth/panel-handoff';
import { DEALER_COOKIE } from '@/lib/auth/dealer-session';
import { DEALER_MEMBERSHIP_SELECT, dealerMembership } from '@/lib/domain/dealer-membership';
import { NextResponse } from 'next/server';

/**
 * ═══ من يردّ على العرض — طرفٌ لا شخص ═══
 *
 * قواعدُ التفاوض بُنيت لبائعٍ فرد، ثمّ صار للمعرض فريق: فمديرٌ أو
 * بائعٌ يرى العرضَ في لوحته وفوقه «اقبل» ويردّ الخادمُ «لست البائع».
 */

const SIDES = {
  parentOfferId: null,
  buyerId: 'buyer-1',
  sellerId: 'owner-1',
  listingDealerId: 'dealer-1',
};

describe('offerSide', () => {
  it('يعرف الطرفين بالعمودين', () => {
    expect(offerSide(SIDES, { userId: 'buyer-1' })).toBe('BUYER');
    expect(offerSide(SIDES, { userId: 'owner-1' })).toBe('SELLER');
    expect(offerSide(SIDES, { userId: 'stranger' })).toBe(null);
  });

  /** **وعضوُ المعرض طرفٌ بائع** — وهو العطلُ الذي بُنيت له الدالّة. */
  it('ويجعل عضو المعرض بائعا بدوره', () => {
    for (const role of ['OWNER', 'MANAGER', 'SALES'] as const) {
      expect(offerSide(SIDES, { userId: 'staff', dealer: { dealerId: 'dealer-1', role } })).toBe(
        'SELLER',
      );
    }
  });

  /** **والمحاسبُ لا يفاوض** — وهي أدوارُ شاشة العروض نفسُها. */
  it('ولا يجعل المحاسب بائعا', () => {
    expect(
      offerSide(SIDES, { userId: 'staff', dealer: { dealerId: 'dealer-1', role: 'ACCOUNTANT' } }),
    ).toBe(null);
  });

  /** **ومعرضٌ آخر غريب** — ولو كان دورُه مالكًا فيه. */
  it('ولا يجعل عضو معرض آخر بائعا', () => {
    expect(
      offerSide(SIDES, { userId: 'staff', dealer: { dealerId: 'dealer-2', role: 'OWNER' } }),
    ).toBe(null);
  });

  /** **وبائعٌ فرد لا فريقَ له** — فعضويّةٌ بلا معرضِ إعلانٍ لا تُرجّح. */
  it('ولا تنفع العضوية على إعلان فرد', () => {
    expect(
      offerSide(
        { ...SIDES, listingDealerId: null },
        { userId: 'staff', dealer: { dealerId: 'dealer-1', role: 'OWNER' } },
      ),
    ).toBe(null);
  });
});

describe('mayAnswerOffer', () => {
  /** المُرسِلُ لا يردّ على نفسه — والقاعدةُ نُقلت ولم تُبدَّل. */
  it('يجيب الأصل البائع، والمقابل المشتري', () => {
    expect(mayAnswerOffer(SIDES, { userId: 'owner-1' })).toBe(true);
    expect(mayAnswerOffer(SIDES, { userId: 'buyer-1' })).toBe(false);

    const counter = { ...SIDES, parentOfferId: 'o-1' };
    expect(mayAnswerOffer(counter, { userId: 'buyer-1' })).toBe(true);
    expect(mayAnswerOffer(counter, { userId: 'owner-1' })).toBe(false);
    expect(
      mayAnswerOffer(counter, { userId: 'staff', dealer: { dealerId: 'dealer-1', role: 'SALES' } }),
    ).toBe(false);
  });

  it('والمقابل من البائع وحده', () => {
    expect(mayCounterOffer(SIDES, { userId: 'buyer-1' })).toBe(false);
    expect(
      mayCounterOffer(SIDES, { userId: 'staff', dealer: { dealerId: 'dealer-1', role: 'SALES' } }),
    ).toBe(true);
  });
});

/**
 * ═══ والقياسُ على صفٍّ حقيقيّ ═══
 *
 * الدالّةُ الخالصة تمرّ، والسؤالُ أيقرؤها `acceptOffer`؟ فيُصنع عضوٌ
 * مؤقّت في معرضٍ له عرضٌ قائم، ويُحذف بعده: **ما يُنشأ بالاختبار
 * يُحذف به**.
 */
/**
 * ═══ والقياسُ على صفٍّ حقيقيّ — يُصنع لا يُلتَقط ═══
 *
 * الدالّةُ الخالصة تمرّ، والسؤالُ أيقرؤها النطاق؟ **والصفُّ المزروع
 * موردٌ مشترك**: اختبارٌ يأخذ «أوّلَ عرضٍ قائم» ثمّ يشترط فيه حالًا
 * يسقط يوم يلمسه جاره. فيُصنع العرضُ هنا ويُحذف بعده.
 */
describe('declineOffer — فريق المعرض', () => {
  const madeUsers: string[] = [];
  let madeOffer: string | null = null;

  afterAll(async () => {
    if (madeOffer !== null) {
      await db.notification.deleteMany({ where: { entityType: 'Offer', entityId: madeOffer } });
      await db.offer.delete({ where: { id: madeOffer } });
    }
    if (madeUsers.length > 0) await db.user.deleteMany({ where: { id: { in: madeUsers } } });
  });

  it('يرد الغريب، ويقبل رد المندوب ويسجله', async () => {
    const listing = await db.listing.findFirst({
      where: { status: 'PUBLISHED', vehicle: { dealerId: { not: null } } },
      select: { id: true, sellerId: true, vehicle: { select: { dealerId: true } } },
    });
    expect(listing, 'لا إعلان معرض منشور في البذرة').not.toBeNull();
    if (listing === null) return;
    const dealerId = listing.vehicle.dealerId as string;

    const [buyer, sales, stranger] = await Promise.all([
      db.user.create({
        data: { phone: '+966500000930', name: 'مشتري اختبار', status: 'ACTIVE' },
        select: { id: true },
      }),
      db.user.create({
        data: {
          phone: '+966500000931',
          name: 'مندوب اختبار',
          status: 'ACTIVE',
          dealerId,
          dealerRole: 'SALES',
        },
        select: { id: true },
      }),
      db.user.create({
        data: { phone: '+966500000932', name: 'غريب اختبار', status: 'ACTIVE' },
        select: { id: true },
      }),
    ]);
    madeUsers.push(buyer.id, sales.id, stranger.id);

    const offer = await db.offer.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        amount: 1000,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 48 * 3_600_000),
      },
      select: { id: true },
    });
    madeOffer = offer.id;

    /** الغريبُ يُردّ. */
    expect(await declineOffer({ offerId: offer.id, userId: stranger.id })).toEqual({
      ok: false,
      reason: 'NOT_RECIPIENT',
    });

    /**
     * **والمندوبُ بلا عضويّةٍ مُلحَقة يُردّ أيضًا** — فالعضويّة من
     * جلسة اللوحة لا من عمودٍ في الجدول: متصفّحٌ فيه جلستان لشخصين
     * لا يُعطي أحدَهما صلاحيّةَ الآخر.
     */
    expect(await declineOffer({ offerId: offer.id, userId: sales.id })).toEqual({
      ok: false,
      reason: 'NOT_RECIPIENT',
    });

    /**
     * ثمّ يُفحص الفعلُ غيرُ المدمّر: القبولُ يُنشئ طلبًا ويسحب
     * الإعلان ويُغلق بقيّةَ العروض — **والبوابةُ المقيسة واحدةٌ
     * للفعلين** (`mayAnswerOffer`)، فلا حاجة إلى هدم إعلانٍ مزروع.
     */
    const allowed = await declineOffer({
      offerId: offer.id,
      userId: sales.id,
      actor: { userId: sales.id, dealer: { dealerId, role: 'SALES' } },
    });
    expect(allowed.ok).toBe(true);

    const row = await db.offer.findUniqueOrThrow({
      where: { id: offer.id },
      select: { status: true, respondedById: true, autoRejected: true },
    });
    expect(row.status).toBe('REJECTED');
    /** **ومن ردّ يُسجَّل** — وهو مصدرُ «مبيعات كل مندوب». */
    expect(row.respondedById).toBe(sales.id);
    expect(row.autoRejected).toBe(false);
  });

  /** **والمحاسبُ يُردّ ولو أُلحقت عضويّتُه** — فالدورُ شرطٌ ثانٍ. */
  it('ويرد المحاسب ولو من اللوحة', () => {
    expect(
      mayAnswerOffer(SIDES, {
        userId: 'acc',
        dealer: { dealerId: 'dealer-1', role: 'ACCOUNTANT' },
      }),
    ).toBe(false);
  });
});

/** ولم تُستعمل `acceptOffer` في القياس — ويُشار إليها فلا تُستورَد عبثًا. */
void acceptOffer;

/**
 * ═══ والشاشةُ تعرض الزرَّ لمن يملك الردّ، وتعدّ ما تفتحه ═══
 *
 * قِيس بالنقر: بعد مقابلةٍ واحدة بقي الصفّان يعرضان «اقبل» و«مقابل»
 * و«ارفض» — ثلاثةُ أزرارٍ يردّها الخادم على كليهما — والترويسةُ تقول
 * «واحد ينتظر ردك» عن عرضٍ أرسله المعرضُ نفسُه.
 */
describe('deskOffers — الزرّ والعدّاد', () => {
  const madeUsers: string[] = [];
  const madeOffers: string[] = [];

  afterAll(async () => {
    if (madeOffers.length > 0) {
      await db.notification.deleteMany({
        where: { entityType: 'Offer', entityId: { in: madeOffers } },
      });
      await db.offer.deleteMany({ where: { id: { in: madeOffers } } });
    }
    if (madeUsers.length > 0) await db.user.deleteMany({ where: { id: { in: madeUsers } } });
  });

  it('يرد الزر على المُرسِل، ويعد ما ينتظره وحده', async () => {
    const listing = await db.listing.findFirst({
      where: { status: 'PUBLISHED', vehicle: { dealerId: { not: null } } },
      select: { id: true, vehicle: { select: { dealerId: true, branchId: true } } },
    });
    expect(listing, 'لا إعلان معرض منشور في البذرة').not.toBeNull();
    if (listing === null) return;
    const dealerId = listing.vehicle.dealerId as string;

    /**
     * **والحكمُ على الصفّ المعنيّ لا على عدّادٍ عامّ** (قاعدةٌ مسجَّلة):
     * المعرضُ له عروضُه المزروعة، فيُقاس الفرقُ لا المجموع.
     */
    const before = await deskCounts(dealerId, null);

    const buyer = await db.user.create({
      data: { phone: '+966500000937', name: 'مشتري عدّاد', status: 'ACTIVE' },
      select: { id: true },
    });
    madeUsers.push(buyer.id);

    const parent = await db.offer.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        amount: 1000,
        status: 'COUNTERED',
        respondedAt: new Date(),
        expiresAt: new Date(Date.now() + 48 * 3_600_000),
      },
      select: { id: true },
    });
    madeOffers.push(parent.id);

    const child = await db.offer.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        amount: 1200,
        status: 'PENDING',
        parentOfferId: parent.id,
        expiresAt: new Date(Date.now() + 48 * 3_600_000),
      },
      select: { id: true },
    });
    madeOffers.push(child.id);

    const rows = await deskOffers(dealerId, null);
    const ours = rows.filter((row) => [parent.id, child.id].includes(row.id));
    expect(ours).toHaveLength(2);
    /** **ولا زرَّ على صفٍّ ينتظر المشتري** — لا المقابَل ولا المقابِل. */
    expect(ours.every((row) => !row.canAnswer)).toBe(true);

    /** والعدّادُ لم يتحرّك: صفّان نشطان، ولا واحدَ ينتظر ردَّ المعرض. */
    const after = await deskCounts(dealerId, null);
    expect(after.offersWaiting).toBe(before.offersWaiting);
    expect(after.offersActive).toBe(before.offersActive + 2);
  });
});

/**
 * ═══ وتسليمُ اللوحة عند الدخول ═══
 *
 * قِيس بالنقر: دخلتُ بحساب مندوبٍ في المتصفّح نفسِه فانفتحت اللوحة
 * **بجلسة المالك** — بنودُ الفواتير والتسويات والفريق ظاهرةٌ لمندوب.
 */
describe('openPanel / attachPanel', () => {
  it('لا يفتح لغير العضو، ويمحو كوكيا قديما', async () => {
    expect(await openPanel('whoever', { state: 'NOT_A_MEMBER' })).toBeNull();
    expect(
      await openPanel('whoever', { state: 'DEALER_NOT_ACTIVE', dealerName: 'معرض' }),
    ).toBeNull();

    /** **والمسحُ يقع ولو لم تُفتح جلسة** — وهو أصلُ العلاج. */
    const response = NextResponse.json({});
    attachPanel(response, null);
    const cookie = response.cookies.get(DEALER_COOKIE);
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);
  });

  it('ويفتح للعضو المعتمد ويكتب كوكيه', async () => {
    /** **والاختبارُ يعيد ما غيّره** — فتُحصى الجلساتُ القائمة قبله. */
    const beforeIds = (await db.dealerSession.findMany({ select: { id: true } })).map((r) => r.id);
    const owner = await db.user.findFirst({
      where: { dealerRole: 'OWNER', status: 'ACTIVE', dealer: { status: 'ACTIVE' } },
      select: { id: true, ...DEALER_MEMBERSHIP_SELECT },
    });
    expect(owner, 'لا مالك معرض معتمد في البذرة').not.toBeNull();
    if (owner === null) return;

    const handoff = await openPanel(owner.id, dealerMembership(owner));
    expect(handoff).not.toBeNull();
    if (handoff === null) return;

    const response = NextResponse.json({});
    attachPanel(response, handoff);
    expect(response.cookies.get(DEALER_COOKIE)?.value).toBe(handoff.token);

    await db.dealerSession.deleteMany({ where: { id: { notIn: beforeIds } } });
  });
});
