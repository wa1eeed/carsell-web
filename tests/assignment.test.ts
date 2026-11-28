import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  autoAssignStaleRequests,
  candidatesFor,
  coverageGaps,
  rankCandidates,
  type Candidate,
} from '@/lib/domain/assignment';
import { SLA_BREACHES_BEFORE_SUSPENSION } from '@/lib/domain/provider-rules';

/**
 * ═══ محرّكُ الإسناد ═══
 *
 * سأل المالك ٢٠٢٦-١١-٢٨ عن آليّة الإسناد، فقِيست: **أوّلُ من يضغط
 * «اقبل» يأخذ الطلب**، ولا ترتيبَ ولا موازنةَ حِمل. وشاشةُ المزوّدين
 * تَعِد بأنّ متجاوز الالتزام «يسقط من الإسناد الآلي» — ولا إسنادَ
 * آليّ. فهذا المحرّكُ يجعل الجملةَ صادقة.
 */

const base: Candidate = {
  providerId: 'p',
  nameAr: 'مزود',
  eligible: true,
  blockedBy: null,
  openLoad: 0,
  recentBreaches: 0,
  slaHours: 24,
  lastAssignedAt: null,
};

describe('rankCandidates', () => {
  it('يقدم الأقل تجاوزا، ثم الأقل حملا، ثم الأقدم إسنادا', () => {
    const order = rankCandidates([
      { ...base, providerId: 'late', nameAr: 'متأخر', recentBreaches: 1 },
      { ...base, providerId: 'busy', nameAr: 'مشغول', openLoad: 9 },
      { ...base, providerId: 'fresh', nameAr: 'فارغ', openLoad: 1,
        lastAssignedAt: new Date('2026-01-01') },
      { ...base, providerId: 'recent', nameAr: 'حديث', openLoad: 1,
        lastAssignedAt: new Date('2026-11-01') },
    ]).map((row) => row.providerId);

    /** **والدورُ يحفظ النصيب بين المتساوين** — فلا يأخذ الأوّلُ كلَّ شيء. */
    expect(order).toEqual(['fresh', 'recent', 'busy', 'late']);
  });

  it('وغير الأهل آخرا مهما كانت أرقامه', () => {
    const order = rankCandidates([
      { ...base, providerId: 'blocked', nameAr: 'موقوف', eligible: false, blockedBy: 'INACTIVE' },
      { ...base, providerId: 'loaded', nameAr: 'محمل', openLoad: 50 },
    ]).map((row) => row.providerId);

    expect(order).toEqual(['loaded', 'blocked']);
  });
});

describe('candidatesFor', () => {
  const madeBreaches: string[] = [];
  const madeProviders: string[] = [];

  afterAll(async () => {
    if (madeBreaches.length > 0) {
      await db.serviceRequest.deleteMany({ where: { id: { in: madeBreaches } } });
    }
    if (madeProviders.length > 0) {
      await db.serviceProvider.deleteMany({ where: { id: { in: madeProviders } } });
    }
  });

  it('يرد المرشحين بأسبابهم — ولا يخفي الممنوع', async () => {
    const request = await db.serviceRequest.findFirst({
      where: { service: { providerType: { not: null } } },
      select: { ref: true, serviceId: true, userId: true, city: true,
        service: { select: { providerType: true } } },
    });
    expect(request, 'لا طلب خدمة في البذرة').not.toBeNull();
    if (request === null) return;

    const list = await candidatesFor(request.ref);
    expect(list).not.toBeNull();
    if (list === null) return;

    /** **والمقامُ يُعلَن**: صفرُ مرشّحين قد يعني «لا مزوّد لهذا الصنف». */
    expect(list.request.providerType).toBe(request.service.providerType);

    const type = request.service.providerType;
    expect(type).not.toBeNull();
    if (type === null) return;
    const all = await db.serviceProvider.count({ where: { type } });
    /** كلُّ مزوّدٍ من الصنف يُعرض — أهلًا كان أم ممنوعًا بسببه. */
    expect(list.candidates).toHaveLength(all);

    for (const candidate of list.candidates) {
      expect(candidate.eligible === (candidate.blockedBy === null)).toBe(true);
    }
  });

  /**
   * **والحدُّ يُختبَر بتجاوزه** (قاعدةٌ مسجَّلة): مزوّدٌ بلا تجاوزاتٍ
   * يجعل فحصَ الإيقاف أخضرَ مهما كان الحدّ. فتُزرع التجاوزاتُ ثمّ
   * تُحذف.
   */
  it('ويسقط من تجاوز الحد — ويعود بزواله', async () => {
    /**
     * **والشرطُ يُصنَع لا يُنتظَر** (قاعدةٌ مسجَّلة): لا طلبَ مزروعًا
     * لصنفٍ فيه مزوّدٌ نظيفُ السجلّ — فبعضُ المزروع متأخّرٌ بحقّ،
     * وصنفُه لا يصلح لقياس الانتقال. فيُصنع المزوّدُ والطلبُ معًا
     * ويُحذفان.
     */
    const service = await db.service.findFirstOrThrow({
      where: { providerType: { not: null } },
      select: { id: true, providerType: true },
    });
    const user = await db.user.findFirstOrThrow({ select: { id: true } });

    const provider = await db.serviceProvider.create({
      data: {
        nameAr: 'مزود قياس الإسناد',
        nameEn: 'assignment-probe',
        type: service.providerType ?? 'OTHER',
        cities: [],
        active: true,
        slaHours: 24,
      },
      select: { id: true },
    });
    madeProviders.push(provider.id);

    const subject = await db.serviceRequest.create({
      data: {
        ref: `SRQ-PROBE-${String(Date.now()).slice(-8)}`,
        serviceId: service.id,
        userId: user.id,
        status: 'NEW',
        amount: 100,
      },
      select: { id: true, ref: true },
    });
    madeBreaches.push(subject.id);

    const before = (await candidatesFor(subject.ref))?.candidates.find(
      (row) => row.providerId === provider.id,
    );
    /** **ويُعلَن أنّ المقيس أهلٌ قبل الزرع** — وإلّا قاس الفحصُ حالًا سابقة. */
    expect(before?.blockedBy).toBeNull();
    expect(before?.recentBreaches).toBe(0);

    const past = new Date(Date.now() - 2 * 24 * 3_600_000);
    for (let i = 0; i < SLA_BREACHES_BEFORE_SUSPENSION; i += 1) {
      const row = await db.serviceRequest.create({
        data: {
          ref: `SRQ-LATE-${String(Date.now()).slice(-7)}-${String(i)}`,
          serviceId: service.id,
          userId: user.id,
          providerId: provider.id,
          status: 'IN_PROGRESS',
          amount: 100,
          dueAt: past,
          createdAt: past,
        },
        select: { id: true },
      });
      madeBreaches.push(row.id);
    }

    const after = (await candidatesFor(subject.ref))?.candidates.find(
      (row) => row.providerId === provider.id,
    );
    expect(after?.recentBreaches).toBe(SLA_BREACHES_BEFORE_SUSPENSION);
    expect(after?.blockedBy).toBe('SLA_SUSPENDED');
    expect(after?.eligible).toBe(false);
    /** **والموقوفُ يبقى في القائمة بسببه** — فالمشغّل يعرف لماذا لا أحد. */
    expect(after).toBeDefined();
  });
});

