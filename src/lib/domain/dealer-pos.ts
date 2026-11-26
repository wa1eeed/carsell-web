import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { issueInvoice } from './tax';
import { buyerTypeFor, checkVatNumber, marginApprovedFor, sellerTypeFor } from './tax-profile';
import { markListingSold } from './listing-state';
import { vehicleMargin } from './vehicle-costs';

/**
 * ═══ `D14` — نقطةُ البيع: عميلُ الصالة ═══
 *
 * طلبُ المالك ٢٠٢٦-١١-٢٦: «توفير POS بحيث يقدر يتعامل مع العملاء اللي
 * يحضرون لمعرضه الواقعي و الـPOS يستعرض نفس السيارات المضافه في مخزونه».
 *
 * ═══ ولمَ ليست طلبًا في السوق ═══
 *
 * `Order` عندنا طلبُ سوقٍ بضمانٍ ومراحلَ وعمولةٍ وتسوية: المالُ يمرّ
 * بنا. وبيعةُ الصالة **لم تمرّ بنا** — نقدٌ أو شبكةٌ أو حوالةٌ بين
 * المعرض ومشتريه. فحشرُها في `Order` يضخّم حجمَ المبيعات وينسب إلينا
 * عمولةً لم نأخذها ويفتح ضمانًا لا مال فيه. فهي **فاتورةٌ وتغيُّرُ حالِ
 * مركبة**، لا أكثر — وبذلك يبقى `GMV` ونسبةُ الأخذ صادقين.
 *
 * ═══ وأخطرُ ما فيها: أن تُباع مرّتين ═══
 *
 * **والسيارةُ تخرج من السوق في المعاملة نفسِها.** معرضٌ يبيع في صالته
 * وإعلانُه قائمٌ على كارز يستقبل عروضًا على سيارةٍ خرجت من بابه — وهذا
 * وحده سببٌ كافٍ ليكون الـPOS عندنا لا في نظامٍ آخر. والحالةُ تمرّ
 * بـ`listing-state` كغيرها (البوابة ٢١).
 *
 * **والضريبةُ من `tax.ts` وحدها** — ولا حسابَ هنا: القاعدةُ تُطابَق،
 * والهامشُ يُقرأ من دفتر كلفة المركبة، والفاتورةُ تحمل رقمَها ورمزَها.
 */

export type PosSaleInput = {
  vehicleId: string;
  /** السعرُ المتَّفق عليه في الصالة — وقد يخالف المعروض. */
  price: number;
  buyerName: string;
  /** جوالُ المشتري — يُحفظ في الفاتورة وصفًا، ولا حسابَ يُنشأ له. */
  buyerPhone: string | null;
  /** رقمُه الضريبيّ إن كان منشأةً تسترد مدخلاتها. */
  buyerVatNo: string | null;
  method: 'CASH' | 'CARD' | 'TRANSFER';
  note: string | null;
};

export type PosSaleResult =
  | { ok: true; invoiceNumber: string; invoiceId: string; total: string }
  | { ok: false; reason: 'VALIDATION'; fields: Record<string, string> }
  | { ok: false; reason: 'VEHICLE_NOT_FOUND' }
  | { ok: false; reason: 'ALREADY_SOLD' }
  | { ok: false; reason: 'RESERVED_ON_MARKET' }
  | { ok: false; reason: 'INVOICE_BLOCKED'; detail: string };

export function validatePosSale(input: PosSaleInput): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!(input.price > 0)) fields.price = 'INVALID';
  if (input.buyerName.trim().length < 2) fields.buyerName = 'REQUIRED';
  /**
   * **والرقمُ الضريبيّ يُفحص بفاحصه القائم** — لا بنمطٍ ثانٍ هنا:
   * `checkVatNumber` تُطبّع ثمّ تفرّق «خمسةَ عشرَ رقمًا» عن «يبدأ بـ٣
   * وينتهي بـ٣»، ومن أدخل أربعةَ عشرَ لا تنفعه رسالةٌ عن النمط. ونمطٌ
   * يُكتب هنا نسخةٌ ثانيةٌ تتباعد — وقد أنذرت عليه البوابةُ إذ قرأت
   * `{15}` نسبةً ضريبية.
   */
  if (input.buyerVatNo !== null && input.buyerVatNo.trim() !== '') {
    const vat = checkVatNumber(input.buyerVatNo);
    if (!vat.ok) fields.buyerVatNo = vat.reason;
  }
  return fields;
}

