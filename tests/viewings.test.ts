import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { ViewingStatus } from '@/generated/prisma/enums';
import {
  acceptCounter,
  awaitsMe,
  cancelViewing,
  closePastViewings,
  counterViewing,
  remindUpcomingViewings,
  requestViewing,
  respondToViewing,
  viewingsAwaiting,
  viewingsFor,
} from '@/lib/domain/viewings';
import { MAX_DAYS_AHEAD, PERIOD_HOURS, slotEnd, slotStart } from '@/lib/domain/viewing-rules';
import { VIEWING_PERIOD, VIEWING_STATUS } from '@/lib/labels/viewings';

/**
 * ═══ المعاينة — طرفان لا ثلاثة ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٧): «افعل ما تراه احترافيًّا ويناسب السوق
 * السعودي». وكانت صفًّا في `Service` **بلا صنف مزوّد**، فكلُّ طلبٍ
 * يُردّ `CITY_NOT_COVERED` — وزرُّها في صفحة المركبة، وهي أكثرُ شاشةٍ
 * يصلها الناس، يقول «قريبًا».
 */

const NOW = new Date('2026-10-17T09:00:00.000Z');

const made: string[] = [];

afterEach(async () => {
  if (made.length > 0) {
    await db.viewing.deleteMany({ where: { ref: { in: made } } });
    made.length = 0;
  }
});

afterAll(async () => {
  await db.$disconnect();
});

/**
 * إعلانٌ منشور ومشترٍ ليس صاحبَه.
 *
 * **والطقم يشترط ما يفترضه**: طلبان قائمان على إعلانٍ واحد مرفوضان
 * بحقّ، فاختبارٌ يحتاج موعدين يأخذ إعلانين — لا يأمل.
 */
