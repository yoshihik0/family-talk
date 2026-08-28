CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`record_type` text DEFAULT 'document' NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`json_schema` text,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_collections_space_key` ON `collections` (`space_id`,`key`);--> statement-breakpoint
CREATE INDEX `idx_collections_space` ON `collections` (`space_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_id` text,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_space_created` ON `events` (`space_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `identities` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'person' NOT NULL,
	`display_name` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text NOT NULL,
	`space_id` text,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`expires_at` integer,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_push_subscriptions_endpoint` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_identity` ON `push_subscriptions` (`identity_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`created_by` text NOT NULL,
	`kind` text DEFAULT 'document' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`data_json` text NOT NULL,
	`searchable_text` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_records_collection_created` ON `records` (`collection_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_records_collection_kind` ON `records` (`collection_id`,`kind`);--> statement-breakpoint
CREATE TABLE `space_members` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`identity_id` text NOT NULL,
	`role` text NOT NULL,
	`capabilities_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_space_members_space_identity` ON `space_members` (`space_id`,`identity_id`);--> statement-breakpoint
CREATE INDEX `idx_space_members_identity` ON `space_members` (`identity_id`);--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'generic' NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_spaces_slug` ON `spaces` (`slug`);