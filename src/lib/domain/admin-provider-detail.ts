import { db } from '@/lib/db';
import type { ProviderAccountStatus, ProviderType, ServiceRequestStatus } from '@/generated/prisma/enums';

/**
 * ═══ ملفُّ المزوّد كاملًا — طلباتُه وحسابُه ومستحقّاته ═══
 *
 * طلب المالك (٢٠٢٦-١٠-١٤): «في حسابات المزوّدين نحتاج نطوّر صفحة
 * تفاصيل المزوّد: إضافة رصيد، والطلبات التي استلمها، ومستحقّاته، وكل
 * شيء يخصّه من ناحية الطلبات أو المدفوعات… كل شيء كل شيء».
 *
 * **ولم يكن للمزوّد صفحة أصلًا**: جدولٌ في `/admin/providers` يعرض
 * الحمل والتجاوزات ولا يفتح واحدًا منها. فمن يقرأ «ثلاثة متأخّرة» لا
 * يعرف أيُّها، ولا يصل إلى طلبٍ ليسأل عنه.
 *
 * ═══ وما يُحسب هنا وما يُقرأ من المزوّد ═══
 *
 * **الطلباتُ والمستحقّاتُ من دفترنا** — نعرفها ونملك إثباتها. **ورصيدُ
 * حساب الدفع من بوّابة المزوّدين** — لا نحوزه ولا نحسبه، وقراءتُه من
 * عندنا تجعلنا نعرض رقمًا نظنّه. وهذا الفرق هو الفرق بين مرآةٍ وأصل.
 */

export type ProviderRequestRow = {
  ref: string;
  serviceName: string;
  status: ServiceRequestStatus;
  city: string | null;
  amount: string;
  createdAt: string;
  dueAt: string | null;
  overdue: boolean;
};

export type ProviderStaff = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  lastSeenAt: string | null;
  mustChangePassword: boolean;
};

export type ProviderDetail = {
  id: string;
  nameAr: string;
  nameEn: string;
  type: ProviderType;
  active: boolean;
  contactPhone: string | null;
  contactEmail: string | null;
  cities: string[];
  slaHours: number | null;
  commissionPct: string | null;

  /** حالُ حساب الدفع كما قاله المزوّد آخر مزامنة */
  account: {
    status: ProviderAccountStatus;
    accountRef: string | null;
    payoutRef: string | null;
    note: string | null;
    syncedAt: string | null;
  };

  /**
   * ═══ العدّادات — وكلٌّ منها يربط إلى قائمته ═══
   *
   * **وعدّادٌ لا يُفتح يجعل القارئ يبحث يدويًّا** عن ثلاثة صفوفٍ في
   * مئة. وهو الصنف الذي أُصلح في غيره مرارًا.
   */
  counts: {
    offered: number;
    assigned: number;
    inProgress: number;
    done: number;
    failed: number;
    overdue: number;
  };

  /** ما استُحقّ له من طلباتٍ أُنجزت — **بدفترنا لا برصيد البوّابة** */
  earned: string;
  /** عدد الطلبات التي أُنجزت وبُني عليها هذا المبلغ */
  earnedFrom: number;

  requests: ProviderRequestRow[];
  staff: ProviderStaff[];
};

const OPEN: readonly ServiceRequestStatus[] = ['NEW', 'ASSIGNED', 'IN_PROGRESS'];

export async function providerDetail(
  id: string,
  now: Date = new Date(),
): Promise<ProviderDetail | null> {
  const row = await db.serviceProvider.findUnique({
    where: { id },
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      type: true,
      active: true,
      contactPhone: true,
      contactEmail: true,
      cities: true,
      slaHours: true,
      commissionPct: true,
      accountStatus: true,
      accountRef: true,
      payoutRef: true,
      accountNote: true,
      accountSyncAt: true,
      users: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          lastSeenAt: true,
          mustChangePassword: true,
        },
      },
    },
  });
  if (row === null) return null;

  const requests = await db.serviceRequest.findMany({
    where: { providerId: id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      ref: true,
      status: true,
      city: true,
      amount: true,
      createdAt: true,
      dueAt: true,
      service: { select: { nameAr: true } },
    },
  });

  const mapped: ProviderRequestRow[] = requests.map((request) => ({
    ref: request.ref,
    serviceName: request.service.nameAr,
    status: request.status,
    city: request.city,
    amount: request.amount.toString(),
    createdAt: request.createdAt.toISOString(),
    dueAt: request.dueAt?.toISOString() ?? null,
    /**
     * **والتجاوز بالوقت لا بالحالة وحدها** (البوابة ٤٢): طلبٌ انقضت
     * مهلتُه ولم يُغلق متجاوزٌ الآن، مرّت الوظيفة الدورية أو لم تمرّ.
     */
    overdue:
      OPEN.includes(request.status) &&
      request.dueAt !== null &&
      request.dueAt.getTime() <= now.getTime(),
  }));

  const by = (status: ServiceRequestStatus): number =>
    mapped.filter((request) => request.status === status).length;

  /**
   * ═══ المستحقّ — من المُنجَز وحده ═══
   *
   * **ولا يُحسب من المعروض ولا من الجاري**: طلبٌ لم يُنجَز لا يستحقّ
   * عليه المزوّد شيئًا، وعدُّه يُظهر له دَينًا لا نملكه. وهو الخطأ
   * نفسه الذي أُصلح في دفتر البائع.
   *
   * **والمبلغ قيمةُ الطلب لا حصّةُ المزوّد منه**: اقتطاعُ حصّتنا يقع
   * في التوزيع لدى البوّابة، ولا تُحسب هنا بقاعدةٍ ثانية تتباعد عنها.
   * فيُسمّى ما هو: «قيمةُ ما أنجزه».
   */
  const completed = mapped.filter((request) => request.status === 'DONE');
  const earned = completed.reduce((total, request) => total + Number(request.amount), 0);

  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    type: row.type,
    active: row.active,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    cities: row.cities,
    slaHours: row.slaHours,
    commissionPct: row.commissionPct?.toFixed(2) ?? null,
    account: {
      status: row.accountStatus,
      accountRef: row.accountRef,
      payoutRef: row.payoutRef,
      note: row.accountNote,
      syncedAt: row.accountSyncAt?.toISOString() ?? null,
    },
    counts: {
      offered: by('NEW'),
      assigned: by('ASSIGNED'),
      inProgress: by('IN_PROGRESS'),
      done: by('DONE'),
      failed: by('FAILED'),
      overdue: mapped.filter((request) => request.overdue).length,
    },
    earned: earned.toFixed(2),
    earnedFrom: completed.length,
    requests: mapped,
    staff: row.users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      active: user.active,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      mustChangePassword: user.mustChangePassword,
    })),
  };
}
