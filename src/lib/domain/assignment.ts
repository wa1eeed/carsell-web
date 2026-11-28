import { db } from '@/lib/db';
import type { ProviderType, ServiceRequestStatus } from '@/generated/prisma/enums';
import { SLA_BREACHES_BEFORE_SUSPENSION } from './provider-rules';

/**
 * ═══ محرّكُ الإسناد — من يستحقّ هذا الطلب، ولماذا ═══
 *
 * سأل المالك ٢٠٢٦-١١-٢٨: «كيف آلية الإسناد؟ وكيف يُحدَّد أيُّ
 * المزوّدين وفي أيّ مدينة؟». وقِيس الجواب قبل أن يُكتب:
 *
 * **بابان، ولا ترتيب بينهما.** الطلبُ يُنشأ بلا مزوّد، فيراه **كلُّ**
 * مزوّدٍ صنفُه صنفُ الخدمة وتغطيتُه تشمل مدينة الطلب، **وأوّلُ من
 * يضغط «اقبل» يأخذه**. وللمشغّل بابٌ ثانٍ يُسنِد به يدويًّا بالشروط
 * نفسِها. فلا حِملَ يُوازَن، ولا التزامَ يُكافَأ، ولا دورَ يُحفظ.
 *
 * **وشاشةُ المزوّدين كانت تَعِد بما لا يقع**: «تجاوز الالتزام مرّتين
 * في شهر يُسقط المزوّد من **الإسناد الآليّ** حتى مراجعته» — ولا إسنادَ
 * آليّ في المنتج كلِّه، ولا شيء يقرأ الحدّ. فهذا الملفّ يجعل الجملةَ
 * صادقة.
 *
 * ═══ ومجموعةُ الإسناد تُشتقّ ولا تُخزَّن ═══
 *
 * «مجموعة إسناد» هي في حقيقتها **(صنفُ الخدمة × المدينة)**: من يغطّي
 * هذه المدينة بهذا الصنف. وجدولٌ يُخزّنها نسخةٌ ثانيةٌ من تغطية
 * المزوّد تتباعد أوّلَ تعديل — فمزوّدٌ يضيف مدينةً ولا يُضاف إلى
 * مجموعتها يبقى خارجها بلا أن يشكو أحد. فتُحسب من `cities` و`type`
 * عند السؤال.
 */

/** ترتيبُ المرشّح — كلُّ عاملٍ رقمٌ يُعرض، فالمشغّل يرى لماذا. */
export type Candidate = {
  providerId: string;
  nameAr: string;
  /** أهو أهلٌ لهذا الطلب أصلًا؟ */
  eligible: boolean;
  /** ما منعه — و`null` للأهل. */
  blockedBy: 'INACTIVE' | 'WRONG_TYPE' | 'CITY_NOT_COVERED' | 'SLA_SUSPENDED' | null;
  /** ما بين يديه الآن: جديدٌ ومُسنَدٌ وجارٍ. */
  openLoad: number;
  /** تجاوزاتُ الالتزام في الثلاثين يومًا الماضية. */
  recentBreaches: number;
  /** التزامُه بالساعات — و`null` لمن لم يُحدَّد له. */
  slaHours: number | null;
  /** متى أُسنِد إليه آخرُ طلب — و`null` لمن لم يُسنَد إليه قطّ. */
  lastAssignedAt: Date | null;
};

const OPEN: readonly ServiceRequestStatus[] = ['NEW', 'ASSIGNED', 'IN_PROGRESS'];

/**
 * ═══ الترتيب — ثلاثةُ عوامل بترتيبٍ معلَن ═══
 *
 * **والأهليّةُ شرطٌ لا وزن**: من لا يغطّي المدينة لا يُرتَّب أدنى، بل
 * يخرج. ثمّ:
 *
 * ١. **الأقلُّ تجاوزًا** — فالالتزامُ يُكافأ، ومن تأخّر مرّةً يأتي بعد
 *    من لم يتأخّر. (ومن بلغ الحدّ خرج أصلًا.)
 * ٢. **الأقلُّ حِملًا** — طلبان عند واحدٍ وعشرةٌ عند آخر ليسا سواءً،
 *    وتوزيعُ العمل هو ما يمنع التأخّر قبل أن يقع.
 * ٣. **الأقدمُ إسنادًا** — دورٌ يحفظ النصيب بين المتساوين، فلا يأخذ
 *    الأوّلُ أبجديًّا كلَّ شيء.
 *
 * والاسمُ آخرًا ليثبت الترتيب: قائمةٌ تتبدّل بين تحميلين تُقرأ عشوائية.
 */
