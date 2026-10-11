CREATE TABLE "daily_counts" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"case_id" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT '' NOT NULL,
	"dim" text DEFAULT '' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"duration_sum_sec" bigint DEFAULT 0 NOT NULL,
	"duration_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_counts_day_metric_case_id_locale_dim_pk" PRIMARY KEY("day","metric","case_id","locale","dim")
);
