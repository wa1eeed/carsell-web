import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/token';
import { profileCompletion, type ProfileCompletion } from './profile';
import { canonicalPath } from './listing-detail';
import type { User } from '@/generated/prisma/client';

/**
 * حساب المستخدم — Wf.
 *
 * **قراءة الجلسة من الكوكي مباشرةً** لا من `NextRequest`: صفحة خادم
 * ليست مسار API، ولا يصلها الطلب. و`currentUser` تخدم المسارات.
 */
export async function currentUserFromCookies(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  if (token === null || token === '') return null;

  const claims = await verifySession(token);
  if (claims === null) return null;

  return db.user.findUnique({ where: { id: claims.userId } });
}

export type AccountStat = { key: string; value: number };

export type AccountOrder = {
  ref: string;
  stage: string;
  title: string;
  year: number;
  amount: string;
  createdAt: string;
  path: string;
};

export type AccountOffer = {
  id: string;
  listingRef: string;
  title: string;
  year: number;
  amount: string;
  status: string;
  expiresAt: string;
  path: string;
};

export type AccountListing = {
  ref: string;
  title: string;
  year: number;
  price: string;
  status: string;
  type: string;
  /** ملاحظة المراجع حين يُعاد الإعلان — و`null` فيما عدا ذلك */
  reviewNote: string | null;
  offerCount: number;
  viewCount: number;
  path: string;
};

export type AccountReport = {
  ref: string;
  score: number;
  inspectedAt: string;
  title: string;
  /** `null` إن لم يعد للمركبة إعلان منشور — التقرير يبقى وملكه لا. */
  path: string | null;
};

export type FavoriteListing = {
  ref: string;
  title: string;
  year: number;
  price: string;
  city: string;
  /** `null` إن سُحب الإعلان — يبقى في المفضّلة ولا يُفتح */
  path: string | null;
  available: boolean;
};

/**
 * المفضّلة — **كانت تُعدّ ولا تُقرأ**.
 *
 * بطاقة الحساب تعرض «المفضّلة ٤» وتربط إلى صفحةٍ ترد ٤٠٤، فيرى
 * المستخدم عددًا لا يبلغه. والصفّ لا علاقة له بـ`Listing` في المخطّط،
 * فالربط هنا يدويّ.
 *
 * **والمسحوب يبقى معروضًا ولا يُفتح**: حذفُه من القائمة يجعل المستخدم
 * يظنّ أنه لم يحفظه قطّ، وهي معلومةٌ تخصّه لا تخصّ الإعلان.
 */
export async function favoriteListings(
  userId: string,
  locale: string,
): Promise<FavoriteListing[]> {
  const rows = await db.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  if (rows.length === 0) return [];

  const listings = await db.listing.findMany({
    where: { id: { in: rows.map((row) => row.listingId) } },
    select: {
      id: true, ref: true, askPrice: true, city: true, status: true,
      vehicle: {
        select: {
          brandName: true, modelName: true, trimName: true, year: true,
          brand: { select: { slug: true } },
        },
      },
    },
  });

  return rows.flatMap((row) => {
    const listing = listings.find((entry) => entry.id === row.listingId);
    if (listing === undefined) return [];
    const available = listing.status === 'PUBLISHED';
    return [{
      ref: listing.ref,
      title: title(listing.vehicle),
      year: listing.vehicle.year,
      price: listing.askPrice.toString(),
      city: listing.city,
      path: available ? canonicalPath(locale, listing).path : null,
      available,
    }];
  });
}

export type AccountData = {
  user: { name: string | null; phone: string; email: string | null; idVerified: boolean };
  completion: ProfileCompletion;
  stats: AccountStat[];
  orders: AccountOrder[];
  offers: AccountOffer[];
  listings: AccountListing[];
  reports: AccountReport[];
};

const title = (vehicle: { brandName: string; modelName: string; trimName: string | null }): string =>
  [vehicle.brandName, vehicle.modelName, vehicle.trimName]
    .filter((part) => part !== null && part !== '')
    .join(' ');

