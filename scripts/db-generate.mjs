#!/usr/bin/env node
/**
 * ═══ توليد عميل Prisma — ومسحُ `.next` معه ═══
 *
 * **المسح ضروريّ**: الخادم يحتفظ بالعميل القديم في الذاكرة بعد
 * `generate`، فتمرّ الاختبارات (تستورد طازجًا) وتسقط الصفحة بـ«Unknown
 * field» — والرسالة تتّهم استعلامك لا الذاكرة.
 *
 * ═══ ولماذا يُنهى الخادم بدل التحذير منه ═══
 *
 * كان الأمر يطبع «أعِد تشغيل خادم التطوير» ويمضي. **ووقع أربع مرّات
 * في جلسة واحدة**: يبقى الخادم يعمل على بناءٍ حُذف من تحته، فيردّ ٥٠٠
 * على كل صفحة بـ`ENOENT routes-manifest.json` — رسالةٌ لا تذكر لا
 * Prisma ولا المسح، فيُقرأ العطل على أنه في الشيفرة الجديدة.
 *
 * وتحذيرٌ يُقرأ ثم يُنسى ليس حارسًا. فالحالة تُترك **متّسقة**: لا بناء
 * ولا خادم يخدمه.
 */
import { execSync, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

execSync('prisma generate', { stdio: 'inherit' });
rmSync('.next', { recursive: true, force: true });

/** من يستمع على المنفذ — و`lsof` غائبٌ في بعض الصور فلا يُسقط الأمر. */
function listeners(port) {
  const found = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (found.error !== undefined || found.status !== 0) return [];
  return found.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

const port = process.env.PORT ?? '3000';
const pids = listeners(port);

for (const pid of pids) {
  try {
    process.kill(Number(pid), 'SIGTERM');
  } catch {
    // مات بيننا — والغرض أن يموت لا أن نقتله نحن
  }
}

console.log('');
if (pids.length === 0) {
  console.log('  ✓ .next مُسح — ولا خادم يعمل عليه');
} else {
  console.log(`  ✓ .next مُسح، وأُنهي خادم التطوير على ${port} — أعِد تشغيله`);
}
console.log('');
