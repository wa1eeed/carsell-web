-- ═══ ونقضُه يشترط ألّا يكون أحدٌ استُعمل ═══
--
-- Postgres لا يحذف قيمةً من تعداد. فالنقض يعيد بناء النوع، ويسقط
-- صراحةً إن وُجد قيدٌ يستعملهما — وحذفُه صامتًا يمحو مالًا.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "LedgerEntry"
    WHERE "account" IN ('WALLET_PAYABLE', 'GOODWILL_EXPENSE')
  ) THEN
    RAISE EXCEPTION 'قيودٌ تستعمل حسابَي المحفظة — النقض يمحو مالًا مقيَّدًا';
  END IF;
END $$;

ALTER TYPE "LedgerAccount" RENAME TO "LedgerAccount_old";

CREATE TYPE "LedgerAccount" AS ENUM (
  'ESCROW_AT_PROVIDER', 'BUYER_ADVANCE', 'SELLER_PAYABLE', 'PLATFORM_REVENUE',
  'VAT_PAYABLE', 'GATEWAY_FEES_CLEARING', 'GOVT_FEES_CLEARING', 'PLATFORM_CASH'
);

ALTER TABLE "LedgerEntry"
  ALTER COLUMN "account" TYPE "LedgerAccount" USING "account"::text::"LedgerAccount";

DROP TYPE "LedgerAccount_old";
