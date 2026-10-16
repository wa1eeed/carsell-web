import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';

/**
 * ═══ كل صفٍّ مزروع حالةٌ يبلغها المنتج ═══
 *
 * البذرة تكتب الصفوف مباشرةً، فتستطيع أن تُركّب حالةً **لا يستطيع
 * المنتج تركيبها** — والصفّ صحيحٌ وحده، والتناقض بين صفّين.
 *
 * ولا شيء يسقط: الأنواع تمرّ، والشاشة تُصيَّر، والاختبارات خضراء لأن
 * كلًّا منها يصنع صفوفه. **ويُقرأ العطلُ في الشاشة وهو في البيانات** —
 * وقد وقع مرّتين:
 *
 *   · بصمات صورٍ مزروعة بمسافة هامينغ ١، فأُحيل كل إعلانٍ جديد إلى
 *     المراجعة — وليست علّة اختبار، بل حالُ المنتج على هذه البيانات.
 *   · نزاعٌ حُسم بتسوية جزئية والضمان `RELEASED` — فالكرت يعرض
 *     «حُسم للمشتري» فوق «أُفرج للبائع».
 *
 * **وأثرُه على الأرقام لا على الشكل**: إعلانان بحالة `SOLD` بلا طلب
 * كانا يضخّمان مؤشّر «نسبة البيع من المعروض» ببيعتين لم تقعا.
 *
 * فهذه بوابة الصنف: ثوابتُ بين الكيانات يضمنها النطاق، وكلّ تناقضٍ
 * جديد يُضاف هنا مرّة.
 *
 * ═══ والحكم على المزروع لا على عدّادٍ عامّ ═══
 *
 * اختبارٌ يسأل «كم في القاعدة كلِّها» يسقط بما لا يقيسه: طلبٌ يصنعه
 * ملفٌّ آخر ويُنظّفه في نهايته يكفي أن يسبقه هذا الملفّ فيسقط — ويبدو
 * تقطّعًا وهو شرطٌ ناقص. فالشكلان هنا هما شكلا `global-setup` نفسهما.
 */

/** جوّالُ اختبار: `+9665` ثم أحدَ عشرَ رقمًا فأكثر — والمزروع ثمانية. */
const TEST_USER_PHONE = /^\+9665\d{11,}$/;
/** مرجعُ إعلانِ اختبار: بادئةٌ ثم طابع زمنيّ — والمزروع `ADS2026A0001`. */
const TEST_LISTING_REF = /^[A-Z]{3}\d{9,}$/;

afterAll(async () => {
  await db.$disconnect();
});

/** قرارُ النزاع وحالةُ الضمان — كما تكتبهما `resolveDispute`. */
const ESCROW_FOR: Record<string, string> = {
  FULL_REFUND: 'REFUNDED',
  PARTIAL_SETTLEMENT: 'PARTIAL_REFUND',
  RELEASE_TO_SELLER: 'RELEASED',
};

const seededOrder = (row: { buyer: { phone: string } }): boolean =>
  !TEST_USER_PHONE.test(row.buyer.phone);

