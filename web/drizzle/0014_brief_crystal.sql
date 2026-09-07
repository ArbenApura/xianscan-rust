ALTER TABLE `pages` ADD `annotated_path` text;--> statement-breakpoint
ALTER TABLE `pages` ADD `annotated_rev` integer DEFAULT 0 NOT NULL;