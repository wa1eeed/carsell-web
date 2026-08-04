import { Prisma } from '@/generated/prisma/client';
import type { DealerStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { MIN_DEALER_NOTE } from './dealer-rules';

export { MIN_DEALER_NOTE } from './dealer-rules';

/**
 * ═══ A26 — التجار والمعارض ═══
 *
 * `Dealer.verified` رايةٌ **بلا كاتب**: الشارة تُقرأ في صفحة المعرض
 * العامّة وفي بطاقة الإعلان، ولا شيء في المنتج يمنحها. فكل معرضٍ
 * مسجَّل يبقى `PENDING` إلى الأبد — وهو الصنف نفسه الذي وُجد في
 * `idVerified`.
 *
 * ═══ والتحقّق قبل الشارة ═══
 *
 * التصميم يعدّد ما يُتحقَّق منه: السجل التجاريّ ساريًا · مطابقة الاسم
 * · الرقم الضريبيّ إن كان مسجَّلًا · الآيبان باسم المنشأة · العنوان.
 * وهي فحوصٌ **بشرية بمستنداتٍ خارج المنصّة** — فلا تُدّعى آليةً، لكنّ
 * الشاشة تعرض ما لدينا منها ليُقارَن.
 *
 * ═══ ولا نُدير مخزونه ═══
 *
 * «أنت تمنح شارة تاجر موثّق وتربط الباقة والعمولة — ولا تدير مخزونه».
 * فالعدد يُعرض ولا يُلمس، ولا زرّ هنا يمسّ إعلانًا.
 */

export type DealerRow = {
  id: string;
  slug: string;
  name: string;
  city: string;
  crNumber: string | null;
  vatNumber: string | null;
  verified: boolean;
  status: DealerStatus;
  /** المخزون المعروض — يُقرأ ولا يُلمس */
  inventory: number;
  ratingAvg: string | null;
  ratingCount: number;
  memberCount: number;
};

export type DealerStats = {
  total: number;
  active: number;
  pending: number;
  suspended: number;
  /** متوسط المخزون لكل معرض نشط */
  averageInventory: number;
  /** نصيب المعارض من الإعلانات المنشورة */
  listingSharePct: number;
};

export async function dealerList(
  status: DealerStatus | null = null,
): Promise<DealerRow[]> {
  const dealers = await db.dealer.findMany({
    where: status === null ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      slug: true,
      nameAr: true,
      city: true,
      crNumber: true,
      vatNumber: true,
      verified: true,
      status: true,
      ratingAvg: true,
      ratingCount: true,
      _count: { select: { members: true } },
    },
  });

  if (dealers.length === 0) return [];

  /**
   * المخزون من الإعلانات المنشورة لأعضاء المعرض — **استعلامٌ واحد**.
   *
   * وحلقةٌ تستعلم لكل معرض تُنتج مئتَي استعلام على صفحة، ولا يظهر ذلك
   * على بياناتٍ مزروعة ويظهر أوّل يومٍ حقيقيّ.
   */
  const counts = await db.listing.groupBy({
    by: ['sellerId'],
    where: { status: 'PUBLISHED' },
    _count: true,
  });

  const members = await db.user.findMany({
    where: { dealerId: { in: dealers.map((dealer) => dealer.id) } },
    select: { id: true, dealerId: true },
  });

  const inventoryOf = (dealerId: string): number =>
    members
      .filter((member) => member.dealerId === dealerId)
      .reduce(
        (sum, member) => sum + (counts.find((row) => row.sellerId === member.id)?._count ?? 0),
        0,
      );

  return dealers.map((dealer) => ({
    id: dealer.id,
    slug: dealer.slug,
    name: dealer.nameAr,
    city: dealer.city,
    crNumber: dealer.crNumber,
    vatNumber: dealer.vatNumber,
    verified: dealer.verified,
    status: dealer.status,
    inventory: inventoryOf(dealer.id),
    ratingAvg: dealer.ratingAvg === null ? null : dealer.ratingAvg.toFixed(1),
    ratingCount: dealer.ratingCount,
    memberCount: dealer._count.members,
  }));
}

