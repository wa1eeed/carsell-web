import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  channelStats,
  groupOf,
  listTemplates,
  renderTemplate,
  saveTemplate,
  smsMetrics,
  undeclaredVariables,
  usedVariables,
} from '@/lib/domain/admin-notifications';

afterAll(async () => {
  await db.$disconnect();
});

async function admin() {
  return db.adminUser.create({
    data: {
      email: `ntf${String(Date.now()).slice(-9)}@carsell.one`,
      name: 'محرّر', role: 'CONTENT', passwordHash: 'x',
    },
  });
}

describe('═══ معيار A8 ═══ متغيّر غير مصرَّح به يمنع الحفظ', () => {
  it('الخطأ المطبعي في المتغيّر يوقف الحفظ ويُسمّى', async () => {
    const operator = await admin();
    const before = await db.notificationTemplate.findUniqueOrThrow({ where: { key: 'offer.received' } });

    const result = await saveTemplate(
      operator,
      'offer.received',
      {
        bodyAr: 'مرحبًا {frist_name}، وصلك عرض.',
        variables: [...before.variables, 'first_name'],
      },
      null,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('UNDECLARED_VARIABLES');
      // المطبعيّ وحده يُسمّى — والباقي مصرَّح به
      expect(result.variables).toEqual(['frist_name']);
    }

    // ولا شيء كُتب
    const after = await db.notificationTemplate.findFirstOrThrow({ where: { key: 'offer.received' } });
    expect(after.bodyAr).toBe(before.bodyAr);
    expect(await db.auditLog.count({ where: { actorId: operator.id } })).toBe(0);

    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('الفحص يشمل النصوص الستّة — لا العربي وحده', () => {
    const declared = ['name'];
    expect(undeclaredVariables({ subjectAr: 'أهلًا {name}' }, declared)).toEqual([]);
    expect(undeclaredVariables({ subjectEn: 'Hi {nmae}' }, declared)).toEqual(['nmae']);
    expect(undeclaredVariables({ smsEn: '{ref} closes' }, declared)).toEqual(['ref']);
    expect(undeclaredVariables({ bodyAr: '{a}', bodyEn: '{b}' }, declared)).toEqual(['a', 'b']);
  });

  it('تقليص قائمة المتغيّرات وحده يُبطل نصًّا محفوظًا فيُرفض', async () => {
    const operator = await admin();
    const key = 'auction.closing';
    const before = await db.notificationTemplate.findUniqueOrThrow({ where: { key } });
    expect(before.variables.length).toBeGreaterThan(0);

    // النصّ لم يُلمَس — لكن المتغيّرات فُرّغت
    const result = await saveTemplate(operator, key, { variables: [] }, null);
    const used = usedVariables(before.bodyAr, before.subjectAr, before.smsAr, before.bodyEn);

    if (used.length > 0) {
      expect(result.ok).toBe(false);
    } else {
      expect(result.ok).toBe(true);
    }

    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('نصّ سليم يُحفظ ويُدقَّق، وإعادته لا تُكتب قيدًا', async () => {
    const operator = await admin();
    const key = 'offer.received';
    const before = await db.notificationTemplate.findUniqueOrThrow({ where: { key } });

    const saved = await saveTemplate(
      operator,
      key,
      { bodyAr: 'وصلك عرض بمبلغ {amount} ريال.', variables: ['ref', 'amount', 'buyer'] },
      null,
    );
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.changed).toBe(true);
    expect(await db.auditLog.count({ where: { actorId: operator.id } })).toBe(1);

    const again = await saveTemplate(
      operator,
      key,
      { bodyAr: 'وصلك عرض بمبلغ {amount} ريال.', variables: ['ref', 'amount', 'buyer'] },
      null,
    );
    if (again.ok) expect(again.changed).toBe(false);
    expect(await db.auditLog.count({ where: { actorId: operator.id } })).toBe(1);

    await db.notificationTemplate.update({
      where: { key },
      data: { bodyAr: before.bodyAr, variables: before.variables },
    });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('قالب مجهول يُرفض', async () => {
    const operator = await admin();
    const result = await saveTemplate(operator, 'nope.nope', { bodyAr: 'x' }, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_FOUND');
    await db.adminUser.delete({ where: { id: operator.id } });
  });
});

describe('A8 — الرسالة القصيرة تُقاس أثناء الكتابة', () => {
  it('العربية ٧٠ حرفًا للمقطع، واللاتينية ١٦٠', () => {
    expect(smsMetrics('أ'.repeat(70)).segments).toBe(1);
    expect(smsMetrics('أ'.repeat(71)).segments).toBe(2);
    expect(smsMetrics('a'.repeat(160)).segments).toBe(1);
    expect(smsMetrics('a'.repeat(161)).segments).toBe(2);
  });

  it('العربية تُرصد ولو حرفًا واحدًا وسط لاتيني', () => {
    expect(smsMetrics('carsell.one: order ready').unicode).toBe(false);
    expect(smsMetrics('carsell.one: طلبك جاهز').unicode).toBe(true);
    // ٢٢ حرفًا لاتينيًا تُحسب مقطعًا، ومعها كلمة عربية تبقى مقطعًا — لكن بحدّ ٧٠
    expect(smsMetrics('carsell.one: طلبك جاهز').segments).toBe(1);
  });

  it('النصّ الفارغ لا مقطع له ولا تكلفة', () => {
    const empty = smsMetrics('');
    expect(empty.segments).toBe(0);
    expect(empty.cost).toBe('0.00');
  });

  it('التكلفة تتبع المقاطع لا الأحرف', () => {
    expect(smsMetrics('أ'.repeat(140)).segments).toBe(3);
    expect(smsMetrics('أ'.repeat(140)).cost).toBe('0.12');
  });
});

describe('A8 — القائمة والمعاينة', () => {
  it('المجموعة مشتقّة من بادئة المفتاح', () => {
    expect(groupOf('auth.otp')).toBe('auth');
    expect(groupOf('order.payment_due')).toBe('order');
  });

  it('العدّ المُرسَل محسوب من الإشعارات لا من عمود', async () => {
    const rows = await listTemplates();
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows.slice(0, 5)) {
      const real = await db.notification.count({ where: { templateKey: row.key } });
      expect(real, row.key).toBe(row.sent);
    }

    // والحرِج معلَّم — لا يمكن للمستخدم إيقافه
    const critical = rows.filter((row) => row.critical);
    expect(critical.every((row) => row.priority === 'critical')).toBe(true);
  });

  it('المعاينة تبدّل ما تعرفه وتُبقي ما لا تعرفه ظاهرًا', () => {
    expect(renderTemplate('أهلًا {name}، مبلغ {amount}', { name: 'خالد' })).toBe(
      'أهلًا خالد، مبلغ {amount}',
    );
  });

  it('إحصاءات القنوات تعدّ القوالب النشطة', async () => {
    const stats = await channelStats(new Date(Date.now() - 30 * 86_400_000));
    const active = await db.notificationTemplate.count({ where: { active: true, channelSms: true } });
    expect(stats.byChannel.find((row) => row.channel === 'sms')?.templates).toBe(active);
    expect(Number(stats.smsCost)).toBeGreaterThanOrEqual(0);
  });
});
