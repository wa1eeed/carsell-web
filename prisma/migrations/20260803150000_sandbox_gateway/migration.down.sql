-- النقض: الجدول تجريبيّ بحت، وحذفه لا يمسّ دفترنا ولا صفًّا ماليًّا حقيقيًّا
DROP INDEX IF EXISTS "SandboxTransaction_parentRef_idx";
DROP INDEX IF EXISTS "SandboxTransaction_createdAt_idx";
DROP INDEX IF EXISTS "SandboxTransaction_ref_key";
DROP TABLE IF EXISTS "SandboxTransaction";
