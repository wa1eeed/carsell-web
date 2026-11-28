import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { db } from '@/lib/db';
import {
  COOLDOWN_HOURS,
  MARKETING_CAP_PER_MONTH,
  createCampaign,
  sendDueCampaigns,
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

  /**
   * **والحكمُ على العلاقة لا على رقمٍ مكتوب.** كان `toBe(6)`، فأوّلُ
   * قناةٍ تُضاف (`viewings_mine`) تُسقطه وهي إضافةٌ صحيحة — ويُقرأ
   * السقوطُ عطلًا. والمقصودُ أنّ **ما في الملفّ يصل القاعدة**، وأنّ
   * الحرِجَ منها لا يُطفأ.
   */
  it('كلُّ قناةٍ في البيانات مزروعة، والحرِجُ منها لا يُطفأ', async () => {
    const seeded = JSON.parse(
      readFileSync('prisma/seed-data/push-channels.json', 'utf8'),
    ) as { key: string; userControllable: boolean }[];

    const channels = await listChannels();
    expect(channels.map((row) => row.key).sort()).toEqual(seeded.map((row) => row.key).sort());

    const locked = channels.filter((row) => !row.userControllable).map((row) => row.key).sort();
    expect(locked).toEqual(
      seeded.filter((row) => !row.userControllable).map((row) => row.key).sort(),
    );
    /** **ومعيار A10**: لا بدّ من قناةٍ حرجةٍ واحدة على الأقلّ لا تُطفأ */
    expect(locked.length).toBeGreaterThan(0);
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

describe('A10 — واللوحة لا تفتح التسويقيّ افتراضًا', () => {
  /**
   * ═══ وقع فعلًا ═══
   *
   * بُني زرُّ «الافتراض» في شاشة الإشعارات، وفُتحت به القناة
   * التسويقية في تجريبٍ يدويّ لأرى الزرّ يعمل — **فسقط اختبار
   * المعيار، وكان محقًّا**: الموافقة على التسويق تُطلب لا تُفترض،
   * وفتحُها يجعل كل حسابٍ جديد موافقًا بلا أن يُسأل.
   *
   * **وحارسٌ في الشاشة ليس حارسًا** — فالمنع في `updateChannel`،
   * والشاشة لا تعرض الزرّ أصلًا.
   */
  it('updateChannel ترفض فتح التسويقيّ', async () => {
    const { updateChannel } = await import('@/lib/domain/push-channels');
    const operator = await admin();

    const before = await db.pushChannel.findUniqueOrThrow({ where: { key: 'marketing' } });
    expect(before.defaultOn).toBe(false);

    expect(await updateChannel(operator, 'marketing', { defaultOn: true }, null)).toEqual({
      ok: false,
    });

    const after = await db.pushChannel.findUniqueOrThrow({ where: { key: 'marketing' } });
    expect(after.defaultOn).toBe(false);
  });

  it('وتقبل إغلاقه، وتقبل فتح غيره', async () => {
    const { updateChannel } = await import('@/lib/domain/push-channels');
    const operator = await admin();

    // الإغلاق مسموح — المنع في اتّجاهٍ واحد
    expect(await updateChannel(operator, 'marketing', { defaultOn: false }, null)).toEqual({
      ok: true,
    });

    const other = await db.pushChannel.findFirstOrThrow({
      where: { key: { not: 'marketing' }, userControllable: true },
    });
    const was = other.defaultOn;
    expect(await updateChannel(operator, other.key, { defaultOn: !was }, null)).toEqual({ ok: true });

    // الاختبار يعيد ما غيّره
    await db.pushChannel.update({ where: { key: other.key }, data: { defaultOn: was } });
    await db.auditLog.deleteMany({ where: { action: 'push.channel_updated' } });
  });
});

/**
 * ═══ A9 — الإنشاء والجدولة ═══
 *
 * «+ حملة جديدة» في رأس الترميز ولا مسارَ ينشئ `Campaign`، و`SCHEDULED`
 * في التعداد و`scheduledAt` في المخطّط **ولا وظيفةَ تُرسلهما**: فحملةٌ
 * تُجدوَل تقف أبدًا وتابُ «مجدولة» يعدّ ما لن يقع.
 */
describe('A9 — حملةٌ تُنشأ، ومجدولةٌ تُرسَل', () => {
  it('المسودّة بلا موعد، والمجدولة بموعدها', async () => {
    const operator = await admin();
    const segment = await saveSegment(
      operator,
      { key: `seg${String(Date.now()).slice(-8)}`, nameAr: 'شريحة اختبار', rules: [{ field: 'hasFavorites' }] },
      null,
    );
    if (!segment.ok) throw new Error('تعذّر حفظ الشريحة');

    const draft = await createCampaign({
      nameAr: 'حملة مسودّة', channels: ['push'], segmentId: segment.id,
      subjectAr: null, bodyAr: 'نصّ', scheduledAt: null,
      adminId: operator.id, ip: null,
    });
    const later = new Date(Date.now() + 3_600_000);
    const planned = await createCampaign({
      nameAr: 'حملة مجدولة', channels: ['email', 'push'], segmentId: segment.id,
      subjectAr: 'عنوان', bodyAr: 'نصّ', scheduledAt: later,
      adminId: operator.id, ip: null,
    });

    if (!draft.ok || !planned.ok) throw new Error('تعذّر الإنشاء');
    expect(draft.status).toBe('DRAFT');
    expect(planned.status).toBe('SCHEDULED');

    // **ويُكتب الأثر** — كل إجراء أدمن في السجلّ
    const logged = await db.auditLog.count({
      where: { action: 'campaign.created', entityId: { in: [draft.campaignId, planned.campaignId] } },
    });
    expect(logged).toBe(2);

    await db.auditLog.deleteMany({
      where: { entityId: { in: [draft.campaignId, planned.campaignId] } },
    });
    await db.campaign.deleteMany({ where: { id: { in: [draft.campaignId, planned.campaignId] } } });
    await db.segment.delete({ where: { id: segment.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('ويُرفض الموعد الماضي — جدولةٌ لا تقع', async () => {
    const operator = await admin();
    const segment = await saveSegment(
      operator,
      { key: `seg${String(Date.now()).slice(-8)}p`, nameAr: 'شريحة', rules: [{ field: 'hasFavorites' }] },
      null,
    );
    if (!segment.ok) throw new Error('تعذّر حفظ الشريحة');

    const result = await createCampaign({
      nameAr: 'حملة', channels: ['push'], segmentId: segment.id,
      subjectAr: null, bodyAr: 'نصّ', scheduledAt: new Date(Date.now() - 60_000),
      adminId: operator.id, ip: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('غير متوقع');
    expect(result.reason).toBe('PAST_SCHEDULE');

    await db.segment.delete({ where: { id: segment.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  /**
   * **والحدُّ يُعبَر**: مجدولةٌ حلّ موعدُها تُرسَل، وأختُها بعد ساعةٍ
   * تبقى — فاختبارٌ على واحدةٍ وحدها لا يقول إن كان الشرط يُقرأ أصلًا.
   */
  it('وتُرسَل ما حلّ موعدُها وحدها', async () => {
    const operator = await admin();
    const subject = await user(true);
    const listing = await db.listing.findFirstOrThrow();
    await db.favorite.create({ data: { userId: subject.id, listingId: listing.id } });

    const segment = await saveSegment(
      operator,
      { key: `seg${String(Date.now()).slice(-8)}d`, nameAr: 'شريحة', rules: [{ field: 'hasFavorites' }] },
      null,
    );
    if (!segment.ok) throw new Error('تعذّر حفظ الشريحة');

    const now = new Date();
    const notYet = await db.campaign.create({
      data: {
        nameAr: 'بعد ساعة', channels: ['push'], segmentId: segment.id,
        bodyAr: 'نصّ', status: 'SCHEDULED',
        scheduledAt: new Date(now.getTime() + 3_600_000), createdBy: operator.id,
      },
    });

    /**
     * **والجولتان تفصلان ما يخلطه التهدئة.** أوّلُ صياغةٍ أنشأت
     * الاثنتين ثمّ أرسلت مرّة، فمرّت **حتى بعد حذف شرط الموعد**: جمهورُ
     * المجدولة بعد ساعةٍ هو جمهورُ الأولى نفسُه، وقد صار في التهدئة —
     * فتُردّ `NO_AUDIENCE` وتبقى `SCHEDULED` كأنّ الشرط قُرئ. فتُشغَّل
     * جولةٌ **قبل** أن توجد المستحقّة: جمهورُها حينئذٍ طازج، فإن أُرسلت
     * فالشرطُ لا يُقرأ.
     */
    /**
     * **والحكمُ على الصفّ المعنيّ لا على عدّادٍ عامّ** (قاعدةٌ
     * مسجَّلة): `sendDueCampaigns` تمرّ على كلّ حملةٍ في القاعدة، فحملةٌ
     * مجدولةٌ تركها تشغيلٌ سابق تجعل العدّ واحدًا — ويسقط الفحصُ على ما
     * لا يقيسه. والجولةُ الأولى تستنفد المتأخّرات، والدعوى أنّ
     * **المجدولةَ بعد ساعةٍ لم تُرسَل**.
     */
    await sendDueCampaigns(now);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: notYet.id } })).status).toBe(
      'SCHEDULED',
    );

    const due = await db.campaign.create({
      data: {
        nameAr: 'حان موعدها', channels: ['push'], segmentId: segment.id,
        bodyAr: 'نصّ', status: 'SCHEDULED',
        scheduledAt: new Date(now.getTime() - 60_000), createdBy: operator.id,
      },
    });

    expect(await sendDueCampaigns(now)).toBe(1);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: due.id } })).status).toBe('SENT');
    expect((await db.campaign.findUniqueOrThrow({ where: { id: notYet.id } })).status).toBe(
      'SCHEDULED',
    );

    await db.campaignSend.deleteMany({ where: { campaignId: { in: [due.id, notYet.id] } } });
    await db.auditLog.deleteMany({ where: { entityId: { in: [due.id, notYet.id] } } });
    await db.campaign.deleteMany({ where: { id: { in: [due.id, notYet.id] } } });
    await db.favorite.deleteMany({ where: { userId: subject.id } });
    await db.user.delete({ where: { id: subject.id } });
    await db.segment.delete({ where: { id: segment.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });
});

/**
 * **والسطرُ الثالث يُقاس بصنعِ حاله.** «خارج فترة التهدئة» يساوي
 * «وافقوا» ما لم يكن أحدٌ في تهدئة — فاختبارٌ على بياناتٍ هادئة يمرّ
 * مهما كُتب. فتُصنع التهدئة بإرسالةٍ حقيقية، ويُقاس الفرق، ثمّ تُستعاد.
 */
describe('A9 — وفجوةُ التهدئة تُقال', () => {
  it('ينقص «خارج فترة التهدئة» بمن أُرسل إليه للتوّ', async () => {
    const operator = await admin();
    const subject = await user(true);
    const listing = await db.listing.findFirstOrThrow();
    await db.favorite.create({ data: { userId: subject.id, listingId: listing.id } });

    const rules = [{ field: 'hasFavorites' }];
    const before = await resolveSegment(rules);

    // تهدئةٌ حقيقية — صفُّ إرسالٍ للتوّ
    const segment = await saveSegment(
      operator,
      { key: `seg${String(Date.now()).slice(-8)}c`, nameAr: 'شريحة', rules },
      null,
    );
    if (!segment.ok) throw new Error('تعذّر حفظ الشريحة');
    const campaign = await db.campaign.create({
      data: {
        nameAr: 'للتهدئة', channels: ['push'], segmentId: segment.id,
        bodyAr: 'نصّ', status: 'SENT', createdBy: operator.id,
      },
    });
    await db.campaignSend.create({
      data: { campaignId: campaign.id, userId: subject.id, channel: 'push' },
    });

    const after = await resolveSegment(rules);
    expect(after.consented).toBe(before.consented);
    expect(after.outsideCooldown).toBe(before.outsideCooldown - 1);
    expect(after.reachable).toBe(before.reachable - 1);

    await db.campaignSend.deleteMany({ where: { campaignId: campaign.id } });
    await db.auditLog.deleteMany({ where: { entityId: { in: [campaign.id, segment.id] } } });
    await db.campaign.delete({ where: { id: campaign.id } });
    await db.segment.delete({ where: { id: segment.id } });
    await db.favorite.deleteMany({ where: { userId: subject.id } });
    await db.user.delete({ where: { id: subject.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });
});
