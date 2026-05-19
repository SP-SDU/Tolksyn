CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`image_uri` text NOT NULL,
	`thumbnail_uri` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`status` text NOT NULL,
	`accepted_revision` integer DEFAULT 0 NOT NULL,
	`draft_structured_json` text,
	`extraction_result` text,
	`error_code` text
);
--> statement-breakpoint
CREATE TABLE `queue_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sequence` integer NOT NULL,
	`status` text NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`last_error_code` text,
	`attempt_id` text NOT NULL,
	`accepted_revision` integer NOT NULL,
	`enqueued_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
