-- One product registration per (customer, SKU). Partial unique index so that
-- system-created replacement orders (id prefix `ORD-REP-`) — which legitimately
-- reuse the original product's SKU for the same customer — are excluded.
CREATE UNIQUE INDEX `orders_customer_registration_sku_uq` ON `orders` (`customer_id`,`item_sku`) WHERE `item_sku` is not null and `id` not like 'ORD-REP-%';
