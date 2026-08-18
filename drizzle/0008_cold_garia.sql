CREATE TABLE `expense_receipt` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`original_filename` text,
	`uploaded_by_user_id` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expense`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
