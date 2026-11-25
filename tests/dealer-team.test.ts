import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { acceptPendingInvite, dealerTeam, inviteMember, revokeInvite } from '@/lib/domain/dealer-team';

/**
 * ═══ فريقُ المعرض ودعواتُه — `D9` ═══
 *
 * **والدعوةُ حالٌ قبل العضوية**: المدعوُّ قد لا يكون له حسابٌ أصلًا،
 * فتُسجَّل بجواله ويصير عضوًا حين يدخل برمزه هو.
 */

const stamp = String(Date.now()).slice(-8);
const made: { users: string[]; branches: string[]; invites: string[] } = {
  users: [], branches: [], invites: [],
};

/**
 * ═══ والتنظيفُ بما يمكن أن يُنشَأ لا بما سُجِّل ═══
 *
 * كان يتتبّع المعرّفات، **فدعوةٌ نجحت في تشغيلٍ لم يصل سطرَ التتبّع
 * بقيت** — وأسقطت التشغيلَ التالي بـ`ALREADY_INVITED`، فبدا تقطّعًا
 * وهو أثرٌ لم يُمسح. وأرقامُ هذا الملفّ كلُّها ببادئةٍ واحدة،
 * فتُحذف بها.
 */
const TEST_PHONE = '+96659900';

async function cleanup(): Promise<void> {
  await db.dealerInvite.deleteMany({ where: { phone: { startsWith: TEST_PHONE } } });
  if (made.invites.length > 0) await db.dealerInvite.deleteMany({ where: { id: { in: made.invites } } });
  await db.user.deleteMany({
    where: { phone: { startsWith: TEST_PHONE }, listings: { none: {} }, ordersAsBuyer: { none: {} } },
  });
  if (made.users.length > 0) {
    await db.user.updateMany({ where: { id: { in: made.users } }, data: { branchId: null } });
    await db.user.deleteMany({ where: { id: { in: made.users } } });
  }
  if (made.branches.length > 0) await db.branch.deleteMany({ where: { id: { in: made.branches } } });
  made.invites = []; made.users = []; made.branches = [];
}

afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

/**
 * ═══ والطقمُ يشترط ما يفترضه ═══
 *
 * أوّلُ صياغةٍ أخذت «أوّلَ معرضٍ نشط» — ووقعت على معرضٍ **مالكُه على
 * الباقة المجّانية**، و`team_seats` فيها صفر. فسقطت خمسةُ اختبارات
 * بـ`NO_SEATS`، **وهو سلوكٌ صحيح**: الخطأ في الطقم لا في الشيفرة.
 *
 * فيُطلب معرضٌ فيه مقعدٌ شاغر، ويُقال صراحةً إن لم يوجد — ولا
 * يُنتظَر أن تأتي به البذرة.
 */
async function fixture() {
  const candidates = await db.dealer.findMany({
    where: { status: 'ACTIVE', members: { some: { dealerRole: 'OWNER' } } },
    select: { id: true, nameAr: true },
  });
  let picked: { id: string; nameAr: string } | null = null;
  for (const candidate of candidates) {
    const team = await dealerTeam(candidate.id);
    if (team.seatsTotal !== null && team.seatsUsed < team.seatsTotal) {
      picked = candidate;
      break;
    }
  }
  expect(picked, 'لا معرضَ فيه مقعدٌ شاغر — والبذرةُ تزرع واحدًا على باقةٍ تحمل مقاعد').not.toBeNull();
  const dealer = await db.dealer.findUniqueOrThrow({ where: { id: picked?.id ?? '' } });
  const owner = await db.user.findFirstOrThrow({ where: { dealerId: dealer.id, dealerRole: 'OWNER' } });
  const branch = await db.branch.create({
    data: { dealerId: dealer.id, name: `فرع ${stamp}`, city: 'الرياض' },
  });
  made.branches.push(branch.id);
  return { dealer, owner, branch };
}

const track = async (dealerId: string, phone: string): Promise<void> => {
  const row = await db.dealerInvite.findFirst({ where: { dealerId, phone }, select: { id: true } });
  if (row !== null) made.invites.push(row.id);
};

