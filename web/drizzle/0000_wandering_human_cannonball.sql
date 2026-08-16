CREATE TABLE `ai_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`page_id` integer,
	`model` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`cached_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_usage_created_idx` ON `ai_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_page_idx` ON `ai_usage` (`page_id`);--> statement-breakpoint
CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text DEFAULT 'upload' NOT NULL,
	`source_lang` text NOT NULL,
	`target_lang` text NOT NULL,
	`title` text NOT NULL,
	`title_target` text,
	`pinned` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `books_archived_idx` ON `books` (`archived`);--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`book_id` text NOT NULL,
	`seq` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`title_target` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`translated_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapters_uuid_unq` ON `chapters` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `chapters_book_seq_unq` ON `chapters` (`book_id`,`seq`);--> statement-breakpoint
CREATE INDEX `chapters_book_idx` ON `chapters` (`book_id`);--> statement-breakpoint
CREATE TABLE `glossary` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text NOT NULL,
	`book_id` text,
	`source_lang` text NOT NULL,
	`target_lang` text NOT NULL,
	`source` text NOT NULL,
	`target` text NOT NULL,
	`gender` text DEFAULT 'neuter' NOT NULL,
	`context` text,
	`tags` text,
	`category` text,
	`pinned` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'ai' NOT NULL,
	`aliases` text,
	`first_chapter_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`first_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "glossary_scope_check" CHECK(("glossary"."scope" = 'global' AND "glossary"."book_id" IS NULL) OR ("glossary"."scope" = 'book' AND "glossary"."book_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `glossary_global_unq` ON `glossary` (`source_lang`,`target_lang`,`source`) WHERE "glossary"."scope" = 'global';--> statement-breakpoint
CREATE UNIQUE INDEX `glossary_book_unq` ON `glossary` (`book_id`,`source`) WHERE "glossary"."scope" = 'book';--> statement-breakpoint
CREATE INDEX `glossary_book_idx` ON `glossary` (`book_id`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chapter_id` integer NOT NULL,
	`seq` integer NOT NULL,
	`file_path` text NOT NULL,
	`width` integer,
	`height` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`cleaned_path` text,
	`output_path` text,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_chapter_seq_unq` ON `pages` (`chapter_id`,`seq`);--> statement-breakpoint
CREATE INDEX `pages_chapter_idx` ON `pages` (`chapter_id`);--> statement-breakpoint
CREATE TABLE `regions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer NOT NULL,
	`seq` integer NOT NULL,
	`box` text NOT NULL,
	`category` text DEFAULT 'dialogue' NOT NULL,
	`text_source` text DEFAULT '' NOT NULL,
	`text_target` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`conf` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `regions_page_idx` ON `regions` (`page_id`);--> statement-breakpoint
CREATE TABLE `translations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer NOT NULL,
	`cache_key` text NOT NULL,
	`content_target` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer,
	`cached_tokens` integer,
	`completion_tokens` integer,
	`cost_usd` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `translations_cache_key_unq` ON `translations` (`cache_key`);--> statement-breakpoint
CREATE INDEX `translations_page_idx` ON `translations` (`page_id`);