CREATE TABLE `app_reg_overrides` (
	`app_object_id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`monitoring_enabled` integer DEFAULT true NOT NULL,
	`template_id` text,
	`channel_override_ids` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`app_object_id`) REFERENCES `app_registrations`(`object_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `threshold_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `app_registrations` (
	`object_id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`display_name` text NOT NULL,
	`kind` text DEFAULT 'app_registration' NOT NULL,
	`has_saml_sso` integer DEFAULT false NOT NULL,
	`preferred_signing_key_thumbprint` text,
	`created_date_time` integer,
	`refreshed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`app_object_id` text NOT NULL,
	`key_id` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text,
	`start_date_time` integer,
	`end_date_time` integer,
	`hint` text,
	`usage` text,
	`key_type` text,
	`custom_key_identifier` text,
	`superseded` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`app_object_id`, `key_id`),
	FOREIGN KEY (`app_object_id`) REFERENCES `app_registrations`(`object_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `global_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`default_template_id` text,
	`global_channel_ids` text DEFAULT (json('[]')) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`default_template_id`) REFERENCES `threshold_templates`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "global_config_singleton" CHECK("global_config"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `notification_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_runs` (
	`run_date` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`summary` text,
	`started_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `refresh_status` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_refresh_started_at` integer,
	`last_refresh_completed_at` integer,
	`last_refresh_status` text,
	`last_refresh_error` text,
	`app_reg_count` integer,
	`credential_count` integer,
	CONSTRAINT "refresh_status_singleton" CHECK("refresh_status"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `threshold_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_builtin` integer DEFAULT false NOT NULL,
	`schedule` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