export async function dealerStats(): Promise<DealerStats> {
  const [grouped, dealerListings, allListings] = await Promise.all([
    db.dealer.groupBy({ by: ['status'], _count: true }),
    db.listing.count({ where: { status: 'PUBLISHED', seller: { dealerId: { not: null } } } }),
    db.listing.count({ where: { status: 'PUBLISHED' } }),
  ]);

  const at = (status: DealerStatus): number =>
    grouped.find((row) => row.status === status)?._count ?? 0;

  const active = at('ACTIVE');

  return {
    total: grouped.reduce((sum, row) => sum + row._count, 0),
    active,
    pending: at('PENDING'),
    suspended: at('SUSPENDED'),
    averageInventory: active === 0 ? 0 : Math.round(dealerListings / active),
    listingSharePct: allListings === 0 ? 0 : Math.round((dealerListings / allListings) * 100),
  };
}

export type DealerDecision = 'VERIFY' | 'SUSPEND' | 'REINSTATE';

export type DealerFailure = 'DEALER_NOT_FOUND' | 'CR_REQUIRED' | 'NOTE_REQUIRED' | 'ALREADY';

export type DealerResult =
  | { ok: true; status: DealerStatus; verified: boolean }
  | { ok: false; reason: DealerFailure };

/**
 * قرار المعرض — **والتوثيق يشترط سجلًّا تجاريًّا**.
 *
 * الشارة تقول للمشتري «هذه منشأة مسجَّلة»، ومنحُها بلا رقم سجلّ يجعل
 * الوعد بلا سند. والفحص هنا لا في الشاشة: زرٌّ معطَّل يُلتفّ عليه
 * بطلبٍ واحد.
 */
export async function decideDealer(
  input: {
    dealerId: string;
    decision: DealerDecision;
    note: string | null;
    adminId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<DealerResult> {
  const dealer = await db.dealer.findUnique({
    where: { id: input.dealerId },
    select: { id: true, status: true, verified: true, crNumber: true },
  });

  if (dealer === null) return { ok: false, reason: 'DEALER_NOT_FOUND' };

  const note = input.note?.trim() ?? '';
  if (input.decision === 'SUSPEND' && note.length < MIN_DEALER_NOTE) {
    return { ok: false, reason: 'NOTE_REQUIRED' };
  }
  if (input.decision === 'VERIFY') {
    if (dealer.crNumber === null || dealer.crNumber.trim() === '') {
      return { ok: false, reason: 'CR_REQUIRED' };
    }
    if (dealer.verified && dealer.status === 'ACTIVE') return { ok: false, reason: 'ALREADY' };
  }

  const next: { status: DealerStatus; verified: boolean } =
    input.decision === 'VERIFY'
      ? { status: 'ACTIVE', verified: true }
      : input.decision === 'SUSPEND'
        ? { status: 'SUSPENDED', verified: false }
        : { status: 'ACTIVE', verified: dealer.verified };

  await db.dealer.update({ where: { id: dealer.id }, data: next });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'Dealer',
      entityId: dealer.id,
      action: `dealer.${input.decision.toLowerCase()}`,
      before: { status: dealer.status, verified: dealer.verified },
      after: { ...next, note: note === '' ? null : note },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, ...next };
}

/** ما يجب التحقّق منه قبل الشارة — مفاتيح، والشاشة تصوغها. */
export const VERIFICATION_CHECKS = [
  'cr_valid',
  'name_matches',
  'vat_if_registered',
  'iban_in_entity_name',
  'address_confirmed',
] as const;

/** إجماليّ ما باعه المعرض — للوحة المفردة لاحقًا. */
export async function dealerGmv(dealerId: string): Promise<string> {
  const members = await db.user.findMany({ where: { dealerId }, select: { id: true } });
  if (members.length === 0) return '0.00';

  const sum = await db.order.aggregate({
    where: { sellerId: { in: members.map((member) => member.id) }, status: 'COMPLETED' },
    _sum: { agreedPrice: true },
  });

  return (sum._sum.agreedPrice ?? new Prisma.Decimal(0)).toFixed(2);
}
