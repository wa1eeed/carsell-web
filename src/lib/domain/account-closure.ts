import { db } from '@/lib/db';

/**
 * ═══ إغلاقُ الحساب — ومن سجّل كان لا يستطيع المغادرة ═══
 *
 * قِيس فلم يكن في المنتج كلّه بابٌ للخروج: لا في الشاشة، ولا في
 * المسارات، ولا في النطاق. فمن أنشأ حسابًا يبقى فيه إلى الأبد.
 *
 * ═══ وقرارُ المالك: تجهيلٌ لا محو ═══
 *
 * > «يُجهَّل الحساب وتبقى فواتيره وعقوده.»
 *
 * والسبب نظاميّ: الفاتورة الضريبية والعقد مستندان يُحفظان سنوات، ومحوُ
 * صاحبهما يُفرغهما. **وقِيس أنّ التجهيل لا يُفرغهما**: `TaxInvoice`
 * تلتقط `customerName` و`customerVatNo` لقطةً عند الإصدار،
 * و`VehicleSaleAgreement` تلتقط `buyerName` و`sellerName` — فكلاهما
 * صفٌّ مستقلّ لا يقرأ `User` بعد كتابته.
 *
 * ولولا ذلك لكان التجهيل محوًا للمستندات بطريقٍ غير مباشر.
 *
 * ═══ وما يُمسح وما يبقى ═══
 *
 * | يُمسح | يبقى |
 * |---|---|
 * | الاسم والجوّال والبريد والصورة والمدينة والعنوان | الفواتير والعقود وكشوف التسوية |
 * | الهوية ورقمها المشفَّر وحالتها | الطلبات وقيود الدفتر |
 * | الآيبان واسم المصرف والرقم الضريبيّ | رقم العميل (`CUS-…`) لتتبّع السجلّ |
 * | المفضّلة والبحوث المحفوظة والإشعارات | المركبات (بلا إعلان) |
 *
 * **والجوّال يُستبدَل ولا يُفرَّغ**: العمود فريدٌ ولا يقبل `null`، وقيمةٌ
 * ثابتة تمنع إغلاق حسابٍ ثانٍ. فيُكتب مرجعٌ محجوزٌ لا يُطابق E.164 ولا
 * يصله رمز.
 */

export type CloseFailure =
  | 'USER_NOT_FOUND'
  | 'ALREADY_CLOSED'
  | 'LIVE_ORDERS'
  | 'HELD_ESCROW'
  | 'LIVE_AUCTION'
  | 'HELD_DEPOSIT'
  | 'PENDING_PAYOUT'
  | 'WALLET_BALANCE';

export type CloseResult =
  | { ok: true }
  | { ok: false; reason: CloseFailure; detail?: string };

/**
 * ما يمنع الإغلاق — **ويُفحص قبل أن يُعرض الزرّ**.
 *
 * وشرطٌ يُفرَض بلا بابٍ لاستيفائه قفلٌ بلا مفتاح: فكلُّ مانعٍ هنا
 * يقابله سببٌ يقرؤه صاحب الحساب ويعرف منه ما يفعل.
 */
export async function closureBlockers(userId: string): Promise<CloseFailure[]> {
  const [orders, escrow, auctions, deposits, payouts, wallet] = await Promise.all([
    db.order.count({
      where: { status: 'ACTIVE', OR: [{ buyerId: userId }, { sellerId: userId }] },
    }),
    db.escrow.count({
      where: { status: 'HELD', order: { OR: [{ buyerId: userId }, { sellerId: userId }] } },
    }),
    db.auction.count({
      where: { status: { in: ['SCHEDULED', 'LIVE'] }, listing: { sellerId: userId } },
    }),
    db.deposit.count({ where: { userId, status: { in: ['HELD', 'APPLIED'] } } }),
    db.payout.count({ where: { sellerId: userId, status: 'PENDING' } }),
    /** **ولا عمود `balance`** — المجموع من القيود، كما يقرؤه الكشف. */
    import('./wallet').then(({ walletBalance }) => walletBalance(userId)),
  ]);

  const blockers: CloseFailure[] = [];
  if (orders > 0) blockers.push('LIVE_ORDERS');
  if (escrow > 0) blockers.push('HELD_ESCROW');
  if (auctions > 0) blockers.push('LIVE_AUCTION');
  if (deposits > 0) blockers.push('HELD_DEPOSIT');
  if (payouts > 0) blockers.push('PENDING_PAYOUT');
  /** **ورصيدٌ لنا عنده مالٌ له** — لا يُغلق حسابٌ على مالٍ لصاحبه. */
  if (Number(wallet) > 0) blockers.push('WALLET_BALANCE');

  return blockers;
}

