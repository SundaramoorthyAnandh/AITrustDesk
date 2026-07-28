CREATE TABLE `agent_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'agent' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`failed_login_count` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_accounts_email_unique` ON `agent_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`tool_call_id` text NOT NULL,
	`decision` text NOT NULL,
	`decided_by` text NOT NULL,
	`decided_at` text NOT NULL,
	`note` text,
	FOREIGN KEY (`tool_call_id`) REFERENCES `tool_calls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `approvals_tool_call_idx` ON `approvals` (`tool_call_id`);--> statement-breakpoint
CREATE TABLE `customer_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`failed_login_count` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_accounts_email_unique` ON `customer_accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_accounts_customer_unique` ON `customer_accounts` (`customer_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`email_verified` integer DEFAULT false NOT NULL,
	`identity_verified` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_email_idx` ON `customers` (`email`);--> statement-breakpoint
CREATE TABLE `documents` (
	`doc_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`category` text,
	`is_adversarial` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_category_idx` ON `documents` (`category`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`text` text NOT NULL,
	`citations` text DEFAULT '[]' NOT NULL,
	`status` text NOT NULL,
	`created_by_agent_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_agent_id`) REFERENCES `agent_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `drafts_ticket_idx` ON `drafts` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `drafts_status_idx` ON `drafts` (`status`);--> statement-breakpoint
CREATE TABLE `eval_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`provider` text DEFAULT 'mock' NOT NULL,
	`summary` text
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`order_date` text NOT NULL,
	`status` text NOT NULL,
	`item_sku` text,
	`item_name` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`delivered_at` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`principal_type` text NOT NULL,
	`principal_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `refresh_tokens_principal_idx` ON `refresh_tokens` (`principal_type`,`principal_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_hash_idx` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`order_id` text,
	`subject` text,
	`body` text NOT NULL,
	`channel` text DEFAULT 'portal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`category` text,
	`priority` text,
	`escalated` integer,
	`assigned_agent_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_agent_id`) REFERENCES `agent_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tickets_customer_idx` ON `tickets` (`customer_id`);--> statement-breakpoint
CREATE INDEX `tickets_order_idx` ON `tickets` (`order_id`);--> statement-breakpoint
CREATE INDEX `tickets_status_idx` ON `tickets` (`status`);--> statement-breakpoint
CREATE INDEX `tickets_priority_idx` ON `tickets` (`priority`);--> statement-breakpoint
CREATE INDEX `tickets_created_idx` ON `tickets` (`created_at`);--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`args` text DEFAULT '{}' NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`recommended_by_agent_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recommended_by_agent_id`) REFERENCES `agent_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tool_calls_idempotency_unique` ON `tool_calls` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `tool_calls_ticket_idx` ON `tool_calls` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `tool_calls_status_idx` ON `tool_calls` (`status`);--> statement-breakpoint
CREATE TABLE `tool_catalog` (
	`name` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`sensitive` integer DEFAULT true NOT NULL,
	`requires_approval` integer DEFAULT true NOT NULL,
	`args_schema` text
);
--> statement-breakpoint
CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text,
	`run_type` text NOT NULL,
	`retrieved_doc_ids` text DEFAULT '[]' NOT NULL,
	`tool_actions` text DEFAULT '[]' NOT NULL,
	`guardrail_result` text,
	`final_status` text NOT NULL,
	`provider` text,
	`latency_ms` integer,
	`detail` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `traces_ticket_idx` ON `traces` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `traces_run_type_idx` ON `traces` (`run_type`);--> statement-breakpoint
CREATE INDEX `traces_created_idx` ON `traces` (`created_at`);