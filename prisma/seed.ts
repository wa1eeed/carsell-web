/**
 * البيانات الأولية — BUILD-WEB-ADMIN.md القسم ٩.
 *
 * لماذا هذا الحجم: لا يمكن الحكم على صفحة نتائج البحث بأربعة إعلانات.
 * الشاشات صُمِّمت على كثافة حقيقية، فالزرع يبني كثافة حقيقية.
 *
 * السكربت **حتمي**: نفس المدخلات تعطي نفس المخرجات في كل تشغيل
 * (مولّد أرقام ببذرة ثابتة، ولا `Date.now()` ولا `Math.random`).
 * وهو **يمسح ويعيد البناء**، فلا يعمل إلا في تطوير أو staging.
 *
 * التشغيل: npm run db:seed
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/lib/auth/password';
import { generateSecret } from '../src/lib/auth/totp';
import { Prisma } from '../src/generated/prisma/client';
import type {
  BodyType,
  Drivetrain,
  FeatureGroup,
  FuelType,
  ProviderType,
  ServiceCategory,
  Transmission,
} from '../src/generated/prisma/enums';

try {
  process.loadEnvFile();
} catch {
  // المتغيّرات من البيئة نفسها
}

// ═══════════════════════════════════════════════════════════
//  الحارس — لا زرع في الإنتاج بأي حال
// ═══════════════════════════════════════════════════════════

const APP_ENV = process.env.APP_ENV ?? 'development';

if (APP_ENV === 'production') {
  console.error(
    [
      '',
      '✗ رُفض التشغيل: APP_ENV=production',
      '',
      '  سكربت الزرع يمسح كل الجداول ويعيد بناءها ببيانات وهمية.',
      '  تشغيله على الإنتاج يعني فقدان بيانات حقيقية لا تُستعاد.',
      '',
      '  الإنتاج يُرحَّل بـ`prisma migrate deploy` فقط — لا زرع ولا `db push`.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  console.error('✗ DATABASE_URL غير مضبوط — راجع .env.example');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: ['error'],
});

const D = Prisma.Decimal;

// ═══════════════════════════════════════════════════════════
//  أدوات حتمية
// ═══════════════════════════════════════════════════════════

/** mulberry32 — مولّد ببذرة ثابتة، فالزرع يعيد نفس النتيجة دائمًا. */
function makeRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = makeRandom(20260802);
const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(rnd() * items.length)] as T;
const between = (min: number, max: number): number =>
  Math.floor(rnd() * (max - min + 1)) + min;

/** لحظة مرجعية ثابتة — التخزين UTC والعرض بتوقيت الرياض في الواجهة. */
const NOW = new Date('2026-08-02T09:00:00.000Z');
const days = (n: number): Date => new Date(NOW.getTime() + n * 86_400_000);
const hours = (n: number): Date => new Date(NOW.getTime() + n * 3_600_000);

const CITIES = [
  'الرياض',
  'جدة',
  'الدمام',
  'مكة المكرمة',
  'المدينة المنورة',
  'الخبر',
  'أبها',
  'تبوك',
] as const;

const COLORS = [
  'أبيض',
  'أسود',
  'فضّي',
  'رمادي',
  'أزرق',
  'بني',
  'أحمر',
] as const;

const SEED_DIR = join(process.cwd(), 'prisma', 'seed-data');
const load = <T,>(name: string): T =>
  JSON.parse(readFileSync(join(SEED_DIR, name), 'utf8')) as T;

// ═══════════════════════════════════════════════════════════
//  أنواع ملفات البيانات
// ═══════════════════════════════════════════════════════════

type FeatureRow = {
  key: string;
  nameAr: string;
  nameEn: string;
  group: FeatureGroup;
  sort: number;
  active: boolean;
  placements: string[];
};

type TrimRow = {
  nameAr: string;
  nameEn: string;
  bodyType: BodyType;
  transmission: Transmission;
  fuel: FuelType;
  drivetrain: Drivetrain;
  seats: number;
  doors: number;
  engineL: number | null;
  cylinders: number | null;
  horsepower: number | null;
  yearFrom: number;
  yearTo: number | null;
};

type ModelRow = {
  nameAr: string;
  nameEn: string;
  yearFrom: number;
  yearTo: number | null;
  bodyType: BodyType;
  visible: boolean;
  trims: TrimRow[];
};

type BrandRow = {
  slug: string;
  nameAr: string;
  nameEn: string;
  sort: number;
  visible: boolean;
  models: ModelRow[];
};

type ServiceRow = {
  key: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  price: string;
  category: ServiceCategory;
  isAutomated: boolean;
  slaHours: number | null;
  placements: string[];
  sort: number;
  providerType: ProviderType | null;
};

type TaxRuleRow = {
  sellerType: string | null;
  buyerType: string | null;
  supplyType: string;
  taxableBase: string;
  ratePct: string | null;
  supplierIsPlatform: boolean;
  invoiceIssuer: string;
  active: boolean;
  note: string;
};

type GatewayRow = {
  key: string;
  nameAr: string;
  nameEn: string;
  status: string;
  sort: number;
  capabilities: Prisma.InputJsonValue;
};

type PushChannelRow = {
  key: string;
  nameAr: string;
  userControllable: boolean;
  defaultOn: boolean;
  sort: number;
};

type AdSlotRow = {
  key: string;
  nameAr: string;
  width: number;
  height: number;
  pricingModel: string;
  basePrice: string;
  maxPerSession: number;
};

type FaqPlacementRow = {
  surface: string;
  listingType: 'DIRECT' | 'NEGOTIATION' | 'AUCTION' | null;
  condition: Record<string, unknown> | null;
};

type FaqRow = {
  questionAr: string;
  questionEn: string;
  answerAr: string;
  answerEn: string;
  category: string;
  sort: number;
  placements: FaqPlacementRow[];
};

type TemplateRow = {
  key: string;
  subjectAr: string;
  subjectEn: string;
  bodyAr: string;
  bodyEn: string;
  smsAr: string | null;
  smsEn: string | null;
  priority: string;
  channelEmail: boolean;
  channelSms: boolean;
  channelPush: boolean;
  channelInApp: boolean;
  variables: string[];
  active: boolean;
};

// ═══════════════════════════════════════════════════════════
//  المسح — بترتيب يحترم المفاتيح الأجنبية
// ═══════════════════════════════════════════════════════════

