-- مفتاحُ حساب المزوّد السرّيّ، مُعمّى. يُعاد مرّةً عند الإنشاء، وبه
-- وحده يُقرأ رصيدُه — ومن لم يلتقطه لحظتها لا يقرأ رصيدًا أبدًا.
ALTER TABLE "ServiceProvider" ADD COLUMN "accountSecret" TEXT;
