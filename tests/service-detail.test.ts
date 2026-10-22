import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { SERVICE_RECENT, editService, serviceDetail } from '@/lib/domain/admin-services';
import { PROVIDER_TYPE_LABEL } from '@/lib/labels/providers';
import { SERVICE_CATEGORY } from '@/lib/labels/services';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();

/**
 * ═══ خدمةٌ واحدة — وثلاثةُ حقولٍ لا يبلغها أحد ═══
 *
 * `includesAr` يقرؤها المشتري قبل زرّ الدفع وتزرعها البذرة **ولا
 * شاشةَ تكتبها**، و`providerType` قاعدةُ طابور المدينة، و`adminFeeMode`
 * كان يُختار عند الإنشاء وحده.
 */
describe('صفحة تفاصيل الخدمة', () => {
  it('للصفحة ملف، والجدول يربط إليها', () => {
    expect(() => readFileSync(join(ROOT, 'src/app/admin/services/[key]/page.tsx'))).not.toThrow();
    const table = stripComments(
      readFileSync(join(ROOT, 'src/app/admin/services/ServicesTable.tsx'), 'utf8'),
    );
    expect(table).toContain('href={`/admin/services/${encodeURIComponent(service.key)}`}');
  });

  it('وتعيد ما تشمله الخدمة وصنف مؤديها', async () => {
    const service = await db.service.findFirstOrThrow({ where: { includesAr: { isEmpty: false } } });
    const detail = await serviceDetail(service.key);
    expect(detail).not.toBeNull();
    if (detail === null) return;

    expect(detail.includesAr).toEqual(service.includesAr);
    expect(detail.includesEn).toEqual(service.includesEn);
    expect(detail.providerType).toBe(service.providerType);
    expect(detail.adminFeeMode).toBe(service.adminFeeMode);
  });

  /**
   * ═══ والحقلُ الذي لا يبلغه أحد يُفتح بابُه ═══
   *
   * **والقياسُ على الكتابة لا على وجود الحقل**: نوعٌ يعرضه دون أن
   * يقبل تعديله هو الشاشة التي تصف قدرةً لم تُبنَ.
   */
  it('وتحرير ما تشمله الخدمة يصل القاعدة', async () => {
    const service = await db.service.findFirstOrThrow({ orderBy: { sort: 'asc' } });
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
    const before = {
      includesAr: service.includesAr,
      providerType: service.providerType,
      adminFeeMode: service.adminFeeMode,
    };

    try {
      const result = await editService(
        admin,
        service.key,
        {
          includesAr: ['بند اختبار أول', 'بند اختبار ثان'],
          providerType: 'DETAILING',
          adminFeeMode: 'PERCENT',
        },
        null,
      );
      expect(result.ok).toBe(true);

      const after = await serviceDetail(service.key);
      expect(after?.includesAr).toEqual(['بند اختبار أول', 'بند اختبار ثان']);
      expect(after?.providerType).toBe('DETAILING');
      expect(after?.adminFeeMode).toBe('PERCENT');

      /**
       * **والقيدُ يحمل ما تغيّر فعلًا** — كان يُكتب من قائمةٍ بيد، فحقلٌ
       * جديد يُعدَّل بلا أثرٍ في سجلّ التدقيق.
       */
      const log = await db.auditLog.findFirst({
        where: { entity: 'Service', entityId: service.key, action: 'service.edited' },
        orderBy: { createdAt: 'desc' },
      });
      expect(log).not.toBeNull();
      expect(Object.keys((log?.after ?? {}) as Record<string, unknown>)).toContain('includesAr');
      expect(Object.keys((log?.after ?? {}) as Record<string, unknown>)).toContain('providerType');
    } finally {
      /** **والاختبارُ يعيد ما غيّره** — وإلّا بقيت بنودُ اختبارٍ في شاشةِ مشترٍ. */
      await db.service.update({ where: { key: service.key }, data: before });
      await db.auditLog.deleteMany({
        where: { entity: 'Service', entityId: service.key, action: 'service.edited' },
      });
    }
  }, 30_000);

  /**
   * ═══ والمسارُ يقبل ما تُرسله الشاشة ═══
   *
   * `editService` تقبلها، **والشاشةُ لا تبلغها إلّا عبر المسار**:
   * مخطّطُ `zod` يُسقط أيّ حقلٍ لا يذكره بلا شكوى، فيُحفظ اللوح ويُقال
   * «حُفظ» ولا يتغيّر شيء — وهو **صمتٌ بعد نجاح**.
   */
  it('ومخطط المسار يذكر الحقول الثلاثة', () => {
    const route = stripComments(
      readFileSync(join(ROOT, 'src/app/api/v1/admin/services/[key]/route.ts'), 'utf8'),
    );
    for (const field of ['includesAr', 'includesEn', 'providerType', 'adminFeeMode', 'category']) {
      expect(route, field).toContain(`${field}:`);
    }
    /** **والقائمةُ تُشتقّ من التعداد** لا تُكتب بجواره (`nativeEnum`). */
    expect(route).toContain('z.nativeEnum(ProviderType)');
    expect(route).not.toMatch(/z\.enum\(\[\s*'INSPECTION'/);
  });

  /** **وما تُرسله الشاشة هو ما يذكره المخطّط** — فلا حقلَ يُسقَط صامتًا. */
  it('وما ترسله شاشة الخدمة كله مقبول في المسار', () => {
    const form = stripComments(
      readFileSync(join(ROOT, 'src/app/admin/services/[key]/ServiceSettings.tsx'), 'utf8'),
    );
    const body = /body:\s*JSON\.stringify\(\{([\s\S]*?)\}\)/.exec(form);
    expect(body, 'لا حمولة في الاستمارة').not.toBeNull();
    const sent = [...(body?.[1] ?? '').matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(sent.length).toBeGreaterThan(0);

    const route = stripComments(
      readFileSync(join(ROOT, 'src/app/api/v1/admin/services/[key]/route.ts'), 'utf8'),
    );
    const schema = /const Body = z\.object\(\{([\s\S]*?)^\}\);/m.exec(route);
    const accepted = [...(schema?.[1] ?? '').matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(sent.filter((field) => !accepted.includes(field))).toEqual([]);
  });

  /** **وكلُّ قيمةٍ معروضةٍ لها تسمية** — ومفتاحٌ خامّ لا يقول شيئًا. */
  it('ولكل صنف مؤد وكل مجموعة تسمية', async () => {
    const rows = await db.service.findMany({ select: { providerType: true, category: true } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(SERVICE_CATEGORY[row.category], row.category).toBeTruthy();
      if (row.providerType !== null) {
        expect(PROVIDER_TYPE_LABEL[row.providerType], row.providerType).toBeTruthy();
      }
    }
  });

  /**
   * ═══ والحدُّ يُختبَر بتجاوزه ═══
   *
   * أكثرُ الخدمات المزروعة دون `SERVICE_RECENT` طلبًا، فاختبارُ
   * الاقتطاع عليها أخضرُ مهما كان الحدّ — يصف البيانات لا الشيفرة.
   */
  it('والمعروض يقتطع عند الحد والعداد يقول الكل', async () => {
    const service = await db.service.findFirstOrThrow({ orderBy: { sort: 'asc' } });
    const user = await db.user.findFirstOrThrow();
    const planted: string[] = [];
    try {
      for (let i = 0; i < SERVICE_RECENT + 2; i += 1) {
        const row = await db.serviceRequest.create({
          data: {
            ref: `SRVTEST-${String(Date.now())}-${String(i)}`,
            serviceId: service.id,
            userId: user.id,
            amount: 10,
            status: 'NEW',
          },
          select: { id: true },
        });
        planted.push(row.id);
      }

      const detail = await serviceDetail(service.key);
      expect(detail).not.toBeNull();
      if (detail === null) return;
      expect(detail.recent.length).toBe(SERVICE_RECENT);
      expect(detail.totalRequests).toBeGreaterThan(SERVICE_RECENT);
      expect(detail.totalRequests).not.toBe(detail.recent.length);
    } finally {
      await db.serviceRequest.deleteMany({ where: { id: { in: planted } } });
    }
  }, 60_000);

  it('ومفتاح لا وجود له يعيد null', async () => {
    expect(await serviceDetail('no-such-service')).toBeNull();
  });
});
