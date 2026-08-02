/**
 * قواعد لينت خاصة بهذا المستودع.
 *
 * كل قاعدة هنا وُلدت من خطأ **وقع مرتين**. القاعدة في CLAUDE.md:
 * خطأ ظهر مرتين لا يُصلَح مرتين — تُبنى له بوابة.
 */

/** حرف عربي (بلا الأرقام العربية-الهندية، فهي أرقام لا نصّ). */
const ARABIC_LETTER = /[ء-ي]/;

/** أسماء مكوّنات تعرض رقمًا خامًا بلا وحدته. */
const BARE_NUMBER_COMPONENTS = new Set(['ArabicNumber']);

function elementName(node) {
  const name = node.openingElement?.name;
  return name?.type === 'JSXIdentifier' ? name.name : null;
}

/**
 * يمنع نصًّا عربيًا ملاصقًا لرقم خام في JSX.
 *
 * `<ArabicNumber value={n} /> إعلانًا` تنتج «١ إعلانًا» — والعربية
 * ست حالات جمع، فالوحدة المكتوبة يدويًا تخطئ في خمس منها.
 * ووقع هذا في المهمتين ٥ و٨، فصار بوابة لا تصحيحًا.
 *
 * **النطاق: ما بعد الرقم وحده.** التسمية قبله (`المحدَّد: <ArabicNumber/>`
 * و`السنوات <ArabicNumber/>`) لا تحتاج مطابقة عدد فهي سليمة، وحظرها
 * ضجيج يدفع إلى تعطيل القاعدة. الخلل صنفٌ واحد: وحدة تتبع رقمًا.
 */
const noArabicBesideNumber = {
  meta: {
    type: 'problem',
    docs: { description: 'لا وحدة عربية مكتوبة يدويًا بجوار رقم' },
    messages: {
      adjacent:
        'وحدة عربية بعد <{{component}}>. العربية ست حالات جمع، والوحدة المكتوبة يدويًا تخطئ في أكثرها. استخدم <Quantity unit="…" count={…} />.',
    },
    schema: [],
  },
  create(context) {
    function check(children) {
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        if (child.type !== 'JSXElement') continue;

        const name = elementName(child);
        if (name === null || !BARE_NUMBER_COMPONENTS.has(name)) continue;

        const next = children[i + 1];
        if (next?.type === 'JSXText' && ARABIC_LETTER.test(next.value)) {
          context.report({
            node: child,
            messageId: 'adjacent',
            data: { component: name },
          });
        }
      }
    }

    return {
      JSXElement: (node) => check(node.children),
      JSXFragment: (node) => check(node.children),
    };
  },
};

const plugin = {
  rules: { 'no-arabic-beside-number': noArabicBesideNumber },
};

export default plugin;
