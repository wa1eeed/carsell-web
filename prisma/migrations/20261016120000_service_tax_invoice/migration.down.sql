-- نقضٌ يفقد ربطَ الفاتورة بطلبها — والفواتير تبقى، ولا يُعرف أيُّها لأيّ طلب.
DROP INDEX "TaxInvoice_serviceRequestId_key";
ALTER TABLE "TaxInvoice" DROP COLUMN "serviceRequestId";
