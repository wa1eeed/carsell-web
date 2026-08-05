DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ApprovalRequest" WHERE "kind" = 'WALLET_ADJUSTMENT') THEN
    RAISE EXCEPTION 'طلبات تعديل رصيد قائمة — النقض يمحو سجلّ موافقات على مال';
  END IF;
END $$;

ALTER TYPE "ApprovalKind" RENAME TO "ApprovalKind_old";
CREATE TYPE "ApprovalKind" AS ENUM (
  'ESCROW_RELEASE', 'DISPUTE_RESOLUTION', 'KEY_ROTATION', 'INTEGRATION_ENV',
  'PAYMENT_ROUTE', 'COMMISSION_CHANGE', 'TAX_RULE_CHANGE'
);
ALTER TABLE "ApprovalRequest"
  ALTER COLUMN "kind" TYPE "ApprovalKind" USING "kind"::text::"ApprovalKind";
DROP TYPE "ApprovalKind_old";
