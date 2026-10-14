import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkShares, halalas } from '@/lib/payments/provider-platform';
import {
  createMoyasarPlatformAdapter,
  toMoyasarSplits,
} from '@/lib/payments/adapters/moyasar-platform';
import { secretFieldsFor, INTEGRATION_SECRET_FIELDS } from '@/lib/domain/integration-fields';

/**
 * ═══ بوّابة المزوّدين ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٤): بوّابتان لا واحدة. وهذه **منصّةٌ متعدّدة
 * التجّار**: يصل المال إلى المزوّد من البوّابة المرخَّصة مباشرةً، وحصّتُنا
 * تُقتطع توزيعًا في الدفعة نفسها — فلا نحوز مالَ غيرنا.
 *
 * **ومفتاح المنصّة لم يصل بعد**، فلا شيء هنا يلمس الخدمة: خادمٌ وهميّ
 * يطبّق شكل ردودها، فتُقاس الترجمةُ والفحوص بلا اتصال.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** خادمٌ وهميّ — يُعيد ما تُعيده الخدمة شكلًا، ويسجّل ما أُرسل إليه. */
function stubFetch(
  routes: Record<string, { status: number; body: unknown }>,
): { calls: { url: string; init: RequestInit | undefined }[] } {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const path = url.replace('https://apimig.moyasar.com/v1', '');
    const match = routes[path];
    return Promise.resolve({
      ok: match !== undefined && match.status < 400,
      status: match?.status ?? 404,
      json: () => Promise.resolve(match?.body ?? { message: 'not found' }),
    } as Response);
  });
  return { calls };
}

describe('المصادقة', () => {
  /**
   * **المفتاح اسمَ مستخدم والكلمة فارغة** — بنصّ وثيقة المزوّد. وهو شكلٌ
   * غير مألوف يُغري بقلب الحقلين، فيردّ ٤٠١ بلا ما يقول إنهما مقلوبان.
   */
  it('المفتاح اسمُ المستخدم والكلمةُ فارغة', async () => {
    const { calls } = stubFetch({ '/platform': { status: 200, body: { id: 'pf-1' } } });
    await createMoyasarPlatformAdapter('key-abc').platformPayoutRef();

    const header = (calls[0]?.init?.headers as Record<string, string> | undefined)?.authorization;
    expect(header).toBeDefined();
    expect(header?.startsWith('Basic ')).toBe(true);
    expect(Buffer.from((header ?? '').slice(6), 'base64').toString()).toBe('key-abc:');
  });
});

describe('حساب المزوّد', () => {
  /**
   * **والمعرّفان مفصولان**: `id` يُدار به الحساب و`entity_id` يُوجَّه إليه
   * التوزيع. وأخذُ الأوّل للتوزيع يُرسل المال إلى عدم، والمزوّد يقبله
   * شكلًا لأن كليهما UUID.
   */
  it('يفصل معرّف الإدارة عن معرّف التحويل', async () => {
    stubFetch({
      '/merchants/m-1': {
        status: 200,
        body: {
          id: 'm-1',
          entity_id: 'e-9',
          status: 'missing_docs',
          documents_complete: false,
          reasons: ['السجل التجاري مطلوب'],
          signature: { status: 'unsigned', url: 'https://sign.example/x' },
        },
      },
    });

    const result = await createMoyasarPlatformAdapter('k').accountState('m-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.accountRef).toBe('m-1');
    expect(result.value.payoutRef).toBe('e-9');
    expect(result.value.status).toBe('MISSING_DOCS');
    /** **وما ينقص يُعرض كما قاله** — لا ترجمةً نخترعها. */
    expect(result.value.note).toBe('السجل التجاري مطلوب');
    expect(result.value.signatureUrl).toBe('https://sign.example/x');
    expect(result.value.documentsComplete).toBe(false);
  });

  it('وحالٌ لا يعرفها لا تُقرأ «مفعَّلًا»', async () => {
    stubFetch({ '/merchants/m-2': { status: 200, body: { id: 'm-2', status: 'something_new' } } });
    const result = await createMoyasarPlatformAdapter('k').accountState('m-2');
    expect(result.ok && result.value.status).toBe('PENDING');
  });

  it('و٤٠١ تُقرأ «مفاتيح خاطئة» لا «عطل مزوّد»', async () => {
    stubFetch({ '/platform': { status: 401, body: { message: 'Invalid authorization credentials' } } });
    const result = await createMoyasarPlatformAdapter('bad').platformPayoutRef();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('UNAUTHORIZED');
  });

  /** وشبكةٌ لا تردّ حالٌ متوقَّعة تُعرض سطرًا، لا خطأً يُرمى. */
  it('وانقطاع الشبكة لا يرمي', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const result = await createMoyasarPlatformAdapter('k').balance();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('UPSTREAM');
  });
});

