import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { plantReference } from './reference';

/**
 * ═══ مُمهِّدُ قاعدةٍ جديدة — يُشغَّل في كلّ إقلاع ═══
 *
 * وبخلاف البذرة **يعمل على الإنتاج**: لا سيارةَ وهمية فيه ولا مستخدم،
 * إنّما ما لا تعمل المنصّة بدونه — ماركاتٌ وخدماتٌ وقواعدُ ضريبةٍ
 * وبوّاباتُ دفعٍ وقوالبُ إشعار.
 *
 * **ويُدرج ولا يُحدِّث**، فتشغيلُه مرّتين لا يمسّ ما عدّله المشغّل من
 * اللوحة. وما يُضاف إلى ملفّات `seed-data` بعد أوّل إقلاع يصل بترحيل
 * لا به — فهو لا يُنشئ إلّا ما غاب كلُّه.
 */
/** و`.env` للتشغيل المحلّي — وفي الحاوية المتغيّراتُ من البيئة نفسها. */
try {
  process.loadEnvFile();
} catch {
  // لا ملفّ — والمتغيّرات مضبوطة
}

async function main(): Promise<void> {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    /**
     * المحرِّرُ لقواعد الضريبة ومسارات الدفع — عمودان إلزاميّان.
     * و`admin-sync` يسبقه في الإقلاع، فالحسابُ موجودٌ حين يصل هذا.
     */
    const admin = await db.adminUser.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    });

    const result = await plantReference(db, { adminId: admin?.id ?? null });
    const rows = Object.entries(result.planted);

    if (rows.length === 0) {
      console.log('✓ البيانات المرجعية كاملة — لم يُزرع شيء');
    } else {
      console.log('✓ زُرعت البيانات المرجعية الناقصة:');
      for (const [name, count] of rows) console.log(`   ${String(count).padStart(5)}  ${name}`);
    }

    /**
     * **والنقصُ المتبقّي يُقال** — قاعدةٌ بلا أدمن تمضي بلا ضريبةٍ ولا
     * مسارات، وصمتُها يجعل أوّلَ فاتورةٍ تُحجب بلا سبب ظاهر.
     */
    if (admin === null) {
      console.warn(
        '⚠ لا حساب أدمن بعد — فقواعد الضريبة ومسارات الدفع لم تُزرع.\n' +
          '  اضبط ADMIN_EMAIL و ADMIN_PASSWORD وأعد الإقلاع.',
      );
    }
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('✗ تعذّر زرع البيانات المرجعية:', error);
  process.exit(1);
});
