PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`avatar_storage_key` text,
	`avatar_mime` text,
	`deleted_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "display_name", "email", "avatar_storage_key", "avatar_mime") SELECT "id", "display_name", "email", "avatar_storage_key", "avatar_mime" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);