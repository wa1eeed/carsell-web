import { deflateSync } from 'node:zlib';

/**
 * ═══ صورةٌ نائبة — تُولَّد ولا تُنتحَل ═══
 *
 * البذرة كانت تكتب **أربعًا إلى عشر** صفوف صورٍ لكل إعلان بمفاتيح
 * `staging/listings/{ref}/{n}.webp` — **ولا ملفّ خلف واحدٍ منها**.
 * فكلُّ كرتٍ في اللوحة وكلُّ معرضٍ في الموقع يُرسم صندوقًا فارغًا، وعدّاد
 * الصور يقول «٦» ولا تُفتح واحدة.
 *
 * ولا شيء يسقط: الصفّ مكتوب، والاستعلام يُرجعه، والاختبار يعدّه —
 * **والعطل في عين من ينظر وحده**. وهو الصنف المسجَّل: البيانات المزروعة
 * تُحاكي شكل الحقيقيّ لا اسمها فقط.
 *
 * ═══ ولماذا تُولَّد بدل أن تُحمَّل ═══
 *
 * صورةٌ حقيقية لسيارةٍ لها مالكٌ وحقوق، وشحنُها في مستودعٍ يجعل كل
 * نسخةٍ تحمل ما لا نملكه. والنائبة تقول عن نفسها إنها نائبة.
 *
 * **وPNG بلا تبعيّة**: `zlib` في Node يكفي — والترميز بنية ثابتة
 * وثلاث كتل، ومُحمِّل خارجيّ لصورةٍ رماديّة ليس ثمنًا يُدفع.
 */

function crc32(buffer: Buffer): number {
  let crc = 0xffff_ffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb8_8320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** درجاتٌ هادئة من لوحة المنتج — ولا لونَ صارخ يُقرأ خطأً. */
const TONES: readonly [number, number, number][] = [
  [0xd8, 0xd2, 0xc4],
  [0xcf, 0xcb, 0xbd],
  [0xc6, 0xc2, 0xb4],
  [0xdb, 0xd6, 0xc9],
  [0xc2, 0xc7, 0xbe],
  [0xd2, 0xcd, 0xbf],
];

/**
 * يبني PNG بتدرّجٍ رأسيّ وشريطٍ أغمق أسفله — يُقرأ «نائبة» لا «عطل».
 *
 * و`seed` يفرّق الإعلانات بعضها عن بعض: شبكةٌ من صناديق بلونٍ واحد
 * تُشبه خطأ تحميلٍ متكرّرًا، والتفريق يجعلها تُقرأ على حقيقتها.
 */
export function placeholderPng(seed: number, width = 480, height = 360): Buffer {
  const [r, g, b] = TONES[Math.abs(seed) % TONES.length] as [number, number, number];

  const raw = Buffer.alloc((width * 3 + 1) * height);
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    raw[at] = 0; // مرشّح السطر: بلا
    at += 1;
    /* تدرّجٌ خفيف من الأعلى إلى الأسفل، ثمّ قاعدةٌ أغمق تُوحي بظلّ أرضيّة */
    const lift = Math.round((1 - y / height) * 14);
    const floor = y > height * 0.78 ? 18 : 0;
    for (let x = 0; x < width; x += 1) {
      raw[at] = Math.max(0, Math.min(255, r + lift - floor));
      raw[at + 1] = Math.max(0, Math.min(255, g + lift - floor));
      raw[at + 2] = Math.max(0, Math.min(255, b + lift - floor));
      at += 3;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // عمق البتّ
  header[9] = 2; // لونٌ حقيقيّ بلا ألفا
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
