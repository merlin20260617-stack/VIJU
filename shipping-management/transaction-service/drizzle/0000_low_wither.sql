CREATE TABLE `entities` (
	`collection` text NOT NULL,
	`entity_key` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`collection`, `entity_key`)
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`part` integer NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`lease` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `projections` (
	`entity_key` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`request_id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`version` integer NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `revisions` (
	`key` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`last_request` text NOT NULL,
	`sync_lock` text DEFAULT '' NOT NULL
);
