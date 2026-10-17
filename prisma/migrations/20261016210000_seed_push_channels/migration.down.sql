-- والقوالبُ تشير إليها بـ`ON DELETE SET NULL`، فحذفُها يُفرّغ إسنادَها.
DELETE FROM "PushChannel" WHERE "key" = 'auction_mine';
DELETE FROM "PushChannel" WHERE "key" = 'orders_payment';
DELETE FROM "PushChannel" WHERE "key" = 'offers_mine';
DELETE FROM "PushChannel" WHERE "key" = 'favorite_price_drop';
DELETE FROM "PushChannel" WHERE "key" = 'saved_search_results';
DELETE FROM "PushChannel" WHERE "key" = 'marketing';
