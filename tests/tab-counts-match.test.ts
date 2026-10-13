import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  auctionCounts,
  auctionMonitor,
  offerCounts,
  offerMonitor,
} from '@/lib/domain/admin-monitors';
import {
  listAdminOrders,
  listAdminUsers,
  orderTabCounts,
  userSegmentCounts,
  type UserSegment,
} from '@/lib/domain/admin-orders';
import { disputeCounts, listDisputes } from '@/lib/domain/disputes';
import {
  serviceRequestCounts,
  listServiceRequests,
  serviceQueueHealth,
} from '@/lib/domain/admin-services';

/**
 * ═══ الشريحة تَعُدّ ما تُرشّح ═══
 *
 * شريحةٌ تقول «٠» والنقرُ عليها يعرض عشرة: **رقمان متناقضان في شاشةٍ
 * واحدة، وكلٌّ صحيحٌ على حدة**. العدّاد يقرأ حقلًا والترشيح يحسب حدًّا،
 * أو العكس — ولا شيء يربطهما.
 *
 * وقع مرّتين:
 *   · «متعثّرة» في الطلبات — عدّادُها من `OrderStatus.STALLED` ولا كاتب
 *     له، وترشيحُها محسوب (المهمة ١٥٠).
 *   · «الكل» في العروض — عدّادُها مجموعُ أربعِ حالاتٍ من ستّ، والقائمة
 *     بلا ترشيحٍ تعيد الستّ. فقالت «٤» وعرضت «٧».
 *
 * فهذه بوابة الصنف: **لكل شاشةٍ شرائحُها، ويُقارَن عدُّ كلِّ شريحةٍ
 * بطول ما تُعيده**. ولا تُستثنى شريحةٌ إلا بسببٍ مكتوب.
 */

afterAll(async () => {
  await db.$disconnect();
});

/** شاشةٌ وشرائحُها — العدّاد والقائمة من المصدر نفسه. */
type Screen = {
  name: string;
  tabs: readonly { key: string | null; count: number; rows: number }[];
};

async function offersScreen(): Promise<Screen> {
  const counts = await offerCounts();
  const keys = [null, 'active', 'countered', 'accepted', 'auto'] as const;
  const totals: Record<string, number> = {
    active: counts.active,
    countered: counts.countered,
    accepted: counts.accepted,
    auto: counts.autoRejected,
  };
  const tabs = await Promise.all(
    keys.map(async (key) => ({
      key,
      count: key === null ? counts.all : (totals[key] ?? -1),
      rows: (await offerMonitor(key, new Date(), null)).length,
    })),
  );
  return { name: 'offers', tabs };
}

async function disputesScreen(): Promise<Screen> {
  const counts = await disputeCounts();
  const keys = [null, 'open', 'investigating', 'resolved'] as const;
  const tabs = await Promise.all(
    keys.map(async (key) => ({
      key,
      count: counts[key ?? 'all'] ?? -1,
      rows: (await listDisputes(new Date(), key)).length,
    })),
  );
  return { name: 'disputes', tabs };
}

async function serviceRequestsScreen(): Promise<Screen> {
  const counts = await serviceRequestCounts();
  const keys = [null, 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'FAILED', 'REFUNDED'] as const;
  const tabs = await Promise.all(
    keys.map(async (key) => ({
      key,
      /** شريحةٌ بلا صفٍّ لا مفتاحَ لها في `groupBy` — والشاشة تعرض صفرًا. */
      count: counts[key ?? 'all'] ?? 0,
      rows: (await listServiceRequests(key === null ? {} : { filter: key })).length,
    })),
  );
  return { name: 'service-requests', tabs };
}

/**
 * ═══ والبطاقةُ شريحةٌ أيضًا ═══
 *
 * «مفتوحة» و«تجاوزت المهلة» و«بلا مزوّد» أرقامٌ يُنقَر عليها فتفتح
 * قوائمها — فهي شرائحُ بشكلٍ آخر، وينطبق عليها ما ينطبق عليها.
 *
 * وكانت تُحسب من **القائمة المعروضة** لا من الطابور، فتصف نفسها بعد
 * أوّل نقرة: على `?overdue=1` تقول «الإجمالي ١» والطابور ثمانية.
 * والعدُّ الآن من `serviceQueueHealth` والقائمةُ من مرشّحٍ في الاستعلام،
 * وهذه البوابة تمنع تباعدهما.
 *
 * **و`now` واحدةٌ للطرفين**: الحدّ ساعةٌ بعد المهلة، وصفٌّ عليها
 * بالضبط يقلب الفحص لو قُرئ الوقتُ مرّتين.
 */
