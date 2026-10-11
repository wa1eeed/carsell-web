import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { buildWhere, parseFilters, serializeFilters, type Filters } from './listings';

/**
 * ═══ البحث المحفوظ ═══
 *
 * `SavedSearch` معرَّفٌ في المخطّط منذ اليوم الأول بحقلَي `notify`
 * و`lastSeenAt` — **ولا شيء في المنتج كلّه يمسّه**. ولم يكن سهوًا:
 * قرار المصمّم ١٨ يضعه في **المرحلة الأولى** مع المفضّلة، وبُنيت
 * المفضّلة وبقي هذا.
 *
 * ═══ و`lastSeenAt` هو الميزة لا حقلًا إضافيًّا ═══
 *
 * بحثٌ محفوظ بلا «كم جدّ منذ زيارتك» تذكرةٌ يعيد صاحبها فتحها ليقارن
 * بذاكرته. وبه يصير السؤال محسوبًا: **كم إعلانًا نُشر بعد آخر مرّة
 * رأيتَ فيها هذا البحث**. وهو ما يجعل الحفظ يستحقّ أن يُحفظ.
 */

/** الفلاتر تُخزَّن سلسلةَ رابط — فما يُحفظ هو ما يُفتح، حرفًا بحرف. */
export type SavedSearchRow = {
  id: string;
  name: string | null;
  /** سلسلة `searchParams` — تُلحق بـ`/cars?` فتعيد الشاشة */
  query: string;
  notify: boolean;
  /** كم إعلانًا جديدًا يطابقه منذ آخر زيارة */
  fresh: number;
  createdAt: string;
};

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'EMPTY_FILTERS' | 'LIMIT_REACHED' | 'DUPLICATE' };

/**
 * **وسقفٌ لعدد المحفوظات.** بلا سقفٍ تصير القائمة سجلَّ تصفّحٍ لا
 * اختيارًا، ويصير التنبيه ضجيجًا يُغلقه صاحبه كلّه.
 */
export const SAVED_SEARCH_LIMIT = 20;

/** يُطبَّع قبل الحفظ: الصفحة لا تُحفظ، والترتيب يُحفظ. */
function canonical(query: string): string {
  const filters = parseFilters(new URLSearchParams(query));
  const params = serializeFilters({ ...filters, page: 1 });
  params.sort();
  return params.toString();
}

export async function saveSearch(
  userId: string,
  input: { query: string; name?: string | null; notify?: boolean },
  now: Date = new Date(),
): Promise<SaveResult> {
  const query = canonical(input.query);

  /**
   * **وبحثٌ بلا فلتر ليس بحثًا.** حفظُ «كل السيارات» يُنتج تنبيهًا
   * عند كل إعلانٍ يُنشر في المنصّة — وهو ما يجعل صاحبه يُطفئ
   * التنبيهات كلّها، فنخسر القناة لأجل صفٍّ لا معنى له.
   */
  if (query === '' || query === 'sort=newest') return { ok: false, reason: 'EMPTY_FILTERS' };

  const existing = await db.savedSearch.findMany({
    where: { userId },
    select: { id: true, filters: true },
  });
  if (existing.some((row) => readQuery(row.filters) === query)) {
    return { ok: false, reason: 'DUPLICATE' };
  }
  if (existing.length >= SAVED_SEARCH_LIMIT) return { ok: false, reason: 'LIMIT_REACHED' };

  const row = await db.savedSearch.create({
    data: {
      userId,
      name: input.name === undefined || input.name === null || input.name.trim() === ''
        ? null
        : input.name.trim().slice(0, 80),
      filters: { query },
      notify: input.notify ?? true,
      /**
       * **و«الجديد» يُحسب من لحظة الحفظ لا من الصفر.** وإلّا فتح
       * صاحبه القائمة فوجد «٤٥ جديدًا» عن بحثٍ حفظه قبل ثانية.
       */
      lastSeenAt: now,
      createdAt: now,
    },
    select: { id: true },
  });

  return { ok: true, id: row.id };
}

function readQuery(filters: Prisma.JsonValue): string {
  if (typeof filters !== 'object' || filters === null || Array.isArray(filters)) return '';
  const value = (filters as { query?: unknown }).query;
  return typeof value === 'string' ? value : '';
}

/** هل هذا البحث محفوظٌ لهذا المستخدم؟ — ليقول الزرّ حالَه قبل الضغط. */
export async function isSaved(userId: string | null, query: string): Promise<boolean> {
  if (userId === null) return false;
  const wanted = canonical(query);
  const rows = await db.savedSearch.findMany({ where: { userId }, select: { filters: true } });
  return rows.some((row) => readQuery(row.filters) === wanted);
}

/**
 * محفوظاتُ المستخدم وكم جدّ في كلٍّ منها.
 *
 * **والعدّ باستعلامٍ لكل بحث** — وهو مقصود: العشرون سقفٌ، والشرط
 * يُبنى من `buildWhere` نفسه الذي تبني به صفحة النتائج، فلا يفترق
 * العدد عمّا يراه صاحبه حين يفتح. وعدٌّ تقريبيٌّ بجدولٍ مادّيّ كان
 * سيعطي رقمًا يخالف الشاشة.
 */
export async function savedSearches(userId: string): Promise<SavedSearchRow[]> {
  const rows = await db.savedSearch.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: SAVED_SEARCH_LIMIT,
  });

  /**
   * حدّ التمويل يُقرأ مرّة للقائمة كلّها — **وهو نفسه الذي تقرؤه
   * `searchListings`**، فلا يفترق العدد عمّا تعرضه الشاشة عند الفتح.
   */
  const settings = await db.financeSetting.findUnique({ where: { id: 'default' } });
  const minPrice = Number(settings?.minPrice ?? 0);

  return Promise.all(
    rows.map(async (row) => {
      const query = readQuery(row.filters);
      const filters = parseFilters(new URLSearchParams(query));
      const fresh =
        row.lastSeenAt === null
          ? 0
          : await db.listing.count({
              where: { ...buildWhere(filters, minPrice), publishedAt: { gt: row.lastSeenAt } },
            });

      return {
        id: row.id,
        name: row.name,
        query,
        notify: row.notify,
        fresh,
        createdAt: row.createdAt.toISOString(),
      };
    }),
  );
}

export async function removeSearch(userId: string, id: string): Promise<boolean> {
  const result = await db.savedSearch.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

export async function setNotify(userId: string, id: string, notify: boolean): Promise<boolean> {
  const result = await db.savedSearch.updateMany({ where: { id, userId }, data: { notify } });
  return result.count > 0;
}

/**
 * «رأيتُه» — **والختم يقع عند الفتح لا عند العرض**.
 *
 * ولو خُتم عند عرض القائمة لاختفى العدد الذي جاء صاحبه لأجله قبل أن
 * يقرأه: يفتح فيرى «٣ جديدة»، ويعود فيرى صفرًا ولم يفتح شيئًا.
 */
export async function markSeen(userId: string, id: string, now: Date = new Date()): Promise<void> {
  await db.savedSearch.updateMany({ where: { id, userId }, data: { lastSeenAt: now } });
}

/** عدد المحفوظات التي فيها جديد — لنقطةٍ على أيقونة الحساب. */
export async function freshCount(userId: string): Promise<number> {
  const rows = await savedSearches(userId);
  return rows.filter((row) => row.fresh > 0).length;
}

export type { Filters };
