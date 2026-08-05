/**
 * ═══ الوضع التجريبيّ — يُشغَّل بيدٍ ولا يقع ضمنًا ═══
 *
 * يوجّه أغراض الدفع كلها إلى البوابة التجريبية فتكتمل رحلة الشراء بلا
 * مفاتيح مزوّد. **ولا يفعل ذلك الزرعُ تلقائيًّا**: توجيهٌ إلى بوابةٍ
 * وهمية يقع من نفسه هو الشكل الذي يصل به إلى الإنتاج.
 *
 * ويرفض في الإنتاج رفضًا صريحًا — لا صامتًا. ومن يشغّله هناك يجب أن
 * يقرأ لماذا لم يقع، لا أن يظنّه وقع.
 *
 *   node scripts/trial-mode.mjs on    ← إلى التجريبية
 *   node scripts/trial-mode.mjs off   ← إلى التوجيه المزروع
 */
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { PaymentPurpose } from '../src/generated/prisma/enums';

const SANDBOX = 'sandbox';

/** التوجيه المزروع — إليه تعود `off`. */
const SEEDED: Record<string, string> = {
  VEHICLE_ESCROW: 'bank_escrow',
  AUCTION_DEPOSIT: 'bank_escrow',
  TRANSFER_FEE: 'bank_escrow',
  WALLET_TOPUP: 'moyasar',
  SERVICE_PURCHASE: 'tap',
  SUBSCRIPTION: 'moyasar',
};

const mode = process.argv[2] ?? 'on';

/**
 * ═══ والحدّ `APP_ENV` لا `NODE_ENV` ═══
 *
 * الثاني يساوي `production` في staging أيضًا — **وهي البيئة التي بُني
 * لها هذا الأمر**. فالحراسة به تُغلق الوضع التجريبيّ على بيئة التجريب
 * نفسها، ويبقى خادمُ العرض عاجزًا عن بيع سيارة واحدة.
 *
 * (القاعدة مسجَّلة، وهذا الملفّ كان يخالفها — وظهرت المخالفة أوّل ما
 * احتيج إلى تشغيله داخل الحاوية.)
 */
if (process.env.APP_ENV === 'production') {
  console.error(
    '\n✗ الوضع التجريبيّ لا يُشغَّل في الإنتاج.\n' +
      '  بوابةٌ وهمية على مالٍ حقيقيّ تقول للمشتري إن بطاقته سُحبت ولم يُسحب شيء.\n',
  );
  process.exit(1);
}

if (mode !== 'on' && mode !== 'off') {
  console.error('\n✗ الوسيط: on أو off.\n');
  process.exit(1);
}

/**
 * `.env` يُقرأ هنا — لا مكتبة dotenv في المستودع، و`npm run trial:on`
 * يجب أن يعمل بلا `set -a` قبله وإلّا صار سطرًا يُنسى ويُبلَّغ عنه عطلًا.
 */
/**
 * **وغيابه ليس عطلًا.** داخل الحاوية لا ملفّ `.env` أصلًا: المتغيّرات
 * تصل من المُنسِّق. فسقوطُ الأمر بـ`ENOENT` هنا يوقفه في البيئة
 * الوحيدة التي يُحتاج فيها.
 */
let envFile = '';
try {
  envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
} catch {
  envFile = '';
}

for (const line of envFile.split('\n')) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (match === null) continue;
  const [, key, raw = ''] = match;
  if (key !== undefined && process.env[key] === undefined) {
    process.env[key] = raw.replace(/^["']|["']$/g, '');
  }
}

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  console.error('✗ DATABASE_URL غير مضبوط — راجع .env.example');
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: ['error'],
});

async function main(): Promise<void> {


  if (mode === 'on') {
    const gateway = await db.paymentGateway.findUnique({ where: { key: SANDBOX } });
    if (gateway === null) {
      /* الزرع قد يسبق إضافة الصفّ — فيُنشأ هنا بدل أن يسقط الأمر */
      await db.paymentGateway.create({
        data: {
          key: SANDBOX,
          nameAr: 'بوابة تجريبية (تطوير)',
          nameEn: 'Sandbox gateway (development)',
          status: 'ACTIVE',
          sort: 0,
          capabilities: {
            supportsHold: true,
            supportsPartialSettle: true,
            supportsRefund: true,
            maxHoldDays: 30,
            settlementDelayHours: 0,
            feePct: 0,
            feeFixed: 0,
          },
        },
      });
      console.log('  + أُنشئت البوابة التجريبية');
    }
  }

  const admin = await db.adminUser.findFirst({ where: { role: 'SUPER_ADMIN' } });

  for (const [purpose, seeded] of Object.entries(SEEDED)) {
    const to = mode === 'on' ? SANDBOX : seeded;
    await db.paymentRoute.updateMany({
      where: { purpose: purpose as PaymentPurpose },
      data: {
        gatewayKey: to,
        environment: 'TEST',
        ...(admin === null ? {} : { updatedBy: admin.id }),
        updatedAt: new Date(),
      },
    });
    console.log(`  ${purpose.padEnd(18)} → ${to}`);
  }

  /**
   * الطلبات القائمة تبقى على بوابتها — **الحجز يُفرَج من حيث أُنشئ**.
   * والتبديل يغيّر وجهة الجديد وحده، فلا يُلمس صفّ `Payment` هنا.
   */
  const inFlight = await db.payment.count({
    where: { status: { in: ['PENDING', 'HELD', 'REQUIRES_ACTION'] } },
  });
  if (inFlight > 0) {
    console.log(`\n  ⓘ ${inFlight} معاملة جارية تبقى على بوابتها — لا تُنقل.`);
  }

  console.log(
    mode === 'on'
      ? '\n✓ الوضع التجريبيّ يعمل. اشترِ بطريقة «mada» لينجح الحجز،\n' +
          '  و«test_declined» لتُرفض البطاقة، و«test_3ds» لتحدّي التحقّق.\n'
      : '\n✓ عاد التوجيه المزروع.\n',
  );
  await db.$disconnect();
}

void main();