export function rankCandidates(rows: readonly Candidate[]): Candidate[] {
  return [...rows].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.recentBreaches !== b.recentBreaches) return a.recentBreaches - b.recentBreaches;
    if (a.openLoad !== b.openLoad) return a.openLoad - b.openLoad;
    const at = a.lastAssignedAt?.getTime() ?? 0;
    const bt = b.lastAssignedAt?.getTime() ?? 0;
    if (at !== bt) return at - bt;
    return a.nameAr.localeCompare(b.nameAr, 'ar');
  });
}

export type CandidateList = {
  request: {
    ref: string;
    city: string | null;
    /** **و`null` خدمةٌ بلا صنفِ مزوّد** — تُنفَّذ عندنا ولا تُسنَد. */
    providerType: ProviderType | null;
    assignable: boolean;
  };
  candidates: Candidate[];
};

/**
 * مرشّحو طلبٍ بعينه — **ومعهم غيرُ الأهل وسببُهم**.
 *
 * فمشغّلٌ يرى «لا مزوّد» يحتاج أن يعرف: أليس في المدينة أحد؟ أم
 * الجميعُ موقوفون؟ وقائمةٌ تعرض الأهلَ وحدهم تُجيب «لا أحد» ولا تقول
 * لماذا — فلا يعرف أيُفعّل مزوّدًا أم يوسّع تغطيةَ آخر.
 */
export async function candidatesFor(
  ref: string,
  now: Date = new Date(),
): Promise<CandidateList | null> {
  const request = await db.serviceRequest.findUnique({
    where: { ref },
    select: {
      ref: true,
      city: true,
      status: true,
      providerId: true,
      service: { select: { providerType: true } },
    },
  });
  if (request === null) return null;

  /**
   * **وخدمةٌ بلا صنفِ مزوّد لا مرشّحَ لها** — ولا تُقرأ قائمةٌ فارغة
   * على أنّها «لا أحد يغطّي المدينة»: الفرقُ بين الحالين قرارٌ مختلف.
   */
  const providerType = request.service.providerType;
  if (providerType === null) {
    return {
      request: {
        ref: request.ref,
        city: request.city,
        providerType: null,
        assignable: false,
      },
      candidates: [],
    };
  }

  const providers = await db.serviceProvider.findMany({
    where: { type: providerType },
    select: { id: true, nameAr: true, type: true, cities: true, active: true, slaHours: true },
  });

  const ids = providers.map((provider) => provider.id);
  const since = new Date(now.getTime() - 30 * 24 * 3_600_000);

  const [load, breaches, last] = await Promise.all([
    db.serviceRequest.groupBy({
      by: ['providerId'],
      where: { providerId: { in: ids }, status: { in: [...OPEN] } },
      _count: { _all: true },
    }),
    /**
     * **والتجاوزُ يُقاس على ما أُنجز متأخّرًا وما تأخّر ولم يُنجز.**
     * عدُّ المنجَز وحده يكافئ من ترك الطلبَ مفتوحًا إلى الأبد.
     */
    db.serviceRequest.findMany({
      where: {
        providerId: { in: ids },
        dueAt: { not: null, lt: now },
        createdAt: { gte: since },
        OR: [{ completedAt: null }, { completedAt: { gt: db.serviceRequest.fields.dueAt } }],
      },
      select: { providerId: true },
    }),
    db.serviceRequest.groupBy({
      by: ['providerId'],
      where: { providerId: { in: ids } },
      _max: { createdAt: true },
    }),
  ]);

  const loadOf = new Map(load.map((row) => [row.providerId, row._count._all]));
  const lastOf = new Map(last.map((row) => [row.providerId, row._max.createdAt]));
  const breachOf = new Map<string, number>();
  for (const row of breaches) {
    if (row.providerId === null) continue;
    breachOf.set(row.providerId, (breachOf.get(row.providerId) ?? 0) + 1);
  }

  const candidates = providers.map((provider): Candidate => {
    const recentBreaches = breachOf.get(provider.id) ?? 0;
    const coversCity =
      provider.cities.length === 0
      || request.city === null
      || provider.cities.includes(request.city);

    /** **والترتيبُ في المنع يقول للمشغّل ما يفعله**: التفعيل قبل التغطية. */
    const blockedBy: Candidate['blockedBy'] = !provider.active
      ? 'INACTIVE'
      : provider.type !== providerType
        ? 'WRONG_TYPE'
        : !coversCity
          ? 'CITY_NOT_COVERED'
          : recentBreaches >= SLA_BREACHES_BEFORE_SUSPENSION
            ? 'SLA_SUSPENDED'
            : null;

    return {
      providerId: provider.id,
      nameAr: provider.nameAr,
      eligible: blockedBy === null,
      blockedBy,
      openLoad: loadOf.get(provider.id) ?? 0,
      recentBreaches,
      slaHours: provider.slaHours,
      lastAssignedAt: lastOf.get(provider.id) ?? null,
    };
  });

  return {
    request: {
      ref: request.ref,
      city: request.city,
      providerType,
      assignable: request.status === 'NEW' && request.providerId === null,
    },
    candidates: rankCandidates(candidates),
  };
}

