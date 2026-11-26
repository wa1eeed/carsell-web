import { db } from '@/lib/db';
import type { DealerRole } from '@/generated/prisma/enums';
import { normalizeSaudiPhone } from './phone';
import { resolveEntitlements } from './entitlements';

/**
 * ═══ فريقُ المعرض ودعواتُه — `D9` ═══
 *
 * **والدعوةُ حالٌ قبل العضوية.** الترميز يرسم «دعوة معلّقة» في عمود
 * الحالة: المدعوُّ قد لا يكون له حسابٌ أصلًا، **وكتابةُ دورٍ على
 * حسابٍ لم يُنشأ تعني إنشاءَ حسابٍ نيابةً عن إنسان**. فتُسجَّل الدعوة
 * بجواله، ويصير عضوًا حين يدخل برمزه هو.
 */

export const INVITE_DAYS = 14;

export type TeamFailure =
  | 'PHONE_INVALID'
  | 'ALREADY_MEMBER'
  | 'ALREADY_INVITED'
  | 'NO_SEATS'
  | 'OWNER_NOT_INVITABLE'
  | 'BRANCH_NOT_FOUND'
  /** مبيعاتٌ بلا فرعٍ في معرضٍ له فروع — «فرعه» بلا معنًى فيُعطى الكلّ. */
  | 'SALES_NEEDS_BRANCH'
  | 'NOT_FOUND';

export type TeamMember = {
  userId: string | null;
  inviteId: string | null;
  name: string | null;
  phone: string;
  role: DealerRole;
  branchName: string | null;
  pending: boolean;
};

export type TeamView = {
  members: TeamMember[];
  /** المقاعدُ من الباقة — «٦ من ٨ مقاعد» في الترميز. */
  seatsUsed: number;
  seatsTotal: number | null;
};

/**
 * ═══ والمقعدُ يشغله المدعوُّ كما يشغله العضو ═══
 *
 * دعوةٌ معلّقة لا تُحسب تجعل معرضًا بثمانية مقاعد يدعو عشرين، فيدخل
 * الثامنُ ويُردّ التاسع **وقد قبل الدعوة** — وبابٌ فُتح ثمّ أُغلق في
 * وجه من دخل أسوأ من بابٍ لم يُفتح.
 */
export async function dealerTeam(dealerId: string, now: Date = new Date()): Promise<TeamView> {
  const [members, invites, owner] = await Promise.all([
    db.user.findMany({
      where: { dealerId, dealerRole: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, name: true, phone: true, dealerRole: true,
        branch: { select: { name: true } },
      },
    }),
    db.dealerInvite.findMany({
      where: { dealerId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, phone: true, role: true, branch: { select: { name: true } } },
    }),
    db.user.findFirst({ where: { dealerId, dealerRole: 'OWNER' }, select: { id: true } }),
  ]);

  /** والمقاعدُ من اشتراك المالك — الباقةُ للمنشأة لا لكلّ موظّف. */
  const seats =
    owner === null
      ? null
      : Number((await resolveEntitlements({ userId: owner.id, dealerId }, now)).team_seats ?? 0);

  return {
    members: [
      ...members.map((m) => ({
        userId: m.id,
        inviteId: null,
        name: m.name,
        phone: m.phone,
        role: m.dealerRole as DealerRole,
        branchName: m.branch?.name ?? null,
        pending: false,
      })),
      ...invites.map((i) => ({
        userId: null,
        inviteId: i.id,
        name: null,
        phone: i.phone,
        role: i.role,
        branchName: i.branch?.name ?? null,
        pending: true,
      })),
    ],
    seatsUsed: members.length + invites.length,
    seatsTotal: seats === null || Number.isNaN(seats) ? null : seats,
  };
}

