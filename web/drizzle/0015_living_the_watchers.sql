-- FEAT-006: custom_fonts / custom_font_files WERE CREATED AT RUNTIME (db/index.ts) AND NEVER IN A DRIZZLE SNAPSHOT.
-- IF NOT EXISTS KEEPS THIS SAFE ON INSTALLS THAT ALREADY HAVE THEM; THEIR NEW `scripts` COLUMN IS ADDED BY THE
-- RUNTIME ALTER TABLE IN db/index.ts (SQLITE HAS NO ADD COLUMN IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS `custom_font_files` (
	`id` text PRIMARY KEY NOT NULL,
	`font_id` text NOT NULL,
	`file_name` text NOT NULL,
	`format` text NOT NULL,
	`weight` text DEFAULT 'regular' NOT NULL,
	`weight_numeric` integer DEFAULT 400 NOT NULL,
	`style` text DEFAULT 'normal' NOT NULL,
	`file_size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`font_id`) REFERENCES `custom_fonts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `custom_font_files_font_idx` ON `custom_font_files` (`font_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `custom_fonts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`file_name` text NOT NULL,
	`format` text NOT NULL,
	`script_type` text DEFAULT 'dialogue' NOT NULL,
	`file_size` integer NOT NULL,
	`supported_weights` text DEFAULT '["normal"]' NOT NULL,
	`is_variable` integer DEFAULT false NOT NULL,
	`scripts` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
