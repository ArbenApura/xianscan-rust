CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reading_history` (
	`book_id` text PRIMARY KEY NOT NULL,
	`chapter_id` integer NOT NULL,
	`chapter_seq` integer DEFAULT 0 NOT NULL,
	`page_seq` integer DEFAULT 0 NOT NULL,
	`total_pages` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reading_history_updated_idx` ON `reading_history` (`updated_at`);--> statement-breakpoint
CREATE INDEX `reading_history_chapter_idx` ON `reading_history` (`chapter_id`);--> statement-breakpoint
ALTER TABLE `chapters` ADD `resliced` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `chapters` ADD `resliced_at` integer;