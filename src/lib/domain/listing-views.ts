import { db } from '@/lib/db';
import { RIYADH_OFFSET_HOURS } from './viewing-rules';

/**
 * ═══ عدّادُ المشاهدات — ويُعرض للبائع منذ بُني ═══
 *
 * `Listing.viewCount` مقروءٌ في أربعة مواضع: صفحةُ «إعلاناتي» تعرضه
 * للبائع، وشاشتا الأدمن تعرضانه — **ولا شيء يزيده**. فالرقم الذي
 * يراه البائع تحت مركبته هو ما زرعتْه البذرة، يبقى على حاله شهورًا.
 *
 * > **وعدّادٌ يراه صاحبُ الشأن ولا يتحرّك أسوأ من عدّادٍ غائب**:
 * > الغائبُ يُسأل عنه، والجامدُ يُصدَّق — فيقيس البائع سعرَه وتوقيتَه
 * > على رقمٍ لا يقيس شيئًا.
 *
 * ═══ ولا تُعدّ مشاهدةُ صاحبها ═══
 *
 * بائعٌ يفتح إعلانَه عشر مرّاتٍ في اليوم ليراجع صوره يُضخّم رقمَه
 * بنفسه ثمّ يقرؤه اهتمامًا.
 */
export async function recordListingView(
  listingId: string,
  viewerId: string | null,
  sellerId: string,
  now: Date = new Date(),
): Promise<void> {
  if (viewerId !== null && viewerId === sellerId) return;

  /**
   * ═══ والمجموعُ ويومُه معًا ═══
   *
   * **ولا يُسقط الصفحةَ عدّاد**: فشلُ الزيادة — قاعدةٌ مشغولة أو صفٌّ
   * حُذف بين القراءة والكتابة — لا يمنع الزائر من رؤية المركبة.
   *
   *
   * `viewCount` تراكميّ، وترميزُ `Wt` يكتب «مشاهدات **هذا الأسبوع**»:
   * والبائع يقيس سعرَه وتوقيتَه على الحركة الأخيرة — **ومجموعٌ كبيرٌ
   * فوق أسبوعٍ ساكن يعني إعلانًا مات، ولا يقوله المجموعُ وحده**.
   *
   * واليومُ تقويمُ الرياض لا نافذةُ أربعٍ وعشرين ساعة: مشاهدتان قبل
   * منتصف الليل وبعده يومان، وقسمةُ المدّة تجعلهما يومًا واحدًا
   * يتبدّل بساعة القراءة.
   */
  const day = new Date(now.getTime() + RIYADH_OFFSET_HOURS * 3_600_000);
  day.setUTCHours(0, 0, 0, 0);

  await Promise.all([
    db.listing
      .update({ where: { id: listingId }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined),
    db.listingViewDay
      .upsert({
        where: { listingId_day: { listingId, day } },
        create: { listingId, day, count: 1 },
        update: { count: { increment: 1 } },
      })
      .catch(() => undefined),
  ]);
}

/** نافذةُ «هذا الأسبوع» — سبعةُ أيّامٍ تقويمية بما فيها اليوم. */
export const VIEW_WINDOW_DAYS = 7;

/**
 * مشاهداتُ آخر سبعة أيّام لإعلاناتِ بائع — **مجموعًا لا صفًّا لكلّ يوم**.
 *
 * والصفرُ غيرُ `null`: صفرٌ يعني «لم يُشاهَد هذا الأسبوع» وهو جوابٌ،
 * و`null` تعني «لا إعلان» — وهما سطران مختلفان في الشاشة.
 */
export async function viewsThisWeek(
  listingIds: readonly string[],
  now: Date = new Date(),
): Promise<number> {
  if (listingIds.length === 0) return 0;

  const from = new Date(now.getTime() + RIYADH_OFFSET_HOURS * 3_600_000);
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - (VIEW_WINDOW_DAYS - 1));

  const rows = await db.listingViewDay.aggregate({
    where: { listingId: { in: [...listingIds] }, day: { gte: from } },
    _sum: { count: true },
  });
  return rows._sum.count ?? 0;
}