async function pair(skip = 0): Promise<{ listingRef: string; buyerId: string; sellerId: string }> {
  const listing = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED' },
    orderBy: { createdAt: 'asc' },
    skip,
    select: { ref: true, sellerId: true },
  });
  const buyer = await db.user.findFirstOrThrow({
    where: { id: { not: listing.sellerId }, role: 'USER' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return { listingRef: listing.ref, buyerId: buyer.id, sellerId: listing.sellerId };
}

async function ask(
  overrides: Partial<{
    onDate: string;
    period: 'MORNING' | 'NOON' | 'AFTERNOON' | 'EVENING';
    skip: number;
  }> = {},
): Promise<{ ref: string; buyerId: string; sellerId: string }> {
  const seat = await pair(overrides.skip ?? 0);
  /** **وما مضى لا يُحجَز** — فالافتراضُ غدًا */
  const result = await requestViewing(
    {
      listingRef: seat.listingRef,
      buyerId: seat.buyerId,
      onDate: overrides.onDate ?? '2026-10-19',
      period: overrides.period ?? 'AFTERNOON',
      note: null,
    },
    NOW,
  );
  if (!result.ok) throw new Error(`تعذّر الطلب: ${result.reason}`);
  made.push(result.value.ref);
  return { ref: result.value.ref, buyerId: seat.buyerId, sellerId: seat.sellerId };
}

describe('الفترة', () => {
  /**
   * **واليومُ وفترتُه لا ساعةٌ بالدقيقة.** المواعيد هنا تُضبط على
   * الصلوات، والمملكةُ بلا توقيتٍ صيفيّ فالفرق ثابتٌ ‎+٣.
   */
  it('تُحسب بتوقيت الرياض', () => {
    const day = new Date('2026-10-19T00:00:00.000Z');
    /** «بعد المغرب» تنتهي ١٠ مساءً بالرياض = ١٩:٠٠ بتوقيت UTC */
    expect(slotEnd(day, 'EVENING').toISOString()).toBe('2026-10-19T19:00:00.000Z');
    expect(slotStart(day, 'EVENING').toISOString()).toBe('2026-10-19T15:00:00.000Z');
    expect(slotEnd(day, 'MORNING').toISOString()).toBe('2026-10-19T09:00:00.000Z');
  });

  /** ولكلِّ فترةٍ اسمٌ — ومفتاحٌ بلا اسمٍ يُعرض خامًا */
  it('ولكلِّ فترةٍ اسمٌ عربيّ، ولكلِّ حالٍ كذلك', () => {
    for (const key of Object.keys(PERIOD_HOURS)) {
      expect(VIEWING_PERIOD[key], key).toBeTypeOf('string');
    }
    for (const key of Object.values(ViewingStatus)) {
      expect(VIEWING_STATUS[key], key).toBeTypeOf('string');
    }
  });
});

describe('الطلب', () => {
  it('يُنشأ بمرجعٍ متسلسل', async () => {
    const seat = await ask();
    expect(seat.ref).toMatch(/^VIW-2026-\d{4}$/);
  });

  /** **ولا معاينةَ لصاحب المركبة** — ولا يُعرض الزرّ له أصلًا */
  it('وصاحبُ الإعلان لا يعاين مركبتَه', async () => {
    const seat = await pair();
    expect(
      await requestViewing(
        {
          listingRef: seat.listingRef,
          buyerId: seat.sellerId,
          onDate: '2026-10-19',
          period: 'EVENING',
          note: null,
        },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'OWN_LISTING' });
  });

  /**
   * **وما مضى لا يُحجَز — والفترةُ كلُّها لا اليومُ وحده**: طلبٌ
   * «صباح اليوم» بعد الظهر ليس طلبًا، واليومُ نفسه مقبولٌ لما بقي
   * منه.
   */
  it('والفترةُ التي مضت تُرفض، والباقيةُ من اليوم نفسه تُقبل', async () => {
    const seat = await pair();
    /** الآن ٩:٠٠ UTC = ١٢ ظهرًا بالرياض — فـ«صباحًا» مضت */
    expect(
      await requestViewing(
        { listingRef: seat.listingRef, buyerId: seat.buyerId, onDate: '2026-10-17', period: 'MORNING', note: null },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'DATE_IN_PAST' });

    const later = await requestViewing(
      { listingRef: seat.listingRef, buyerId: seat.buyerId, onDate: '2026-10-17', period: 'EVENING', note: null },
      NOW,
    );
    expect(later.ok).toBe(true);
    if (later.ok) made.push(later.value.ref);
  });

  it('وما بعد المدّة المتاحة يُرفض', async () => {
    const seat = await pair();
    const far = new Date(NOW.getTime() + (MAX_DAYS_AHEAD + 2) * 86_400_000);
    expect(
      await requestViewing(
        {
          listingRef: seat.listingRef,
          buyerId: seat.buyerId,
          onDate: far.toISOString().slice(0, 10),
          period: 'EVENING',
          note: null,
        },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'DATE_TOO_FAR' });
  });

  /**
   * **ولا يُكرّر طلبًا قائمًا**: عشرةُ طلباتٍ من شخصٍ واحد ليست رغبةً
   * أشدّ، هي طابورٌ يُربك البائع فيتجاهله كلَّه.
   */
  it('ولا طلبان قائمان على إعلانٍ واحد', async () => {
    const seat = await ask();
    const row = await db.viewing.findUniqueOrThrow({
      where: { ref: seat.ref },
      select: { listing: { select: { ref: true } } },
    });
    expect(
      await requestViewing(
        {
          listingRef: row.listing.ref,
          buyerId: seat.buyerId,
          onDate: '2026-10-20',
          period: 'EVENING',
          note: null,
        },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'ALREADY_OPEN' });
  });
});

describe('الردّ', () => {
  /**
   * ═══ **ونقطةُ اللقاء لا تخرج قبل القبول** ═══
   *
   * والشاشة تَعِد بذلك منذ بُنيت: «لا يُكشف العنوان إلّا بعد تأكيد
   * الموعد». والشرطُ يقع **حيث يُجلَب** لا حيث يُعرض — مسلكُ
   * `reservePrice` نفسه.
   */
  it('القبولُ يكشف نقطة اللقاء ورقمَ الطرف الآخر، وما قبله لا يكشف', async () => {
    const seat = await ask();

    const before = await viewingsFor(seat.buyerId, 'ar', NOW);
    const pending = before.asBuyer.find((row) => row.ref === seat.ref);
    expect(pending?.meetingPoint).toBeNull();
    expect(pending?.counterpartPhoneTail).toBeNull();

    expect(
      await respondToViewing(
        {
          ref: seat.ref,
          sellerId: seat.sellerId,
          accept: true,
          meetingPoint: 'محطة بترومين، طريق الملك عبدالعزيز، حيّ الملقا.',
          reason: null,
        },
        NOW,
      ),
    ).toEqual({ ok: true, value: { status: 'CONFIRMED' } });

    const after = await viewingsFor(seat.buyerId, 'ar', NOW);
    const confirmed = after.asBuyer.find((row) => row.ref === seat.ref);
    expect(confirmed?.meetingPoint).toContain('بترومين');
    expect(confirmed?.counterpartPhoneTail).toHaveLength(4);

    /**
     * **والرابط يُبنى قانونيًّا من أوّله** — `/ar/cars/{ref}` يُحوَّل ٣٠٨
     * عند كل نقرة، وهو إشارةٌ لمحرّك البحث أنّ عناويننا ليست نهائية.
     * وقِيس: سبعُ تحويلاتٍ من هذه الشاشة وحدها.
     */
    expect(confirmed?.listingPath).toMatch(/^\/ar\/cars\/[^/]+\/[^/]+\/[^/]+\//);
    /**
     * **ولاتينيٌّ كاملًا**: حرفٌ عربيّ في المسار يُرمَّز `%D9%83…`،
     * فيُشارَك مشوَّهًا — ويُحوَّل ٣٠٨ لأنه ليس المعياريّ. وقِيس
     * مرّتين: أُصلح `brand` وحده فبقي الطراز عربيًّا.
     */
    expect(confirmed?.listingPath).not.toMatch(/[\u0600-\u06FF]/);
  });

  /** **ونقطةُ لقاءٍ بلا وصفٍ ليست موعدًا** — «جدة» لا يُلتقى فيها */
  it('ولا قبولَ بلا نقطة لقاء', async () => {
    const seat = await ask();
    expect(
      await respondToViewing(
        { ref: seat.ref, sellerId: seat.sellerId, accept: true, meetingPoint: 'جدة', reason: null },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'MEETING_POINT_REQUIRED' });
  });

  /** **و«رُفض» بلا سببٍ تُعيد الطالب إلى الحيرة** */
  it('ولا اعتذارَ بلا سبب', async () => {
    const seat = await ask();
    expect(
      await respondToViewing(
        { ref: seat.ref, sellerId: seat.sellerId, accept: false, meetingPoint: null, reason: 'لا' },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'REASON_REQUIRED' });
  });

  /** **وحارسٌ في الشاشة ليس حارسًا** — ولا يردّ على موعدٍ من لا يملكه */
  it('ولا يردّ غيرُ البائع', async () => {
    const seat = await ask();
    expect(
      await respondToViewing(
        {
          ref: seat.ref,
          sellerId: seat.buyerId,
          accept: true,
          meetingPoint: 'محطة بترومين، حيّ الملقا.',
          reason: null,
        },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'NOT_YOURS' });
  });

  it('ولا يُردّ مرّتين', async () => {
    const seat = await ask();
    await respondToViewing(
      { ref: seat.ref, sellerId: seat.sellerId, accept: false, meetingPoint: null, reason: 'السيارة في الصيانة هذا الأسبوع.' },
      NOW,
    );
    expect(
      await respondToViewing(
        { ref: seat.ref, sellerId: seat.sellerId, accept: true, meetingPoint: 'محطة بترومين، الملقا.', reason: null },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'NOT_PENDING' });
  });
});

describe('الاقتراح المضادّ', () => {
  /**
   * **والاعتذارُ وحده كان يُنهي الحوار**: بائعٌ لا يستطيع السبت
   * ويستطيع الأحد يُضطرّ إلى الرفض، ثمّ ينتظر أن يعيد المشتري الطلب —
   * وأكثرُهم لا يعيد. فاتّفاقٌ ممكنٌ يسقط لأن لا بابَ له.
   */
  it('ينقل الموعد ويحفظ ما طُلب أوّلًا', async () => {
    const seat = await ask({ onDate: '2026-10-19', period: 'MORNING' });

    expect(
      await counterViewing(
        {
          ref: seat.ref,
          sellerId: seat.sellerId,
          onDate: '2026-10-21',
          period: 'EVENING',
          meetingPoint: 'مواقف مجمّع العثيم، مخرج ٩، الرياض.',
        },
        NOW,
      ),
    ).toEqual({ ok: true, value: { status: 'COUNTERED' } });

    const view = await viewingsFor(seat.buyerId, 'ar', NOW);
    const row = view.asBuyer.find((entry) => entry.ref === seat.ref);
    expect(row?.status).toBe('COUNTERED');
    expect(row?.period).toBe('EVENING');
    /** **والفرقُ يُقرأ لا الموعدُ الجديد وحده** */
    expect(row?.originalPeriod).toBe('MORNING');
    expect(row?.originalDate?.slice(0, 10)).toBe('2026-10-19');
    /** **ونقطةُ اللقاء مخفيّةٌ عن المشتري حتى يقبل** — كما في الحالة الأولى */
    expect(row?.meetingPoint).toBeNull();

    /**
     * **ويراها البائعُ دائمًا — وهي بيانُه هو.** قِيس على الشاشة:
     * اقترح موعدًا وكتب الموضع ثمّ لم يرَه، فلا يعرف ماذا وعد به إن
     * سُئل.
     */
    const sellerView = await viewingsFor(seat.sellerId, 'ar', NOW);
    const mine = sellerView.asSeller.find((entry) => entry.ref === seat.ref);
    expect(mine?.meetingPoint).toContain('العثيم');
    /** والرقمُ يبقى محجوبًا عن الطرفين حتى التأكيد */
    expect(mine?.counterpartPhoneTail).toBeNull();
  });

  /** **والدورُ ينتقل**: الاقتراحُ على المشتري لا البائع */
  it('والدورُ يصير للمشتري', async () => {
    const seat = await ask({ onDate: '2026-10-19', period: 'MORNING' });
    const sellerBefore = await viewingsAwaiting(seat.sellerId, NOW);

    await counterViewing(
      {
        ref: seat.ref,
        sellerId: seat.sellerId,
        onDate: '2026-10-21',
        period: 'EVENING',
        meetingPoint: 'مواقف مجمّع العثيم، مخرج ٩، الرياض.',
      },
      NOW,
    );

    expect(await viewingsAwaiting(seat.sellerId, NOW)).toBe(sellerBefore - 1);
    expect(await viewingsAwaiting(seat.buyerId, NOW)).toBeGreaterThanOrEqual(1);
    expect(awaitsMe({ status: 'COUNTERED' }, 'BUYER')).toBe(true);
    expect(awaitsMe({ status: 'COUNTERED' }, 'SELLER')).toBe(false);
  });

  it('وقبولُ المشتري يؤكّده ويكشف نقطة اللقاء', async () => {
    const seat = await ask({ onDate: '2026-10-19', period: 'MORNING' });
    await counterViewing(
      {
        ref: seat.ref,
        sellerId: seat.sellerId,
        onDate: '2026-10-21',
        period: 'EVENING',
        meetingPoint: 'مواقف مجمّع العثيم، مخرج ٩، الرياض.',
      },
      NOW,
    );

    expect(await acceptCounter({ ref: seat.ref, buyerId: seat.buyerId }, NOW)).toEqual({
      ok: true,
      value: { status: 'CONFIRMED' },
    });

    const view = await viewingsFor(seat.buyerId, 'ar', NOW);
    const row = view.asBuyer.find((entry) => entry.ref === seat.ref);
    expect(row?.meetingPoint).toContain('العثيم');
    expect(row?.counterpartPhoneTail).toHaveLength(4);
  });

  /** **وحارسٌ في الشاشة ليس حارسًا**: البائع لا يقبل اقتراحَ نفسه */
  it('ولا يقبل البائعُ اقتراحَ نفسه', async () => {
    const seat = await ask({ onDate: '2026-10-19', period: 'MORNING' });
    await counterViewing(
      {
        ref: seat.ref,
        sellerId: seat.sellerId,
        onDate: '2026-10-21',
        period: 'EVENING',
        meetingPoint: 'مواقف مجمّع العثيم، مخرج ٩، الرياض.',
      },
      NOW,
    );
    expect(await acceptCounter({ ref: seat.ref, buyerId: seat.sellerId }, NOW)).toEqual({
      ok: false,
      reason: 'NOT_YOURS',
    });
  });

  /** **والاقتراحُ يخضع لما يخضع له الطلب** — ولا يُقترح ما مضى */
  it('ولا يُقترح موعدٌ مضى', async () => {
    const seat = await ask({ onDate: '2026-10-19', period: 'MORNING' });
    expect(
      await counterViewing(
        {
          ref: seat.ref,
          sellerId: seat.sellerId,
          onDate: '2026-10-17',
          period: 'MORNING',
          meetingPoint: 'مواقف مجمّع العثيم، مخرج ٩، الرياض.',
        },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'DATE_IN_PAST' });
  });

  /** **واقتراحٌ بلا نقطة لقاءٍ نصفُ اقتراح** — فتُطلب معه */
  it('ولا اقتراحَ بلا نقطة لقاء', async () => {
    const seat = await ask({ onDate: '2026-10-19', period: 'MORNING' });
    expect(
      await counterViewing(
        { ref: seat.ref, sellerId: seat.sellerId, onDate: '2026-10-21', period: 'EVENING', meetingPoint: 'جدة' },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'MEETING_POINT_REQUIRED' });
  });
});

describe('التذكير', () => {
  /**
   * **والتذكير يسبق لحظة الحاجة.** موعدٌ اتُّفق عليه قبل أسبوعين
   * يُنسى، فيذهب أحدُهما ولا يجد الآخر — وليس بينهما عقدٌ ولا مال.
   */
  it('يصل الطرفين مرّةً واحدة قبل الموعد', async () => {
    const seat = await ask({ onDate: '2026-10-19', period: 'EVENING' });
    await respondToViewing(
      { ref: seat.ref, sellerId: seat.sellerId, accept: true, meetingPoint: 'محطة بترومين، الملقا.', reason: null },
      NOW,
    );

    /** قبل الموعد بأكثر من المهلة — فلا تذكير */
    expect(await remindUpcomingViewings(new Date('2026-10-17T06:00:00.000Z'))).toBe(0);

    /** وداخل المهلة — فيصل الطرفين */
    const sent = await remindUpcomingViewings(new Date('2026-10-18T18:00:00.000Z'));
    expect(sent).toBeGreaterThanOrEqual(1);

    const notes = await db.notification.findMany({
      where: { templateKey: 'viewing.reminder', entityType: 'Viewing', entityId: seat.ref },
      select: { userId: true },
    });
    expect(new Set(notes.map((row) => row.userId))).toEqual(
      new Set([seat.buyerId, seat.sellerId]),
    );

    /** **ولا يُذكَّر مرّتين** — والإشعارُ نفسُه هو السجلّ، بلا عمود */
    await remindUpcomingViewings(new Date('2026-10-18T20:00:00.000Z'));
    expect(
      await db.notification.count({
        where: { templateKey: 'viewing.reminder', entityType: 'Viewing', entityId: seat.ref },
      }),
    ).toBe(2);

    await db.notification.deleteMany({ where: { entityType: 'Viewing', entityId: seat.ref } });
  });

  /** **وما لم يُؤكَّد لا يُذكَّر به** — فلا موعدَ أصلًا */
  it('ولا يُذكَّر بما ينتظر ردًّا', async () => {
    const seat = await ask({ onDate: '2026-10-19', period: 'EVENING' });
    await remindUpcomingViewings(new Date('2026-10-18T18:00:00.000Z'));
    expect(
      await db.notification.count({
        where: { templateKey: 'viewing.reminder', entityType: 'Viewing', entityId: seat.ref },
      }),
    ).toBe(0);
  });
});

describe('الإلغاء', () => {
  /** **ولكلا الطرفين** — ظروفُ الناس تتغيّر، وبلا بابٍ يذهب أحدُهما ولا يجد الآخر */
  it('يقع من أيّ طرفٍ ويُسجَّل صاحبُه', async () => {
    const seat = await ask();
    expect(await cancelViewing({ ref: seat.ref, userId: seat.buyerId }, NOW)).toEqual({
      ok: true,
      value: { by: 'BUYER' },
    });
    const row = await db.viewing.findUniqueOrThrow({
      where: { ref: seat.ref },
      select: { status: true, cancelledBy: true },
    });
    expect(row.status).toBe('CANCELLED');
    /** **ومن ألغى يُقال** — والوسمُ وحده يجعل الطرفين يتّهمان بعضهما */
    expect(row.cancelledBy).toBe('BUYER');
  });

  it('ولا يُلغيه ثالث', async () => {
    const seat = await ask();
    const other = await db.user.findFirstOrThrow({
      where: { id: { notIn: [seat.buyerId, seat.sellerId] }, role: 'USER' },
      select: { id: true },
    });
    expect(await cancelViewing({ ref: seat.ref, userId: other.id }, NOW)).toEqual({
      ok: false,
      reason: 'NOT_YOURS',
    });
  });
});

describe('ما مضى', () => {
  /**
   * ═══ **والاختبارُ يعيد ما غيّره** ═══
   *
   * `closePastViewings` وظيفةٌ دورية تمرّ على **كل** الصفوف — وهو
   * صوابُها. فتشغيلُها بزمنٍ مستقبليّ يُغلق المزروعَ أيضًا: صفُّ
   * «ينتظر ردًّا» في بيئة التطوير صار `EXPIRED` بعد أوّل تشغيل، وما
   * لا يُزرع لا يُرى.
   *
   * فتُلتقط حالُ المزروع قبل الاختبار وتُعاد بعده — ونظافةُ الاختبار
   * جزءٌ منه.
   */
  const before = new Map<string, ViewingStatus>();

  beforeAll(async () => {
    const rows = await db.viewing.findMany({ select: { ref: true, status: true } });
    for (const row of rows) before.set(row.ref, row.status);
  });

  afterAll(async () => {
    for (const [ref, status] of before) {
      await db.viewing.updateMany({ where: { ref, status: { not: status } }, data: { status } });
    }
  });

  /**
   * **والحالةُ المخزَّنة لا تكفي متى كان لها وقت**: موعدٌ انقضى وبقي
   * «ينتظر ردًّا» يقول للمشتري إنّ بائعًا قد يردّ، وقد فات اليوم.
   *
   * **والفرقُ بين المنقضي والتامّ هو ما يُقاس به البائع**: من لا يردّ
   * غيرُ من يردّ ويلتقي.
   */
  it('المنتظِرُ ينقضي والمؤكَّدُ يتمّ', async () => {
    const waiting = await ask({ onDate: '2026-10-19', period: 'MORNING' });
    /** **وعلى إعلانٍ آخر** — فطلبان قائمان على واحدٍ مرفوضان بحقّ */
    const confirmed = await ask({ onDate: '2026-10-19', period: 'EVENING', skip: 1 });

    await respondToViewing(
      { ref: confirmed.ref, sellerId: confirmed.sellerId, accept: true, meetingPoint: 'محطة بترومين، الملقا.', reason: null },
      NOW,
    );

    /** بعد انقضاء اليوم كلِّه */
    /**
     * **والحكمُ على الصفّ المعنيّ لا على عدّادٍ عامّ**: الدالّة تمرّ
     * على كل الصفوف، فيكفي صفٌّ مزروعٌ تجاوز وقتَه ليجعل العدد
     * يختلف — فيسقط الاختبار على ما لا يقيسه.
     */
    await closePastViewings(new Date('2026-10-20T06:00:00.000Z'));

    const rows = await db.viewing.findMany({
      where: { ref: { in: [waiting.ref, confirmed.ref] } },
      select: { ref: true, status: true },
    });
    const byRef = new Map(rows.map((row) => [row.ref, row.status]));
    expect(byRef.get(waiting.ref)).toBe('EXPIRED');
    expect(byRef.get(confirmed.ref)).toBe('COMPLETED');
  });

  /**
   * **والعدّادُ يُحسب بما يُنتظر فعلًا** — لا بكلّ صفٍّ في القائمة.
   *
   * **والحكمُ على فارقِ صفِّنا لا على العدّاد العامّ**: الدالّة تعدّ
   * لكلّ البائع، وكان الاختبار يقول `toBe(0)` — فحين صار **أقدمُ
   * إعلانٍ منشور** إعلانًا لبائعٍ له معاينةٌ مزروعة منتظرة سقط على ما
   * لا يقيسه. والصنف مسجَّل في CLAUDE.md، وهذا ثانيه.
   *
   * فالشرطُ يُشترط صريحًا: لا صفَّ آخر لهذا البائع ينقضي بين
   * اللحظتين — ثمّ الفارقُ **واحد**، هو صفُّنا وحده.
   */
  it('والعدّادُ يستبعد ما مضى وقتُه', async () => {
    const seat = await ask({ onDate: '2026-10-19', period: 'EVENING' });
    const past = new Date('2026-10-20T06:00:00.000Z');

    const others = await db.viewing.findMany({
      where: {
        ref: { not: seat.ref },
        OR: [
          { sellerId: seat.sellerId, status: ViewingStatus.REQUESTED },
          { buyerId: seat.sellerId, status: ViewingStatus.COUNTERED },
        ],
      },
      select: { onDate: true, period: true },
    });
    const inWindow = others.filter((row) => {
      const ends = slotEnd(row.onDate, row.period).getTime();
      return ends > NOW.getTime() && ends <= past.getTime();
    });
    expect(inWindow).toEqual([]);

    const before = await viewingsAwaiting(seat.sellerId, NOW);
    expect(before).toBeGreaterThanOrEqual(1);

    /** بعد الموعد — لم يعد ينتظر ردًّا من أحد */
    const after = await viewingsAwaiting(seat.sellerId, past);
    /** **والحالة لم تتغيّر** — فالاستبعادُ بالوقت لا بالحالة. */
    expect(await db.viewing.count({ where: { ref: seat.ref, status: 'REQUESTED' } })).toBe(1);
    expect(before - after).toBe(1);
  });
});