async function serviceCardsScreen(): Promise<Screen> {
  const now = new Date();
  const health = await serviceQueueHealth(now);
  const cards = [
    { key: 'open', count: health.open, filters: { onlyOpen: true } },
    { key: 'overdue', count: health.overdue, filters: { onlyOverdue: true } },
    { key: 'unassigned', count: health.unassigned, filters: { onlyUnassigned: true } },
  ] as const;

  const tabs = await Promise.all(
    cards.map(async (card) => ({
      key: card.key as string | null,
      count: card.count,
      rows: (await listServiceRequests(card.filters, now)).length,
    })),
  );
  return { name: 'service-cards', tabs };
}

async function auctionsScreen(): Promise<Screen> {
  const counts = await auctionCounts();
  const keys = [null, 'live', 'scheduled', 'unmet', 'ended'] as const;
  const totals: Record<string, number> = {
    live: counts.live,
    scheduled: counts.scheduled,
    unmet: counts.unmet,
    ended: counts.ended,
  };
  const tabs = await Promise.all(
    keys.map(async (key) => ({
      key,
      count: key === null ? counts.all : (totals[key] ?? 0),
      rows: (await auctionMonitor(key, new Date(), null)).length,
    })),
  );
  return { name: 'auctions', tabs };
}

async function usersScreen(): Promise<Screen> {
  const counts = await userSegmentCounts();
  const keys: readonly UserSegment[] = [
    'all', 'buyers', 'sellers', 'individuals', 'dealers',
    'verified', 'unverified', 'repeat', 'suspended', 'banned',
  ];
  const tabs = await Promise.all(
    keys.map(async (key) => ({
      key,
      count: counts[key] ?? 0,
      rows: (await listAdminUsers(key, null)).length,
    })),
  );
  return { name: 'users', tabs };
}

async function ordersScreen(): Promise<Screen> {
  const counts = await orderTabCounts();
  const now = new Date();
  const STAGES = ['REQUEST', 'APPROVED', 'INSPECTION', 'PAYMENT', 'TRANSFER', 'DONE'] as const;

  const stageTabs = await Promise.all(
    STAGES.map(async (stage) => ({
      key: stage as string | null,
      count: counts.byStage[stage] ?? 0,
      rows: (await listAdminOrders({ stage }, now)).length,
    })),
  );

  const closedTabs = await Promise.all(
    ([['completed', 'COMPLETED'], ['cancelled', 'CANCELLED']] as const).map(
      async ([key, status]) => ({
        key: key as string | null,
        count: key === 'completed' ? counts.completed : counts.cancelled,
        rows: (await listAdminOrders({ status }, now)).length,
      }),
    ),
  );

  const live = await listAdminOrders({}, now);

  return {
    name: 'orders',
    tabs: [
      /** «الكل» تَعُدّ كلَّ الحالات، والقائمة تعرض القائمة منها وحدها. */
      { key: 'live', count: counts.all - counts.completed - counts.cancelled, rows: live.length },
      ...stageTabs,
      ...closedTabs,
      {
        key: 'disputed',
        count: counts.disputed,
        rows: live.filter((row) => row.hasDispute).length,
      },
      {
        key: 'stalled',
        count: counts.stalled,
        rows: live.filter((row) => row.critical).length,
      },
    ],
  };
}

function wrongTabs(screen: Screen): string[] {
  return screen.tabs
    .filter((tab) => tab.count !== tab.rows)
    .map((tab) => `${tab.key ?? 'all'}: العدّاد ${tab.count} والقائمة ${tab.rows}`);
}

describe('═══ كل شريحةٍ تَعُدّ ما تُرشّح ═══', () => {
  it('العروض', async () => {
    const screen = await offersScreen();
    expect(wrongTabs(screen)).toEqual([]);
  });

  it('النزاعات', async () => {
    const screen = await disputesScreen();
    expect(wrongTabs(screen)).toEqual([]);
  });

  it('طلبات الخدمات', async () => {
    const screen = await serviceRequestsScreen();
    expect(wrongTabs(screen)).toEqual([]);
  });

  it('بطاقاتُ طلبات الخدمات', async () => {
    expect(wrongTabs(await serviceCardsScreen())).toEqual([]);
  });

  it('المزادات', async () => {
    expect(wrongTabs(await auctionsScreen())).toEqual([]);
  });

  it('العملاء', async () => {
    expect(wrongTabs(await usersScreen())).toEqual([]);
  });

  it('الطلبات', async () => {
    expect(wrongTabs(await ordersScreen())).toEqual([]);
  });
});
