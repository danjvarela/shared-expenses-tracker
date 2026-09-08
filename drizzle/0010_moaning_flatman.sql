CREATE TABLE `group_category` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`category_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `group`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_category_group_id_category_id_unique` ON `group_category` (`group_id`,`category_id`);--> statement-breakpoint
DROP INDEX `category_name_unique`;--> statement-breakpoint
ALTER TABLE `category` ADD `owner_group_id` text REFERENCES `group`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX `category_owner_group_id_name_unique` ON `category` (`owner_group_id`,`name`);