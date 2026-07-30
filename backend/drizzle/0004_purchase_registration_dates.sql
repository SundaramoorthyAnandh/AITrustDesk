-- Split the single order-date into two distinct concepts:
--   purchase_date  → when the product was bought (the time-window anchor)
--   registered_at  → when the customer registered it with TrustDesk (audit only)
-- Existing rows: rename order_date → purchase_date and backfill registered_at
-- to the purchase date (best-available value for historical records).
ALTER TABLE `orders` RENAME COLUMN `order_date` TO `purchase_date`;--> statement-breakpoint
ALTER TABLE `orders` ADD `registered_at` text;--> statement-breakpoint
UPDATE `orders` SET `registered_at` = `purchase_date` WHERE `registered_at` IS NULL;
