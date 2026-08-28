CREATE TABLE `device_links` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`identity_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_device_links_token_hash` ON `device_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_device_links_identity` ON `device_links` (`identity_id`);