/** الجوّال المحجوز بعد التجهيل — لا يطابق E.164 فلا يصله رمز. */
function closedPhone(userId: string): string {
  return `closed:${userId}`;
}

export async function closeOwnAccount(
  input: { userId: string; reason: string | null },
  now: Date = new Date(),
): Promise<CloseResult> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, status: true },
  });
  if (user === null) return { ok: false, reason: 'USER_NOT_FOUND' };
  if (user.status === 'CLOSED') return { ok: false, reason: 'ALREADY_CLOSED' };

  const blockers = await closureBlockers(user.id);
  if (blockers.length > 0) {
    return { ok: false, reason: blockers[0] as CloseFailure, detail: blockers.join(',') };
  }

  /**
   * ═══ والإعلانات تغادر السوق قبل صاحبها ═══
   *
   * إعلانٌ منشورٌ لبائعٍ مجهَّل يبقى معروضًا ولا يردّ على عرضٍ أبدًا —
   * فيُوقَف. والمسودّات تُحذف: لم يرها أحد، ولا سجلَّ فيها.
   *
   * **والحالة تمرّ بمدخلها الوحيد** (البوابة ٢١): `pauseListing` لا
   * `listing.update`.
   */
  const { pauseListing } = await import('./listing-state');

  const live = await db.listing.findMany({
    where: { sellerId: user.id, status: { in: ['PUBLISHED', 'PENDING_REVIEW'] } },
    select: { id: true },
  });
  for (const row of live) await pauseListing(db, row.id);

  await db.listing.deleteMany({
    where: {
      sellerId: user.id,
      status: 'DRAFT',
      offers: { none: {} },
      orders: { none: {} },
      serviceRequests: { none: {} },
      auction: { is: null },
    },
  });

  /** ما لا قيمة قانونية له يُحذف — وهو أثرُ تصفّحه لا سجلُّ معاملاته. */
  await Promise.all([
    db.favorite.deleteMany({ where: { userId: user.id } }),
    db.savedSearch.deleteMany({ where: { userId: user.id } }),
    db.notification.deleteMany({ where: { userId: user.id } }),
    db.notificationPreference.deleteMany({ where: { userId: user.id } }),
    db.deviceToken.deleteMany({ where: { userId: user.id } }),
  ]);

  await db.user.update({
    where: { id: user.id },
    data: {
      status: 'CLOSED',
      closedAt: now,
      /** يُستبدَل ولا يُفرَّغ: العمود فريدٌ ولا يقبل `null`. */
      phone: closedPhone(user.id),
      email: null,
      name: null,
      avatarUrl: null,
      passwordHash: null,
      city: null,
      address: null,
      bankName: null,
      iban: null,
      businessName: null,
      crNumber: null,
      crExpiresAt: null,
      vatNumber: null,
      taxStatus: null,
      taxStatusSetAt: null,
      nationalIdEncrypted: null,
      idVerified: false,
      idVerifiedAt: null,
      identityStatus: 'NONE',
      identitySubmittedAt: null,
      identityMethod: null,
      identityNote: null,
      identityReviewedBy: null,
      marginSchemeApproved: false,
      marginSchemeRef: null,
      marginSchemeBy: null,
      marginSchemeAt: null,
      marketingConsent: false,
      marketingConsentAt: null,
      /** ويُفكّ عن معرضه — فلا يبقى في فريقٍ لا ينتمي إليه. */
      dealerId: null,
    },
  });

  /**
   * ═══ والسجلّ يقول إنّ الإغلاق وقع ═══
   *
   * **وبلا بياناتٍ شخصية فيه**: السببُ اختياريّ ويُكتب كما كتبه صاحبه،
   * ولا يُنسخ إليه اسمٌ ولا جوّال — وإلّا بقي المُجهَّل مقروءًا في
   * سجلٍّ يُحفظ سنوات.
   */
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorType: 'user',
      entity: 'User',
      entityId: user.id,
      action: 'account.closed',
      before: { status: user.status },
      after: { status: 'CLOSED', reason: input.reason?.trim().slice(0, 300) ?? null },
      ip: null,
      createdAt: now,
    },
  });

  return { ok: true };
}
