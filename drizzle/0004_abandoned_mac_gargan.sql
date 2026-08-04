ALTER TABLE `expense` ADD `date` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `expense` SET `date` = `created_at` WHERE `date` = 0;