export async function sellAtCounter(
  actor: { userId: string; dealerId: string; branchId: string | null },
  input: PosSaleInput,
  now: Date = new Date(),
): Promise<PosSaleResult> {
  const fields = validatePosSale(input);
  if (Object.keys(fields).length > 0) return { ok: false, reason: 'VALIDATION', fields };

  const vehicle = await db.vehicle.findFirst({
    where: {
      id: input.vehicleId,
      dealerId: actor.dealerId,
      ...(actor.branchId === null ? {} : { branchId: actor.branchId }),
    },
    select: {
      id: true,
      brandName: true,
      modelName: true,
      trimName: true,
      year: true,
      listings: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true },
      },
    },
  });
  if (vehicle === null) return { ok: false, reason: 'VEHICLE_NOT_FOUND' };

  const live = vehicle.listings.find((row) =>
    ['PUBLISHED', 'PENDING_REVIEW', 'DRAFT', 'PAUSED', 'RESERVED'].includes(row.status),
  );
  if (vehicle.listings.some((row) => row.status === 'SOLD')) {
    return { ok: false, reason: 'ALREADY_SOLD' };
  }
  /**
   * **ومحجوزةٌ بطلبٍ قائم لا تُباع في الصالة.** مشترٍ من السوق دفع
   * عربونًا أو دخل ضمانًا على هذه السيارة — وبيعُها لغيره يترك مالَه
   * عندنا وسيارتَه عند سواه.
   */
  if (live?.status === 'RESERVED') return { ok: false, reason: 'RESERVED_ON_MARKET' };

  /** والبائعُ صاحبُ المعرض — فالفاتورةُ باسم المنشأة ورقمها. */
  const seller = await db.user.findFirstOrThrow({
    where: { dealerId: actor.dealerId, dealerRole: 'OWNER' },
    select: {
      taxStatus: true,
      vatNumber: true,
      dealerId: true,
      businessName: true,
      name: true,
      identityStatus: true,
      dealer: { select: { nameAr: true, address: true, marginSchemeApproved: true } },
    },
  });

  const sellerType = sellerTypeFor(seller, { taxableSupply: null });
  const buyerType = buyerTypeFor({
    taxStatus: input.buyerVatNo !== null && input.buyerVatNo.trim() !== '' ? 'VAT_REGISTERED' : null,
    vatNumber: input.buyerVatNo,
    dealerId: null,
  });

  /**
   * **وهامشُ الربح يحتاج مقدارَه لا اعتمادَه وحده**: معتمَدٌ بلا رقمٍ
   * يُنتج ضريبةً على صفر — فتصدر فاتورةٌ صفرية على بيعةٍ مستحقّة.
   */
  const marginApproved = marginApprovedFor(seller);
  const margin = marginApproved ? await vehicleMargin(vehicle.id, input.price) : null;

  const title = [vehicle.brandName, vehicle.modelName, vehicle.trimName]
    .filter((part) => part !== null && part !== '')
    .join(' ');

  const invoice = await issueInvoice(
    {
      sellerType,
      buyerType,
      supplyType: 'VEHICLE',
      amount: input.price.toFixed(2),
      ...(margin === null ? {} : { marginAmount: margin.taxable.toFixed(2) }),
      marginApproved,
      supplierName: seller.businessName ?? seller.dealer?.nameAr ?? seller.name ?? '',
      supplierVatNo: seller.vatNumber,
      supplierAddress: seller.dealer?.address ?? null,
      customerName: input.buyerName.trim(),
      customerVatNo:
        input.buyerVatNo === null || input.buyerVatNo.trim() === ''
          ? null
          : input.buyerVatNo.trim(),
      description: `${title} ${String(vehicle.year)}`,
      suppliedAt: now,
    },
    now,
  );

  if (!invoice.ok) return { ok: false, reason: 'INVOICE_BLOCKED', detail: invoice.reason };

  /**
   * **والسيارةُ تخرج من السوق مع الفاتورة لا بعدها.** ومعاملةٌ تُصدر
   * ورقةً وتترك الإعلانَ قائمًا تبيع السيارةَ مرّتين.
   */
  await db.$transaction(async (tx) => {
    /** **وسببُ الخروج بيعةُ صالةٍ لا طلبٌ اكتمل** — فلا يبحث مراجعٌ عن طلب. */
    if (live !== undefined) await markListingSold(tx, live.id, now, 'dealer.pos.sale');

    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        actorType: 'user',
        entity: 'Vehicle',
        entityId: vehicle.id,
        action: 'dealer.pos.sale',
        before: { listingStatus: live?.status ?? null },
        after: {
          invoice: invoice.number,
          price: input.price.toFixed(2),
          method: input.method,
          buyer: input.buyerName.trim(),
          phone: input.buyerPhone,
          note: input.note,
          branchId: actor.branchId,
        },
        ip: null,
        createdAt: now,
      },
    });
  });

  return {
    ok: true,
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.number,
    total: new Prisma.Decimal(invoice.amounts.total).toFixed(2),
  };
}
