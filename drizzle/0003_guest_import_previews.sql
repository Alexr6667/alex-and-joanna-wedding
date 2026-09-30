CREATE TABLE "guest_import_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_email" text NOT NULL,
	"file_sha256" text NOT NULL,
	"duplicate_lines" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "guest_import_previews_expires_at_idx" ON "guest_import_previews" USING btree ("expires_at");