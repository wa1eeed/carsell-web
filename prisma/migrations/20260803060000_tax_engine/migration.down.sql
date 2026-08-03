-- نقض محرّك الضريبة.
DROP TABLE IF EXISTS "VehicleSaleAgreement";
DROP TABLE IF EXISTS "SettlementStatement";
DROP TABLE IF EXISTS "CreditNote";
DROP TABLE IF EXISTS "TaxInvoiceLine";
DROP TABLE IF EXISTS "TaxInvoice";
DROP TABLE IF EXISTS "TaxRule";

ALTER TABLE "Dealer"
  DROP COLUMN IF EXISTS "marginSchemeAt",
  DROP COLUMN IF EXISTS "marginSchemeBy",
  DROP COLUMN IF EXISTS "marginSchemeRef",
  DROP COLUMN IF EXISTS "marginSchemeApproved";

DROP TYPE IF EXISTS "InvoiceStatus";
DROP TYPE IF EXISTS "InvoiceIssuer";
DROP TYPE IF EXISTS "TaxableBase";
DROP TYPE IF EXISTS "SupplyType";
DROP TYPE IF EXISTS "BuyerType";
DROP TYPE IF EXISTS "SellerType";
