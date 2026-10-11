CREATE TABLE "active_day" (
	"day" date NOT NULL,
	"pid" text NOT NULL,
	CONSTRAINT "active_day_day_pid_pk" PRIMARY KEY("day","pid")
);
--> statement-breakpoint
CREATE TABLE "active_week" (
	"week" text NOT NULL,
	"pid" text NOT NULL,
	CONSTRAINT "active_week_week_pid_pk" PRIMARY KEY("week","pid")
);
--> statement-breakpoint
CREATE TABLE "login_codes" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"code_mac" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"tries_left" integer NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"sends_in_window" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_counters" (
	"key_mac" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_counters_key_mac_window_start_pk" PRIMARY KEY("key_mac","window_start")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"renewed_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invite_batch" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_counters_window_start_idx" ON "rate_counters" USING btree ("window_start");