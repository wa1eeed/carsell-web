import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * مخطط الهيكل — رسم المصمّم إن وُجد، وتخطيط بديل إن لم يوجد.
 *
 * الملف `public/diagrams/car-body-top.svg` منظر علويّ بمعرّف لكل لوحة،
 * وبنيته ثلاث مجموعات: `panels` تُلوَّن وتتفاعل، و`glass` لا يُصبغ،
 * و`decor` يرث `currentColor`.
 *
 * **الحقن هنا لا في المكوّن**: الملف يُقرأ مرّة ويُخزَّن، فلا قراءة قرص
 * لكل طلب. وغيابه ليس خطأً — الشاشة تعرض التخطيط البديل وتبقى صادقة.
 */

/** معرّفات اللوحات كما اتُّفق عليها — الترجمة تربطها بأسمائها. */
export const PANEL_IDS = [
  'front-bumper', 'hood', 'fender-fl', 'fender-fr',
  'door-fl', 'door-fr', 'door-rl', 'door-rr',
  'roof', 'quarter-l', 'quarter-r', 'trunk', 'rear-bumper',
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

const DIAGRAM_PATH = join(process.cwd(), 'public', 'diagrams', 'car-body-top.svg');

let cached: string | null | undefined;

/** يعيد `null` إن لم يصل الرسم بعد — والشاشة تتدبّر. */
export async function loadBodyDiagram(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const raw = await readFile(DIAGRAM_PATH, 'utf8');
    // ما ليس `<svg>` ليس رسمًا — ملف تالف يُعامَل كغائب لا كمحتوى
    cached = raw.includes('<svg') ? raw : null;
  } catch {
    cached = null;
  }
  return cached;
}
