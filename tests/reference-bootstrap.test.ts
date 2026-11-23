import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { plantReference } from '../prisma/reference';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();

/**
 * ═══ المُمهِّد — ما تحتاجه قاعدةُ إنتاجٍ جديدة لتعمل ═══
 *
 * البذرةُ ترفض الإنتاج عمدًا، والإقلاع كان يُشغّل الترحيلاتِ ومزامنةَ
 * الأدمن وحدهما. وقِيس على قاعدةٍ بكرٍ بعد ١٠٩ ترحيلات: **صفرُ ماركة
 * وصفرُ خدمة وصفرُ قاعدةِ ضريبةٍ وصفرُ بوّابةِ دفع** — عشرةُ قوالبِ
 * إشعارٍ وسبعُ قنواتٍ وقالبُ فحصٍ واحد وحدها. فالموقعُ يقلع ولا
 * يُستعمل: لا إعلانَ يُنشر، ولا ضريبةَ تُحتسب، ولا فاتورةَ تصدر.
 *
 * وهذه الاختبارات تحرس الوعدين معًا: **يزرع الناقص**، و**لا يكتب فوق
 * ما عدّله المشغّل** — ولا يُعيد ما حذفه.
 */
describe('المُمهِّد: ما يزرعه وما لا يمسّه', () => {
  it('على قاعدةٍ مكتملة لا يزرع شيئًا', async () => {
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
    const { planted } = await plantReference(db, { adminId: admin.id });
    expect(planted).toEqual({});
  });

  it('ويُعيد شجرة الكتالوج كما هي في القاعدة', async () => {
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
    const { trims } = await plantReference(db, { adminId: admin.id });

    const inDb = await db.trim.count();
    expect(trims).toHaveLength(inDb);
    expect(inDb).toBeGreaterThan(0);

    /** والمواصفةُ تصل كاملةً — البذرةُ تبني بها مركباتها. */
    const first = trims[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.row.nameAr.length).toBeGreaterThan(0);
    expect(first.brandNameAr.length).toBeGreaterThan(0);
    expect(first.modelNameAr.length).toBeGreaterThan(0);
    expect(typeof first.row.seats).toBe('number');
  });

  /**
   * **والقياسُ بالكسر**: لولا الشرط لمرّ هذا أخضرَ على أيّ شيفرة.
   * فالخدمةُ تُعدَّل إلى سعرٍ لا يوجد في أيّ ملفّ، ثمّ يُشغَّل
   * المُمهِّد، ثمّ يُقرأ الصفُّ — ومُمهِّدٌ بـ`upsert` يُسقطه.
   */
  it('ولا يكتب فوق سعرٍ عدّله المشغّل', async () => {
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
    const service = await db.service.findFirstOrThrow({ orderBy: { sort: 'asc' } });
    const before = { nameAr: service.nameAr, price: service.price, descAr: service.descAr };

    await db.service.update({
      where: { id: service.id },
      data: { price: '7777.77', nameAr: 'اسمٌ كتبه المشغّل', descAr: 'وصفٌ كتبه المشغّل' },
    });
    await plantReference(db, { adminId: admin.id });

    const after = await db.service.findUniqueOrThrow({ where: { id: service.id } });
    expect(Number(after.price)).toBe(7777.77);
    expect(after.nameAr).toBe('اسمٌ كتبه المشغّل');
    expect(after.descAr).toBe('وصفٌ كتبه المشغّل');

    /** **والاختبارُ يعيد ما غيّره** — صفٌّ مزروع يقرؤه كلُّ جار. */
    await db.service.update({ where: { id: service.id }, data: before });
  });

  it('ولا يكتب فوق رسم النقل ولا نسبة الضريبة', async () => {
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
    const before = await db.platformSetting.findUniqueOrThrow({ where: { id: 'default' } });

    await db.platformSetting.update({
      where: { id: 'default' },
      data: { transferFee: '611.00', vatPct: '12.00' },
    });
    await plantReference(db, { adminId: admin.id });

    const after = await db.platformSetting.findUniqueOrThrow({ where: { id: 'default' } });
    expect(Number(after.transferFee)).toBe(611);
    expect(Number(after.vatPct)).toBe(12);

    await db.platformSetting.update({
      where: { id: 'default' },
      data: { transferFee: before.transferFee, vatPct: before.vatPct },
    });
  });

  /**
   * ═══ وما حذفه المشغّل لا يعود ═══
   *
   * الماركةُ والطرازُ والفئةُ والميزةُ تُحذف من اللوحة (أربعُ دالّات
   * في `catalog.ts`). ومُمهِّدٌ يُدرج الصفَّ الغائب يُعيد ما حُذف في
   * أوّل إقلاعٍ بعده — **فيرتدّ الحذفُ بلا كلمة**. فالبوّابةُ على
   * المجموعة: «أفارغةٌ هي؟» لا «أموجودٌ هذا الصفّ؟».
   */
  it('وفئةٌ حذفها المشغّل لا تعود بإقلاعٍ جديد', async () => {
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });

    /** **ويُختار ما يأذن `deleteTrim` بحذفه** — فئةٌ بلا مركبة. */
    const trim = await db.trim.findFirstOrThrow({
      where: { vehicles: { none: {} } },
      orderBy: { id: 'asc' },
    });
    const saved = { ...trim };
    const links = await db.trimFeature.findMany({ where: { trimId: trim.id } });

    await db.trimFeature.deleteMany({ where: { trimId: trim.id } });
    await db.trim.delete({ where: { id: trim.id } });

    const { planted } = await plantReference(db, { adminId: admin.id });
    expect(await db.trim.findUnique({ where: { id: trim.id } })).toBeNull();
    expect(planted['فئة']).toBeUndefined();
    expect(planted['ماركة']).toBeUndefined();

    await db.trim.create({ data: saved });
    await db.trimFeature.createMany({ data: links });
  });

  /**
   * **والوجهُ الآخر للبوّابة**: ما لا يُحذف من اللوحة يُزرع إن غاب.
   * قالبُ إشعارٍ ناقص يعرض مفتاحَه الخام في جرس المستخدم — وقع
   * بقالبين، وهو سببُ وجود هذا المُمهِّد.
   */
  it('وقالبُ إشعارٍ غائب يُزرع', async () => {
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
    const template = await db.notificationTemplate.findFirstOrThrow({ orderBy: { key: 'asc' } });
    const saved = { ...template };

    await db.notificationTemplate.delete({ where: { key: template.key } });
    const { planted } = await plantReference(db, { adminId: admin.id });

    expect(planted['قالب إشعار']).toBe(1);
    const back = await db.notificationTemplate.findUniqueOrThrow({ where: { key: template.key } });
    expect(back.subjectAr).toBe(saved.subjectAr);
  });
});