describe('═══ حالات يبلغها المنتج ═══', () => {
  it('نزاعٌ محسومٌ وضمانُه يتبع قراره', async () => {
    const resolved = await db.dispute.findMany({
      where: { resolution: { not: null } },
      select: {
        resolution: true,
        order: {
          select: {
            ref: true,
            buyer: { select: { phone: true } },
            escrow: { select: { status: true } },
          },
        },
      },
    });

    const mismatched = resolved
      .filter((row) => seededOrder(row.order))
      .filter((row) => row.order.escrow !== null)
      .filter((row) => row.order.escrow?.status !== ESCROW_FOR[row.resolution ?? ''])
      .map((row) => `${row.order.ref}: ${row.resolution} → ${row.order.escrow?.status}`);

    expect(mismatched).toEqual([]);
  });

  it('إعلانٌ مباعٌ له طلبٌ باعه', async () => {
    /**
     * `closeListingSold` وحدها تكتب `SOLD`، ولا تُنادى إلا من اكتمال
     * طلب. فإعلانٌ مباعٌ بلا طلبٍ **بيعةٌ بلا مشترٍ** — ويُحسب في
     * «نسبة البيع من المعروض» فيضخّمها.
     */
    const orphans = await db.listing.findMany({
      where: { status: 'SOLD', orders: { none: {} } },
      select: { ref: true },
    });

    expect(orphans.map((row) => row.ref).filter((ref) => !TEST_LISTING_REF.test(ref))).toEqual([]);
  });

  it('طلبٌ بلغ الدفع فما بعده له ضمان', async () => {
    const PAID = ['PAYMENT', 'TRANSFER', 'DONE'] as const;
    /**
     * ═══ والملغى مستثنى — المرحلة تسجّل أين مات ═══
     *
     * الإلغاء حالةٌ لا مرحلة (قرار المصمّم ١٧): الطلب يبقى عند المرحلة
     * التي مات فيها. فطلبٌ أُلغي **عند دخوله** مرحلة الدفع مرحلتُه
     * `PAYMENT` ولا دفعةَ له ولا ضمان — وهو ما يُنتجه `cancelOrder`
     * بالضبط.
     *
     * وكانت الثابتة تشمله فتقرأ بلوغَ المرحلة إقرارًا بأن مالًا
     * أُخذ. (كُتبت يوم لم يكن في البذرة طلبٌ ملغى واحد.)
     */
    /**
     * ═══ ومن لم يدفع بعدُ مستثنى — المرحلة تُدخَل قبل المال ═══
     *
     * الطلب يُنشأ **في** مرحلة `PAYMENT`: فبين إنشائه وضغطِ «ادفع
     * الآن» طلبٌ مرحلتُه `PAYMENT` ولا دفعةَ له ولا ضمان — وهي
     * الحال الطبيعية لكلّ شراءٍ جديد، لا شذوذ.
     *
     * وكانت الثابتة تقرأ بلوغَ المرحلة إقرارًا بأن مالًا أُخذ،
     * فمرّت ما دامت البذرة بلا طلبٍ غير مدفوع — **وأسقطتها أوّل
     * رحلة شراءٍ مُشيت بالنقر**. والشرط على المال لا على المرحلة.
     */
    const without = await db.order.findMany({
      where: {
        stage: { in: [...PAID] },
        status: { not: 'CANCELLED' },
        escrow: { is: null },
        payments: { some: {} },
      },
      select: { ref: true, buyer: { select: { phone: true } } },
    });

    expect(without.filter(seededOrder).map((row) => row.ref)).toEqual([]);
  });

  it('طلبٌ عليه نزاعٌ مفتوح حالتُه DISPUTED', async () => {
    /**
     * `openDispute` تكتب `status: 'DISPUTED'` في معاملة الفتح نفسها.
     * **والأثر ماليّ**: لوحة المالية تقرأ «المجمَّد بنزاع» من
     * `escrow HELD AND order DISPUTED` — فطلبٌ بقي `ACTIVE` يجعلها
     * تقول صفرًا عن مالٍ مجمَّد.
     */
    const open = await db.dispute.findMany({
      where: { status: { in: ['OPEN', 'INVESTIGATING'] } },
      select: { order: { select: { ref: true, status: true, buyer: { select: { phone: true } } } } },
    });

    const wrong = open
      .filter((row) => seededOrder(row.order))
      .filter((row) => row.order.status !== 'DISPUTED')
      .map((row) => `${row.order.ref}: ${row.order.status}`);

    expect(wrong).toEqual([]);
  });

  it('مزادٌ رسا بلغ احتياطيَه', async () => {
    /**
     * `closeEndedAuctions` لا تكتب `ENDED_MET` إلّا حين تتجاوز أعلى
     * مزايدةٍ الاحتياطيَ. ومزادٌ «رسا» وأعلى مزايدته دونه يعرض على
     * الكرت «رسا» و«لم يُبلغ» معًا — سطرٌ يناقض نفسه.
     */
    const met = await db.auction.findMany({
      where: { status: 'ENDED_MET' },
      select: {
        reservePrice: true,
        listing: { select: { ref: true } },
        bids: { orderBy: { amount: 'desc' }, take: 1, select: { amount: true } },
      },
    });

    const below = met
      .filter((row) => {
        const top = row.bids[0]?.amount;
        /** **واحتياطيٌّ غائب لا يُقارَن** — مزادٌ بلا احتياطيّ يرسو بأي مبلغ. */
        if (row.reservePrice === null) return false;
        return top === undefined || top.lessThan(row.reservePrice);
      })
      .map((row) => row.listing.ref);

    expect(below.filter((ref) => !TEST_LISTING_REF.test(ref))).toEqual([]);
  });

  it('درجةُ تقرير الفحص من أقسامه', async () => {
    /**
     * تقريرٌ كلّيُّه ٦٤ وكلُّ أقسامه ٨٦ فأعلى لا يُنتجه فاحص — والقارئ
     * يرى الرقمين فلا يصدّق أيًّا منهما. والفرق يُحتمل في حدود
     * التقريب والترجيح، لا في ثمانٍ وعشرين درجة.
     */
    const reports = await db.inspectionReport.findMany({
      select: { ref: true, score: true, sections: true },
    });

    const off = reports
      .map((row) => {
        const sections = (row.sections as unknown as { score: number }[]) ?? [];
        if (sections.length === 0) return null;
        const average = sections.reduce((total, s) => total + s.score, 0) / sections.length;
        return Math.abs(average - row.score) > 10 ? `${row.ref}: ${row.score} ≠ ${Math.round(average)}` : null;
      })
      .filter((row): row is string => row !== null);

    expect(off).toEqual([]);
  });

  it('ضمانٌ له دفعتُه — ولا يُكتب أحدهما بلا الآخر', async () => {
    /**
     * `applyState` تُنشئ `Escrow` **من دفعةٍ محجوزة**. وضمانٌ بلا
     * دفعة يُفرِغ `/admin/settlements` كاملةً — فتقول «لا مبالغ
     * محجوزة» بينما يقول الدفتر مئتي ألفٍ لدى المزوّد. **ثلاث
     * شاشات وثلاثة أرقام عن المال نفسه.**
     */
    const orphans = await db.order.findMany({
      where: { escrow: { isNot: null }, payments: { none: {} } },
      select: { ref: true, buyer: { select: { phone: true } } },
    });

    expect(orphans.filter(seededOrder).map((row) => row.ref)).toEqual([]);
  });

  it('الدفتر لا يقول عند المزوّد أقلَّ ممّا نحجزه', async () => {
    /**
     * ═══ ودفترٌ لا يطابق الصناديق ليس دفترًا ═══
     *
     * `ESCROW_AT_PROVIDER` رصيدٌ يقول كم من المال عندنا هناك. وضمانٌ
     * `HELD` مالٌ محجوزٌ باسم صفقة — **فرصيدُ الحساب لا يقلّ عنه
     * أبدًا**، وإن قلّ فثمّ مالٌ في الصناديق لا يعرفه الدفتر.
     *
     * وقِيس قبل الإصلاح: الدفتر ٢٠٧٬٧٥٠ والمحجوز ٢٥٤٬٥٧٠ — والفرق
     * أنّ البذرة كانت تُنشئ الضمان **بلا قيدٍ واحد**، فما في الدفتر
     * بقايا اختباراتٍ لا مالُ المنتج.
     *
     * **والعربون المحجوز ليس منه**: تفويضٌ لدى البوابة لا نقدٌ
     * قبضناه، فلا يُقيَّد حتى يُصادَر أو يُحصَّل.
     */
    const rows = await db.ledgerEntry.groupBy({
      by: ['direction'],
      where: { account: 'ESCROW_AT_PROVIDER' },
      _sum: { amount: true },
    });
    const side = (key: 'DEBIT' | 'CREDIT'): number =>
      Number(rows.find((row) => row.direction === key)?._sum.amount ?? 0);

    const atProvider = side('DEBIT') - side('CREDIT');
    const held = await db.escrow.aggregate({ where: { status: 'HELD' }, _sum: { amount: true } });

    expect(atProvider).toBeGreaterThanOrEqual(Number(held._sum.amount ?? 0));
  });

  it('طلبٌ مكتملٌ وإعلانُه مُغلق', async () => {
    /** الطلب يُكمل فيُغلق إعلانه — وإعلانٌ يبقى معروضًا يُباع مرّتين. */
    const stillOpen = await db.order.findMany({
      where: { status: 'COMPLETED', listing: { status: 'PUBLISHED' } },
      select: { ref: true, buyer: { select: { phone: true } } },
    });

    expect(stillOpen.filter(seededOrder).map((row) => row.ref)).toEqual([]);
  });
});
