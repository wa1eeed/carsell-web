import { db } from '@/lib/db';
import {
  pendingAdjustment,
  walletView,
  type PendingAdjustment,
  type WalletLine,
} from './wallet';

/**
 * ═══ تفاصيل الإعلان والعميل في اللوحة ═══
 *
 * قائمتان تعرضان صفوفًا ولا تفتحانها. ومن رأى إعلانًا في طابور المراجعة
 * لا يرى صوره ولا سبب إحالته ولا تاريخ سعره — فيقرّر بلا ما يقرّر به.
 *
 * ═══ ورقم الهوية لا يُقرأ من هنا ═══
 *
 * `nationalIdEncrypted` له مسارُه المُقيَّد (`viewIdentity`) الذي يكتب
 * أثرًا بكل قراءة. وجرُّه في استعلامٍ عامّ يجعل القراءة تقع بلا أن
 * يقصدها أحد وبلا أن يُسجَّل شيء.
 */

export type ListingImageRow = {
  id: string;
  r2Key: string;
  isCover: boolean;
  plateBlurred: boolean;
  /** بصمةٌ إدراكية — وتشابهُها هو ما يُحيل إعلانًا للمراجعة */
  hasFingerprint: boolean;
  qualityFlags: string[];
};

export type AdminListingDetail = {
  ref: string;
  status: string;
  type: string;
  city: string;
  askPrice: string;
  publishedAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  viewCount: number;

  reviewReason: string | null;
  reviewQueuedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;

  seller: { id: string; name: string; phone: string; idVerified: boolean };
  vehicle: {
    brandName: string;
    modelName: string;
    year: number;
    bodyType: string;
    transmission: string;
    fuel: string;
    mileageKm: number;
    colorExterior: string;
    condition: string;
    /** الرقم التسلسليّ — يُقارن خانةً بخانة، فلاتينيّ في العرض */
    vin: string | null;
  };

  images: ListingImageRow[];
  offers: { id: string; amount: string; status: string; at: string }[];
  orders: { ref: string; stage: string; status: string; at: string }[];
  auction: { status: string; startPrice: string; endsAt: string; bidCount: number } | null;
};

export async function adminListingDetail(ref: string): Promise<AdminListingDetail | null> {
  const listing = await db.listing.findUnique({
    where: { ref },
    include: {
      seller: { select: { id: true, name: true, phone: true, idVerified: true } },
      vehicle: {
        select: {
          brandName: true,
          modelName: true,
          year: true,
          bodyType: true,
          transmission: true,
          fuel: true,
          mileageKm: true,
          colorExterior: true,
          condition: true,
          vin: true,
        },
      },
      images: { orderBy: { sort: 'asc' } },
      offers: { orderBy: { createdAt: 'desc' }, take: 20 },
      orders: { orderBy: { createdAt: 'desc' }, take: 10 },
      auction: { include: { _count: { select: { bids: true } } } },
    },
  });

  if (listing === null) return null;

  return {
    ref: listing.ref,
    status: listing.status,
    type: listing.type,
    city: listing.city,
    askPrice: listing.askPrice.toFixed(2),
    publishedAt: listing.publishedAt?.toISOString() ?? null,
    closedAt: listing.closedAt?.toISOString() ?? null,
    closeReason: listing.closeReason,
    viewCount: listing.viewCount,

    reviewReason: listing.reviewReason,
    reviewQueuedAt: listing.reviewQueuedAt?.toISOString() ?? null,
    reviewedAt: listing.reviewedAt?.toISOString() ?? null,
    reviewNote: listing.reviewNote,

    seller: {
      id: listing.seller.id,
      name: listing.seller.name ?? listing.seller.phone,
      phone: listing.seller.phone,
      idVerified: listing.seller.idVerified,
    },

    vehicle: {
      brandName: listing.vehicle.brandName,
      modelName: listing.vehicle.modelName,
      year: listing.vehicle.year,
      bodyType: listing.vehicle.bodyType,
      transmission: listing.vehicle.transmission,
      fuel: listing.vehicle.fuel,
      mileageKm: listing.vehicle.mileageKm,
      colorExterior: listing.vehicle.colorExterior,
      condition: listing.vehicle.condition,
      vin: listing.vehicle.vin,
    },

    images: listing.images.map((image) => ({
      id: image.id,
      r2Key: image.r2Key,
      isCover: image.isCover,
      plateBlurred: image.plateBlurred,
      hasFingerprint: image.phash !== null,
      qualityFlags: image.qualityFlags,
    })),

    offers: listing.offers.map((offer) => ({
      id: offer.id,
      amount: offer.amount.toFixed(2),
      status: offer.status,
      at: offer.createdAt.toISOString(),
    })),

    orders: listing.orders.map((order) => ({
      ref: order.ref,
      stage: order.stage,
      status: order.status,
      at: order.createdAt.toISOString(),
    })),

    auction:
      listing.auction === null
        ? null
        : {
            status: listing.auction.status,
            startPrice: listing.auction.startPrice.toFixed(2),
            endsAt: listing.auction.endsAt.toISOString(),
            bidCount: listing.auction._count.bids,
          },
  };
}

