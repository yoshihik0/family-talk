CREATE TABLE `device_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text NOT NULL,
	`space_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`label` text,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_device_sessions_token_hash` ON `device_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_device_sessions_identity` ON `device_sessions` (`identity_id`);--> statement-breakpoint
CREATE INDEX `idx_device_sessions_space` ON `device_sessions` (`space_id`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`created_by` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invites_token_hash` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_invites_space` ON `invites` (`space_id`);