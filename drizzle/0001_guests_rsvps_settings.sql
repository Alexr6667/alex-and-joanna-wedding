CREATE TYPE "public"."attendee_role" AS ENUM('guest', 'plus_one');--> statement-breakpoint
CREATE TYPE "public"."menu_category_key" AS ENUM('arrival_drink', 'starter', 'main', 'dessert');--> statement-breakpoint
CREATE TYPE "public"."rsvp_updated_by" AS ENUM('guest', 'admin');--> statement-breakpoint
CREATE TYPE "public"."site_access_mode" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TABLE "family_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faq_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_sha256" text NOT NULL,
	"row_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"family_group_id" uuid,
	"plus_one_allowed" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"invitation_token_hash" text,
	"invitation_token_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"key" "menu_category_key" PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "menu_category_key" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rsvp_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"role" "attendee_role" NOT NULL,
	"full_name" text,
	"dietary_requirements" text,
	"arrival_drink_option_id" uuid,
	"starter_option_id" uuid,
	"main_option_id" uuid,
	"dessert_option_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rsvps" (
	"guest_id" uuid PRIMARY KEY NOT NULL,
	"attending" boolean NOT NULL,
	"bringing_plus_one" boolean DEFAULT false NOT NULL,
	"song_request" text,
	"notes" text,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" "rsvp_updated_by" DEFAULT 'guest' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_mode" "site_access_mode" DEFAULT 'private' NOT NULL,
	"rsvp_deadline" date,
	"menu_enabled" boolean DEFAULT false NOT NULL,
	"ask_dietary" boolean DEFAULT true NOT NULL,
	"ask_song_request" boolean DEFAULT true NOT NULL,
	"ask_notes" boolean DEFAULT true NOT NULL,
	"whatsapp_template" text,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_singleton" CHECK ("site_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_family_group_id_family_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "public"."family_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_options" ADD CONSTRAINT "menu_options_category_menu_categories_key_fk" FOREIGN KEY ("category") REFERENCES "public"."menu_categories"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_attendees" ADD CONSTRAINT "rsvp_attendees_guest_id_rsvps_guest_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."rsvps"("guest_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_attendees" ADD CONSTRAINT "rsvp_attendees_arrival_drink_option_id_menu_options_id_fk" FOREIGN KEY ("arrival_drink_option_id") REFERENCES "public"."menu_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_attendees" ADD CONSTRAINT "rsvp_attendees_starter_option_id_menu_options_id_fk" FOREIGN KEY ("starter_option_id") REFERENCES "public"."menu_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_attendees" ADD CONSTRAINT "rsvp_attendees_main_option_id_menu_options_id_fk" FOREIGN KEY ("main_option_id") REFERENCES "public"."menu_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_attendees" ADD CONSTRAINT "rsvp_attendees_dessert_option_id_menu_options_id_fk" FOREIGN KEY ("dessert_option_id") REFERENCES "public"."menu_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_groups_name_lower_idx" ON "family_groups" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "guest_imports_file_sha256_idx" ON "guest_imports" USING btree ("file_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_sessions_token_hash_idx" ON "guest_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "guest_sessions_guest_idx" ON "guest_sessions" USING btree ("guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guests_invitation_token_hash_idx" ON "guests" USING btree ("invitation_token_hash");--> statement-breakpoint
CREATE INDEX "guests_family_group_idx" ON "guests" USING btree ("family_group_id");--> statement-breakpoint
CREATE INDEX "menu_options_category_idx" ON "menu_options" USING btree ("category","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "rsvp_attendees_guest_role_idx" ON "rsvp_attendees" USING btree ("guest_id","role");