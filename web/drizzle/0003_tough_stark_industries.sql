CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`api_key` text DEFAULT '' NOT NULL,
	`base_url` text NOT NULL,
	`active_model` text NOT NULL,
	`available_models` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `regions` DROP COLUMN `category`;