/**
 * ═══ ولا نسخةَ ثانية من البيانات المرجعية ═══
 *
 * البذرةُ كانت تكتبها كلَّها بيدها، والمُمهِّد نسخةٌ ثانية — ونسختان
 * تتباعدان أوّل تغيير: صفٌّ يُضاف للبذرة فلا يصل نشرًا، أو العكس. فهي
 * تُستخرج ولا تُنسخ، والفحصُ يمنع عودة النسخة.
 */
describe('البذرةُ تقرأ المُمهِّد ولا تنسخه', () => {
  const REFERENCE_MODELS = [
    'brand',
    'model',
    'trim',
    'trimFeature',
    'feature',
    'bodyTypeDisplay',
    'taxRule',
    'paymentGateway',
    'paymentRoute',
    'notificationTemplate',
    'pushChannel',
    'adSlot',
    'faqItem',
    'legalDocument',
    'plan',
    'entitlement',
    'financeSetting',
    'platformSetting',
  ] as const;

  it('لا تُنشئ البذرةُ صفًّا مرجعيًّا بنفسها', () => {
    const seed = stripComments(readFileSync(join(ROOT, 'prisma/seed.ts'), 'utf8'));
    const offenders = REFERENCE_MODELS.filter((model) =>
      new RegExp(`prisma\\.${model}\\.(create|createMany|upsert)\\b`).test(seed),
    );
    expect(offenders).toEqual([]);
  });

  it('وتستورده بدل أن تعيد كتابته', () => {
    const seed = readFileSync(join(ROOT, 'prisma/seed.ts'), 'utf8');
    expect(seed).toContain("from './reference'");
    expect(seed).toContain('plantReference(prisma');
  });

  /** والإقلاعُ يُشغّله — وإلّا بقي النقصُ على كلّ نشرٍ جديد. */
  it('والإقلاعُ يُشغّله بعد مزامنة الأدمن', () => {
    const entry = readFileSync(join(ROOT, 'docker-entrypoint.sh'), 'utf8');
    const admin = entry.indexOf('prisma/admin-sync.ts');
    const plant = entry.indexOf('prisma/plant-reference.ts');
    const serve = entry.indexOf('exec node server.js');
    expect(admin).toBeGreaterThan(0);
    expect(plant).toBeGreaterThan(admin);
    expect(serve).toBeGreaterThan(plant);
  });

  /** وملفّاهُ في الصورة — و`COPY prisma` يحملهما، فيُفحص أنه قائم. */
  it('وملفّاه منسوخان إلى صورة التشغيل', () => {
    const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(/COPY[^\n]*\/app\/prisma \/opt\/seed\/prisma/);
  });
});
