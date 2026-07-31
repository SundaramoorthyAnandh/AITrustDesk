-- Refund eligibility per product (KB-REFUND-002: gift cards / digital / final-sale
-- are non-refundable). Default true; the loader marks the gift card false.
ALTER TABLE `products` ADD `refundable` integer DEFAULT true NOT NULL;
