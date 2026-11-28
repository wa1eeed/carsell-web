import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  quoteFor,
  saveTemplateField,
  removeTemplateField,
  serviceTemplate,
  validateField,
  type ServiceTemplateView,
} from '@/lib/domain/service-template';

/**
 * ═══ قالبُ الخدمة ═══
 *
 * طلبُ المالك ٢٠٢٦-١١-٢٨: قالبٌ لكل خدمة يُحرَّر بلا نشر، وحقولُ
 * سعرٍ **تحسب السعر قبل الدفع**. وكان الفحصُ وحده قابلًا للتحرير.
 */

const view = (fields: ServiceTemplateView['fields']): ServiceTemplateView => ({
  serviceId: 's',
  serviceKey: 'probe',
  nameAr: 'خدمة',
  basePrice: '900.00',
  version: 3,
  fields,
});

const field = (over: Partial<ServiceTemplateView['fields'][number]>) => ({
  id: 'f',
  key: 'k',
  labelAr: 'حقل',
  hintAr: null,
  kind: 'TEXT' as const,
  purpose: 'REQUEST' as const,
  required: false,
  sort: 0,
  maxLength: null,
  priceDelta: null,
  options: [],
  ...over,
});

describe('quoteFor', () => {
  it('يجمع على الأساس: خيارا وتأشيرا وعددا', () => {
    const quote = quoteFor(
      view([
        field({
          key: 'size',
          kind: 'SELECT',
          options: [
            { value: 'small', labelAr: 'صغيرة', priceDelta: null },
            { value: 'large', labelAr: 'كبيرة', priceDelta: '150.00' },
          ],
        }),
        field({ key: 'urgent', kind: 'CHECKBOX', priceDelta: '80.00' }),
        /** **والرقمُ لكلّ وحدة** — فمئةُ كيلو ليست كعشرة. */
        field({ key: 'km', kind: 'NUMBER', priceDelta: '2.50' }),
      ]),
      { size: 'large', urgent: 'true', km: '40' },
    );

    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.base).toBe('900.00');
    expect(quote.extra).toBe('330.00');
    expect(quote.total).toBe('1230.00');
    /** **والتفصيلُ يُحفظ ليُقرأ** — فمن دفع يعرف من أين جاءت الزيادة. */
    expect(quote.lines.map((line) => line.delta)).toEqual(['150.00', '80.00', '100.00']);
  });

  it('ولا يحسب حقل المزود — فالسعر دفع قبله', () => {
    const quote = quoteFor(
      view([field({ key: 'policy', purpose: 'ACTION', kind: 'MONEY', priceDelta: '500.00' })]),
      { policy: '500' },
    );
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.total).toBe('900.00');
    expect(quote.lines).toHaveLength(0);
  });

  it('ويسمي الحقل الناقص بدل «تعذر»', () => {
    const quote = quoteFor(
      view([
        field({ key: 'plate', required: true }),
        field({ key: 'size', kind: 'SELECT', options: [{ value: 'a', labelAr: 'أ', priceDelta: null }] }),
      ]),
      { size: 'zzz' },
    );
    expect(quote.ok).toBe(false);
    if (quote.ok) return;
    expect(quote.fields['plate']).toBe('REQUIRED');
    expect(quote.fields['size']).toBe('UNKNOWN_OPTION');
  });

  /** **والتأشيرُ المطلوبُ غيرُ المتروك** — «لا» جوابٌ لا نقص. */
  it('والمربع غير المؤشر ليس نقصا', () => {
    const quote = quoteFor(
      view([field({ key: 'urgent', kind: 'CHECKBOX', required: true, priceDelta: '80.00' })]),
      {},
    );
    expect(quote.ok).toBe(true);
  });
});

describe('validateField', () => {
  const base = {
    key: 'distance',
    labelAr: 'المسافة',
    hintAr: null,
    kind: 'NUMBER' as const,
    purpose: 'REQUEST' as const,
    required: false,
    maxLength: null,
    priceDelta: '2.50',
    options: [],
  };

  it('يرفض مفتاحا غير لاتيني أو بمسافة', () => {
    expect(validateField({ ...base, key: 'مسافة' })).toBe('KEY_INVALID');
    expect(validateField({ ...base, key: 'my key' })).toBe('KEY_INVALID');
    expect(validateField(base)).toBeNull();
  });

  /** **ولا يُسعَّر حقلُ إجراء** — شرطٌ في الخادم لا تلميحٌ في الشاشة. */
  it('ويرفض زيادة على حقل يملؤه المزود', () => {
    expect(validateField({ ...base, purpose: 'ACTION' })).toBe('PRICED_ACTION');
    expect(validateField({ ...base, purpose: 'ACTION', priceDelta: null })).toBeNull();
  });

  it('ويرفض اختيارا بلا خيارات، وزيادة سالبة', () => {
    expect(validateField({ ...base, kind: 'SELECT', priceDelta: null })).toBe('OPTIONS_REQUIRED');
    expect(validateField({ ...base, priceDelta: '-5' })).toBe('DELTA_INVALID');
  });
});

