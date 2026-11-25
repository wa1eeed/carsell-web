#!/usr/bin/env node
/**
 * ═══ أيُّ قيمةِ تعدادٍ لا تُرى في بيئةِ التطوير؟ ═══
 *
 * **«ما لا يُزرع لا يُرى»** — قاعدةٌ مكتوبة في هذا المستودع، وُلدت من
 * تسع عللٍ سكنت حالًا لم تفتحها شاشةٌ قطّ: لم يكن في البذرة طلبٌ ملغى
 * واحد، فبقيت تسعةُ مواضع تقرأ مرحلتَه بلا حاله.
 *
 * وهذا يقيسها: لكلّ حقلِ تعدادٍ **يكتبه المنتج**، أيُّ قيمةٍ لا صفَّ
 * لها في القاعدة. والناقصُ إمّا يُزرع، أو يُسمّى سببُه — وقيمةٌ لا
 * يكتبها المنتج أصلًا عطلٌ آخر يكشفه فحصُ الكاتب.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';

const ROOT = join(import.meta.dirname, '..');
const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');

/** تعداداتُ المخطّط وقيَمها. */
const enums = new Map<string, string[]>();
for (const match of schema.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
  const values = (match[2] ?? '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*/, '').trim())
    .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
  const name = match[1];
  if (name !== undefined && values.length > 0) enums.set(name, values);
}

/** الحقولُ المقيسة: نموذج ← حقل ← تعداد. */
const WATCHED: [string, string, string][] = [
  ['listing', 'status', 'ListingStatus'],
  ['listing', 'type', 'ListingType'],
  ['order', 'stage', 'OrderStage'],
  ['order', 'status', 'OrderStatus'],
  ['order', 'source', 'OrderSource'],
  ['auction', 'status', 'AuctionStatus'],
  ['escrow', 'status', 'EscrowStatus'],
  ['offer', 'status', 'OfferStatus'],
  ['dispute', 'status', 'DisputeStatus'],
  ['serviceRequest', 'status', 'ServiceRequestStatus'],
  ['user', 'status', 'UserStatus'],
  ['user', 'identityStatus', 'IdentityStatus'],
  ['dealer', 'status', 'DealerStatus'],
  ['taxInvoice', 'status', 'InvoiceStatus'],
  ['vehicle', 'condition', 'VehicleCondition'],
  ['vehicle', 'spec', 'VehicleSpec'],
];

/**
 * ═══ قيَمٌ لا تُزرع — بسببٍ معلَن ═══
 *
 * **وقائمةُ الاستثناء تُسمّي سببَها أو تصير مخبأً** — وهي قاعدةٌ
 * مكتوبة في هذا المستودع. فكلُّ سطرٍ هنا إمّا قيمةٌ لا يكتبها المنتج
 * (وذاك عطلٌ آخر، مسجَّل في موضعه)، أو حالٌ لا تُبلَغ إلّا بدورةٍ
 * كاملة لا تُحاكى بصفّ.
 */
const DECLARED: Record<string, string> = {
  'order.status.STALLED':
    'لا كاتب لها في المنتج كلّه — مسجَّلٌ في admin-orders.ts بـDESIGN-Q: أتبقى حالًا يضعها المشغّل بيده أم تُحذف؟',
  'listing.status.EXPIRED':
    'لا كاتب لها — لا وظيفة دورية تُنهي مدّة إعلان ولا مسار. وشريحةٌ لها تبقى صفرًا إلى الأبد.',
  'escrow.status.PENDING':
    'لا كاتب لها — `applyState` تُنشئ الضمان `HELD` دائمًا، وفي payments.ts فرعٌ يقرؤها لا ينتجه أحد. وزرعُها على طلبٍ عند الدفع يُخفي زرَّ الدفع.',
  'taxInvoice.status.CANCELLED':
    'الفاتورة لا تُلغى بتبديل حقل — بل بإشعارٍ دائن يشير إلى الأصل (التسلسل متّصل بلا فجوات). وزرعُها مباشرةً حالٌ لا يبلغها المنتج.',
};

async function main(): Promise<void> {
  let missing = 0;
  const report = [];

  for (const [model, field, enumName] of WATCHED) {
    const values = enums.get(enumName);
    if (values === undefined) {
      report.push(`✗ ${enumName} غير موجود في المخطّط`);
      missing += 1;
      continue;
    }
    const table = (db as unknown as Record<string, {
      groupBy: (args: unknown) => Promise<Record<string, unknown>[]>;
    }>)[model];
    if (table === undefined) {
      report.push(`✗ ${model} ليس نموذجًا في العميل`);
      missing += 1;
      continue;
    }
    const rows = await table.groupBy({ by: [field], _count: { _all: true } });
    const seen = new Map(
      rows.map((row) => [
        String(row[field]),
        ((row['_count'] as { _all: number } | undefined)?._all) ?? 0,
      ]),
    );
    const gaps = values.filter(
      (value) => !seen.has(value) && DECLARED[`${model}.${field}.${value}`] === undefined,
    );
    const declared = values.filter(
      (value) => !seen.has(value) && DECLARED[`${model}.${field}.${value}`] !== undefined,
    );
    const shown = values
      .map((v) => `${v}:${seen.has(v) ? seen.get(v) : DECLARED[`${model}.${field}.${v}`] !== undefined ? '—' : 0}`)
      .join(' · ');
    report.push(`${gaps.length === 0 ? '✓' : '⬜'} ${model}.${field} — ${shown}`);
    for (const value of declared) {
      report.push(`   — ${value}: ${DECLARED[`${model}.${field}.${value}`] ?? ''}`);
    }
    missing += gaps.length;
  }

  await db.$disconnect();
  console.log(report.join('\n'));
  console.log(`\n${missing === 0 ? '✓ كلُّ قيمةٍ مزروعة' : `⬜ ${missing} قيمةً بلا صفّ`}`);

}

void main();
