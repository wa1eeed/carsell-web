import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import {
  blockedRecipients,
  campaignDetail,
  resolveSegment,
} from '@/lib/domain/admin-campaigns';
import { SEGMENT_FIELDS, validRules } from '@/lib/campaigns/segments';
import { CAMPAIGN_STATUS_LABEL, SEGMENT_FIELD_LABEL } from '@/lib/labels/admin';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();

/**
 * ═══ حملةٌ كانت صفًّا بأربعة عدّادات ═══
 *
 * **ولا موضعَ يُقرأ فيه نصُّ الرسالة التي ستخرج** — والإرسال لا رجعة
 * فيه ويستهلك سقفَ الشهر لكلّ من وصلته.
 */
describe('صفحة تفاصيل الحملة', () => {
  it('للصفحة ملف، والجدول يربط إليها', () => {
    expect(() => readFileSync(join(ROOT, 'src/app/admin/campaigns/[id]/page.tsx'))).not.toThrow();
    const list = stripComments(
      readFileSync(join(ROOT, 'src/app/admin/campaigns/page.tsx'), 'utf8'),
    );
    expect(list).toContain('href={`/admin/campaigns/${encodeURIComponent(campaign.id)}`}');
  });

  /**
   * **والنصُّ هو سببُ الصفحة** — فصفحةٌ لا تعرضه تُعيد المشكلة التي
   * بُنيت لها.
   */
  it('وتعرض عنوان الرسالة ونصها', async () => {
    const campaign = await db.campaign.findFirst({
      where: { subjectAr: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    expect(campaign, 'لا حملةَ مزروعة بنصّ — فالقياس لا يقع').not.toBeNull();
    if (campaign === null) return;

    const detail = await campaignDetail(campaign.id);
    expect(detail).not.toBeNull();
    expect(detail?.subjectAr).toBe(campaign.subjectAr);
    expect(detail?.bodyAr).toBe(campaign.bodyAr);

    const page = stripComments(
      readFileSync(join(ROOT, 'src/app/admin/campaigns/[id]/page.tsx'), 'utf8'),
    );
    expect(page).toContain('campaign.subjectAr');
    expect(page).toContain('campaign.bodyAr');
  });

  /**
   * ═══ وما تعرضه الشاشة هو ما يطبّقه الإرسال ═══
   *
   * قاعدةُ الحجب (تهدئةٌ وسقف) كانت مكتوبةً مرّتين حرفًا بحرف —
   * **ورقمان لجمهورٍ واحد**: تتغيّر المهلة في موضعٍ فتقول الشاشة
   * سبعةً ويصل خمسة.
   */
  it('وجمهورها يساوي ما يحسبه ترشيح الشريحة', async () => {
    const campaign = await db.campaign.findFirstOrThrow({
      where: { status: 'DRAFT' },
      include: { segment: true },
    });
    const now = new Date();
    const detail = await campaignDetail(campaign.id, now);
    expect(detail).not.toBeNull();
    if (detail === null) return;

    const rules = validRules(campaign.segment.rules) ? campaign.segment.rules : [];
    const counts = await resolveSegment(rules, now);

    expect(detail.audience.matched).toBe(counts.matched);
    expect(detail.audience.consented).toBe(counts.consented);
    expect(detail.audience.reachable).toBe(counts.reachable);
  });

  /**
   * ═══ والفجوةُ تُفصَّل لا تُجمَع ═══
   *
   * «حُجب ثمانية» لا يقول شيئًا، و«واحدٌ في تهدئته وآخرُ بلغ السقف»
   * يقول للمشغّل أيؤجّل أم يُلغي.
   *
   * **والشرطُ يُصنَع لا يُنتظَر**: لا أحدَ في البذرة في تهدئةٍ ولا أحدَ
   * بلغ السقف، فالمعادلةُ تصير «صفر = صفر» وتمرّ مهما فعلت الشيفرة —
   * **وقِيس بإبطال حدّ السقف فبقي أخضر**. فيُزرع الحالان ثمّ يُستعاد.
   */
  it('والمحجوبون مفصلون — بزرع حالتي التهدئة والسقف', async () => {
    const campaign = await db.campaign.findFirstOrThrow({
      where: { status: 'DRAFT' },
      include: { segment: true },
    });
    /** الشريحةُ المزروعة «لديه مفضلة» — فالمزروعُ يطابقها بمفضّلة. */
    expect(campaign.segment.key).toBe('has_favourites');
    const listing = await db.listing.findFirstOrThrow({ select: { id: true } });

    const now = new Date();
    const base = await campaignDetail(campaign.id, now);
    expect(base).not.toBeNull();
    if (base === null) return;
    /** ولا محجوبَ قبل الزرع — فالفرقُ بعده من الزرع وحده. */
    expect(base.audience.blockedByCooldown).toBe(0);
    expect(base.audience.blockedByCap).toBe(0);

    const made: string[] = [];
    const sendAt = (hoursAgo: number): Date => new Date(now.getTime() - hoursAgo * 3600 * 1000);
    try {
      /**
       * ثلاثةُ أحوال — والثالثُ هو ما يكشف العدَّ المزدوج: محجوبٌ
       * **بالسببين معًا**. فبلا هذا الصفّ تمرّ دالّةٌ تعدّه مرّتين،
       * ومجموعُ السببين يتجاوز الفجوة ولا شيء يشكو.
       */
      const PLAN = {
        cooldown: [1],
        cap: [100, 101, 102, 103],
        both: [2, 101, 102, 103],
      } as const;

      let slot = 0;
      for (const [kind, hours] of Object.entries(PLAN)) {
        slot += 1;
        const user = await db.user.create({
          data: {
            phone: `+96650007700${String(slot)}`,
            name: `blocked-${kind}`,
            marketingConsent: true,
            favorites: { create: { listingId: listing.id } },
          },
          select: { id: true },
        });
        made.push(user.id);

        await db.campaignSend.createMany({
          data: hours.map((h, i) => ({
            campaignId: campaign.id,
            userId: user.id,
            channel: `probe-${String(i)}`,
            sentAt: sendAt(h),
          })),
        });
      }

      const after = await campaignDetail(campaign.id, now);
      expect(after).not.toBeNull();
      if (after === null) return;

      /** التهدئةُ تضمّ المحجوبَ بالسببين — فهو يُعدّ فيها وحدها. */
      expect(after.audience.blockedByCooldown).toBe(2);
      expect(after.audience.blockedByCap).toBe(1);
      /** والمجموعُ يفسّر الفجوة كاملةً — ولا يُعدّ أحدٌ مرّتين. */
      expect(after.audience.blockedByCooldown + after.audience.blockedByCap).toBe(
        after.audience.consented - after.audience.reachable,
      );
    } finally {
      await db.campaignSend.deleteMany({ where: { userId: { in: made } } });
      await db.favorite.deleteMany({ where: { userId: { in: made } } });
      await db.user.deleteMany({ where: { id: { in: made } } });
    }
  }, 60_000);

  /**
   * ═══ والحدُّ يُختبَر بتجاوزه ═══
   *
   * المزروع ستُّ رسائل والسقفُ خمسون، فاختبارُ الاقتطاع عليه أخضرُ
   * مهما كان الحدّ — يصف البيانات لا الشيفرة. فتُزرع رسائلُ تتجاوزه،
   * ثمّ تُستعاد.
   */
  it('والعداد يقول العدد كله وإن اقتطع المعروض', async () => {
    const campaign = await db.campaign.findFirstOrThrow({
      where: { status: 'SENT' },
      include: { sends: { select: { userId: true }, take: 1 } },
    });
    const before = await campaignDetail(campaign.id);
    expect(before?.results.sent).toBeGreaterThan(0);

    /** مستخدمون مؤقّتون — رسالةٌ لكلٍّ منهم، فالمفتاح الفريد لا يصطدم. */
    const planted: string[] = [];
    for (let i = 0; i < 52; i += 1) {
      const user = await db.user.create({
        data: { phone: `+96650000${String(900_000 + i)}`, name: `ctest-${String(i)}` },
        select: { id: true },
      });
      planted.push(user.id);
    }
    try {
      await db.campaignSend.createMany({
        data: planted.map((userId) => ({
          campaignId: campaign.id,
          userId,
          channel: 'email',
          sentAt: new Date(),
        })),
        skipDuplicates: true,
      });

      const after = await campaignDetail(campaign.id);
      expect(after).not.toBeNull();
      if (after === null) return;
      expect(after.results.rows.length).toBe(50);
      expect(after.results.sent).toBeGreaterThan(50);
      /** **والعدّادُ من تجميعةٍ كاملة** لا من الصفوف المعروضة. */
      expect(after.results.sent).not.toBe(after.results.rows.length);
    } finally {
      /** **والاختبارُ يعيد ما غيّره** — والرسالةُ تُحذف بصاحبها. */
      await db.campaignSend.deleteMany({ where: { userId: { in: planted } } });
      await db.user.deleteMany({ where: { id: { in: planted } } });
    }
  }, 60_000);

  /** **وكلُّ حقلِ شريحةٍ له تسمية** — ومفتاحٌ خامّ لا يقول للمشغّل شيئًا. */
  it('ولكل حقل شريحة تسمية، ولكل حال حملة تسمية', async () => {
    for (const field of SEGMENT_FIELDS) {
      expect(SEGMENT_FIELD_LABEL[field.key], field.key).toBeTruthy();
    }
    const statuses = await db.campaign.findMany({ distinct: ['status'], select: { status: true } });
    expect(statuses.length).toBeGreaterThan(0);
    for (const row of statuses) expect(CAMPAIGN_STATUS_LABEL[row.status], row.status).toBeTruthy();
  });

  it('وقاعدة الحجب تعيد مجموعتين واتحادهما', async () => {
    const blocked = await blockedRecipients(new Date());
    for (const id of blocked.cooldown) expect(blocked.all.has(id)).toBe(true);
    for (const id of blocked.cap) expect(blocked.all.has(id)).toBe(true);
    expect(blocked.all.size).toBeLessThanOrEqual(blocked.cooldown.size + blocked.cap.size);
  });

  it('ومعرف لا وجود له يعيد null', async () => {
    expect(await campaignDetail('no-such-campaign')).toBeNull();
  });
});