/**
 * ═══ تغطيةُ المدن — أين لا أحد ═══
 *
 * **والفجوةُ تُعرض قبل أن تُطلب**: (صنفٌ × مدينة) بلا مزوّدٍ أهلٍ تعني
 * أنّ كلَّ طلبٍ يصلها يبقى معلَّقًا حتى تنقضي مهلتُه — والمشغّلُ يراه
 * واحدًا واحدًا ولا يرى النمط.
 */
export type CoverageCell = {
  type: ProviderType;
  city: string;
  providers: number;
  /** الأهلُ منهم الآن: مفعَّلٌ وغيرُ موقوفٍ بالتجاوز. */
  eligible: number;
};

export async function coverageGaps(now: Date = new Date()): Promise<CoverageCell[]> {
  const [providers, cities] = await Promise.all([
    db.serviceProvider.findMany({
      select: { id: true, type: true, cities: true, active: true },
    }),
    db.city.findMany({ where: { visible: true }, select: { nameAr: true } }),
  ]);

  const since = new Date(now.getTime() - 30 * 24 * 3_600_000);
  const breaches = await db.serviceRequest.findMany({
    where: {
      providerId: { not: null },
      dueAt: { not: null, lt: now },
      createdAt: { gte: since },
      OR: [{ completedAt: null }, { completedAt: { gt: db.serviceRequest.fields.dueAt } }],
    },
    select: { providerId: true },
  });
  const breachOf = new Map<string, number>();
  for (const row of breaches) {
    if (row.providerId === null) continue;
    breachOf.set(row.providerId, (breachOf.get(row.providerId) ?? 0) + 1);
  }

  const cells: CoverageCell[] = [];
  const types = [...new Set(providers.map((provider) => provider.type))];

  for (const type of types) {
    for (const city of cities) {
      const covering = providers.filter(
        (provider) =>
          provider.type === type
          && (provider.cities.length === 0 || provider.cities.includes(city.nameAr)),
      );
      cells.push({
        type,
        city: city.nameAr,
        providers: covering.length,
        eligible: covering.filter(
          (provider) =>
            provider.active
            && (breachOf.get(provider.id) ?? 0) < SLA_BREACHES_BEFORE_SUSPENSION,
        ).length,
      });
    }
  }

  return cells;
}

/**
 * ═══ الإسنادُ الآليّ بعد مهلة الالتقاط ═══
 *
 * **والطلبُ الذي لا يلتقطه أحد يُنتظر مرّتين**: مرّةً للالتقاط ومرّةً
 * للتنفيذ. وبابُ الالتقاط حقٌّ لمزوّدٍ يراقب طابورَه — فتُترك له نافذةٌ
 * (`serviceClaimMinutes`)، ثمّ يُسنِد المحرّكُ ما بقي.
 *
 * **والإسنادُ مفردٌ لكلّ طلب**: مدينةُ هذا غيرُ مدينة ذاك، فمزوّدٌ
 * واحد للدفعة يردّ نصفَها. وفشلُ واحدٍ لا يوقف الباقين.
 *
 * **وما لا مرشّحَ له يُترك ولا يُحاوَل كلَّ دقيقة**: غيابُ المزوّد
 * مشكلةُ تغطيةٍ تُقرأ من شاشة المزوّدين، لا طابورٌ يُعاد.
 */
export async function autoAssignStaleRequests(now: Date = new Date()): Promise<number> {
  const { deadline } = await import('./deadlines');
  const minutes = await deadline('serviceClaimMinutes');
  const cutoff = new Date(now.getTime() - minutes * 60_000);

  const stale = await db.serviceRequest.findMany({
    where: { status: 'NEW', providerId: null, createdAt: { lte: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: { ref: true },
  });
  if (stale.length === 0) return 0;

  /** **والإسنادُ يمرّ بمدخله الوحيد** — فالتحقّقُ واحد و`AuditLog` يُكتب. */
  const { autoAssignServiceRequests } = await import('./admin-services');
  const { SYSTEM_ACTOR } = await import('./system-actor');
  const result = await autoAssignServiceRequests(
    SYSTEM_ACTOR,
    stale.map((row) => row.ref),
    null,
    now,
  );

  return result.assigned.length;
}