describe('دعوات فريق المعرض', () => {
  it('والجوال يطبع — فلا دعوتان لرقم واحد بصيغتين', async () => {
    const { dealer, owner } = await fixture();
    const first = await inviteMember({
      dealerId: dealer.id, phone: '0599000111', role: 'ACCOUNTANT', invitedById: owner.id,
    });
    expect(first.ok).toBe(true);
    await track(dealer.id, '+966599000111');

    const again = await inviteMember({
      dealerId: dealer.id, phone: '+966599000111', role: 'ACCOUNTANT', invitedById: owner.id,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('ALREADY_INVITED');
  });

  /**
   * **والإغفالُ يمنح صلاحية.** `branchId: null` تعني «كل الفروع»،
   * فبائعٌ دُعي بلا فرعٍ يرى مخزون المعرض كلَّه — **ولا خطأ يظهر**،
   * ولا أحد يشكو من صلاحيةٍ زائدة.
   */
  it('ومبيعات بلا فرع يرد — متى كان للمعرض فروع', async () => {
    const { dealer, owner, branch } = await fixture();
    const bad = await inviteMember({
      dealerId: dealer.id, phone: '0599000222', role: 'SALES', invitedById: owner.id,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('SALES_NEEDS_BRANCH');

    const good = await inviteMember({
      dealerId: dealer.id, phone: '0599000222', role: 'SALES', branchId: branch.id, invitedById: owner.id,
    });
    expect(good.ok, good.ok ? '' : `رُفضت بـ${good.reason}`).toBe(true);
    await track(dealer.id, '+966599000222');
  });

  it('ومالك ثان لا يدعى — الملكية تنتقل ولا تمنح', async () => {
    const { dealer, owner } = await fixture();
    const result = await inviteMember({
      dealerId: dealer.id, phone: '0599000333', role: 'OWNER', invitedById: owner.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('OWNER_NOT_INVITABLE');
  });

  /**
   * **والمقعدُ يشغله المدعوُّ كما يشغله العضو.** دعوةٌ لا تُحسب تجعل
   * المعرضَ يدعو أكثر من مقاعده، **فيُردّ من قبل الدعوة** — وبابٌ
   * فُتح ثمّ أُغلق في وجه من دخل أسوأ من بابٍ لم يُفتح.
   */
  it('والدعوة المعلقة تشغل مقعدا', async () => {
    const { dealer, owner } = await fixture();
    const before = await dealerTeam(dealer.id);

    await inviteMember({ dealerId: dealer.id, phone: '0599000444', role: 'ACCOUNTANT', invitedById: owner.id });
    await track(dealer.id, '+966599000444');

    const after = await dealerTeam(dealer.id);
    expect(after.seatsUsed).toBe(before.seatsUsed + 1);
    expect(after.members.some((m) => m.pending && m.phone === '+966599000444')).toBe(true);
  });

  it('وتقبل عند أول دخول — ويصير عضوا بدوره وفرعه', async () => {
    const { dealer, owner, branch } = await fixture();
    const phone = `+9665990005${stamp.slice(-2)}`;
    await inviteMember({
      dealerId: dealer.id, phone, role: 'SALES', branchId: branch.id, invitedById: owner.id,
    });
    await track(dealer.id, phone);

    /** والمدعوُّ ينشئ حسابَه بنفسه — فالدعوةُ لا تُنشئه نيابةً عنه. */
    const invited = await db.user.create({ data: { phone, name: 'مدعو' } });
    made.users.push(invited.id);

    const result = await acceptPendingInvite(invited.id);
    expect(result.accepted).toBe(true);

    const row = await db.user.findUniqueOrThrow({ where: { id: invited.id } });
    expect(row.dealerId).toBe(dealer.id);
    expect(row.dealerRole).toBe('SALES');
    expect(row.branchId).toBe(branch.id);
  });

  it('ودعوة مسحوبة لا تقبل', async () => {
    const { dealer, owner } = await fixture();
    const phone = `+9665990006${stamp.slice(-2)}`;
    const invite = await inviteMember({ dealerId: dealer.id, phone, role: 'ACCOUNTANT', invitedById: owner.id });
    expect(invite.ok).toBe(true);
    if (!invite.ok) return;
    made.invites.push(invite.id);

    expect((await revokeInvite({ dealerId: dealer.id, inviteId: invite.id })).ok).toBe(true);

    const invited = await db.user.create({ data: { phone, name: 'مسحوب' } });
    made.users.push(invited.id);
    expect((await acceptPendingInvite(invited.id)).accepted).toBe(false);
  });
});
