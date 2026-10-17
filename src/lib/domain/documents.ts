import { BRAND_AR } from '@/lib/brand';
import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { issueInvoice } from './tax';
import { processingFeeOnSeller } from './fees';
import { netToSeller as sellerNet } from './money';
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

  // **عمولة البائع وحدها** — وما يدفعه المشتري ليس خصمًا على البائع
  const commission = order.sellerCommission;
  /**
   * **ولقطةُ الطلب لا حسابٌ عند القراءة** (قرار المالك ٢٠٢٦-١٠-١٧:
   * «فوقها»). كانت تُحسب `vatIncluded(commission)` عند كل فتحٍ
   * للكشف — فنسبةٌ تتغيّر من اللوحة تُغيّر **كشفًا صدر**، ويقرأ
   * البائع رقمًا غير الذي وُقّع عليه.
   */
  const commissionTax = order.sellerVat;

  /**
   * ═══ الخصم من **سياستنا** لا من تكلفة البوابة ═══
   *
   * كان يُقدَّر من `capabilities.feePct` — أي من عقدنا مع المزوّد، فيصير
   * تغييرُ عقدٍ يغيّر ما يستلمه البائعون صمتًا. صار من `Order.processingFee`
   * لقطةً وقت الإنشاء، وصفرًا حين يتحمّلها المشتري.
   */
  const gatewayFee = processingFeeOnSeller(order);
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
  // القاعدة في `money.ts` — وتقرؤها صفحة أرباح البائع وشاشة الإفراج
  const netToSeller = sellerNet({
    agreedPrice: order.agreedPrice,
    settlementAmount: order.settlementAmount,
    sellerCommission: commission,
    /** **وضريبتُه تُخصم معه** — فوق الرسم لا داخله */
    sellerVat: commissionTax,
    gatewayFee,
  });

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
              /**
               * أحدث فحصٍ **منشور** — وهو ما يُشار إليه في العقد.
               *
               * وعقدٌ بين البائع والمشتري لا يذكر مرجعَ تقريرٍ خاصٍّ
               * بثالث: وجودُه نفسه معلومةٌ تخصّ من دفع.
               */
              inspectionReports: {
                where: { publishedAt: { not: null } },
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
   * ورسوم المعالجة كذلك — **توريدُنا أيًّا كان من تحمّلها**. البوابة
   * تفوتر نحن، فتمريرُها إعادةُ تحميلِ تكلفتنا لا صرفٌ نيابةً عن أحد.
   */
  if (order.processingFee.greaterThan(0)) {
    supplies.push({
      supplyType: 'ADMIN_FEE',
      amount: order.processingFee.toString(),
      description: 'payment processing fee',
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
        // اسم المورّد في فاتورة ضريبية — مستند رسميّ يحمل اسم الشركة
        supplierName: supply.supplyType === 'VEHICLE' ? sellerName : BRAND_AR,
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
/**
 * سببُ الحجب كما يعني **صاحب الطلب**.
 *
 * الحمولة قائمةُ توريدات، والمشتري يسأل عن فاتورة مركبته — لا عن
 * المصروفات المسدَّدة نيابةً. فتوريد `VEHICLE` أوّلًا، وإلّا فأوّل ما
 * في القائمة.
 */
function blockedReasonOf(payload: Prisma.JsonValue | null): string | undefined {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const rows = (payload as { blocked?: unknown }).blocked;
  if (!Array.isArray(rows)) return undefined;

  const entries = rows.filter(
    (row): row is { supplyType?: string; reason?: string } =>
      row !== null && typeof row === 'object' && !Array.isArray(row),
  );
  const vehicle = entries.find((row) => row.supplyType === 'VEHICLE');
  const reason = (vehicle ?? entries[0])?.reason;
  return typeof reason === 'string' && reason !== '' ? reason : undefined;
}

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
    /**
     * ═══ والوعد لا يبقى بعد موعده ═══
     *
     * «فاتورة ضريبية — يصدر عند الإفراج عن المبلغ» صادقةٌ قبل
     * الإفراج. **وبعده تصير كذبًا**: أُفرج ولم تصدر، والسطر يَعِد
     * بموعدٍ مضى — فينتظر المشتري ورقةً لن تأتي ولا يعرف أنه ينتظر.
     *
     * و`BLOCKED` و`blockedReason` معرَّفان في النوع منذ كُتب **ولا
     * شيء يكتبهما** — والسبب نفسه مكتوبٌ في `invoice.blocked` التي
     * يكتبها `applyState`، فيقرؤها الأدمن ولا يقرؤها صاحب الطلب.
     */
    const settled = order.settlement !== null;

    const blocked = settled
      ? await db.orderEvent.findFirst({
          where: { orderId: order.id, type: 'invoice.blocked' },
          orderBy: { createdAt: 'desc' },
          select: { payload: true },
        })
      : null;

    out.push({
      kind: 'INVOICE',
      state: settled ? 'BLOCKED' : 'PENDING',
      availableAt: settled ? null : 'SETTLED',
      reference: null,
      ...(blocked === null ? {} : { blockedReason: blockedReasonOf(blocked.payload) }),
    });
  }

  return out;
}

/**
 * ═══ المستند كما يُقرأ — لا كما يُخزَّن ═══
 *
 * `orderDocuments` تقول **ما صدر**، والشاشة تعرضه قائمةً. وكانت
 * القائمة نهايةَ الطريق: من اشترى بسبعين ألفًا يرى «عقد البيع ✓»
 * **ولا سبيل له إلى فتحه** — وهو ما يحمله إلى المرور.
 *
 * ثالثَ عشرَ وقوعٍ لـ«معروضٌ لا يُبلَغ»: البيانات كلّها مخزَّنة منذ
 * صدر المستند، والناقص صفحةٌ تعرضها.
 */
export type SaleAgreementView = {
  orderRef: string;
  vin: string;
  sellerName: string;
  sellerIdNo: string | null;
  buyerName: string;
  buyerIdNo: string | null;
  price: string;
  inspectionRef: string | null;
  deliveryTerms: string | null;
  issuedAt: string;
  vehicle: string;
  year: number;
  plate: string | null;
};

export type SettlementStatementView = {
  orderRef: string;
  sellerName: string;
  vehicleValue: string;
  commission: string;
  commissionTax: string;
  gatewayFee: string;
  servicesTotal: string;
  netToSeller: string;
  heldAmount: string;
  returnedAmount: string;
  issuedAt: string;
};

/**
 * **والطلب خاصٌّ بطرفيه** — والفحص هنا لا في الشاشة: حارسٌ في العميل
 * ليس حارسًا، ومن يعرف المرجع يفتح الرابط مباشرةً.
 */
export async function saleAgreementFor(
  orderRef: string,
  viewerId: string,
): Promise<SaleAgreementView | null> {
  const order = await db.order.findUnique({
    where: { ref: orderRef },
    include: {
      agreement: true,
      listing: {
        select: {
          vehicle: {
            select: {
              brandName: true, modelName: true, trimName: true, year: true,
              plateLetters: true, plateNumbers: true,
            },
          },
        },
      },
    },
  });

  if (order === null || order.agreement === null) return null;
  if (order.buyerId !== viewerId && order.sellerId !== viewerId) return null;

  const vehicle = order.listing.vehicle;
  const plate =
    vehicle.plateLetters === null || vehicle.plateNumbers === null
      ? null
      : `${vehicle.plateLetters} ${vehicle.plateNumbers}`;

  return {
    orderRef: order.ref,
    vin: order.agreement.vin,
    sellerName: order.agreement.sellerName,
    sellerIdNo: order.agreement.sellerIdNo,
    buyerName: order.agreement.buyerName,
    buyerIdNo: order.agreement.buyerIdNo,
    price: order.agreement.price.toString(),
    inspectionRef: order.agreement.inspectionRef,
    deliveryTerms: order.agreement.deliveryTerms,
    issuedAt: order.agreement.issuedAt.toISOString(),
    vehicle: [vehicle.brandName, vehicle.modelName, vehicle.trimName]
      .filter((part) => part !== null && part !== '')
      .join(' '),
    year: vehicle.year,
    plate,
  };
}

export async function settlementStatementFor(
  orderRef: string,
  viewerId: string,
): Promise<SettlementStatementView | null> {
  const order = await db.order.findUnique({
    where: { ref: orderRef },
    include: { settlement: true, seller: { select: { name: true } } },
  });

  if (order === null || order.settlement === null) return null;
  if (order.buyerId !== viewerId && order.sellerId !== viewerId) return null;

  const row = order.settlement;
  return {
    orderRef: order.ref,
    sellerName: order.seller.name ?? '',
    vehicleValue: row.vehicleValue.toString(),
    commission: row.commission.toString(),
    commissionTax: row.commissionTax.toString(),
    gatewayFee: row.gatewayFee.toString(),
    servicesTotal: row.servicesTotal.toString(),
    netToSeller: row.netToSeller.toString(),
    heldAmount: row.heldAmount.toString(),
    returnedAmount: row.returnedAmount.toString(),
    issuedAt: row.issuedAt.toISOString(),
  };
}
