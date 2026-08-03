-- محرّك الضريبة والفوترة — A21 (المهمة ٣٥)

CREATE TYPE "SellerType"    AS ENUM ('INDIVIDUAL', 'DEALER_VAT', 'DEALER_NO_VAT', 'COMPANY');
CREATE TYPE "BuyerType"     AS ENUM ('INDIVIDUAL', 'DEALER', 'COMPANY');
CREATE TYPE "SupplyType"    AS ENUM ('VEHICLE', 'COMMISSION', 'SERVICE');
CREATE TYPE "TaxableBase"   AS ENUM ('FULL_VALUE', 'MARGIN', 'FEE_ONLY', 'OUT_OF_SCOPE');
CREATE TYPE "InvoiceIssuer" AS ENUM ('PLATFORM', 'SELLER', 'PLATFORM_ON_BEHALF');
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'REPORTED', 'REPORT_FAILED', 'CANCELLED');

-- هامش الربح صفةٌ على التاجر لا خيارٌ في الصفقة
ALTER TABLE "Dealer"
  ADD COLUMN "marginSchemeApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "marginSchemeRef"      TEXT,
  ADD COLUMN "marginSchemeBy"       TEXT,
  ADD COLUMN "marginSchemeAt"       TIMESTAMP(3);

CREATE TABLE "TaxRule" (
  "id"                 TEXT NOT NULL,
  "sellerType"         "SellerType",
  "buyerType"          "BuyerType",
  "supplyType"         "SupplyType" NOT NULL,
  "taxableBase"        "TaxableBase" NOT NULL,
  "ratePct"            DECIMAL(5,2),
  "supplierIsPlatform" BOOLEAN NOT NULL DEFAULT false,
  "invoiceIssuer"      "InvoiceIssuer" NOT NULL,
  "activeFrom"         TIMESTAMP(3) NOT NULL,
  "activeTo"           TIMESTAMP(3),
  "active"             BOOLEAN NOT NULL DEFAULT true,
  "note"               TEXT,
  "updatedBy"          TEXT NOT NULL,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaxRule_supplyType_active_activeFrom_idx" ON "TaxRule"("supplyType", "active", "activeFrom");

CREATE TABLE "TaxInvoice" (
  "id"                TEXT NOT NULL,
  "sequence"          INTEGER NOT NULL,
  "number"            TEXT NOT NULL,
  "uuid"              TEXT NOT NULL,
  "orderId"           TEXT,
  "ruleId"            TEXT NOT NULL,
  "ruleSellerType"    "SellerType",
  "ruleBuyerType"     "BuyerType",
  "ruleSupplyType"    "SupplyType" NOT NULL,
  "ruleTaxableBase"   "TaxableBase" NOT NULL,
  "ruleRatePct"       DECIMAL(5,2),
  "ruleInvoiceIssuer" "InvoiceIssuer" NOT NULL,
  "supplierName"      TEXT NOT NULL,
  "supplierVatNo"     TEXT,
  "supplierAddress"   TEXT,
  "customerName"      TEXT NOT NULL,
  "customerVatNo"     TEXT,
  "issuedAt"          TIMESTAMP(3) NOT NULL,
  "suppliedAt"        TIMESTAMP(3) NOT NULL,
  "subtotal"          DECIMAL(12,2) NOT NULL,
  "taxTotal"          DECIMAL(12,2) NOT NULL,
  "total"             DECIMAL(12,2) NOT NULL,
  "qrTlv"             TEXT,
  "invoiceHash"       TEXT,
  "signature"         TEXT,
  "status"            "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "reportedAt"        TIMESTAMP(3),
  "reportError"       TEXT,
  CONSTRAINT "TaxInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaxInvoice_sequence_key" ON "TaxInvoice"("sequence");
CREATE UNIQUE INDEX "TaxInvoice_number_key"   ON "TaxInvoice"("number");
CREATE UNIQUE INDEX "TaxInvoice_uuid_key"     ON "TaxInvoice"("uuid");
CREATE INDEX "TaxInvoice_orderId_idx"          ON "TaxInvoice"("orderId");
CREATE INDEX "TaxInvoice_status_issuedAt_idx"  ON "TaxInvoice"("status", "issuedAt");
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "TaxRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TaxInvoiceLine" (
  "id"          TEXT NOT NULL,
  "invoiceId"   TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity"    DECIMAL(10,2) NOT NULL DEFAULT 1,
  "unitPrice"   DECIMAL(12,2) NOT NULL,
  "subtotal"    DECIMAL(12,2) NOT NULL,
  "taxAmount"   DECIMAL(12,2) NOT NULL,
  "total"       DECIMAL(12,2) NOT NULL,
  CONSTRAINT "TaxInvoiceLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaxInvoiceLine_invoiceId_idx" ON "TaxInvoiceLine"("invoiceId");
ALTER TABLE "TaxInvoiceLine" ADD CONSTRAINT "TaxInvoiceLine_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "TaxInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CreditNote" (
  "id"        TEXT NOT NULL,
  "sequence"  INTEGER NOT NULL,
  "number"    TEXT NOT NULL,
  "uuid"      TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "reason"    TEXT NOT NULL,
  "amount"    DECIMAL(12,2) NOT NULL,
  "taxAmount" DECIMAL(12,2) NOT NULL,
  "issuedAt"  TIMESTAMP(3) NOT NULL,
  "issuedBy"  TEXT NOT NULL,
  CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CreditNote_sequence_key" ON "CreditNote"("sequence");
CREATE UNIQUE INDEX "CreditNote_number_key"   ON "CreditNote"("number");
CREATE UNIQUE INDEX "CreditNote_uuid_key"     ON "CreditNote"("uuid");
CREATE INDEX "CreditNote_invoiceId_idx"       ON "CreditNote"("invoiceId");
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "TaxInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SettlementStatement" (
  "id"             TEXT NOT NULL,
  "orderId"        TEXT NOT NULL,
  "vehicleValue"   DECIMAL(12,2) NOT NULL,
  "commission"     DECIMAL(12,2) NOT NULL,
  "commissionTax"  DECIMAL(12,2) NOT NULL,
  "gatewayFee"     DECIMAL(12,2) NOT NULL,
  "servicesTotal"  DECIMAL(12,2) NOT NULL,
  "netToSeller"    DECIMAL(12,2) NOT NULL,
  "heldAmount"     DECIMAL(12,2) NOT NULL,
  "returnedAmount" DECIMAL(12,2) NOT NULL,
  "issuedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SettlementStatement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SettlementStatement_orderId_key" ON "SettlementStatement"("orderId");
ALTER TABLE "SettlementStatement" ADD CONSTRAINT "SettlementStatement_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "VehicleSaleAgreement" (
  "id"            TEXT NOT NULL,
  "orderId"       TEXT NOT NULL,
  "vin"           TEXT NOT NULL,
  "sellerName"    TEXT NOT NULL,
  "sellerIdNo"    TEXT,
  "buyerName"     TEXT NOT NULL,
  "buyerIdNo"     TEXT,
  "price"         DECIMAL(12,2) NOT NULL,
  "inspectionRef" TEXT,
  "deliveryTerms" TEXT,
  "issuedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleSaleAgreement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VehicleSaleAgreement_orderId_key" ON "VehicleSaleAgreement"("orderId");
ALTER TABLE "VehicleSaleAgreement" ADD CONSTRAINT "VehicleSaleAgreement_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
