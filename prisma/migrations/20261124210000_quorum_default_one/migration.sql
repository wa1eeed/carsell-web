-- AlterTable
ALTER TABLE "ApprovalRequest" ALTER COLUMN "requiredApprovals" SET DEFAULT 1;


-- **والصفوفُ المعلّقة تتبع القرار كما تتبعه الشيفرة.**
-- `selfApprovalBlocked` تقرأ `requiredApprovals` **من الصفّ لا من
-- الثابت**، فطلبٌ كُتب قبل القرار يظلّ يشترط شخصًا ثانيًا مهما انخفض
-- الثابت. ولا يُمَسّ منفَّذٌ ولا مرفوض: تاريخُهما ما كان.
UPDATE "ApprovalRequest"
SET "requiredApprovals" = 1
WHERE "status" = 'PENDING' AND "requiredApprovals" > 1;
