import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  COOLDOWN_HOURS,
  MARKETING_CAP_PER_MONTH,
  resolveSegment,
  saveSegment,
  sendCampaign,
  validRules,
} from '@/lib/domain/admin-campaigns';
import {
  PUSH_BODY_LIMIT,
  PUSH_TITLE_LIMIT,
  isChannelEnabled,
  listChannels,
  pushFits,
  setPreference,
  updateChannel,
} from '@/lib/domain/push-channels';

afterAll(async () => {
  await db.$disconnect();
});

let seq = 0;
async function admin() {
  seq += 1;
  return db.adminUser.create({
    data: {
      email: `cmp${String(Date.now()).slice(-8)}${String(seq)}@carsell.one`,
      name: 'مسوّق', role: 'CONTENT', passwordHash: 'x',
    },
  });
}

async function user(consent: boolean) {
  seq += 1;
  return db.user.create({
    data: {
      phone: `+96650${String(Date.now()).slice(-6)}${String(seq).padStart(2, '0')}`,
      name: 'مستخدم اختبار',
      marketingConsent: consent,
      marketingConsentAt: consent ? new Date() : null,
    },
  });
}

describe('═══ معيار A9 ═══ الشريحة تُحوسَب وقت الإرسال', () => {
  /**
   * الإثبات: تُقاس الشريحة، ثمّ **تتغيّر البيانات**، ثمّ تُقاس ثانيةً
   * بلا لمس الشريحة نفسها. ولو كانت قائمةَ أعضاء محفوظةً لما تحرّك
   * الرقم.
   */
  it('سحب الموافقة بين قياسين ينقص العدد بلا تعديل الشريحة', async () => {
    const rules = [{ field: 'hasFavorites' }];
    const subject = await user(true);
    await db.favorite.create({
      data: { userId: subject.id, listingId: (await db.listing.findFirstOrThrow()).id },
    });

    const before = await resolveSegment(rules);
    expect(before.consented).toBeGreaterThan(0);

    // المستخدم يسحب موافقته — ولا أحد يمسّ الشريحة
    await db.user.update({ where: { id: subject.id }, data: { marketingConsent: false } });

    const after = await resolveSegment(rules);
    expect(after.consented).toBe(before.consented - 1);
    // ويبقى مطابقًا للقواعد — الفرق في الموافقة لا في المطابقة
    expect(after.matched).toBe(before.matched);

    await db.favorite.deleteMany({ where: { userId: subject.id } });
    await db.user.delete({ where: { id: subject.id } });
  });

  it('الإرسال يستبعد من سحب موافقته بعد إنشاء الحملة', async () => {
    const operator = await admin();
    const staying = await user(true);
    const leaving = await user(true);
    const listing = await db.listing.findFirstOrThrow();
    await db.favorite.createMany({
      data: [
        { userId: staying.id, listingId: listing.id },
        { userId: leaving.id, listingId: listing.id },
      ],
    });

    const saved = await saveSegment(
      operator,
      { key: `seg${String(Date.now()).slice(-8)}`, nameAr: 'لديه مفضلة', rules: [{ field: 'hasFavorites' }] },
      null,
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error('لم تُحفظ');

    const campaign = await db.campaign.create({
      data: {
        nameAr: 'حملة اختبار', channels: ['push'], segmentId: saved.id,
        status: 'SCHEDULED', createdBy: operator.id,
      },
    });

    // ═══ بعد الحفظ وقبل الإرسال ═══
    await db.user.update({ where: { id: leaving.id }, data: { marketingConsent: false } });

    const result = await sendCampaign(operator, campaign.id, null);
    expect(result.ok).toBe(true);

    const reached = await db.campaignSend.findMany({ where: { campaignId: campaign.id } });
    const ids = reached.map((row) => row.userId);
    expect(ids).toContain(staying.id);
    // ولم يصله شيء — والقائمة المحفوظة كانت ستُرسل إليه
    expect(ids).not.toContain(leaving.id);

    await db.campaignSend.deleteMany({ where: { campaignId: campaign.id } });
    await db.campaign.delete({ where: { id: campaign.id } });
    await db.segment.delete({ where: { id: saved.id } });
    await db.favorite.deleteMany({ where: { userId: { in: [staying.id, leaving.id] } } });
    await db.user.deleteMany({ where: { id: { in: [staying.id, leaving.id] } } });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('ثلاثة أرقام لا واحد — والفجوة بينها هي المعلومة', async () => {
    const counts = await resolveSegment([{ field: 'hasFavorites' }]);
    expect(counts.matched).toBeGreaterThanOrEqual(counts.consented);
    expect(counts.consented).toBeGreaterThanOrEqual(counts.reachable);
  });

  it('التهدئة تحجب من وصلته حملة قريبًا', async () => {
    const operator = await admin();
    const subject = await user(true);
    const listing = await db.listing.findFirstOrThrow();
    await db.favorite.create({ data: { userId: subject.id, listingId: listing.id } });

    const rules = [{ field: 'hasFavorites' }];
    const before = await resolveSegment(rules);

    const saved = await saveSegment(
      operator,
      { key: `cd${String(Date.now()).slice(-8)}`, nameAr: 'تهدئة', rules },
      null,
    );
    if (!saved.ok) throw new Error('لم تُحفظ');
    const campaign = await db.campaign.create({
      data: { nameAr: 'سابقة', channels: ['push'], segmentId: saved.id, createdBy: operator.id },
    });
    await db.campaignSend.create({
      data: { campaignId: campaign.id, userId: subject.id, channel: 'push', sentAt: new Date() },
    });

    const after = await resolveSegment(rules);
    expect(after.reachable).toBe(before.reachable - 1);
    // ويبقى موافقًا ومطابقًا — الحجب زمنيّ لا وصفيّ
    expect(after.consented).toBe(before.consented);

    expect(COOLDOWN_HOURS).toBe(72);
    expect(MARKETING_CAP_PER_MONTH).toBe(4);

    await db.campaignSend.deleteMany({ where: { campaignId: campaign.id } });
    await db.campaign.delete({ where: { id: campaign.id } });
    await db.segment.delete({ where: { id: saved.id } });
    await db.favorite.deleteMany({ where: { userId: subject.id } });
    await db.user.delete({ where: { id: subject.id } });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('قواعد غير صالحة تُرفض، والحقل المجهول لا يوسّع الشريحة', async () => {
    expect(validRules([])).toBe(false);
    expect(validRules([{ field: 'nope' }])).toBe(false);
    expect(validRules([{ field: 'hasFavorites' }])).toBe(true);

    const operator = await admin();
    const bad = await saveSegment(operator, { key: 'x1', nameAr: 'س', rules: [{ field: 'nope' }] }, null);
    expect(bad.ok).toBe(false);
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('حملة أُرسلت لا تُرسَل ثانيةً', async () => {
    const operator = await admin();
    const saved = await saveSegment(
      operator,
      { key: `tw${String(Date.now()).slice(-8)}`, nameAr: 'مرّتان', rules: [{ field: 'hasFavorites' }] },
      null,
    );
    if (!saved.ok) throw new Error('لم تُحفظ');
    const campaign = await db.campaign.create({
      data: {
        nameAr: 'مُرسَلة', channels: ['push'], segmentId: saved.id,
        status: 'SENT', sentAt: new Date(), createdBy: operator.id,
      },
    });

    const again = await sendCampaign(operator, campaign.id, null);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('NOT_SENDABLE');

    await db.campaign.delete({ where: { id: campaign.id } });
    await db.segment.delete({ where: { id: saved.id } });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });
});

describe('═══ معيار A10 ═══ الحرِجة لا تُطفأ', () => {
  it('إطفاء قناة حرجة يُرفض باسمه، والتفضيل لا يُكتب', async () => {
    const subject = await user(false);
    const critical = await db.pushChannel.findFirstOrThrow({ where: { userControllable: false } });

    const result = await setPreference(subject.id, critical.key, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('CRITICAL_CHANNEL');

    // ولا صفّ كُتب — الرفض ليس صمتًا
    expect(
      await db.notificationPreference.count({
        where: { userId: subject.id, channelKey: critical.key },
      }),
    ).toBe(0);

    // وتبقى واصلةً مهما كان
    expect(await isChannelEnabled(subject.id, critical.key)).toBe(true);

    await db.user.delete({ where: { id: subject.id } });
  });

  it('الحرِجة تصل حتى لو كُتب تفضيل بإطفائها في القاعدة مباشرةً', async () => {
    const subject = await user(false);
    const critical = await db.pushChannel.findFirstOrThrow({ where: { userControllable: false } });

    // التفافٌ على الدالّة — كتابة مباشرة في الجدول
    await db.notificationPreference.create({
      data: { userId: subject.id, channelKey: critical.key, enabled: false },
    });

    // `isChannelEnabled` لا تقرأ التفضيل أصلًا للحرِجة
    expect(await isChannelEnabled(subject.id, critical.key)).toBe(true);

    await db.notificationPreference.deleteMany({ where: { userId: subject.id } });
    await db.user.delete({ where: { id: subject.id } });
  });

  it('غير الحرِجة تُطفأ وتُشعل', async () => {
    const subject = await user(false);
    const normal = await db.pushChannel.findFirstOrThrow({ where: { userControllable: true } });

    expect((await setPreference(subject.id, normal.key, false)).ok).toBe(true);
    expect(await isChannelEnabled(subject.id, normal.key)).toBe(false);

    expect((await setPreference(subject.id, normal.key, true)).ok).toBe(true);
    expect(await isChannelEnabled(subject.id, normal.key)).toBe(true);

    await db.notificationPreference.deleteMany({ where: { userId: subject.id } });
    await db.user.delete({ where: { id: subject.id } });
  });

  it('التسويقي مغلق افتراضيًا — الموافقة تُطلب لا تُفترض', async () => {
    const subject = await user(false);
    const marketing = await db.pushChannel.findUniqueOrThrow({ where: { key: 'marketing' } });
    expect(marketing.defaultOn).toBe(false);
    // بلا تفضيل مكتوب ⇒ الافتراض هو الجواب
    expect(await isChannelEnabled(subject.id, 'marketing')).toBe(false);
    await db.user.delete({ where: { id: subject.id } });
  });

  it('اللوحة لا تملك تحويل قناة حرجة إلى قابلة للإطفاء', async () => {
    const operator = await admin();
    const critical = await db.pushChannel.findFirstOrThrow({ where: { userControllable: false } });

    // `updateChannel` لا تقبل الحقل أصلًا — والتحقّق أنه لم يتغيّر
    await updateChannel(operator, critical.key, { defaultOn: true, sort: 1 }, null);
    const after = await db.pushChannel.findUniqueOrThrow({ where: { key: critical.key } });
    expect(after.userControllable).toBe(false);

    await db.pushChannel.update({
      where: { key: critical.key },
      data: { defaultOn: critical.defaultOn, sort: critical.sort },
    });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('قناة مجهولة تُرفض ولا تُنشأ', async () => {
    const subject = await user(false);
    const result = await setPreference(subject.id, 'nope', true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('UNKNOWN_CHANNEL');
    expect(await isChannelEnabled(subject.id, 'nope')).toBe(false);
    await db.user.delete({ where: { id: subject.id } });
  });

  it('القنوات الستّ مزروعة، واثنتان منها حرجتان', async () => {
    const channels = await listChannels();
    expect(channels.length).toBe(6);
    expect(channels.filter((row) => !row.userControllable).length).toBe(2);
  });
});

describe('A10 — حدّ نصّ الإشعار', () => {
  it('الحدّ الآمن ٤٠ و١٢٠ — وما زاد يُقتطع على أندرويد', () => {
    expect(PUSH_TITLE_LIMIT).toBe(40);
    expect(PUSH_BODY_LIMIT).toBe(120);

    const fits = pushFits('تمّت المزايدة فوقك', 'فورد إكسبلورر ٢٠٢٢ — أعلى مزايدة الآن ٨٤٬٠٠٠.');
    expect(fits.title).toBe(true);
    expect(fits.body).toBe(true);

    const over = pushFits('ع'.repeat(41), 'ن'.repeat(121));
    expect(over.title).toBe(false);
    expect(over.body).toBe(false);
  });
});
