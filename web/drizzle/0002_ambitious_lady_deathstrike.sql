DROP INDEX IF EXISTS `translations_cache_key_unq`;--> statement-breakpoint
CREATE UNIQUE INDEX `translations_page_cache_key_unq` ON `translations` (`page_id`,`cache_key`);