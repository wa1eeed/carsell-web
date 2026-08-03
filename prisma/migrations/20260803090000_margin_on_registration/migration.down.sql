-- نقض الترحيل. الأصل باقٍ على `Dealer` ولم يُمَسّ، فالإسقاط كافٍ.
ALTER TABLE "User" DROP COLUMN IF EXISTS "marginSchemeAt",
                   DROP COLUMN IF EXISTS "marginSchemeBy",
                   DROP COLUMN IF EXISTS "marginSchemeRef",
                   DROP COLUMN IF EXISTS "marginSchemeApproved";
