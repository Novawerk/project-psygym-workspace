CREATE SEQUENCE "public"."content_draft_revisions" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "admin_logins" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"google_sub" text,
	"role" text NOT NULL,
	"org" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "content_drafts" (
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"source" text NOT NULL,
	"revision" integer NOT NULL,
	"base_version" integer,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_drafts_kind_item_id_pk" PRIMARY KEY("kind","item_id")
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"version" integer NOT NULL,
	"source" text NOT NULL,
	"action" text NOT NULL,
	"from_version" integer,
	"note" text,
	"published_by" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_versions_kind_item_id_version_pk" PRIMARY KEY("kind","item_id","version")
);
--> statement-breakpoint
ALTER TABLE "admin_logins" ADD CONSTRAINT "admin_logins_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_updated_by_admins_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_published_by_admins_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_logins_at_idx" ON "admin_logins" USING btree ("at");--> statement-breakpoint
CREATE INDEX "content_versions_published_at_idx" ON "content_versions" USING btree ("published_at");