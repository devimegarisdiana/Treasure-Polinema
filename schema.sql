CREATE TABLE "registration_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" varchar NOT NULL,
	"submission_key" uuid NOT NULL,
	"purpose" text NOT NULL,
	"object_path" text NOT NULL,
	"file_name" varchar(200) NOT NULL,
	"content_type" varchar(40) NOT NULL,
	"file_size" integer NOT NULL,
	"registration_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_uploads_object_path_unique" UNIQUE("object_path")
);

CREATE TABLE "team_registration_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"registration_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"institution" varchar(200),
	"study_program" varchar(160),
	"education_level" text,
	"fee_category" text
);

CREATE TABLE "team_registrations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"submission_key" uuid NOT NULL,
	"reference_code" varchar(24) NOT NULL,
	"team_name" varchar(120) NOT NULL,
	"contact_email" varchar(254) NOT NULL,
	"contact_phone" varchar(40) NOT NULL,
	"owner_id" varchar,
	"alternative_phone" varchar(40),
	"institution" varchar(200),
	"faculty_department" varchar(200),
	"country_of_origin" varchar(100),
	"competition" varchar(160),
	"has_edugate_training" boolean,
	"student_id_upload_id" uuid,
	"payment_upload_id" uuid,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_registrations_submission_key_unique" UNIQUE("submission_key"),
	CONSTRAINT "team_registrations_reference_code_unique" UNIQUE("reference_code")
);

CREATE TABLE "registration_notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"registration_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_id" varchar(100),
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_notifications_registration_id_unique" UNIQUE("registration_id")
);

CREATE TABLE "registration_spreadsheet_sync" (
	"id" uuid PRIMARY KEY NOT NULL,
	"registration_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_spreadsheet_sync_registration_id_unique" UNIQUE("registration_id")
);

CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);

CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "participant_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_accounts_username_unique" UNIQUE("username"),
	CONSTRAINT "participant_accounts_email_unique" UNIQUE("email")
);

CREATE TABLE "participant_auth_limits" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);

CREATE TABLE "participant_sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "organizer_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizer_accounts_username_unique" UNIQUE("username")
);

CREATE TABLE "organizer_sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

ALTER TABLE "registration_uploads" ADD CONSTRAINT "registration_uploads_registration_id_team_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."team_registrations"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "team_registration_members" ADD CONSTRAINT "team_registration_members_registration_id_team_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."team_registrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "registration_notifications" ADD CONSTRAINT "registration_notifications_registration_id_team_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."team_registrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "registration_spreadsheet_sync" ADD CONSTRAINT "registration_spreadsheet_sync_registration_id_team_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."team_registrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "participant_sessions" ADD CONSTRAINT "participant_sessions_account_id_participant_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."participant_accounts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "organizer_sessions" ADD CONSTRAINT "organizer_sessions_account_id_organizer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organizer_accounts"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");
CREATE INDEX "participant_session_expiry" ON "participant_sessions" USING btree ("expires_at");
CREATE INDEX "organizer_session_expiry" ON "organizer_sessions" USING btree ("expires_at");