describe('الرصيد', () => {
  /** يردّه المزوّد بأصغر وحدة — والعرض بالريال، فالقسمة في المُهايئ. */
  it('يُحوَّل من القروش إلى الريالات', async () => {
    stubFetch({
      '/balance': {
        status: 200,
        body: { currency: 'SAR', total: 125_050, available: 100_000, transferred: 25_050 },
      },
    });
    const result = await createMoyasarPlatformAdapter('k').balance();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.total).toBe('1250.50');
    expect(result.value.available).toBe('1000.00');
    expect(result.value.transferred).toBe('250.50');
  });
});

describe('فحصُ الحصص قبل إرسالها', () => {
  /**
   * **دفعةٌ تُرفض لخللٍ في حصصها تُرفض بعد أن أدخل العميل بطاقته** —
   * فيُقرأ خللُنا عطلًا في بطاقته. والفحص عندنا أوّلًا.
   */
  it('المجموع يساوي الدفعة', () => {
    expect(
      checkShares('632.50', [
        { payoutRef: 'e-1', amount: '575.00' },
        { payoutRef: 'pf', amount: '57.50', bearsGatewayFee: true },
      ]).ok,
    ).toBe(true);

    const short = checkShares('632.50', [{ payoutRef: 'e-1', amount: '575.00' }]);
    expect(short.ok).toBe(false);
    if (short.ok) return;
    expect(short.message).toBe('SUM_MISMATCH');
  });

  /**
   * **وحاملُ الرسم واحدٌ على الأكثر.** وبلا تحديدٍ تختار البوّابة أكبر
   * حصّةِ تاجر — فيدفع المزوّد رسمًا لم يتّفق عليه.
   */
  it('ولا حاملان للرسم', () => {
    const result = checkShares('100.00', [
      { payoutRef: 'a', amount: '50.00', bearsGatewayFee: true },
      { payoutRef: 'b', amount: '50.00', bearsGatewayFee: true },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe('MANY_FEE_BEARERS');
  });

  /**
   * **والجمع بالقروش لا بالعشريّ.** `0.1 + 0.2` ليست `0.3` في العائم،
   * فمجموعٌ محسوبٌ عشريًّا يخالف الدفعة بقرش — وقرشٌ يمنع صفقة.
   */
  it('والكسور تجتمع بلا فرق', () => {
    expect(
      checkShares('0.30', [
        { payoutRef: 'a', amount: '0.10' },
        { payoutRef: 'b', amount: '0.20' },
      ]).ok,
    ).toBe(true);
    expect(halalas('0.1') + halalas('0.2')).toBe(halalas('0.3'));
  });
});

describe('شكلُ التوزيع المُرسَل', () => {
  it('بالقروش وبأسماء المزوّد', () => {
    expect(
      toMoyasarSplits([
        { payoutRef: 'e-1', amount: '575.00', reference: 'SRV-1', description: 'الفحص' },
        { payoutRef: 'pf', amount: '57.50', bearsGatewayFee: true },
      ]),
    ).toEqual([
      { recipient_id: 'e-1', amount: 57_500, reference: 'SRV-1', description: 'الفحص' },
      { recipient_id: 'pf', amount: 5_750, fee_source: true },
    ]);
  });
});

/**
 * ═══ وأسماءُ الأسرار مُعلَنة ═══
 *
 * المحرّر كان يقبل اسمًا حرًّا، **فحرفٌ زائد يحفظ سرًّا لا يقرؤه أحد**:
 * التكامل مضبوطٌ في عين المشغّل ومعطَّلٌ في عين الكود، ولا شيء يسقط.
 */
describe('حقول الأسرار', () => {
  it('لكل تكاملٍ أسماؤه، ولما لم يُعلَن افتراضيّ', () => {
    expect(secretFieldsFor('moyasar_platform')).toEqual(['platformKey']);
    expect(secretFieldsFor('payments')).toEqual(['secretKey', 'webhookSecret']);
    expect(secretFieldsFor('غير-معروف')).toEqual(['apiKey']);
  });

  /** ولا حقلَ فارغًا ولا مكرَّرًا — فصفٌّ بلا اسمٍ لا يُحفظ أصلًا. */
  it('ولا اسم فارغ ولا مكرّر', () => {
    for (const [key, names] of Object.entries(INTEGRATION_SECRET_FIELDS)) {
      expect(names.length, key).toBeGreaterThan(0);
      expect(new Set(names).size, key).toBe(names.length);
      for (const name of names) expect(name, key).not.toBe('');
    }
  });
});