describe('saveTemplateField — على خدمة حقيقية', () => {
  const admin = { adminId: 'tpl-test' };
  let serviceKey: string | null = null;

  afterAll(async () => {
    if (serviceKey !== null) {
      const service = await db.service.findUnique({
        where: { key: serviceKey },
        select: { template: { select: { id: true } } },
      });
      if (service?.template != null) {
        await db.serviceTemplate.delete({ where: { id: service.template.id } });
      }
    }
    await db.auditLog.deleteMany({ where: { actorId: admin.adminId } });
  });

  it('يحفظ ويقرأ ويحذف — ويرفع الإصدار في كل مرة', async () => {
    const service = await db.service.findFirstOrThrow({
      where: { template: null },
      select: { key: true },
    });
    serviceKey = service.key;

    const saved = await saveTemplateField(admin, service.key, {
      key: 'distance_km',
      labelAr: 'المسافة بالكيلو',
      hintAr: 'من مدينة السيارة إلى وجهتك',
      kind: 'NUMBER',
      purpose: 'REQUEST',
      required: true,
      maxLength: null,
      priceDelta: '2.00',
      options: [],
    });
    expect(saved.ok).toBe(true);

    const template = await serviceTemplate(service.key);
    expect(template?.fields).toHaveLength(1);
    expect(template?.version).toBe(2);

    /** **والسعرُ يُحسب من القالب المقروء** — لا من رقمٍ يُرسَل. */
    if (template !== null) {
      const quote = quoteFor(template, { distance_km: '10' });
      expect(quote.ok).toBe(true);
      if (quote.ok) {
        expect(quote.extra).toBe('20.00');
      }
    }

    expect(await removeTemplateField(admin, service.key, 'distance_km')).toBe(true);
    const after = await serviceTemplate(service.key);
    expect(after?.fields).toHaveLength(0);
    /** **والحذفُ تغييرٌ كالإضافة** — فيرفع الإصدار. */
    expect(after?.version).toBe(3);
  });
});

/**
 * ═══ والرحلةُ تُمشى إلى آخرها ═══
 *
 * القالبُ يُحرَّر والسعرُ يُحسب — **والسؤالُ أيصل الطلبَ**. فقِيس
 * بإنشاء طلبٍ حقيقيّ بإجاباته: مبلغُه ولقطتُه وسطورُه.
 */
describe('requestService — السعر من القالب', () => {
  const made: { requests: string[]; templates: string[] } = { requests: [], templates: [] };

  afterAll(async () => {
    if (made.requests.length > 0) {
      await db.serviceRequestAnswer.deleteMany({ where: { requestId: { in: made.requests } } });
      await db.serviceRequest.deleteMany({ where: { id: { in: made.requests } } });
    }
    if (made.templates.length > 0) {
      await db.serviceTemplate.deleteMany({ where: { id: { in: made.templates } } });
    }
    await db.auditLog.deleteMany({ where: { actorId: 'tpl-journey' } });
  });

  it('يضيف الزيادة على المبلغ، ويحفظ تفصيلها مع الطلب', async () => {
    /** **ومركبةٌ لصاحبها** — فلا إذنَ بائعٍ ينتظر، والقياسُ على السعر. */
    const vehicle = await db.vehicle.findFirstOrThrow({
      where: { listings: { none: {} } },
      select: { id: true, ownerId: true },
    });
    const service = await db.service.findFirstOrThrow({
      where: { key: 'shipping' },
      select: { id: true, key: true, price: true, template: { select: { id: true } } },
    });

    const saved = await saveTemplateField({ adminId: 'tpl-journey' }, service.key, {
      key: 'probe_km',
      labelAr: 'مسافة القياس',
      hintAr: null,
      kind: 'NUMBER',
      purpose: 'REQUEST',
      required: true,
      maxLength: null,
      priceDelta: '3.00',
      options: [],
    });
    expect(saved.ok).toBe(true);
    const fresh = await db.service.findUniqueOrThrow({
      where: { id: service.id },
      select: { template: { select: { id: true } } },
    });
    if (service.template === null && fresh.template !== null) {
      made.templates.push(fresh.template.id);
    }

    const { requestService } = await import('@/lib/domain/service-lifecycle');
    const result = await requestService({
      serviceKey: service.key,
      requesterId: vehicle.ownerId,
      vehicleId: vehicle.id,
      scheduledAt: null,
      answers: { probe_km: '20' },
    });

    expect(result.ok, 'ok' in result ? '' : JSON.stringify(result)).toBe(true);
    if (!result.ok) return;

    const row = await db.serviceRequest.findUniqueOrThrow({
      where: { ref: result.ref },
      select: {
        id: true,
        amount: true,
        quoteBase: true,
        quoteExtra: true,
        templateVersion: true,
        answers: { select: { key: true, labelAr: true, value: true, priceDelta: true } },
      },
    });
    made.requests.push(row.id);

    /** الأساسُ ٩٠٠ وعشرون كيلو بثلاثة = ٦٠ زيادة. */
    expect(row.quoteBase?.toFixed(2)).toBe(Number(service.price).toFixed(2));
    expect(row.quoteExtra?.toFixed(2)).toBe('60.00');
    /** **والمبلغُ يشمل الزيادة** — وإلّا حُسبت في الشاشة ولم تُحصَّل. */
    expect(Number(row.amount)).toBeGreaterThan(Number(service.price));
    expect(row.templateVersion).not.toBeNull();

    /** **واللقطةُ مع الجواب** — التسميةُ والزيادةُ كما كانتا يوم أُجيب. */
    const answer = row.answers.find((entry) => entry.key === 'probe_km');
    expect(answer?.labelAr).toBe('مسافة القياس');
    expect(answer?.priceDelta.toFixed(2)).toBe('60.00');

    /** **وجوابٌ ناقصٌ يُردّ بحقله** — لا بـ«تعذّر». */
    const missing = await requestService({
      serviceKey: service.key,
      requesterId: vehicle.ownerId,
      vehicleId: vehicle.id,
      scheduledAt: null,
      answers: {},
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok && missing.reason === 'ANSWERS_INVALID') {
      expect(missing.fields['probe_km']).toBe('REQUIRED');
    } else {
      expect.fail('كان يجب أن يُردّ بسبب الحقل الناقص');
    }

    await removeTemplateField({ adminId: 'tpl-journey' }, service.key, 'probe_km');
  });
});
