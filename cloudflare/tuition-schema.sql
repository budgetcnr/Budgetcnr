-- Schema only. No student, teacher or credential data.
CREATE TABLE `fee_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`import_version` text NOT NULL,
	`source_id` text NOT NULL,
	`academic_year` integer NOT NULL,
	`semester` integer NOT NULL,
	`class_room` text NOT NULL,
	`item` text NOT NULL,
	`outstanding_cents` integer NOT NULL
);
CREATE TABLE `fee_import_state` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL
);
CREATE TABLE "fee_reports" (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`import_version` text NOT NULL,
	`source_id` text NOT NULL,
	`total_cents` integer,
	`details_available` integer NOT NULL,
	`payment_note` text NOT NULL
);
CREATE TABLE `fee_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`import_version` text NOT NULL,
	`class_room` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`as_of` text NOT NULL,
	`total_cents` integer NOT NULL,
	`row_count` integer NOT NULL,
	`complete` integer NOT NULL
);
CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
CREATE TABLE `student_roster` (
	`student_id` text PRIMARY KEY NOT NULL,
	`roll_number` integer,
	`full_name` text NOT NULL,
	`class_room` text NOT NULL,
	`advisor` text NOT NULL,
	`status` text NOT NULL,
	`credential_hash` text,
	`import_version` text NOT NULL
);
CREATE TABLE `teacher_advisory_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`class_room` text NOT NULL,
	`source` text NOT NULL,
	`import_version` text NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `teacher_roster`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `teacher_roster` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`department` text NOT NULL,
	`position_number` text,
	`rank` text NOT NULL,
	`personnel_id` text,
	`credential_hash` text NOT NULL,
	`source_url` text NOT NULL,
	`source_academic_year` integer NOT NULL,
	`import_version` text NOT NULL
, `login_enabled` integer DEFAULT 0 NOT NULL);
CREATE INDEX `idx_fee_entries_version_student` ON `fee_entries` (`import_version`,`student_id`);
CREATE INDEX `idx_fee_sources_version_room` ON `fee_sources` (`import_version`,`class_room`);
CREATE UNIQUE INDEX `teacher_roster_personnel_id_unique` ON `teacher_roster` (`personnel_id`);

