-- طلبُ الخدمة يُفوتَر بنفسه — وتسويةُ المركبة تقول ذلك منذ كُتبت
-- (`INVOICED_WITH_ITS_OWN_PAYMENT`) ولا شيء كان يُصدره.
-- و`UNIQUE` يمنع فاتورةً ثانية بقيدٍ في القاعدة لا بفحصٍ يسبقها.
ALTER TABLE "TaxInvoice" ADD COLUMN "serviceRequestId" TEXT;
CREATE UNIQUE INDEX "TaxInvoice_serviceRequestId_key" ON "TaxInvoice"("serviceRequestId");
