import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { issueInvoice, vatIncluded } from './tax';
import { buyerTypeFor, marginApprovedFor, sellerTypeFor } from './tax-profile';

/**
 * مستندات الصفقة الثلاثة — **ولا يُدمج اثنان**.
 *
 *   ١· عقد البيع        — بين البائع والمشتري، ولسنا طرفًا فيه.
 *   ٢· كشف التسوية      — تفصيلٌ ماليّ، و**ليس فاتورة ضريبية**.
 *   ٣· الفواتير الضريبية — وقد تكون ثلاثًا من مورّدين مختلفين.
 *
 * وكلٌّ يُصدر في لحظته: العقد عند تأكيد النقل، والكشف والفواتير عند
 * التسوية المؤكَّدة. **ووثيقةٌ تسبق واقعتها وثيقةٌ كاذبة.**
 */

export type SettlementFigures = {
  vehicleValue: string;
  commission: string;
  commissionTax: string;
  gatewayFee: string;
  servicesTotal: string;
  netToSeller: string;
  heldAmount: string;
  returnedAmount: string;
  /** `true` قبل التسوية — الأرقام تقديرٌ لا واقع. */
  preview: boolean;
};

/**
 * ═══ الكشف يُرى **قبل** التسوية ═══
 *
 * والبائع يحتاج أن يعرف ما سيصله **قبل** أن يتحرّك المال لا بعده:
 * كشفٌ يظهر بعد التحويل يشرح ما وقع، وكشفٌ يظهر قبله يجعل البائع
 * يعترض وهو ما زال ممكنًا.
 *
 * والفرق معلَن: `preview: true` والشاشة تقول «تقديريّ».
 */
export async function settlementFigures(
  orderId: string,
): Promise<SettlementFigures | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      settlement: true,
      payments: {
        where: { status: { in: ['HELD', 'SETTLED', 'PARTIALLY_SETTLED'] } },
      },
    },
  });
  if (order === null) return null;

  // صدر فعلًا ⇒ يُقرأ لا يُحسب
  if (order.settlement !== null) {
    const stored = order.settlement;
    return {
      vehicleValue: stored.vehicleValue.toString(),
      commission: stored.commission.toString(),
      commissionTax: stored.commissionTax.toString(),
      gatewayFee: stored.gatewayFee.toString(),
      servicesTotal: stored.servicesTotal.toString(),
      netToSeller: stored.netToSeller.toString(),
      heldAmount: stored.heldAmount.toString(),
      returnedAmount: stored.returnedAmount.toString(),
      preview: false,
    };
  }

  /**
   * خدمات **البائع** وحده — لا كل خدمة على الإعلان.
   *
   * فحصٌ طلبه المشتري يُخصم من صافي البائع لو جُمع بالإعلان، وهو خصمٌ
   * لمالٍ لم يُنفقه. والتصفية بالمستخدم لا بالإعلان.
   */
  const services = await db.serviceRequest.aggregate({
    where: { listingId: order.listingId, userId: order.sellerId, status: 'DONE' },
    _sum: { amount: true },
  });

  /**
   * **الفاتورة بالمُسوَّى لا بالمتّفق.** البيع قد يكتمل بأقلّ، و
   * `agreedPrice` يبقى للتدقيق بينما `settlementAmount` هو ما وقع.
   */
  const value = order.settlementAmount ?? order.agreedPrice;

  const commission = order.commissionAmount;
  const commissionTax = vatIncluded(commission);
  const gatewayFee = await estimateGatewayFee(
    order.payments[0] ?? null,
    order.totalAmount,
  );
  const servicesTotal = new Prisma.Decimal(services._sum.amount ?? 0);

  /**
   * الخدمات **تُعرض ولا تُخصم**.
   *
   * وهي مدفوعةٌ عند طلبها بمعاملةٍ مستقلّة، فخصمها هنا يُحصّلها مرّتين.
   * والخطأ في الاتّجاهين ليس سواءً: خصمٌ زائد يأخذ من البائع مالًا ليس
   * لنا، ونقصُه دَينٌ يُطالَب به لاحقًا.
   *
   * // DESIGN-Q: هل تُخصم خدمات البائع من صافيه أم تبقى معاملةً منفصلة؟
   */
  const netToSeller = value.minus(commission).minus(gatewayFee);

  return {
    vehicleValue: value.toString(),
    commission: commission.toString(),
    commissionTax: commissionTax.toString(),
    gatewayFee: gatewayFee.toString(),
    servicesTotal: servicesTotal.toString(),
    netToSeller: netToSeller.toString(),
    heldAmount: (order.payments[0]?.amount ?? new Prisma.Decimal(0)).toString(),
    returnedAmount: (
      order.payments[0]?.returnedAmount ?? new Prisma.Decimal(0)
    ).toString(),
    preview: true,
  };
}