export async function getAccountData(user: User, locale: string): Promise<AccountData> {
  const vehicleSelect = {
    brandName: true,
    modelName: true,
    trimName: true,
    year: true,
    brand: { select: { slug: true } },
  } as const;

  const [orders, offers, listings, reports, favourites] = await Promise.all([
    db.order.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        ref: true, stage: true, totalAmount: true, createdAt: true,
        listing: { select: { ref: true, city: true, vehicle: { select: vehicleSelect } } },
      },
    }),
    // العروض الواردة على مركبات المستخدم — لا عروضه هو
    db.offer.findMany({
      where: { listing: { sellerId: user.id }, status: { in: ['PENDING', 'COUNTERED'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, amount: true, status: true, expiresAt: true,
        listing: { select: { ref: true, city: true, vehicle: { select: vehicleSelect } } },
      },
    }),
    db.listing.findMany({
      where: { sellerId: user.id },
      orderBy: { publishedAt: 'desc' },
      select: {
        ref: true, city: true, askPrice: true, status: true, type: true, viewCount: true,
        reviewNote: true,
        vehicle: { select: vehicleSelect },
        _count: { select: { offers: true } },
      },
    }),
    db.inspectionReport.findMany({
      where: { vehicle: { ownerId: user.id } },
      orderBy: { inspectedAt: 'desc' },
      take: 10,
      select: {
        ref: true, score: true, inspectedAt: true,
        vehicle: {
          select: {
            ...vehicleSelect,
            listings: {
              where: { status: 'PUBLISHED' },
              take: 1,
              select: { ref: true, city: true, vehicle: { select: vehicleSelect } },
            },
          },
        },
      },
    }),
    db.favorite.count({ where: { userId: user.id } }),
  ]);

  return {
    user: {
      name: user.name,
      phone: user.phone,
      email: user.email,
      idVerified: user.idVerified,
    },
    completion: profileCompletion(user),
    stats: [
      { key: 'listings', value: listings.length },
      { key: 'orders', value: orders.length },
      { key: 'offers', value: offers.length },
      { key: 'favourites', value: favourites },
    ],
    orders: orders.map((order) => ({
      ref: order.ref,
      stage: order.stage,
      title: title(order.listing.vehicle),
      year: order.listing.vehicle.year,
      amount: order.totalAmount.toString(),
      createdAt: order.createdAt.toISOString(),
      path: canonicalPath(locale, order.listing).path,
    })),
    offers: offers.map((offer) => ({
      id: offer.id,
      listingRef: offer.listing.ref,
      title: title(offer.listing.vehicle),
      year: offer.listing.vehicle.year,
      amount: offer.amount.toString(),
      status: offer.status,
      expiresAt: offer.expiresAt.toISOString(),
      path: canonicalPath(locale, offer.listing).path,
    })),
    listings: listings.map((listing) => ({
      ref: listing.ref,
      title: title(listing.vehicle),
      year: listing.vehicle.year,
      price: listing.askPrice.toString(),
      status: listing.status,
      type: listing.type,
      // **الإرجاع بلا سببٍ معروض إرجاعٌ صامت** — فيُعاد نشره كما هو
      reviewNote: listing.status === 'DRAFT' ? listing.reviewNote : null,
      offerCount: listing._count.offers,
      viewCount: listing.viewCount,
      path: canonicalPath(locale, listing).path,
    })),
    reports: reports.map((report) => {
      const listing = report.vehicle.listings[0] ?? null;
      return {
        ref: report.ref,
        score: report.score,
        inspectedAt: report.inspectedAt.toISOString(),
        title: title(report.vehicle),
        // التقرير يبقى وإن سُحب الإعلان — ورابطه يذهب معه
        path: listing === null ? null : `${canonicalPath(locale, listing).path}/inspection`,
      };
    }),
  };
}
