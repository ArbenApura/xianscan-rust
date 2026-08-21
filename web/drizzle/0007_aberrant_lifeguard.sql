ALTER TABLE `books` ADD `description` text;--> statement-breakpoint
ALTER TABLE `books` ADD `author` text;--> statement-breakpoint
ALTER TABLE `books` ADD `artist` text;--> statement-breakpoint
ALTER TABLE `books` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `books` ADD `status` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `books` ADD `cover_path` text;--> statement-breakpoint
ALTER TABLE `books` ADD `cover_rev` integer DEFAULT 0 NOT NULL;