export async function inviteMember(
  input: {
    dealerId: string;
    phone: string;
    role: DealerRole;
    branchId?: string | null;
    invitedById: string;
  },
  now: Date = new Date(),
): Promise<{ ok: true; id: string } | { ok: false; reason: TeamFailure }> {
  /** **ومالكٌ ثانٍ لا يُدعى.** الملكيّةُ تنتقل ولا تُمنَح بدعوة. */
  if (input.role === 'OWNER') return { ok: false, reason: 'OWNER_NOT_INVITABLE' };

  const phone = normalizeSaudiPhone(input.phone);
  if (phone === null) return { ok: false, reason: 'PHONE_INVALID' };

  /**
   * ═══ والإغفالُ يمنح صلاحية ═══
   *
   * مصفوفةُ `D9` تقول إنّ المبيعات يرى **فرعَه**، و`branchId: null`
   * تعني في الشيفرة «كلّ الفروع» — فبائعٌ دُعي بلا فرعٍ يرى مخزونَ
   * المعرض كلَّه وعروضَه. **وثغرةٌ بالإغفال لا تُكتشف**: لا خطأ
   * يظهر، ولا أحدَ يشكو من صلاحيةٍ زائدة.
   *
   * وحيث لا فروعَ أصلًا فـ«كلّ الفروع» هي فرعُه الوحيد — فلا يُشترط.
   */
  if (input.role === 'SALES' && input.branchId == null) {
    const anyBranch = await db.branch.findFirst({
      where: { dealerId: input.dealerId, active: true },
      select: { id: true },
    });
    if (anyBranch !== null) return { ok: false, reason: 'SALES_NEEDS_BRANCH' };
  }

  if (input.branchId != null) {
    const branch = await db.branch.findFirst({
      where: { id: input.branchId, dealerId: input.dealerId, active: true },
      select: { id: true },
    });
    if (branch === null) return { ok: false, reason: 'BRANCH_NOT_FOUND' };
  }

  const existing = await db.user.findFirst({
    where: { phone, dealerId: input.dealerId, dealerRole: { not: null } },
    select: { id: true },
  });
  if (existing !== null) return { ok: false, reason: 'ALREADY_MEMBER' };

  const team = await dealerTeam(input.dealerId, now);
  if (team.seatsTotal !== null && team.seatsUsed >= team.seatsTotal) {
    return { ok: false, reason: 'NO_SEATS' };
  }

  const open = await db.dealerInvite.findFirst({
    where: { dealerId: input.dealerId, phone, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    select: { id: true },
  });
  if (open !== null) return { ok: false, reason: 'ALREADY_INVITED' };

  /**
   * **ودعوةٌ منتهيةٌ تُستبدل لا تُكدَّس.** القيدُ الفريد على
   * (المعرض، الجوال) يمنع صفًّا ثانيًا، فدعوةٌ انقضت تُحدَّث بمهلةٍ
   * جديدة — وإلّا مُنع المشغّل من إعادة الدعوة إلى الأبد.
   */
  const row = await db.dealerInvite.upsert({
    where: { dealerId_phone: { dealerId: input.dealerId, phone } },
    create: {
      dealerId: input.dealerId,
      phone,
      role: input.role,
      branchId: input.branchId ?? null,
      invitedById: input.invitedById,
      expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000),
      createdAt: now,
    },
    update: {
      role: input.role,
      branchId: input.branchId ?? null,
      invitedById: input.invitedById,
      expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000),
      acceptedAt: null,
      revokedAt: null,
      createdAt: now,
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

/** يسحب دعوةً معلّقة — وبابٌ فُتح يُغلق قبل أن يُدخَل منه. */
export async function revokeInvite(
  input: { dealerId: string; inviteId: string },
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: TeamFailure }> {
  const result = await db.dealerInvite.updateMany({
    where: { id: input.inviteId, dealerId: input.dealerId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count === 0 ? { ok: false, reason: 'NOT_FOUND' } : { ok: true };
}

/**
 * ═══ قبولُ الدعوة — عند أوّل دخولٍ بالجوال المدعوّ ═══
 *
 * **ويقع تلقائيًّا لا بزرّ.** من دُعي ثمّ دخل يجد اللوحة مفتوحة؛
 * وزرُّ «اقبل الدعوة» يحتاج شاشةً يصلها، وهي شاشةٌ لا يعرف وجودَها.
 */
export async function acceptPendingInvite(
  userId: string,
  now: Date = new Date(),
): Promise<{ accepted: boolean }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, dealerId: true, dealerRole: true },
  });
  /** ومن كان في فريقٍ لا تنقله دعوةٌ أخرى بلا خروجه منه. */
  if (user === null || user.dealerRole !== null) return { accepted: false };

  const invite = await db.dealerInvite.findFirst({
    where: { phone: user.phone, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, dealerId: true, role: true, branchId: true },
  });
  if (invite === null) return { accepted: false };

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { dealerId: invite.dealerId, dealerRole: invite.role, branchId: invite.branchId },
    }),
    db.dealerInvite.update({ where: { id: invite.id }, data: { acceptedAt: now } }),
  ]);
  return { accepted: true };
}