async function reset(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "CreditNote","TaxInvoiceLine","TaxInvoice","TaxRule",
      "VehicleSaleAgreement","SettlementStatement",
      "PaymentEvent","Payment","PaymentRouteChange","PaymentRoute","PaymentGateway",
      "DeviceToken","NotificationPreference","PushChannel","CampaignSend","Campaign","Segment",
      "ApprovalRequest","AuditLog","Report","PriceStat","SeoTemplate","Integration",
      "AdCampaign","AdSlot","NotificationTemplate","FaqPlacement","FaqItem",
      "SavedSearch","Favorite","FinanceInput","CommissionRule","PlatformSetting",
      "Subscription","PlanEntitlement","Entitlement","Plan","EntitlementOverride",
      "FinanceSetting","FinanceProvider","InspectionReport","ServiceRequest","Service",
      "ServiceProvider","Invoice","Dispute","Escrow","OrderEvent","Order",
      "Deposit","Bid","Auction","Offer","ListingFeature","ListingImage","Listing",
      "VehicleHistoryItem","Vehicle","TrimFeature","Feature","Trim","Model","Brand",
      "OtpChallenge","AdminUser","User","Dealer"
    RESTART IDENTITY CASCADE;
  `);
}

// ═══════════════════════════════════════════════════════════
//  الزرع
// ═══════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log(`زرع البيانات الأولية · APP_ENV=${APP_ENV}`);
  await reset();

  // ————— إعدادات المنصة —————
  await prisma.platformSetting.create({
    data: { id: 'default', transferFee: new D('350.00'), vatPct: new D('15.00') },
  });
  await prisma.financeSetting.create({
    data: {
      id: 'default',
      downPaymentPct: new D('20.00'),
      months: 60,
      profitRatePct: new D('4.75'),
      minPrice: new D('30000.00'),
    },
  });

  // ————— الخصائص والباقة المجانية بعمولة صفر —————
  const ENTITLEMENTS = [
    ['can_direct_sale', 'bool', 'true', 'إتاحة البيع المباشر'],
    ['can_negotiate', 'bool', 'true', 'إتاحة التفاوض بالعروض'],
    ['can_auction', 'bool', 'true', 'إتاحة إنشاء مزاد'],
    ['max_active_listings', 'int', '10', 'سقف الإعلانات النشطة'],
    ['featured_slots', 'int', '0', 'عدد مرات التمييز المجانية'],
    ['bulk_upload', 'bool', 'false', 'الرفع الجماعي — لوحة التاجر'],
    ['team_seats', 'int', '0', 'مقاعد فريق المعرض'],
    ['commission_pct', 'percent', '0', 'نسبة العمولة'],
    ['deposit_required', 'bool', 'true', 'اشتراط العربون للمزايدة'],
    ['priority_support', 'bool', 'false', 'دعم ذو أولوية'],
  ] as const;

  await prisma.entitlement.createMany({
    data: ENTITLEMENTS.map(([key, type, defaultValue, description]) => ({
      key,
      type,
      defaultValue,
      description,
    })),
  });

  const freePlan = await prisma.plan.create({
    data: {
      key: 'free',
      nameAr: 'المجانية',
      nameEn: 'Free',
      price: new D('0.00'),
      billingCycle: 'monthly',
      visible: true,
      entitlements: {
        create: ENTITLEMENTS.map(([key, , defaultValue]) => ({
          entitlementKey: key,
          value: defaultValue,
        })),
      },
    },
  });

  await prisma.commissionRule.create({
    data: {
      scope: 'global',
      pct: new D('0.00'),
      fixedFee: new D('0.00'),
      activeFrom: days(-180),
    },
  });

  // ————— ٣ حسابات أدمن بالأدوار —————
  //
  // كلمة مرور واحدة معروفة للتطوير، وTOTP **مسجَّل مسبقًا** حتى
  // يمكن الدخول بلا مسح رمز QR في كل إعادة زرع. السرّ يُطبع أدناه.
  // لا يعمل هذا إلا خارج الإنتاج — الحارس أعلى الملف يمنعه.
  const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? 'CarSell!dev2026';
  const seedPasswordHash = await hashPassword(seedPassword);
  const totpSecrets = new Map<string, string>();

  const admins = await Promise.all(
    (
      [
        ['super@carsell.one', 'وليد — سوبر أدمن', 'SUPER_ADMIN'],
        ['ops@carsell.one', 'نورة — التشغيل', 'OPS'],
        ['finance@carsell.one', 'سلطان — المالية', 'FINANCE'],
      ] as const
    ).map(([email, name, role]) => {
      const secret = generateSecret();
      totpSecrets.set(email, secret);
      return prisma.adminUser.create({
        data: {
          email,
          name,
          role,
          passwordHash: seedPasswordHash,
          // TOTP إلزامي لكل الأدوار — التسجيل هو الحقيقة لا راية منفصلة
          totpSecret: secret,
          totpEnrolledAt: days(-1),
          mustChangePassword: false,
        },
      });
    }),
  );

  // ————— ٣٩ ميزة —————
  const features = load<FeatureRow[]>('features.json');
  await prisma.feature.createMany({ data: features });

  /**
   * ربط المميّزات بالفئات — الأساسيات وحدها.
   * القاعدة في prisma/seed-data/README.md: ميزة خاطئة في الكتالوج
   * تنتشر إلى كل إعلان يُنشر من تلك الفئة، ولا يراها البائع ليصحّحها.
   */
  const ALWAYS = ['abs', 'airbags_front', 'ac_auto', 'bluetooth'] as const;
  const FROM_2020 = 'rear_camera';

  // ————— الكتالوج: ٤٢ ماركة، عشر منها بشجرة كاملة —————
  const brands = load<BrandRow[]>('brands.json');
  const trimLinks: { trimId: string; featureKey: string; isDefault: boolean }[] = [];
  type TrimRef = {
    id: string;
    row: TrimRow;
    modelId: string;
    modelNameAr: string;
    brandId: string;
    brandNameAr: string;
  };
  const allTrims: TrimRef[] = [];

  for (const b of brands) {
    const brand = await prisma.brand.create({
      data: {
        slug: b.slug,
        nameAr: b.nameAr,
        nameEn: b.nameEn,
        sort: b.sort,
        visible: b.visible,
      },
    });

    for (const m of b.models) {
      const model = await prisma.model.create({
        data: {
          brandId: brand.id,
          nameAr: m.nameAr,
          nameEn: m.nameEn,
          yearFrom: m.yearFrom,
          yearTo: m.yearTo,
          bodyType: m.bodyType,
          visible: m.visible,
        },
      });

      for (const t of m.trims) {
        const trim = await prisma.trim.create({
          data: {
            modelId: model.id,
            nameAr: t.nameAr,
            nameEn: t.nameEn,
            yearFrom: t.yearFrom,
            yearTo: t.yearTo,
            bodyType: t.bodyType,
            transmission: t.transmission,
            fuel: t.fuel,
            drivetrain: t.drivetrain,
            seats: t.seats,
            doors: t.doors,
            engineL: t.engineL === null ? null : new D(String(t.engineL)),
            cylinders: t.cylinders,
            horsepower: t.horsepower,
          },
        });

        for (const key of ALWAYS) {
          trimLinks.push({ trimId: trim.id, featureKey: key, isDefault: true });
        }
        if (t.yearFrom >= 2020) {
          trimLinks.push({
            trimId: trim.id,
            featureKey: FROM_2020,
            isDefault: true,
          });
        }

        allTrims.push({
          id: trim.id,
          row: t,
          modelId: model.id,
          modelNameAr: m.nameAr,
          brandId: brand.id,
          brandNameAr: b.nameAr,
        });
      }
    }
  }
  await prisma.trimFeature.createMany({ data: trimLinks });

  // ————— المزوّدون والخدمات التسعة —————
  const providerDefs = [
    ['مركز فحص المستقبل', 'Mustaqbal Inspection Centre', 'INSPECTION', 48],
    ['ناقل للشحن', 'Naqil Transport', 'SHIPPING', 96],
    ['تأمين الراجحي', 'Al Rajhi Takaful', 'INSURANCE', 1],
    ['ديتيل برو', 'Detail Pro', 'DETAILING', 48],
    ['عدسة للتصوير', 'Adasa Studio', 'PHOTOGRAPHY', 48],
  ] as const;

  const providers = new Map<ProviderType, string>();
  for (const [nameAr, nameEn, type, sla] of providerDefs) {
    const p = await prisma.serviceProvider.create({
      data: {
        nameAr,
        nameEn,
        type,
        slaHours: sla,
        contactPhone: '+966112000000',
        commissionPct: new D('15.00'),
        cities: [...CITIES].slice(0, 4),
        active: true,
      },
    });
    providers.set(type, p.id);
  }

  const serviceRows = load<ServiceRow[]>('services.json');
  const services = new Map<string, string>();
  for (const s of serviceRows) {
    const created = await prisma.service.create({
      data: {
        key: s.key,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        descAr: s.descAr,
        descEn: s.descEn,
        price: new D(s.price),
        category: s.category,
        isAutomated: s.isAutomated,
        slaHours: s.slaHours,
        placements: s.placements,
        sort: s.sort,
        providerId:
          s.providerType === null ? null : (providers.get(s.providerType) ?? null),
      },
    });
    services.set(s.key, created.id);
  }

  // ————— المعارض (Wg مرحلة أولى) —————
  const dealerDefs = [
    ['al-safwa', 'معرض الصفوة', 'Al Safwa Motors', 'الرياض', true, '4.80', 142],
    ['al-nokhba', 'معرض النخبة', 'Al Nokhba Cars', 'الرياض', true, '4.60', 98],
    ['jeddah-auto', 'جدة أوتو', 'Jeddah Auto', 'جدة', true, '4.40', 61],
    ['sharq-motors', 'معرض الشرق', 'Sharq Motors', 'الدمام', false, null, 0],
  ] as const;

  const dealers = await Promise.all(
    dealerDefs.map(([slug, nameAr, nameEn, city, verified, rating, count]) =>
      prisma.dealer.create({
        data: {
          slug,
          nameAr,
          nameEn,
          city,
          verified,
          ratingAvg: rating === null ? null : new D(rating),
          ratingCount: count,
          status: verified ? 'ACTIVE' : 'PENDING',
          phone: '+966112345678',
          aboutAr: `${nameAr} — بيع وشراء السيارات المستعملة والجديدة في ${city}.`,
          aboutEn: `${nameEn} — buying and selling used and new cars in ${city}.`,
          crNumber: `10${between(10000000, 99999999)}`,
          createdAt: days(-between(200, 900)),
        },
      }),
    ),
  );

  // ————— المستخدمون —————
  const individualNames = [
    'خالد العتيبي',
    'فهد الدوسري',
    'سعود العنزي',
    'ريم القحطاني',
    'عبدالله الشهري',
    'منى الحربي',
    'ماجد الغامدي',
    'نوف السبيعي',
  ] as const;

  const sellers = await Promise.all(
    individualNames.map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+9665${String(10000000 + i).padStart(8, '0')}`,
          name,
          email: `seller${i + 1}@example.com`,
          idVerified: true,
          idVerifiedAt: days(-between(30, 400)),
          iban: `SA03${between(10, 99)}${between(1000000000000000, 9999999999999999)}`,
          createdAt: days(-between(60, 700)),
        },
      }),
    ),
  );

  const dealerUsers = await Promise.all(
    dealers.map((d, i) =>
      prisma.user.create({
        data: {
          phone: `+9665${String(20000000 + i).padStart(8, '0')}`,
          name: `مدير ${d.nameAr}`,
          email: `dealer${i + 1}@example.com`,
          role: 'DEALER',
          dealerId: d.id,
          idVerified: true,
          idVerifiedAt: days(-300),
          createdAt: days(-between(200, 900)),
        },
      }),
    ),
  );

  const buyers = await Promise.all(
    Array.from({ length: 14 }, (_, i) =>
      prisma.user.create({
        data: {
          phone: `+9665${String(30000000 + i).padStart(8, '0')}`,
          name: `مشترٍ ${i + 1}`,
          idVerified: i % 3 !== 0,
          createdAt: days(-between(5, 300)),
        },
      }),
    ),
  );

  await prisma.subscription.createMany({
    data: [...sellers, ...dealerUsers].map((u) => ({
      userId: u.id,
      planId: freePlan.id,
      startsAt: u.createdAt,
      status: 'active',
    })),
  });

  // ————— ٦٠ إعلانًا على الأنواع والمدن والحالات —————
  const buildableTrims = allTrims.filter((t) => t.row.yearTo === null);

  type ListingRef = {
    id: string;
    ref: string;
    type: 'DIRECT' | 'NEGOTIATION' | 'AUCTION';
    askPrice: Prisma.Decimal;
    vehicleId: string;
    sellerId: string;
    city: string;
  };
  const listings: ListingRef[] = [];
  const vehicleIds: string[] = [];

  // ٣٠ مباشر · ٢٠ تفاوض · ١٠ مزاد
  const plan: ('DIRECT' | 'NEGOTIATION' | 'AUCTION')[] = [
    ...Array.from({ length: 30 }, () => 'DIRECT' as const),
    ...Array.from({ length: 20 }, () => 'NEGOTIATION' as const),
    ...Array.from({ length: 10 }, () => 'AUCTION' as const),
  ];

  const featureKeys = features.map((f) => f.key);

  for (let i = 0; i < plan.length; i += 1) {
    const type = plan[i] as 'DIRECT' | 'NEGOTIATION' | 'AUCTION';
    const t = pick(buildableTrims);
    const year = between(Math.max(t.row.yearFrom, 2018), 2026);
    const age = 2026 - year;
    const mileageKm = age === 0 ? between(500, 8000) : between(8000, 45000) * age;
    const city = pick(CITIES);

    // بائع تاجر في ثلث الإعلانات — البطاقات في Wa وWb تعرض شارة المعرض
    const asDealer = i % 3 === 0;
    const dealerIdx = i % dealers.length;
    const seller = asDealer
      ? (dealerUsers[dealerIdx] as (typeof dealerUsers)[number])
      : pick(sellers);
    const dealerId = asDealer ? (dealers[dealerIdx]?.id ?? null) : null;

    const base = 45_000 + (t.row.horsepower ?? 150) * 260;
    const askPrice = new D(
      String(
        Math.round(
          Math.max(28_000, base * (1 - age * 0.07) - mileageKm * 0.12) / 500,
        ) * 500,
      ),
    );

    const vehicle = await prisma.vehicle.create({
      data: {
        ownerId: seller.id,
        dealerId,
        brandId: t.brandId,
        modelId: t.modelId,
        trimId: t.id,
        brandName: t.brandNameAr,
        modelName: t.modelNameAr,
        trimName: t.row.nameAr,
        year,
        bodyType: t.row.bodyType,
        transmission: t.row.transmission,
        fuel: t.row.fuel,
        drivetrain: t.row.drivetrain,
        seats: t.row.seats,
        mileageKm,
        colorExterior: pick(COLORS),
        colorInterior: pick(['بيج', 'أسود']),
        paintStatus: age <= 1 ? 'ORIGINAL' : pick(['ORIGINAL', 'PARTIAL', 'UNKNOWN']),
        spec: pick(['SAUDI', 'SAUDI', 'GCC', 'AGENT_IMPORT']),
        condition: age === 0 ? 'NEW' : 'USED',
        city,
        entryMode: i % 4 === 0 ? 'MANUAL' : 'VIN_LOOKUP',
        vin: `SEED${String(i).padStart(4, '0')}${between(100000000, 999999999)}`,
        plateLetters: 'أ ب ح',
        plateNumbers: String(between(1000, 9999)),
        createdAt: days(-between(2, 120)),
      },
    });
    vehicleIds.push(vehicle.id);

    // حالات متنوّعة: منشور في الغالب، ومسودّة وقيد مراجعة وموقوف ومباع
    const status =
      i % 20 === 5
        ? 'DRAFT'
        : i % 20 === 9
          ? 'PENDING_REVIEW'
          : i % 20 === 13
            ? 'SOLD'
            : i % 20 === 17
              ? 'SUSPENDED'
              : 'PUBLISHED';

    const ref = `ADS2026A${String(i + 1).padStart(4, '0')}`;
    const listing = await prisma.listing.create({
      data: {
        ref,
        vehicleId: vehicle.id,
        sellerId: seller.id,
        type,
        status,
        askPrice,
        minAcceptPrice:
          type === 'NEGOTIATION'
            ? new D(String(Math.round(Number(askPrice) * 0.92)))
            : null,
        negotiable: type === 'NEGOTIATION',
        city,
        viewCount: between(12, 2400),
        publishedAt: status === 'DRAFT' ? null : days(-between(1, 90)),
        closedAt: status === 'SOLD' ? days(-between(1, 20)) : null,
        closeReason: status === 'SOLD' ? 'بيع' : null,
        reviewReason: status === 'PENDING_REVIEW' ? 'DUPLICATE_IMAGE' : null,
        featuredUntil: i % 12 === 0 ? days(between(1, 7)) : null,
      },
    });

    // الصور: أربع على الأقل (قرار ٣٣)، اللوحة مطموسة دائمًا (القاعدة ١٤)
    const imageCount = between(4, 10);
    await prisma.listingImage.createMany({
      data: Array.from({ length: imageCount }, (_, n) => ({
        listingId: listing.id,
        r2Key: `staging/listings/${ref}/${n + 1}.webp`,
        sort: n,
        isCover: n === 0,
        plateBlurred: true,
        phash: `${ref}-${n}`,
        qualityFlags: n === 3 && i % 9 === 0 ? ['BLURRY'] : [],
      })),
    });

    // لقطة المميّزات وقت النشر — لا قراءة حيّة من الفئة
    const extra = new Set<string>(ALWAYS);
    if (year >= 2020) extra.add(FROM_2020);
    for (let k = 0; k < between(2, 7); k += 1) extra.add(pick(featureKeys));
    await prisma.listingFeature.createMany({
      data: [...extra].map((featureKey) => ({ listingId: listing.id, featureKey })),
    });

    if (status === 'PUBLISHED' || status === 'SOLD') {
      listings.push({
        id: listing.id,
        ref,
        type,
        askPrice,
        vehicleId: vehicle.id,
        sellerId: seller.id,
        city,
      });
    }
  }

  // ————— تاريخ المركبة: ما تملكه المنصة فقط (قرار ١٥) —————
  await prisma.vehicleHistoryItem.createMany({
    data: vehicleIds.slice(0, 24).flatMap((vehicleId, i) => [
      {
        vehicleId,
        type: 'owner',
        titleAr: 'مالك واحد منذ الشراء',
        titleEn: 'One owner since purchase',
        detailAr: 'لم تُنقل الملكية داخل المنصة منذ الإضافة.',
        detailEn: 'Ownership has not changed inside the platform since it was added.',
        source: 'PLATFORM' as const,
        occurredAt: days(-between(200, 800)),
      },
      {
        vehicleId,
        type: 'service',
        titleAr: 'صيانة دورية في الوكالة',
        titleEn: 'Scheduled service at the dealership',
        detailAr: `آخر صيانة على ${between(10, 60) * 1000} كم.`,
        detailEn: `Last service at ${between(10, 60) * 1000} km.`,
        source: 'SELLER' as const,
        occurredAt: days(-between(30, 200) - i),
      },
    ]),
  });

  // ————— ٣ مزادات: جارٍ · قادم · منتهٍ —————
  const auctionListings = listings.filter((l) => l.type === 'AUCTION').slice(0, 3);
  const auctionSpecs = [
    { status: 'LIVE' as const, startsAt: hours(-6), endsAt: hours(4) },
    { status: 'SCHEDULED' as const, startsAt: days(2), endsAt: days(4) },
    { status: 'ENDED_MET' as const, startsAt: days(-6), endsAt: days(-3) },
  ];

  for (let i = 0; i < auctionListings.length; i += 1) {
    const l = auctionListings[i] as ListingRef;
    const spec = auctionSpecs[i] as (typeof auctionSpecs)[number];
    const start = new D(String(Math.round(Number(l.askPrice) * 0.75)));
    const increment = new D('500.00');

    const auction = await prisma.auction.create({
      data: {
        listingId: l.id,
        startPrice: start,
        reservePrice: new D(String(Math.round(Number(l.askPrice) * 0.9))),
        bidIncrement: increment,
        buyNowPrice: new D(String(Math.round(Number(l.askPrice) * 1.05))),
        depositAmount: new D('5000.00'),
        startsAt: spec.startsAt,
        endsAt: spec.endsAt,
        status: spec.status,
        extendedCount: spec.status === 'ENDED_MET' ? 2 : 0,
        viewingCity: l.city,
      },
    });

    if (spec.status !== 'SCHEDULED') {
      const bidderPool = buyers.slice(0, 6);
      let amount = Number(start);
      for (let n = 0; n < between(8, 18); n += 1) {
        amount += Number(increment) * between(1, 4);
        const bidder = bidderPool[n % bidderPool.length] as (typeof buyers)[number];
        await prisma.bid.create({
          data: {
            auctionId: auction.id,
            bidderId: bidder.id,
            amount: new D(String(amount)),
            isAuto: n % 5 === 0,
            createdAt: new Date(spec.startsAt.getTime() + n * 900_000),
          },
        });
      }
      await prisma.deposit.createMany({
        data: bidderPool.map((b) => ({
          auctionId: auction.id,
          userId: b.id,
          amount: new D('5000.00'),
          status: spec.status === 'ENDED_MET' ? ('RELEASED' as const) : ('HELD' as const),
          releasedAt: spec.status === 'ENDED_MET' ? spec.endsAt : null,
        })),
      });
    }
  }

  // ————— ١٢ طلبًا في مراحل مختلفة —————
  const STAGES = [
    'REQUEST',
    'APPROVED',
    'INSPECTION',
    'PAYMENT',
    'TRANSFER',
    'DONE',
  ] as const;

  const orderListings = listings.slice(0, 12);
  for (let i = 0; i < orderListings.length; i += 1) {
    const l = orderListings[i] as ListingRef;
    const stage = STAGES[i % STAGES.length] as (typeof STAGES)[number];
    const buyer = buyers[i % buyers.length] as (typeof buyers)[number];
    const agreed = new D(String(Math.round(Number(l.askPrice) * 0.97)));
    // رسمٌ حكوميّ يُمرَّر كما هو — صرفٌ نيابةً عن العميل، لا ضريبة لنا فيه
    const transferFee = new D('350.00');
    const total = agreed.plus(transferFee);
    /**
     * الضريبة على **توريداتنا وحدها**: العمولة (٠٪ الآن) والرسم الإداريّ
     * (معطَّل افتراضًا) — فصفرٌ هنا. وكانت ١٥/١١٥ من الإجمالي («قرار ١٧»
     * وقد نُسخ)، فتحتسب ضريبةً على قيمة المركبة والرسم الحكوميّ معًا.
     */
    const vat = new D('0.00');

    const order = await prisma.order.create({
      data: {
        ref: `ORD-2026-${String(1000 + i)}`,
        listingId: l.id,
        buyerId: buyer.id,
        sellerId: l.sellerId,
        source:
          l.type === 'AUCTION'
            ? 'AUCTION'
            : l.type === 'NEGOTIATION'
              ? 'OFFER'
              : 'DIRECT',
        stage,
        status: stage === 'DONE' ? 'COMPLETED' : 'ACTIVE',
        agreedPrice: agreed,
        commissionPct: new D('0.00'),
        commissionAmount: new D('0.00'),
        transferFee,
        vatAmount: vat,
        totalAmount: total,
        stageEnteredAt: days(-between(1, 14)),
        paymentDueAt: stage === 'PAYMENT' ? hours(between(2, 22)) : null,
        transferAppointmentAt: stage === 'TRANSFER' ? days(between(1, 5)) : null,
      },
    });

    await prisma.orderEvent.createMany({
      data: STAGES.slice(0, STAGES.indexOf(stage) + 1).map((s, n) => ({
        orderId: order.id,
        // نفس اسم `advanceStage` — واسمان لحدث واحد أسوأ من اسم غير مثالي
        type: 'stage.advanced',
        fromStage: n === 0 ? null : (STAGES[n - 1] ?? null),
        toStage: s,
        actorType: 'system',
        createdAt: days(-14 + n),
      })),
    });

    if (STAGES.indexOf(stage) >= STAGES.indexOf('PAYMENT')) {
      await prisma.escrow.create({
        data: {
          orderId: order.id,
          amount: total,
          status: stage === 'DONE' ? 'RELEASED' : 'HELD',
          heldAt: days(-between(2, 10)),
          releasedAt: stage === 'DONE' ? days(-1) : null,
        },
      });
      await prisma.invoice.create({
        data: {
          ref: `INV-2026-${String(2000 + i)}`,
          orderId: order.id,
          userId: buyer.id,
          type: 'SALE',
          subtotal: total.minus(vat),
          vatAmount: vat,
          total,
          issuedAt: days(-between(1, 9)),
        },
      });
    }
  }

  // ————— تقريرا فحص كاملان — ٢١٠ نقطة لكلٍّ منهما —————
  /**
   * النقاط أسماء حقيقية لا معرّفات مصطنعة: تقرير فحص يقرؤه مشترٍ
   * ليقرّر شراءً، و«الهيكل والصبغ-١٧» لا يقول له شيئًا. الأسماء في
   * `prisma/seed-data/inspection-points.json` ومجموعها ٢١٠ بالضبط.
   */
  const POINTS = load<Record<string, { name: string; points: string[] }>>('inspection-points.json');

  /** الملاحظات المحدَّدة — الفاحص لا يكتب على كل نقطة، بل على ما يستحق. */
  const FINDINGS: Record<string, { state: string; note: string; photos: string[] }> = {
    'سماكة طلاء المصد الخلفي': {
      state: 'PAINT',
      note: 'سماكة الطلاء ١٨٠ ميكرون مقابل ١١٥ للقطع المجاورة — صبغ إصلاحي لا استبدال.',
      photos: ['inspection/rear-bumper-1.jpg'],
    },
    'مساعد أمامي أيسر': {
      state: 'NOTE',
      note: 'بداية ترشيح زيت دون تأثير على الأداء. يُنصح بالمتابعة خلال ١٠٬٠٠٠ كم.',
      photos: ['inspection/front-left-strut.jpg'],
    },
    'عمق نقشة الإطار الأمامي الأيمن': {
      state: 'NOTE',
      note: 'عمق النقشة ٥٫٤ ملم مقابل ٦٫٢ لبقية الإطارات.',
      photos: ['inspection/front-right-tyre.jpg'],
    },
    'سماكة طلاء الرفرف الأمامي الأيمن': {
      state: 'PAINT',
      note: 'صبغ في الرفرف الأيمن — ٢٤٠ ميكرون.',
      photos: ['inspection/right-fender.jpg'],
    },
  };

  const SECTION_SCORES: Record<string, number> = {
    engine: 96,
    transmission: 94,
    brakes: 89,
    tyres: 91,
    body: 86,
    electric: 95,
  };

  const SECTION_NOTES: Record<string, string> = {
    engine: 'ضغط متساوٍ على الأسطوانات، لا تسريب زيت.',
    transmission: 'تعشيق سلس، لا اهتزاز عند التسارع.',
    brakes: 'الأقراص الأمامية ٧٢٪ من العمر، ومساعد أمامي أيسر بداية ترشيح.',
    tyres: 'الإطارات الأمامية بعمر سنتين، والخلفية بثلاث.',
    body: 'هيكل سليم بلا حوادث مسجّلة. صبغ على المصد الخلفي فقط.',
    electric: 'جميع الأنظمة تعمل، وشحن البطارية ضمن المدى.',
  };

  const inspectionServiceId = services.get('inspection') as string;

  for (let i = 0; i < 2; i += 1) {
    const l = listings[i] as ListingRef;
    const request = await prisma.serviceRequest.create({
      data: {
        ref: `SRV-2026-${String(3000 + i)}`,
        serviceId: inspectionServiceId,
        userId: l.sellerId,
        listingId: l.id,
        vehicleId: l.vehicleId,
        providerId: providers.get('INSPECTION') ?? null,
        status: 'DONE',
        amount: new D('450.00'),
        dueAt: days(-between(5, 20)),
        createdAt: days(-between(21, 40)),
      },
    });

    const sections = Object.entries(POINTS).map(([key, section]) => ({
      key,
      name: section.name,
      score: SECTION_SCORES[key] ?? 90,
      note: SECTION_NOTES[key] ?? null,
      points: section.points.map((label, n) => {
        const finding = i === 0 ? FINDINGS[label] : undefined;
        return {
          id: `${key}-${n + 1}`,
          label,
          state: finding?.state ?? 'OK',
          note: finding?.note ?? null,
          photos: finding?.photos ?? [],
        };
      }),
    }));

    await prisma.inspectionReport.create({
      data: {
        ref: `INS-2026-${String(41800 + i)}`,
        serviceRequestId: request.id,
        vehicleId: l.vehicleId,
        score: 92 - i * 5,
        inspectorName: i === 0 ? 'م. تركي الشمري' : 'م. بدر المطيري',
        inspectedAt: days(-between(5, 20)),
        sections,
        paintMap: {
          summary:
            'هيكل سليم بلا حوادث مسجّلة. صبغ على المصد الخلفي فقط بسماكة ١٨٠ ميكرون. لا آثار لحام أو استبدال في أي قطعة أساسية.',
          frontBumper: 'original',
          hood: 'original',
          roof: 'original',
          trunk: 'original',
          rearBumper: i === 0 ? 'repainted' : 'original',
          frontRightFender: i === 0 ? 'repainted' : 'original',
          frontLeftFender: 'original',
          rightFrontDoor: 'original',
          leftFrontDoor: 'original',
          rightRearDoor: 'original',
          leftRearDoor: 'original',
        },
      },
    });
  }

  // ————— مواضع الأسئلة الشائعة —————
  for (const f of load<FaqRow[]>('faqs.json')) {
    await prisma.faqItem.create({
      data: {
        questionAr: f.questionAr,
        questionEn: f.questionEn,
        answerAr: f.answerAr,
        answerEn: f.answerEn,
        category: f.category,
        sort: f.sort,
        placements: {
          create: f.placements.map((p, n) => ({
            surface: p.surface,
            listingType: p.listingType,
            condition: (p.condition ?? Prisma.DbNull) as Prisma.InputJsonValue,
            sort: n,
          })),
        },
      },
    });
  }

  // ————— القوالب والمساحات الإعلانية —————
  await prisma.notificationTemplate.createMany({
    data: load<TemplateRow[]>('notification-templates.json'),
  });
  // ————— بوابات الدفع وتوجيه الأغراض (A20) —————
  await prisma.paymentGateway.createMany({
    data: load<GatewayRow[]>('payment-gateways.json').map((g) => ({
      ...g,
      status: g.status as 'ACTIVE' | 'INACTIVE' | 'DEGRADED',
    })),
  });
  const routingAdmin = (await prisma.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } })).id;
  await prisma.paymentRoute.createMany({
    data: [
      // الضمان يحتاج ٣٠ يومًا — والمصرفية وحدها تبلغها
      { purpose: 'VEHICLE_ESCROW', gatewayKey: 'bank_escrow', environment: 'TEST', enabled: true, updatedBy: routingAdmin, updatedAt: NOW },
      { purpose: 'AUCTION_DEPOSIT', gatewayKey: 'bank_escrow', environment: 'TEST', enabled: true, updatedBy: routingAdmin, updatedAt: NOW },
      { purpose: 'TRANSFER_FEE', gatewayKey: 'bank_escrow', environment: 'TEST', enabled: true, updatedBy: routingAdmin, updatedAt: NOW },
      // تحصيل فوري بلا حجز
      { purpose: 'WALLET_TOPUP', gatewayKey: 'moyasar', environment: 'TEST', enabled: true, updatedBy: routingAdmin, updatedAt: NOW },
      { purpose: 'SERVICE_PURCHASE', gatewayKey: 'tap', environment: 'TEST', enabled: true, updatedBy: routingAdmin, updatedAt: NOW },
      // معطّل — كل الباقات مجانية
      { purpose: 'SUBSCRIPTION', gatewayKey: 'moyasar', environment: 'TEST', enabled: false, updatedBy: routingAdmin, updatedAt: NOW },
    ],
  });

  // ————— قواعد الضريبة (A21) — ثلاث منها تنتظر المذكرة —————
  await prisma.taxRule.createMany({
    data: load<TaxRuleRow[]>('tax-rules.json').map((rule) => ({
      sellerType: rule.sellerType as never,
      buyerType: rule.buyerType as never,
      supplyType: rule.supplyType as never,
      taxableBase: rule.taxableBase as never,
      ratePct: rule.ratePct === null ? null : new D(rule.ratePct),
      supplierIsPlatform: rule.supplierIsPlatform,
      invoiceIssuer: rule.invoiceIssuer as never,
      active: rule.active,
      note: rule.note,
      activeFrom: days(-365),
      updatedBy: routingAdmin,
      updatedAt: NOW,
    })),
  });

  await prisma.pushChannel.createMany({
    data: load<PushChannelRow[]>('push-channels.json'),
  });

  // ————— مفضّلات وبحوث محفوظة — بلاها لا تُقاس شريحة ولا تُختبر —————
  const buyerPool = await prisma.user.findMany({
    where: { dealerId: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const publishedListings = await prisma.listing.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true },
    orderBy: { ref: 'asc' },
  });

  for (const [index, buyer] of buyerPool.entries()) {
    // ثلثا المشترين لهم مفضّلة — والباقي بلاها ليبقى للشريحة معنًى
    if (index % 3 === 2 || publishedListings.length === 0) continue;
    const count = between(1, 3);
    for (let n = 0; n < count; n += 1) {
      const listing = publishedListings[(index * 3 + n) % publishedListings.length];
      if (listing === undefined) continue;
      await prisma.favorite.upsert({
        where: { userId_listingId: { userId: buyer.id, listingId: listing.id } },
        create: { userId: buyer.id, listingId: listing.id, createdAt: days(-between(1, 40)) },
        update: {},
      });
    }
  }

  // ————— شرائح وحملة — القواعد تُحوسَب وقت الإرسال لا الآن —————
  const superAdminId = (await prisma.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } })).id;
  const favouriteSegment = await prisma.segment.create({
    data: {
      key: 'has_favourites',
      nameAr: 'لديه مفضلة نشطة',
      rules: [{ field: 'hasFavorites' }],
      createdBy: superAdminId,
      createdAt: days(-20),
    },
  });
  await prisma.segment.create({
    data: {
      key: 'added_no_listing',
      nameAr: 'أضاف مركبة ولم يعلن',
      rules: [{ field: 'hasVehicle' }, { field: 'hasListing', negate: true }],
      createdBy: superAdminId,
      createdAt: days(-14),
    },
  });
  await prisma.campaign.create({
    data: {
      nameAr: 'عاد سعر سيارة في مفضلتك',
      channels: ['push'],
      segmentId: favouriteSegment.id,
      status: 'DRAFT',
      createdBy: superAdminId,
      createdAt: days(-6),
    },
  });

  // موافقة التسويق — تُطلب ولا تُفترض، فثلث المستخدمين وافقوا
  const consenting = await prisma.user.findMany({ select: { id: true } });
  await prisma.user.updateMany({
    where: { id: { in: consenting.filter((_, i) => i % 3 === 0).map((u) => u.id) } },
    data: { marketingConsent: true, marketingConsentAt: days(-30) },
  });
  await prisma.adSlot.createMany({
    data: load<AdSlotRow[]>('ad-slots.json').map((s) => ({
      ...s,
      basePrice: new D(s.basePrice),
    })),
  });

  // ————— جهات التمويل (قرار ١٤: عرض وحساب فقط) —————
  await prisma.financeProvider.createMany({
    data: (
      [
        ['الراجحي', 'Al Rajhi Bank'],
        ['البلاد', 'Bank Albilad'],
        ['الرياض', 'Riyad Bank'],
        ['الإنماء', 'Alinma Bank'],
        ['الجزيرة', 'Bank Aljazira'],
        ['الأهلي', 'SNB'],
        ['عبداللطيف جميل', 'Abdul Latif Jameel'],
        ['إمكان', 'Emkan Finance'],
      ] as const
    ).map(([nameAr, nameEn], i) => ({
      nameAr,
      nameEn,
      downPaymentPct: new D('20.00'),
      months: 60,
      profitRatePct: new D(String(4 + i * 0.25)),
      sort: i + 1,
    })),
  });

  // ————— التكاملات (A11) —————
  await prisma.integration.createMany({
    data: [
      ['otp_sms', 'رسائل التحقّق', 'Unifonic', 'INFRASTRUCTURE', 'ACTIVE', 'التحويل للاحتياطي خلال ٣٠ ثانية'],
      ['nafath', 'النفاذ الوطني', 'Nafath', 'IDENTITY', 'INACTIVE', 'المسار اليدوي دائمًا متاح'],
      ['payments', 'بوابة الدفع', 'Moyasar', 'PAYMENT', 'INACTIVE', 'رسالة واضحة وإعادة محاولة'],
      ['vin_lookup', 'بيانات المركبة', 'Tamm', 'GOVERNMENT', 'INACTIVE', 'فتح الإدخال اليدوي'],
      ['mojaz', 'تقارير موجز', 'Mojaz', 'GOVERNMENT', 'INACTIVE', 'ردّ المبلغ تلقائيًا'],
      ['r2', 'الوسائط', 'Cloudflare R2', 'INFRASTRUCTURE', 'ACTIVE', 'عرض من الذاكرة المؤقتة'],
      ['email', 'البريد المعاملاتي', 'Resend', 'INFRASTRUCTURE', 'INACTIVE', 'طابور إعادة إرسال'],
    ].map(([key, nameAr, provider, category, status, failureBehavior]) => ({
      key: key as string,
      nameAr: nameAr as string,
      provider: provider as string,
      category: category as 'IDENTITY' | 'PAYMENT' | 'GOVERNMENT' | 'INFRASTRUCTURE',
      status: status as 'ACTIVE' | 'INACTIVE' | 'DEGRADED',
      failureBehavior: failureBehavior as string,
      lastCheckAt: status === 'ACTIVE' ? hours(-1) : null,
      lastCheckOk: status === 'ACTIVE' ? true : null,
    })),
  });

  // ————— قوالب نصوص SEO (قرار ٢٦) —————
  await prisma.seoTemplate.createMany({
    data: [
      {
        key: 'search_results',
        surface: 'search',
        titleAr: 'سيارات {brand} {model} {condition} في {city}',
        titleEn: '{condition} {brand} {model} cars in {city}',
        introAr:
          '{count} سيارة {model} معروضة في {city} بأسعار من {priceMin} إلى {priceMax} ريال، جميعها موثّقة الملكية.',
        introEn:
          '{count} {model} cars listed in {city}, priced from {priceMin} to {priceMax} SAR, all with verified ownership.',
        outroAr:
          'متوسط سعر {model} المستعملة في {city} {median} ريال، ويتفاوت حسب سنة الصنع والممشى ودرجة الفحص.',
        outroEn:
          'The median price for a used {model} in {city} is {median} SAR, varying with year, mileage and inspection score.',
        variables: [
          'brand',
          'model',
          'city',
          'condition',
          'count',
          'priceMin',
          'priceMax',
          'median',
        ],
      },
    ],
  });

  // ————— إحصاءات السعر (RangeBar — المئينات ١٠/٢٥/٥٠/٧٥/٩٠) —————
  const statsByModel = new Map<string, number[]>();
  for (const l of listings) {
    const v = await prisma.vehicle.findUniqueOrThrow({
      where: { id: l.vehicleId },
      select: { modelId: true, year: true, mileageKm: true },
    });
    const key = `${v.modelId}|${v.year}|${Math.floor(v.mileageKm / 10_000) * 10}`;
    statsByModel.set(key, [...(statsByModel.get(key) ?? []), Number(l.askPrice)]);
  }

  const pct = (sorted: number[], p: number): string => {
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return String(sorted[idx] ?? 0);
  };

  for (const [key, prices] of statsByModel) {
    const [modelId, year, bucket] = key.split('|');
    const sorted = [...prices].sort((a, b) => a - b);
    await prisma.priceStat.create({
      data: {
        modelId: modelId as string,
        year: Number(year),
        mileageBucket: Number(bucket),
        p10: new D(pct(sorted, 10)),
        p25: new D(pct(sorted, 25)),
        p50: new D(pct(sorted, 50)),
        p75: new D(pct(sorted, 75)),
        p90: new D(pct(sorted, 90)),
        sampleSize: sorted.length,
        daysToSellMedian: between(12, 45),
        computedAt: NOW,
      },
    });
  }

  // ————— سجلّ التدقيق: كل إجراء أدمن يُكتب —————
  const superAdmin = admins[0] as (typeof admins)[number];
  await prisma.auditLog.create({
    data: {
      actorId: superAdmin.id,
      actorType: 'system',
      entity: 'Database',
      entityId: 'seed',
      action: 'seed.run',
      after: { appEnv: APP_ENV, at: NOW.toISOString() },
    },
  });

  /**
   * أنواع الهياكل — جدول **عرض** لا كيانات. المفاتيح من `BodyType`
   * نفسه، فلا مرجع جديد يمكن أن ينحرف عن التعداد. الصور الظلّية
   * يرفعها الأدمن في A12، والبطاقة تُعرض بالاسم وحده حتى ذلك الحين.
   */
  const BODY_TYPES = [
    { key: 'SEDAN', nameAr: 'سيدان', nameEn: 'Sedan', sort: 1 },
    { key: 'SUV', nameAr: 'دفع رباعي', nameEn: 'SUV', sort: 2 },
    { key: 'PICKUP', nameAr: 'بيك أب', nameEn: 'Pickup', sort: 3 },
    { key: 'HATCHBACK', nameAr: 'هاتشباك', nameEn: 'Hatchback', sort: 4 },
    { key: 'COUPE', nameAr: 'كوبيه', nameEn: 'Coupe', sort: 5 },
    { key: 'VAN', nameAr: 'فان', nameEn: 'Van', sort: 6 },
  ] as const;

  for (const body of BODY_TYPES) {
    await prisma.bodyTypeDisplay.upsert({
      where: { key: body.key },
      update: { nameAr: body.nameAr, nameEn: body.nameEn, sort: body.sort },
      create: { ...body },
    });
  }

  /**
   * المستندات القانونية — نسخة وتاريخ سريان لكل مستند. مستخدم قَبِل
   * شروط مارس محكومٌ بنصّها لا بنصّ اليوم، فالنسخة جزء من البيانات.
   */
  const LEGAL = load<Record<string, {
    titleAr: string; titleEn: string; version: string;
    summaryAr: string; summaryEn: string; sort: number; sections: unknown;
  }>>('legal.json');

  for (const [key, doc] of Object.entries(LEGAL)) {
    await prisma.legalDocument.upsert({
      where: { key },
      update: { ...doc, sections: doc.sections as never, effectiveAt: NOW },
      create: { key, ...doc, sections: doc.sections as never, effectiveAt: NOW },
    });
  }

  // ————— التقرير —————
  const counts = {
    ماركة: await prisma.brand.count(),
    'نوع هيكل': await prisma.bodyTypeDisplay.count(),
    'مستند قانوني': await prisma.legalDocument.count(),
    طراز: await prisma.model.count(),
    فئة: await prisma.trim.count(),
    ميزة: await prisma.feature.count(),
    'ربط ميزة بفئة': await prisma.trimFeature.count(),
    معرض: await prisma.dealer.count(),
    مستخدم: await prisma.user.count(),
    'حساب أدمن': await prisma.adminUser.count(),
    مركبة: await prisma.vehicle.count(),
    إعلان: await prisma.listing.count(),
    صورة: await prisma.listingImage.count(),
    مزاد: await prisma.auction.count(),
    مزايدة: await prisma.bid.count(),
    طلب: await prisma.order.count(),
    فاتورة: await prisma.invoice.count(),
    'تقرير فحص': await prisma.inspectionReport.count(),
    خدمة: await prisma.service.count(),
    'سؤال شائع': await prisma.faqItem.count(),
    'قالب إشعار': await prisma.notificationTemplate.count(),
    'قناة دفع': await prisma.pushChannel.count(),
    'بوابة دفع': await prisma.paymentGateway.count(),
    'قاعدة ضريبية': await prisma.taxRule.count(),
    مفضّلة: await prisma.favorite.count(),
    'مساحة إعلانية': await prisma.adSlot.count(),
    'جهة تمويل': await prisma.financeProvider.count(),
    تكامل: await prisma.integration.count(),
    'إحصاء سعر': await prisma.priceStat.count(),
  };

  console.log('');
  console.log(`  حسابات الأدمن — كلمة المرور: ${seedPassword}`);
  for (const [email, secret] of totpSecrets) {
    console.log(`    ${email.padEnd(22)} TOTP: ${secret}`);
  }
  console.log('');
  for (const [label, n] of Object.entries(counts)) {
    console.log(`  ${String(n).padStart(5)}  ${label}`);
  }
  console.log('');

  await prisma.$disconnect();
}

void main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