/** رسوم البوابة من قدراتها — تقديرٌ حتى تصل تسويتها الفعلية. */
async function estimateGatewayFee(
  payment: { gatewayKey: string } | null,
  amount: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  if (payment === null) return new Prisma.Decimal(0);
  const gateway = await db.paymentGateway.findUnique({
    where: { key: payment.gatewayKey },
  });
  if (gateway === null) return new Prisma.Decimal(0);

  const caps = gateway.capabilities as {
    feePct?: number;
    feeFixed?: number;
  } | null;
  const pct = new Prisma.Decimal(caps?.feePct ?? 0).dividedBy(100);
  const fixed = new Prisma.Decimal(caps?.feeFixed ?? 0);
  return amount.times(pct).plus(fixed).toDecimalPlaces(2);
}

/** عقد البيع — **عند تأكيد النقل**، وهو بين الطرفين لا معنا. */
export async function issueSaleAgreement(
  orderId: string,
  now: Date = new Date(),
): Promise<{ ok: boolean }> {
  const existing = await db.vehicleSaleAgreement.findUnique({
    where: { orderId },
  });
  if (existing !== null) return { ok: true };

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      buyer: { select: { name: true } },
      seller: { select: { name: true, dealer: { select: { nameAr: true } } } },
      listing: {
        select: {
          vehicle: {
            select: {
              vin: true,
              // أحدث فحص — وهو ما يُشار إليه في العقد
              inspectionReports: {
                select: { ref: true },
                orderBy: { inspectedAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (order === null) return { ok: false };

  try {
    await db.vehicleSaleAgreement.create({
      data: {
        orderId,
        vin: order.listing.vehicle.vin ?? '',
        sellerName: order.seller.dealer?.nameAr ?? order.seller.name ?? '',
        buyerName: order.buyer.name ?? '',
        price: order.agreedPrice,
        inspectionRef: order.listing.vehicle.inspectionReports[0]?.ref ?? null,
        issuedAt: now,
      },
    });
  } catch {
    // نداءان متزامنان — والقيد الفريد منع الثاني، وهذا هو المطلوب
    return { ok: true };
  }
  return { ok: true };
}

export type IssueDocumentsResult = {
  settlementIssued: boolean;
  invoices: { number: string; supplyType: string }[];
  blocked: { supplyType: string; reason: string }[];
};

/**
 * مستندات التسوية — **عند `SETTLED` المؤكَّد وحده**.
 *
 * ولا تُصدَر على `PENDING`: الفاتورة تشهد بواقعة، و«ينتظر التأكيد»
 * ليست واقعة بعد. ولو صدرت ثم فشلت التسوية لصار الإلغاء إشعارَ دائن
 * على فاتورةٍ ما كان ينبغي أن تُولد.
 *
 * **والفاتورة المحجوبة لا تُبتلع**: `blocked` تقول أيّ توريد لم يُفوتَر
 * ولماذا — وقاعدةٌ تنتظر المذكرة الضريبية سببٌ مشروع يُعرض لا يُخفى.
 */
export async function issueSettlementDocuments(
  orderId: string,
  now: Date = new Date(),
): Promise<IssueDocumentsResult> {
  const result: IssueDocumentsResult = {
    settlementIssued: false,
    invoices: [],
    blocked: [],
  };

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      buyer: { select: { name: true, dealerId: true, taxStatus: true, vatNumber: true } },
      seller: {
        select: {
          name: true,
          dealerId: true,
          taxStatus: true,
          vatNumber: true,
          marginSchemeApproved: true,
          dealer: {
            select: {
              nameAr: true,
              vatNumber: true,
              marginSchemeApproved: true,
            },
          },
        },
      },
      listing: { select: { taxableSupply: true } },
      settlement: true,
    },
  });
  if (order === null) return result;

  const figures = await settlementFigures(orderId);
  if (figures !== null && order.settlement === null) {
    try {
      await db.settlementStatement.create({
        data: {
          orderId,
          vehicleValue: new Prisma.Decimal(figures.vehicleValue),
          commission: new Prisma.Decimal(figures.commission),
          commissionTax: new Prisma.Decimal(figures.commissionTax),
          gatewayFee: new Prisma.Decimal(figures.gatewayFee),
          servicesTotal: new Prisma.Decimal(figures.servicesTotal),
          netToSeller: new Prisma.Decimal(figures.netToSeller),
          heldAmount: new Prisma.Decimal(figures.heldAmount),
          returnedAmount: new Prisma.Decimal(figures.returnedAmount),
          issuedAt: now,
        },
      });
      result.settlementIssued = true;
    } catch {
      // أُصدر بالتوازي — والقيد الفريد كفى
    }
  }

  /**
   * النوعان من **وضع الطرفين هما** لا من صفة المعرض — ففردٌ قد يكون
   * مسجَّلًا، ومعرضٌ قد لا يكون. `src/lib/domain/tax-profile.ts`.
   */
  const sellerType = sellerTypeFor(order.seller, order.listing);
  const buyerType = buyerTypeFor(order.buyer);
  const sellerName = order.seller.dealer?.nameAr ?? order.seller.name ?? '';
  const buyerName = order.buyer.name ?? '';

  /**
   * ═══ ما يُفوتَر هنا: العمولة وحدها ═══
   *
   * **والخدمات لا** — وإن ظهرت في الكشف. فهي `SERVICE_PURCHASE`: توريدٌ
   * وقع يوم أُنجزت الخدمة ودُفعت بمعاملتها. وفوترتُها ثانيةً عند تسوية
   * المركبة **فاتورة مكرَّرة** لا فاتورة متأخّرة: تُنشئ التزامًا ضريبيًّا
   * على توريدٍ مُفوتَر، ونقضُها يحتاج إشعار دائن على ورقةٍ ما كان لها أن
   * توجد. والخطأ هنا غير متماثل — النقص ثغرةٌ تُسدّ، والزيادة وثيقةٌ خرجت.
   *
   * **ورسم النقل الحكوميّ صرفٌ** يُمرَّر بلا زيادة فلا فاتورة منّا فيه،
   * بينما **رسمنا الإداريّ عليه توريدٌ منّا** يُفوتَر. وهذا الفصل شرط
   * صحّة التصنيف لا ترتيب عرض — `src/lib/domain/fees.ts`.
   *
   * أمّا المركبة فمورّدها البائع، وقاعدتها قد تكون معطّلة بانتظار المذكرة.
   */
  const supplies: {
    supplyType: 'COMMISSION' | 'VEHICLE' | 'ADMIN_FEE' | 'DISBURSEMENT';
    amount: string;
    description: string;
  }[] = [];
  if (new Prisma.Decimal(figures?.commission ?? 0).greaterThan(0)) {
    supplies.push({
      supplyType: 'COMMISSION',
      amount: figures?.commission ?? '0',
      description: 'platform commission',
    });
  }

  /**
   * الرسم الإداريّ توريدُ خدمةٍ منّا — يُفوتَر مع تسوية المركبة لأنه
   * جزء من مبلغها المحجوز، بخلاف خدمةٍ لها معاملتها.
   */
  if (order.transferAdminFee.greaterThan(0)) {
    supplies.push({
      supplyType: 'ADMIN_FEE',
      amount: order.transferAdminFee.toString(),
      description: 'ownership transfer administrative fee',
    });
  }

  /**
   * والرسم الحكوميّ يمرّ من المُصدِر **ليُردّ بقاعدته**: يطابق صفًّا
   * `OUT_OF_SCOPE` فيعود `OUT_OF_SCOPE_NO_INVOICE`. ولم يُستثنَ في الكود
   * لأن الاستثناء يجعل المعالجة سطرًا لا يراه المشغّل — وهنا يراها في
   * A21 صفًّا يقرؤه ويغيّره إن جاء التصنيف بغيرها.
   */
  if (order.transferFee.greaterThan(0)) {
    supplies.push({
      supplyType: 'DISBURSEMENT',
      amount: order.transferFee.toString(),
      description: 'ownership transfer government fee',
    });
  }

  supplies.push({
    supplyType: 'VEHICLE',
    amount: figures?.vehicleValue ?? '0',
    description: 'vehicle',
  });

  /**
   * **المؤجَّل يُعلَن.** توريدٌ يسقط بلا سطر يبدو توريدًا لم يقع، وأوّل
   * مطابقةٍ شهرية تكشفه سؤالًا بلا جواب مكتوب.
   */
  if (new Prisma.Decimal(figures?.servicesTotal ?? 0).greaterThan(0)) {
    result.blocked.push({ supplyType: 'SERVICE', reason: 'INVOICED_WITH_ITS_OWN_PAYMENT' });
  }


  for (const supply of supplies) {
    const issued = await issueInvoice(
      {
        orderId,
        sellerType,
        buyerType,
        supplyType: supply.supplyType,
        amount: supply.amount,
        marginApproved: marginApprovedFor(order.seller),
        supplierName: supply.supplyType === 'VEHICLE' ? sellerName : 'CarSell',
        supplierVatNo:
          supply.supplyType === 'VEHICLE'
            ? (order.seller.dealer?.vatNumber ?? null)
            : null,
        customerName: supply.supplyType === 'VEHICLE' ? buyerName : sellerName,
        description: supply.description,
        suppliedAt: now,
      },
      now,
    );

    if (issued.ok) {
      result.invoices.push({
        number: issued.number,
        supplyType: supply.supplyType,
      });
    } else {
      result.blocked.push({
        supplyType: supply.supplyType,
        reason: issued.reason,
      });
    }
  }

  return result;
}

export type DocumentState = 'READY' | 'PENDING' | 'BLOCKED';

export type OrderDocument = {
  kind: 'AGREEMENT' | 'SETTLEMENT' | 'INVOICE';
  state: DocumentState;
  /** متى يصير جاهزًا — يُقال قبل أن يُسأل عنه. */
  availableAt: 'TRANSFER_CONFIRMED' | 'SETTLED' | null;
  reference: string | null;
  supplyType?: string;
  blockedReason?: string;
};

/**
 * ما يراه صاحب الطلب من مستنداته — **الموجود والقادم معًا**.
 *
 * وقسمٌ فارغ يجعل المستخدم يظنّ أن شيئًا ضاع. فالقادم يُعرض بموعده:
 * «عقد البيع — يصدر عند تأكيد النقل» أوضح من غيابه.
 */
export async function orderDocuments(
  orderRef: string,
  viewerId: string,
): Promise<OrderDocument[] | null> {
  const order = await db.order.findUnique({
    where: { ref: orderRef },
    include: {
      agreement: true,
      settlement: true,
      taxInvoices: {
        select: { number: true, ruleSupplyType: true, status: true },
      },
    },
  });
  if (order === null) return null;
  // الطلب خاصّ بطرفيه
  if (order.buyerId !== viewerId && order.sellerId !== viewerId) return null;

  const out: OrderDocument[] = [
    {
      kind: 'AGREEMENT',
      state: order.agreement === null ? 'PENDING' : 'READY',
      availableAt: order.agreement === null ? 'TRANSFER_CONFIRMED' : null,
      reference: order.agreement?.id ?? null,
    },
    {
      kind: 'SETTLEMENT',
      state: order.settlement === null ? 'PENDING' : 'READY',
      availableAt: order.settlement === null ? 'SETTLED' : null,
      reference: order.settlement?.id ?? null,
    },
  ];

  for (const invoice of order.taxInvoices) {
    out.push({
      kind: 'INVOICE',
      state: 'READY',
      availableAt: null,
      reference: invoice.number,
      supplyType: invoice.ruleSupplyType,
    });
  }

  if (order.taxInvoices.length === 0) {
    out.push({
      kind: 'INVOICE',
      state: 'PENDING',
      availableAt: 'SETTLED',
      reference: null,
    });
  }

  return out;
}
