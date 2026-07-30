-- Plain-language, customer-facing rewrite of each KB article. The canonical
-- `body` stays agent/eval/retrieval facing; `customer_body` is what the customer
-- portal shows (verbose, non-technical, no tool names). Nullable — falls back to
-- `body` when absent.
ALTER TABLE `documents` ADD `customer_body` text;
