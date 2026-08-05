ALTER TABLE `group` ADD `description` text;--> statement-breakpoint
ALTER TABLE `group` ADD `currency_code` text DEFAULT 'PHP' NOT NULL;--> statement-breakpoint
ALTER TABLE `group` ADD `avatar_icon` text;