export type AdminUserDetail = {
  id: string;
  /** رقم العميل المقروء — وهو ما يقوله في مكالمة */
  ref: string | null;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  role: string;
  createdAt: string;
  idVerified: boolean;
  identityStatus: string;
  identitySubmittedAt: string | null;
  taxStatus: string | null;
  vatNumber: string | null;
  marketingConsent: boolean;
  /** لدى تاجر — والاسم لا المعرّف */
  dealerName: string | null;

  counts: { listings: number; asBuyer: number; asSeller: number; favorites: number };
  wallet: { balance: string; lines: WalletLine[] } | null;
  /** قيود الدفتر التي تخصّ هذا العميل — كشفُ عملياته */
  ledger: {
    id: string;
    account: string;
    direction: string;
    amount: string;
    event: string;
    orderRef: string | null;
    at: string;
  }[];
  /** ما ينتظر موافقةً ثانية على رصيده */
  pendingAdjustment: PendingAdjustment | null;
  /** `at` تاريخ النشر — و`null` لمسودّةٍ لم تُنشر بعد */
  listings: { ref: string; status: string; askPrice: string; at: string | null }[];
  orders: { ref: string; stage: string; status: string; side: string; at: string }[];
  overrides: { id: string; entitlementKey: string; value: string; reason: string }[];
};

export async function adminUserDetail(id: string): Promise<AdminUserDetail | null> {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      ref: true,
      name: true,
      phone: true,
      email: true,
      status: true,
      role: true,
      createdAt: true,
      idVerified: true,
      identityStatus: true,
      identitySubmittedAt: true,
      taxStatus: true,
      vatNumber: true,
      marketingConsent: true,
      dealer: { select: { nameAr: true } },
      overrides: { select: { id: true, entitlementKey: true, value: true, reason: true } },
      _count: {
        select: {
          listings: true,
          ordersAsBuyer: true,
          ordersAsSeller: true,
          favorites: true,
        },
      },
    },
  });

  if (user === null) return null;

  const [listings, asBuyer, asSeller, wallet, pending, ledgerRows] = await Promise.all([
    db.listing.findMany({
      where: { sellerId: id },
      orderBy: { publishedAt: 'desc' },
      take: 10,
      // `Listing` بلا `createdAt` — والتاريخ تاريخُ النشر أو لا شيء
      select: { ref: true, status: true, askPrice: true, publishedAt: true },
    }),
    db.order.findMany({
      where: { buyerId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { ref: true, stage: true, status: true, createdAt: true },
    }),
    db.order.findMany({
      where: { sellerId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { ref: true, stage: true, status: true, createdAt: true },
    }),
    walletView(id),
    pendingAdjustment(id),
    /**
     * **كشف عملياته من الدفتر** — لا من تجميع طلباته. والدفتر يقول
     * «لماذا تغيّر» لا «كم صار»، وهو ما يُحتاج حين يشكو عميل.
     */
    db.ledgerEntry.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
  ]);

  const ledgerOrderIds = ledgerRows.map((row) => row.orderId).filter((row) => row !== null);
  const ledgerOrders =
    ledgerOrderIds.length === 0
      ? []
      : await db.order.findMany({
          where: { id: { in: ledgerOrderIds } },
          select: { id: true, ref: true },
        });

  /**
   * الطلبات من الجانبين في قائمةٍ واحدة **بجانبها مكتوبًا**: عميلٌ
   * باع واشترى تُعرض طلباته مختلطةً بلا تمييز فتُقرأ خطأً.
   */
  const orders = [
    ...asBuyer.map((order) => ({ ...order, side: 'buyer' })),
    ...asSeller.map((order) => ({ ...order, side: 'seller' })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 12);

  return {
    id: user.id,
    ref: user.ref,
    name: user.name ?? user.phone,
    phone: user.phone,
    email: user.email,
    status: user.status,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    idVerified: user.idVerified,
    identityStatus: user.identityStatus,
    identitySubmittedAt: user.identitySubmittedAt?.toISOString() ?? null,
    taxStatus: user.taxStatus,
    vatNumber: user.vatNumber,
    marketingConsent: user.marketingConsent,
    dealerName: user.dealer?.nameAr ?? null,

    counts: {
      listings: user._count.listings,
      asBuyer: user._count.ordersAsBuyer,
      asSeller: user._count.ordersAsSeller,
      favorites: user._count.favorites,
    },

    // المحفظة تُعرض دائمًا ولو بلا صفّ — و«لا محفظة» تُقرأ عطلًا
    wallet: { balance: wallet.balance, lines: wallet.lines },
    pendingAdjustment: pending,

    ledger: ledgerRows.map((row) => ({
      id: row.id,
      account: row.account,
      direction: row.direction,
      amount: row.amount.toFixed(2),
      event: row.event,
      orderRef: ledgerOrders.find((order) => order.id === row.orderId)?.ref ?? null,
      at: row.createdAt.toISOString(),
    })),

    listings: listings.map((listing) => ({
      ref: listing.ref,
      status: listing.status,
      askPrice: listing.askPrice.toFixed(2),
      at: listing.publishedAt?.toISOString() ?? null,
    })),

    orders: orders.map((order) => ({
      ref: order.ref,
      stage: order.stage,
      status: order.status,
      side: order.side,
      at: order.createdAt.toISOString(),
    })),

    overrides: user.overrides,
  };
}
