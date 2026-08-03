import { describe, expect, it } from 'vitest';
import { redact, reportError } from '@/lib/observability/report';

describe('السجلّ لا يحمل سرًّا', () => {
  /**
   * **بالاسم وبالقيمة معًا.** فالاسم وحده يفوته سرٌّ في حقلٍ اسمه
   * `note`، والقيمة وحدها تفوتها كلمة مرورٍ لا نمط لها.
   */
  it('يحجب بالاسم', () => {
    const out = redact({
      secretKey: 'abc',
      password: 'x',
      authorization: 'Bearer y',
      iban: 'SA0380000000608010167519',
      vatNumber: '300000000000003',
      safe: 'ظاهر',
    }) as Record<string, unknown>;

    expect(out.secretKey).toBe('[محجوب]');
    expect(out.password).toBe('[محجوب]');
    expect(out.authorization).toBe('[محجوب]');
    expect(out.iban).toBe('[محجوب]');
    expect(out.vatNumber).toBe('[محجوب]');
    // وما ليس سرًّا يبقى — والحجب الشامل يجعل السجلّ عديم النفع
    expect(out.safe).toBe('ظاهر');
  });

  it('ويحجب بالقيمة داخل حقلٍ برئ الاسم', () => {
    const out = redact({
      note: 'المفتاح csk_AAAAAAAAAAAAAAAAAAAA فشل',
      body: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.aaaaaaaaaaaaaaaaaaaaaa',
      phone: 'اتصل على +966501234567',
    }) as Record<string, string>;

    expect(out.note).not.toContain('csk_AAAAAAAAAAAAAAAAAAAA');
    expect(out.body).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(out.phone).not.toContain('+966501234567');
  });

  it('يتحمّل التداخل العميق والدوائر بلا انهيار', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { secret: 'x' } } } } } } } };
    expect(() => redact(deep)).not.toThrow();
    expect(() => redact([1, 'a', null, undefined, { token: 't' }])).not.toThrow();
  });

  /**
   * **لا يرمي أبدًا.** إبلاغٌ يرمي داخل معالج خطأ يُخفي الخطأ الأصلي
   * ويستبدله بخطأ الإبلاغ.
   */
  it('الإبلاغ لا يرمي مهما كان المُبلَّغ عنه', () => {
    expect(() => reportError(new Error('عادي'), { where: 'test' })).not.toThrow();
    expect(() => reportError('نصّ لا خطأ', { where: 'test' })).not.toThrow();
    expect(() => reportError(null, { where: 'test' })).not.toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      reportError(new Error('x'), { where: 'test', extra: { circular } }),
    ).not.toThrow();
  });
});
