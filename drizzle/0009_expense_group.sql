CREATE TABLE `expense_group` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `group`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `expense` ADD `expense_group_id` text;
--> statement-breakpoint
INSERT INTO `expense_group` (`id`, `group_id`, `created_at`)
SELECT `id`, `group_id`, `created_at` FROM `expense`;
--> statement-breakpoint
UPDATE `expense` SET `expense_group_id` = `id`;
--> statement-breakpoint
ALTER TABLE `expense_receipt` ADD `expense_group_id` text;
--> statement-breakpoint
UPDATE `expense_receipt` SET `expense_group_id` = (
	SELECT `expense`.`expense_group_id` FROM `expense` WHERE `expense`.`id` = `expense_receipt`.`expense_id`
);
--> statement-breakpoint
CREATE TABLE `expense_receipt_new` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_group_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`original_filename` text,
	`uploaded_by_user_id` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	FOREIGN KEY (`expense_group_id`) REFERENCES `expense_group`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `expense_receipt_new` (`id`, `expense_group_id`, `storage_key`, `mime`, `size_bytes`, `original_filename`, `uploaded_by_user_id`, `uploaded_at`)
SELECT `id`, `expense_group_id`, `storage_key`, `mime`, `size_bytes`, `original_filename`, `uploaded_by_user_id`, `uploaded_at` FROM `expense_receipt`;
--> statement-breakpoint
DROP TABLE `expense_receipt`;
--> statement-breakpoint
ALTER TABLE `expense_receipt_new` RENAME TO `expense_receipt`;
--> statement-breakpoint
CREATE TABLE `expense_new` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`expense_group_id` text NOT NULL,
	`paid_by_user_id` text NOT NULL,
	`category_id` text,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `group`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_group_id`) REFERENCES `expense_group`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paid_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `expense_new` (`id`, `group_id`, `expense_group_id`, `paid_by_user_id`, `category_id`, `description`, `amount_cents`, `date`, `created_at`, `updated_at`)
SELECT `id`, `group_id`, `expense_group_id`, `paid_by_user_id`, `category_id`, `description`, `amount_cents`, `date`, `created_at`, `updated_at` FROM `expense`;
--> statement-breakpoint
DROP TABLE `expense`;
--> statement-breakpoint
ALTER TABLE `expense_new` RENAME TO `expense`;