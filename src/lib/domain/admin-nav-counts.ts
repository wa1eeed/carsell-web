import { db } from '@/lib/db';

/**
 * ═══ ما ينتظر عملًا — في المِلاحة نفسها ═══
 *
 * `AdminNavItem.badge` معرَّفٌ في النوع و**مُصيَّرٌ في الشريط**، و
 * `ADMIN_NAV` ثابتٌ لا يُسند إليه عدد — فالشارة مبنيّةٌ ولا تظهر أبدًا.
 * وهو الصنف نفسه الذي تكرّر في `Integration.status` و`viewCount`:
 * حقلٌ يُقرأ ولا يكتبه أحد.
 *
 * وترميز A1 يعرضها على سبعة بنود: الطلبات · الإعلانات · طلبات الخدمات
 * · النزاعات · البلاغات · التجار · توثيق الهوية.
 *
 * ═══ ولمَ هي جوهرُ اللوحة لا زينتُها ═══
 *
 * مشغّلٌ يفتح اللوحة يسأل سؤالًا واحدًا: **أين ينتظرني عمل؟** وبلا
 * شارات يفتح تسع شاشاتٍ ليعرف، فيفتح أوّلها كل صباحٍ ويترك آخرها
 * أسابيع. والشارة تنقل القرار من ذاكرته إلى الشاشة.
 *
 * ═══ وما يُعدّ: ما ينتظر فعلًا لا ما هو قائم ═══
 *
 * «كل الإعلانات» لا شارة لها — ألفُ إعلانٍ منشور ليست عملًا ينتظر.
 * والمعدود هو ما **يقف حتى يتحرّك أحد**.
 */
export type AdminNavCounts = Record<string, number>;

export async function adminNavCounts(now: Date = new Date()): Promise<AdminNavCounts> {
  const [
    listings,
    identity,
    disputes,
    reports,
    serviceRequests,
    dealers,
    payouts,
    settlements,
  ] = await Promise.all([
    db.listing.count({ where: { status: 'PENDING_REVIEW' } }),
    db.user.count({ where: { identityStatus: { in: ['PENDING', 'CLARIFICATION'] } } }),
    db.dispute.count({ where: { status: { in: ['OPEN', 'INVESTIGATING'] } } }),
    // و`Report.status` نصٌّ لا تعداد — والقيمة `open` كما تقرؤها شاشتُها
    db.report.count({ where: { status: 'open' } }),
    db.serviceRequest.count({ where: { status: { in: ['NEW', 'ASSIGNED'] } } }),
    db.dealer.count({ where: { verified: false } }),
    /**
     * **وما ينتظر اعتمادًا ثانيًا يُعدّ على من يعتمد.** طلبُ تحويلٍ
     * قدّمه زميلٌ ولم يره ثانٍ هو أطولُ ما يقف في هذه اللوحة: المال
     * محجوزٌ والبائع ينتظر، ولا شيء يقول إنّ أحدًا يجب أن ينظر.
     */
    db.approvalRequest.count({
      where: { kind: 'SELLER_PAYOUT', status: 'PENDING', expiresAt: { gt: now } },
    }),
    db.approvalRequest.count({
      where: { kind: 'ESCROW_RELEASE', status: 'PENDING', expiresAt: { gt: now } },
    }),
  ]);

  /**
   * **والصفر لا يُعرض.** شارةٌ على صفرٍ ضوضاء: الشريط كلُّه يصير
   * أرقامًا، فتختفي السبعةُ التي تعني شيئًا بين العشرين التي لا تعني.
   */
  const counts: AdminNavCounts = {};
  const put = (href: string, value: number): void => {
    if (value > 0) counts[href] = value;
  };

  put('/admin/listings', listings);
  put('/admin/identity', identity);
  put('/admin/disputes', disputes);
  put('/admin/reports', reports);
  put('/admin/service-requests', serviceRequests);
  put('/admin/dealers', dealers);
  put('/admin/payouts', payouts);
  put('/admin/settlements', settlements);

  return counts;
}