describe('coverageGaps', () => {
  it('يعد المغطين والأهل لكل صنف ومدينة', async () => {
    const cells = await coverageGaps();
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      /** **والأهلُ جزءٌ من المغطّين** — ورقمٌ يتجاوزه يعني عدًّا مزدوجًا. */
      expect(cell.eligible).toBeLessThanOrEqual(cell.providers);
    }
  });
});

/**
 * ═══ ومهلةُ الالتقاط ثمّ الإسناد ═══
 *
 * بابُ الالتقاط حقٌّ لمزوّدٍ يراقب طابورَه، **وطلبٌ لا يلتقطه أحد
 * يُنتظر مرّتين**. فنافذةٌ ثمّ إسناد.
 */
describe('autoAssignStaleRequests', () => {
  const made: { requests: string[]; providers: string[] } = { requests: [], providers: [] };

  afterAll(async () => {
    if (made.requests.length > 0) {
      await db.auditLog.deleteMany({
        where: { entity: 'ServiceRequest', entityId: { in: made.requests } },
      });
      await db.serviceRequest.deleteMany({ where: { ref: { in: made.requests } } });
    }
    if (made.providers.length > 0) {
      await db.serviceProvider.deleteMany({ where: { id: { in: made.providers } } });
    }
  });

  it('يترك الطازج ويسند ما تجاوز النافذة', async () => {
    const service = await db.service.findFirstOrThrow({
      where: { providerType: { not: null } },
      select: { id: true, providerType: true },
    });
    const user = await db.user.findFirstOrThrow({ select: { id: true } });

    /** مزوّدٌ نظيفُ السجلّ يغطّي كلَّ المدن — فالأهليّةُ ليست المقيس هنا. */
    const provider = await db.serviceProvider.create({
      data: {
        nameAr: 'مزود مهلة الالتقاط',
        nameEn: 'claim-window-probe',
        type: service.providerType ?? 'OTHER',
        cities: [],
        active: true,
      },
      select: { id: true },
    });
    made.providers.push(provider.id);

    const { deadline } = await import('@/lib/domain/deadlines');
    const minutes = await deadline('serviceClaimMinutes');
    const now = new Date();

    const stamp = String(Date.now()).slice(-7);
    const fresh = await db.serviceRequest.create({
      data: {
        ref: `SRQ-FRESH-${stamp}`,
        serviceId: service.id,
        userId: user.id,
        status: 'NEW',
        amount: 100,
        createdAt: now,
      },
      select: { ref: true },
    });
    const stale = await db.serviceRequest.create({
      data: {
        ref: `SRQ-STALE-${stamp}`,
        serviceId: service.id,
        userId: user.id,
        status: 'NEW',
        amount: 100,
        /** دقيقةٌ بعد النافذة — فالحدُّ يُختبَر بتجاوزه لا بعيدًا عنه. */
        createdAt: new Date(now.getTime() - (minutes + 1) * 60_000),
      },
      select: { ref: true },
    });
    made.requests.push(fresh.ref, stale.ref);

    await autoAssignStaleRequests(now);

    const after = await db.serviceRequest.findMany({
      where: { ref: { in: [fresh.ref, stale.ref] } },
      select: { ref: true, status: true, providerId: true },
    });

    const staleRow = after.find((row) => row.ref === stale.ref);
    const freshRow = after.find((row) => row.ref === fresh.ref);

    /** **والمتجاوزُ يُسنَد** — ولا يبقى ينتظر حتى تنقضي مهلتُه. */
    expect(staleRow?.status).toBe('ASSIGNED');
    expect(staleRow?.providerId).not.toBeNull();
    /** **والطازجُ يُترك** — فالنافذةُ حقُّ المزوّد في الالتقاط. */
    expect(freshRow?.status).toBe('NEW');
    expect(freshRow?.providerId).toBeNull();
  });
});
