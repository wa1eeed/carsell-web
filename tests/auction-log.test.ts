import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { getAuction } from '@/lib/domain/auctions';
import { bidLogCsv } from '@/lib/domain/auction-export';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();
const MADE: string[] = [];

afterAll(async () => {
  if (MADE.length > 0) await db.auctionEvent.deleteMany({ where: { id: { in: MADE } } });
});

/**
 * ═══ سجلُّ المزايدات — وأربعةُ صفوفٍ من التصميم كانت مفتوحة ═══
 *
 * والتمديدُ أخطرُها: يقع ويُعَدّ **ولا يُسجَّل**، فيقرأ الزائر مزايدةً
 * عند ٢١:٥٩ وإغلاقًا عند ٢٢:٠٥ ولا شيء يفسّر الفارق.
 */
describe('سجل المزايدات', () => {
  it('والتمديد له جدولٌ وكاتبٌ في المنتج', () => {
    const source = stripComments(readFileSync(join(ROOT, 'src/lib/domain/auctions.ts'), 'utf8'));
    expect(source).toContain("kind: 'EXTENDED'");
    expect(source).toMatch(/auctionEvent\.create/);

    /**
     * ═══ وكلُّ قيمة تعدادٍ لها كاتب ═══
     *
     * كان الفحصُ `toEqual(['EXTENDED'])` — **قائمةً تُحاكي التعداد**،
     * فلمّا بُني الإلغاء (قرار المالك ٢٠٢٦-١١-٢٥) سقط الاختبارُ على
     * قيمةٍ صارت لها كاتب. وإضافةُ الاسم إلى القائمة تُعيد الكرّة عند
     * القيمة التالية.
     *
     * فالقاعدةُ تُفحص كما هي: **لكلّ قيمةٍ في المخطّط كاتبٌ في
     * `src/`** — وهي نفسُها «قيمةٌ في المخطّط بلا كاتب» التي وقعت في
     * هذا المستودع إحدى عشرة مرّة. والمصدرُ التعدادُ لا نسخةٌ منه.
     */
    const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');
    const block = /enum AuctionEventKind \{([\s\S]*?)\n\}/.exec(schema);
    expect(block).not.toBeNull();
    const values = [...(block?.[1] ?? '').matchAll(/^\s*([A-Z_]+)\s*$/gm)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(0);

    const src = stripComments(
      readFileSync(join(ROOT, 'src/lib/domain/auctions.ts'), 'utf8')
        + readFileSync(join(ROOT, 'src/lib/domain/bid-cancellation.ts'), 'utf8'),
    );
    const orphans = values.filter((value) => !src.includes(`kind: '${String(value)}'`));
    expect(orphans, 'قيمةُ حدثٍ بلا كاتب').toEqual([]);
  });

  /** **ويُطوى الأقدم** — سجلٌّ بستّين صفًّا يدفن ما يحسم المزاد. */
  it('والسجل يطوي الأقدم ويقول عددَه', () => {
    const log = stripComments(readFileSync(join(ROOT, 'src/components/site/BidLog.tsx'), 'utf8'));
    expect(log).toMatch(/const VISIBLE_BIDS = \d+/);
    expect(log).toMatch(/bids\.slice\(0, VISIBLE_BIDS\)/);
    expect(log).toContain('<Quantity unit="bids" count={hidden} />');
  });

  /**
   * ═══ والملفُّ يحمل ما تحمله الشاشة لا أكثر ═══
   *
   * **ولا `bidderId` فيه**: ما لا يدخل الكائن لا يتسرّب منه، وهو
   * مسلك `reservePrice` نفسه. ويُقاس على مزادٍ مزروع لا على نصّ.
   */
  it('والملف يحمل الصفوف بلا هوية، ويُرتَّب بالأحدث', async () => {
    const row = await db.auction.findFirstOrThrow({
      where: { bids: { some: {} } },
      select: { listing: { select: { ref: true } } },
    });
    const auction = await getAuction(row.listing.ref);
    expect(auction).not.toBeNull();
    if (auction === null) return;

    const csv = bidLogCsv(auction);
    const lines = csv.replace('﻿', '').trim().split('\n');
    expect(lines[0]).toBe('bidder,at,step,type,status,amount');
    expect(lines.length).toBe(auction.bids.length + auction.events.length + 1);

    /** ولا هويّةَ في الملفّ — ولا معرّفَ مستخدم. */
    const bidders = await db.bid.findMany({
      where: { auction: { listing: { ref: row.listing.ref } } },
      select: { bidderId: true },
    });
    for (const bid of bidders) expect(csv).not.toContain(bid.bidderId);

    /** **والعلامة في أوّله** — وبدونها يفتح إكسل العربية مقطّعة. */
    expect(csv.startsWith('﻿')).toBe(true);

    // الأحدثُ أوّلًا — كما في الشاشة
    const times = lines.slice(1).map((line) => line.split(',')[1] ?? '');
    expect([...times].sort().reverse()).toEqual(times);
  });

  /** **والفاصلة تُهرَّب** — حقلٌ فيها يزيح الأعمدة كلَّها. */
  it('والفاصلة داخل حقل تُهرَّب لا تُزيح', () => {
    const csv = bidLogCsv({
      listingRef: 'X',
      bids: [{ alias: '1,2', amount: '100', at: '2026-01-01T00:00:00.000Z', isAuto: false, step: null, top: true }],
      events: [],
    } as unknown as Parameters<typeof bidLogCsv>[0]);
    expect(csv).toContain('"#U-1,2"');
  });

  /** **والحدثُ صفٌّ في الملفّ** كما هو سطرٌ في الشاشة. */
  it('والتمديد يظهر في الملف وفي الشاشة', async () => {
    const row = await db.auction.findFirstOrThrow({
      where: { bids: { some: {} } },
      select: { id: true, listing: { select: { ref: true } } },
    });
    const event = await db.auctionEvent.create({
      data: { auctionId: row.id, kind: 'EXTENDED', seconds: 300 },
    });
    MADE.push(event.id);

    const auction = await getAuction(row.listing.ref);
    expect(auction?.events.some((entry) => entry.seconds === 300)).toBe(true);
    expect(bidLogCsv(auction as NonNullable<typeof auction>)).toContain('extended');
  });
});
