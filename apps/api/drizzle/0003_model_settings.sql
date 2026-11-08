CREATE TABLE "model_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"client_provider" text,
	"client_model" text,
	"supervisor_provider" text,
	"supervisor_model" text,
	"anthropic_key" text,
	"anthropic_key_hint" text,
	"deepseek_key" text,
	"deepseek_key_hint" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_settings_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"admin_id" text,
	"change" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_settings" ADD CONSTRAINT "model_settings_updated_by_admins_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_settings_log" ADD CONSTRAINT "model_settings_log_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_settings_log_at_idx" ON "model_settings_log" USING btree ("at");