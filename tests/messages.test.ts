import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * **المفتاح المشتقّ من بيانات لا يفشل ظاهرًا.**
 *
 * `t(`event.${row.type}`)` بنوعٍ لا ترجمة له يطبع مسار المفتاح نفسه على
 * الشاشة — لا استثناء ولا سطر في السجلّ. فما دام الكود يكتب النوع، فهو
 * وحده مصدر القائمة، والاختبار يقارن ما يُكتب بما يُترجَم.
 */

const locales = ['ar', 'en'] as const;

function messages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`src/messages/${locale}.json`, 'utf8')) as Record<string, unknown>;
}

function lookup(tree: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, part) =>
      node !== null && typeof node === 'object'
        ? (node as Record<string, unknown>)[part]
        : undefined,
    tree,
  );
}

/** أنواع أحداث الطلب كما يكتبها المجال فعلًا — لا كما نتذكّرها. */
function writtenEventTypes(): string[] {
  const sources = [
    'src/lib/domain/orders.ts',
    'src/lib/domain/disputes.ts',
    'src/lib/domain/offers.ts',
  ];
  const found = new Set<string>();
  for (const file of sources) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/type:\s*'([a-z_]+\.[a-z_]+)'/g)) {
      const type = match[1];
      if (type !== undefined) found.add(type);
    }
  }
  return [...found].sort();
}

describe('رسائل الترجمة', () => {
  it('كل نوع حدث يكتبه المجال له ترجمة في اللغتين', () => {
    const types = writtenEventTypes();
    expect(types.length).toBeGreaterThan(0);

    for (const locale of locales) {
      const tree = messages(locale);
      for (const type of types) {
        expect(typeof lookup(tree, `order.event.${type}`), `${locale} — ${type}`).toBe('string');
      }
      // والاحتياط نفسه لا بدّ أن يوجد وإلا صار الاحتياط عطلًا
      expect(typeof lookup(tree, 'order.event.other')).toBe('string');
    }
  });

  it('لا مفتاح فيه نقطة — النقطة تعني التداخل عند next-intl', () => {
    const dotted: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (node === null || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key.includes('.')) dotted.push(`${path}${key}`);
        walk(value, `${path}${key}.`);
      }
    };
    for (const locale of locales) walk(messages(locale), `${locale}:`);
    expect(dotted).toEqual([]);
  });

  it('اللغتان متطابقتا المفاتيح', () => {
    const keys = (tree: unknown, path = ''): string[] => {
      if (tree === null || typeof tree !== 'object') return [path];
      return Object.entries(tree).flatMap(([key, value]) =>
        keys(value, path === '' ? key : `${path}.${key}`),
      );
    };
    const ar = new Set(keys(messages('ar')));
    const en = new Set(keys(messages('en')));
    expect([...ar].filter((key) => !en.has(key)), 'موجود في ar وغائب عن en').toEqual([]);
    expect([...en].filter((key) => !ar.has(key)), 'موجود في en وغائب عن ar').toEqual([]);
  });
});
