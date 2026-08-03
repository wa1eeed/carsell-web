-- نقض ترحيل الدفع و3DS.
DROP TABLE IF EXISTS "WebhookEvent";
DROP TABLE IF EXISTS "IdempotencyKey";
DROP TABLE IF EXISTS "PaymentEvent";
DROP TABLE IF EXISTS "Payment";
DROP TYPE IF EXISTS "PaymentStatus";
