/** تعريفُ الأنواع لوحدةٍ تقرؤها البوابةُ (MJS) والاختبارُ (TS). */
export type ModelWriters = {
  model: string;
  /** أينشئه المنتج؟ */
  created: boolean;
  /** أيعدّله المنتج؟ — والحذفُ ليس تعديلًا. */
  edited: boolean;
  /** أيزرعه الزرعُ أو ترحيل؟ */
  seeded: boolean;
};

export declare function schemaModels(root: string): string[];
export declare function classifyModels(root: string): ModelWriters[];
export declare function frozenModels(root: string): string[];
export declare function untouchedModels(root: string): string[];
export declare function CREATES(model: string): RegExp;
export declare function EDITS(model: string): RegExp;
